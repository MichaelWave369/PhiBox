import { midiToHz, clamp } from './patterns.js';
import { chooseCaptureStep, DEFAULT_VELOCITY } from './performance.js';

class PhiAudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = new Map();
    this.voices = new Map();
    this.playing = false;
    this.currentStep = 0;
    this.bpm = 108;
    this.swing = 12;
    this.fx = { volume: 0.78, cutoff: 14000, drive: 0.08, delay: 0.16, reverb: 0.12 };
    this.synth = { waveform: 'sawtooth', attack: 0.015, decay: 0.25, sustain: 0.46, release: 0.3 };
    this.vocoder = null;
    this.recording = false;
    this.stepTimeouts = [];
    this.stepTimeline = [];
    this.sequenceIndex = 0;
    this.arrangement = {};
  }

  async ensure() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio.');
      const ctx = this.ctx = new Context();
      this.input = ctx.createGain();
      this.shaper = ctx.createWaveShaper();
      this.shaper.oversample = '2x';
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.5;
      this.master = ctx.createGain();
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.22;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.recordDest = ctx.createMediaStreamDestination();
      this.input.connect(this.shaper);
      this.shaper.connect(this.filter);
      this.filter.connect(this.master);
      this.master.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.compressor.connect(this.recordDest);

      this.delaySend = ctx.createGain();
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.3;
      this.feedback = ctx.createGain();
      this.feedback.gain.value = 0.32;
      this.delayWet = ctx.createGain();
      this.input.connect(this.delaySend);
      this.delaySend.connect(this.delay);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.delayWet);
      this.delayWet.connect(this.master);
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this.createImpulse(1.65);
      this.reverbWet = ctx.createGain();
      this.input.connect(this.convolver);
      this.convolver.connect(this.reverbWet);
      this.reverbWet.connect(this.master);
      this.noiseBuffer = this.makeNoise(2);
      this.setFX(this.fx);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  makeNoise(seconds) {
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  createImpulse(seconds) {
    const count = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(2, count, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < count; i++) {
        const env = Math.pow(1 - i / count, 2.8);
        channel[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return buffer;
  }

  setFX(next) {
    this.fx = { ...this.fx, ...next };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(clamp(this.fx.volume, 0, 1), t, 0.015);
    this.filter.frequency.setTargetAtTime(clamp(this.fx.cutoff, 180, 20000), t, 0.025);
    this.delayWet.gain.setTargetAtTime(clamp(this.fx.delay, 0, 0.8), t, 0.03);
    this.reverbWet.gain.setTargetAtTime(clamp(this.fx.reverb, 0, 0.8), t, 0.03);
    const curve = new Float32Array(1024);
    const drive = clamp(this.fx.drive, 0, 1);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = drive === 0 ? x : Math.tanh(x * (1 + drive * 17)) / Math.tanh(1 + drive * 17);
    }
    this.shaper.curve = curve;
  }

  setSynth(next) {
    this.synth = { ...this.synth, ...next };
  }

  outputGain(time, amplitude, attack = 0.002, decay = 0.24) {
    const g = this.ctx.createGain();
    const a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + a + Math.max(0.015, decay));
    g.connect(this.input);
    return g;
  }

  oscillator(frequency, wave, time, length, gain, pitchEnd = null) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(Math.max(24, frequency), time);
    if (pitchEnd) osc.frequency.exponentialRampToValueAtTime(pitchEnd, time + Math.min(0.15, length));
    osc.connect(gain);
    osc.start(time);
    osc.stop(time + length + 0.03);
    return osc;
  }

  noise(time, length, level, filterType = 'highpass', cutoff = 1600) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    const gain = this.outputGain(time, level, 0.001, length);
    src.connect(filter).connect(gain);
    src.start(time, Math.random() * 0.3);
    src.stop(time + length + 0.02);
  }

  playDrum(kind, velocity, time, tune = 0) {
    const v = clamp(velocity, 0.05, 1);
    const pitch = Math.pow(2, clamp(tune, -12, 12) / 12);
    if (kind === 'kick') {
      const gain = this.outputGain(time, v * 0.95, 0.002, 0.48);
      this.oscillator(155 * pitch, 'sine', time, 0.5, gain, 45 * pitch);
      return;
    }
    if (kind === 'snare') {
      this.noise(time, 0.16, v * 0.44, 'highpass', 1300);
      this.oscillator(175 * pitch, 'triangle', time, 0.12, this.outputGain(time, v * 0.22, 0.001, 0.1), 100 * pitch);
      return;
    }
    if (kind === 'hat' || kind === 'openhat') {
      this.noise(time, kind === 'hat' ? 0.075 : 0.43, v * 0.31, 'highpass', 6900);
      return;
    }
    if (kind === 'clap') {
      [0, 0.025, 0.054].forEach((d, i) => this.noise(time + d, i === 2 ? 0.19 : 0.025, v * 0.31, 'bandpass', 1600));
      return;
    }
    if (kind === 'tom') {
      this.oscillator(175 * pitch, 'sine', time, 0.36, this.outputGain(time, v * 0.55, 0.002, 0.34), 76 * pitch);
      return;
    }
    if (kind === 'rim') {
      this.oscillator(680 * pitch, 'square', time, 0.05, this.outputGain(time, v * 0.12, 0.001, 0.035));
      this.noise(time, 0.038, v * 0.19, 'highpass', 3600);
      return;
    }
    if (kind === 'perc') {
      this.oscillator(430 * pitch, 'triangle', time, 0.2, this.outputGain(time, v * 0.38, 0.002, 0.18), 210 * pitch);
    }
  }

  playSynth(frequency, velocity, time, kind = 'lead', override = {}) {
    const ctx = this.ctx;
    const preset = { ...this.synth, ...override };
    const settings = {
      sub: ['sine', 0.55, 0.42], acid: ['sawtooth', 0.52, 0.16],
      chord: ['triangle', 0.3, 0.75], pluck: ['triangle', 0.42, 0.12],
      lead: ['square', 0.32, 0.42], organ: ['sine', 0.35, 0.45],
      bell: ['sine', 0.3, 1.1], drone: ['sawtooth', 0.18, 1.35],
    };
    const [baseWave, level, length] = settings[kind] || settings.lead;
    const wave = override.waveform || (kind === 'lead' ? preset.waveform : baseWave);
    const env = this.outputGain(time, level * clamp(velocity, 0.04, 1), kind === 'drone' ? 0.12 : 0.006, length);
    const voiceFilter = ctx.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.frequency.setValueAtTime(kind === 'acid' ? 3200 : 11000, time);
    if (kind === 'acid') voiceFilter.frequency.exponentialRampToValueAtTime(450, time + length);
    voiceFilter.connect(env);
    const intervals = kind === 'chord' ? [0, 4, 7] : kind === 'organ' ? [0, 12] : kind === 'bell' ? [0, 19] : [0];
    for (const interval of intervals) {
      const freq = frequency * Math.pow(2, interval / 12);
      this.oscillator(freq, wave, time, length + 0.05, voiceFilter);
    }
  }

  async loadSample(index, file) {
    const ctx = await this.ensure();
    if (!file || file.size > 20 * 1024 * 1024) throw new Error('Use an audio file under 20 MB.');
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    this.samples.set(index, decoded);
    return decoded.duration;
  }

  removeSample(index) {
    this.samples.delete(index);
  }

  async trigger(index, pad, velocity = 0.85, when) {
    await this.ensure();
    const time = Math.max(this.ctx.currentTime, when ?? this.ctx.currentTime);
    const sample = this.samples.get(index);
    if (sample) {
      const src = this.ctx.createBufferSource();
      src.buffer = sample;
      const output = this.ctx.createGain();
      output.gain.value = clamp(velocity, 0.05, 1) * 0.8;
      src.playbackRate.value = Math.pow(2, (Number(pad.tune) || 0) / 12);
      src.connect(output).connect(this.input);
      src.start(time);
    } else if (pad.group === 'drums') {
      this.playDrum(pad.kind, velocity, time, pad.tune || 0);
    } else {
      this.playSynth(midiToHz(pad.note + (Number(pad.tune) || 0)), velocity, time, pad.kind);
    }
  }

  async noteOn(note) {
    await this.ensure();
    if (this.voices.has(note)) this.noteOff(note);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const params = this.synth;
    const osc = ctx.createOscillator();
    osc.type = params.waveform;
    osc.frequency.value = midiToHz(note);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + Math.max(0.005, params.attack));
    gain.gain.setTargetAtTime(Math.max(0.0001, params.sustain * 0.35), now + params.attack, Math.max(0.01, params.decay / 3));
    osc.connect(gain).connect(this.input);
    osc.start(now);
    this.voices.set(note, { osc, gain });
    if (this.vocoder) this.vocoder.carrier.frequency.setTargetAtTime(midiToHz(note), now, 0.015);
  }

  noteOff(note) {
    if (!this.ctx) return;
    const voice = this.voices.get(note);
    if (!voice) return;
    const now = this.ctx.currentTime;
    const release = Math.max(0.02, this.synth.release);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    voice.osc.stop(now + release + 0.02);
    this.voices.delete(note);
  }

  start(patternGetter, bpm, swing, onStep, options = {}) {
    if (!this.ctx) throw new Error('Unlock audio before starting transport.');
    this.stop();
    this.bpm = clamp(bpm, 40, 240);
    this.swing = clamp(swing, 0, 70);
    this.arrangement = options;
    this.playing = true;
    this.currentStep = 0;
    this.sequenceIndex = 0;
    this.stepTimeline = [];
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    const tick = () => {
      while (this.playing && this.nextNoteTime < this.ctx.currentTime + 0.13) {
        const index = this.sequenceIndex;
        const step = index % 16;
        const bank = this.resolveBank(index);
        const scheduledAt = this.nextNoteTime;
        const pattern = patternGetter(bank);
        if (pattern) {
          for (let i = 0; i < 16; i++) {
            if (pattern.steps[i]?.[step]) {
              const level = pattern.velocities?.[i]?.[step];
              const velocity = typeof level === 'number' && level > 0 ? level : DEFAULT_VELOCITY;
              this.trigger(i, pattern.pads[i], velocity, scheduledAt).catch(console.error);
            }
          }
        }
        this.stepTimeline.push({ index, step, bank, time: scheduledAt });
        this.stepTimeline = this.stepTimeline.filter(event => event.time > this.ctx.currentTime - 5);
        const timeout = setTimeout(() => {
          if (this.playing) onStep(step, bank, index);
        }, Math.max(0, (scheduledAt - this.ctx.currentTime) * 1000));
        this.stepTimeouts.push(timeout);
        if (this.stepTimeouts.length > 64) this.stepTimeouts.shift();
        const base = 60 / this.bpm / 4;
        this.nextNoteTime += base * (step % 2 === 0 ? (1 + this.swing / 200) : (1 - this.swing / 200));
        this.sequenceIndex += 1;
        this.currentStep = this.sequenceIndex % 16;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }

  resolveBank(index) {
    const chain = this.arrangement.getChain?.();
    if (Array.isArray(chain) && chain.length) {
      return chain[Math.floor(index / 16) % chain.length] ?? 0;
    }
    return this.arrangement.getBank?.() ?? 0;
  }

  // Capture from the AudioContext clock, not from React's visual playhead.
  // Project unscheduled future grid cells for accurate 1/8 and 1/4 capture near bar boundaries.
  getCaptureCell(division = '1/16') {
    if (!this.playing || !this.ctx || !this.stepTimeline.length) return null;
    const now = this.ctx.currentTime;
    const events = this.stepTimeline.filter(event => event.time >= now - 2.5);
    let last = events.at(-1) || this.stepTimeline.at(-1);
    const duration = 60 / this.bpm / 4;
    for (let i = 0; i < 20; i++) {
      const nextIndex = last.index + 1;
      const nextTime = last.time + duration * (last.step % 2 === 0 ?
        (1 + this.swing / 200) : (1 - this.swing / 200));
      last = { index: nextIndex, step: nextIndex % 16, bank: this.resolveBank(nextIndex), time: nextTime };
      events.push(last);
    }
    return chooseCaptureStep(events, now, division);
  }

  setTransport(bpm, swing) {
    this.bpm = clamp(bpm, 40, 240);
    this.swing = clamp(swing, 0, 70);
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stepTimeouts.forEach(clearTimeout);
    this.stepTimeouts = [];
    this.stepTimeline = [];
    this.sequenceIndex = 0;
  }

  async startVocoder() {
    await this.ensure();
    if (!navigator.mediaDevices?.getUserMedia || !this.ctx.audioWorklet) {
      throw new Error('Microphone vocoder requires a secure (HTTPS) browser with AudioWorklet support.');
    }
    if (this.vocoder) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
    try {
      await this.ctx.audioWorklet.addModule(new URL('./vocoder-processor.js', import.meta.url).href);
      const node = new AudioWorkletNode(this.ctx, 'phi-vocoder', {
        numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
      });
      const mic = this.ctx.createMediaStreamSource(stream);
      const carrier = this.ctx.createOscillator();
      carrier.type = 'sawtooth';
      carrier.frequency.value = 110;
      const out = this.ctx.createGain();
      out.gain.value = 0.62;
      mic.connect(node, 0, 0);
      carrier.connect(node, 0, 1);
      node.connect(out).connect(this.input);
      carrier.start();
      this.vocoder = { stream, mic, carrier, node, out };
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      throw error;
    }
  }

  stopVocoder() {
    const v = this.vocoder;
    if (!v) return;
    v.stream.getTracks().forEach(track => track.stop());
    v.carrier.stop();
    v.carrier.disconnect();
    v.mic.disconnect();
    v.node.disconnect();
    v.out.disconnect();
    this.vocoder = null;
  }

  setVocoderPitch(hz) {
    if (this.vocoder) this.vocoder.carrier.frequency.setTargetAtTime(clamp(hz, 35, 1200), this.ctx.currentTime, 0.02);
  }

  async startRecording() {
    await this.ensure();
    if (this.recorder?.state === 'recording') return;
    if (typeof MediaRecorder === 'undefined') throw new Error('Browser audio recording is unavailable here.');
    const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t));
    const recorder = this.recorder = new MediaRecorder(this.recordDest.stream, mimeType ? { mimeType } : {});
    this.chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
    recorder.start();
    this.recording = true;
  }

  stopRecording() {
    if (!this.recorder || this.recorder.state !== 'recording') return Promise.resolve(null);
    return new Promise(resolve => {
      const recorder = this.recorder;
      recorder.onstop = () => {
        this.recording = false;
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
  }
}
export const audio = new PhiAudioEngine();
