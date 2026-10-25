import { midiToHz, clamp } from './patterns.js';
import { chooseCaptureStep, DEFAULT_VELOCITY } from './performance.js';
import { audioPeaks, playbackWindow } from './chops.js';
import { onsetEnvelope, estimatedTempo, smartTransientMarkers, tempoFactor, grainTimeline } from './break-intelligence.js';
import { barFrames, nextBarTime } from './loop-utils.js';
import { renderOverdub, toAudioBuffer } from './overdub.js';
import { renderPunch } from './punch.js';

class PhiAudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = new Map();
    this.chopSources = new Map();
    this.reverseSources = new Map();
    this.previewVoice = null;
    this.previewGrains = [];
    this.analysisCache = new Map();
    this.chopSync = 'off';
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
    this.loopBuffers = new Map();
    this.loopUndo = new Map();
    this.loopRedo = new Map();
    this.loopSources = new Map();
    this.loopMix = new Map();
    this.padMix = new Map();
    this.captureNode = null;
    this.captureInit = null;
    this.captureJob = null;
    this.captureId = 0;
    this.transportOrigin = 0;
    this.liveCapture = null;
    this.micInput = null;
    this.micRequestId = 0;
  }

  async ensure() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio.');
      const ctx = this.ctx = new Context();
      this.input = ctx.createGain();
      this.liveCapture = ctx.createGain();
      this.input.connect(this.liveCapture);
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


  getPadDestination(index, settings = {}) {
    let channel = this.padMix.get(index);
    if (!channel) {
      const ctx = this.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const panner = ctx.createStereoPanner();
      filter.connect(panner);
      panner.connect(this.input);
      const delaySend = ctx.createGain(), reverbSend = ctx.createGain();
      panner.connect(delaySend); panner.connect(reverbSend);
      delaySend.connect(this.delay); reverbSend.connect(this.convolver);
      channel = { input: filter, filter, panner, delaySend, reverbSend };
      this.padMix.set(index, channel);
    }
    const t=this.ctx.currentTime;
    channel.filter.frequency.setTargetAtTime(clamp(settings.cutoff ?? 20000, 200, 20000),t,.012);
    channel.panner.pan.setTargetAtTime(clamp(settings.pan ?? 0,-1,1),t,.012);
    channel.delaySend.gain.setTargetAtTime(clamp(settings.delay ?? 0,0,0.75),t,.016);
    channel.reverbSend.gain.setTargetAtTime(clamp(settings.reverb ?? 0,0,0.75),t,.016);
    return channel.input;
  }

  async prepareCapture() {
    await this.ensure();
    if (this.captureNode) return this.captureNode;
    if (this.captureInit) return this.captureInit;
    if (!this.ctx.audioWorklet) throw new Error('Loop Forge requires AudioWorklet support in this browser.');
    this.captureInit = (async () => {
      await this.ctx.audioWorklet.addModule(new URL('./loop-capture-processor.js', import.meta.url).href);
      const ctx=this.ctx;
      const node=new AudioWorkletNode(ctx,'phi-loop-capture',{
        numberOfInputs:3,numberOfOutputs:1,outputChannelCount:[2]
      });
      this.liveCapture.connect(node,0,0);
      this.compressor.connect(node,0,1);
      // External input captures even when monitoring is turned off.
      // A silent source prevents the worklet from idling before permission is granted.
      this.micCaptureBus=ctx.createGain();
      this.micCaptureBus.connect(node,0,2);
      if(this.micInput) this.micInput.analyser.connect(this.micCaptureBus);
      const silence=ctx.createGain();silence.gain.value=0;
      node.connect(silence).connect(ctx.destination);
      node.port.onmessage = event => this.onCaptureMessage(event.data);
      this.captureNode=node;
      return node;
    })();
    try{return await this.captureInit;}finally{this.captureInit=null;}
  }

  onCaptureMessage(message) {
    const job=this.captureJob;
    if (!job || message.id!==job.id) return;
    if (message.type==='started') job.onState?.('recording');
    if(message.type==='error' || message.type==='aborted') {
      this.captureJob=null;
      job.onError?.(new Error(message.message || 'Audio capture aborted'));
    }
    if (message.type==='complete') {
      this.captureJob=null;
      try {
        const left=new Float32Array(message.left), right=new Float32Array(message.right);
        const buffer=this.ctx.createBuffer(2,left.length,this.ctx.sampleRate);
        buffer.copyToChannel(left,0); buffer.copyToChannel(right,1);
        let completed=buffer;
        if(job.source==='live'||job.source==='input') {
          const previous=this.loopBuffers.get(job.track)||null;
          if(job.punch) {
            if(!previous)throw new Error('The loop to punch disappeared during capture.');
            completed=toAudioBuffer(this.ctx,renderPunch(previous.buffer,buffer,{
              oldBpm:previous.bpm,newBpm:job.bpm,originTime:job.originTime,
              startTime:job.startTime,region:job.punch,gain:job.overdubGain
            }));
          } else if(job.overdub) {
            if(!previous)throw new Error('The original loop disappeared before overdubbing.');
            const mixed=renderOverdub(previous.buffer,buffer,{
              oldBpm:previous.bpm,newBpm:job.bpm,
              originTime:job.originTime,startTime:job.startTime,gain:job.overdubGain
            });
            completed=toAudioBuffer(this.ctx,mixed);
          }
          this.loopUndo.set(job.track,previous);
          this.loopRedo.delete(job.track);
          this.setLoopBuffer(job.track,completed,job.bpm,job.bars);
          if(this.playing)this.playLoopTrack(job.track);
        }
        job.onDone?.(completed,{
          track:job.track,bpm:job.bpm,bars:job.bars,source:job.source,overdub:job.overdub===true,punch:!!job.punch
        });
      } catch(error) {job.onError?.(error);}
    }
  }

  async armLoopCapture({ track=null, bars=1, source='live', overdub=false, punch=null, overdubGain=.85, onState, onDone, onError }) {
    if (!this.playing || !this.ctx) throw new Error('Start the transport before recording a loop.');
    if(this.captureJob) throw new Error('Another loop capture is already armed or recording.');
    if(source!=='master' && (!Number.isInteger(track)||track<0||track>=4))throw new Error('Choose a loop track 1–4.');
    if(!['live','master','input'].includes(source))throw new Error('Invalid recording source.');
    if(source==='input' && !this.micInput)throw new Error('Connect a microphone or audio interface first.');
    if(punch && (!Number.isFinite(punch.start)||!Number.isFinite(punch.end)||
      punch.start<0||punch.end>1||punch.end-punch.start<1/64))throw new Error('Invalid punch in/out markers.');
    if(punch && (source==='master'||!this.loopBuffers.has(track)||overdub))
      throw new Error('Punch needs a recorded track and cannot be used with overdub.');
    if(punch)bars=this.loopBuffers.get(track).bars;
    if(overdub) {
      if(source==='master'||!this.loopBuffers.has(track))
        throw new Error('Overdub requires an existing loop on the selected track.');
      if(!Number.isFinite(overdubGain)||overdubGain<0||overdubGain>1.5)
        throw new Error('Invalid overdub gain.');
      bars=this.loopBuffers.get(track).bars;
    }
    await this.prepareCapture();
    if(!this.playing)throw new Error('Transport stopped before capture could arm.');
    const bpm=this.bpm;
    const frames=barFrames(bpm,bars,this.ctx.sampleRate);
    if(!frames)throw new Error('This loop duration is unsupported.');
    const at=nextBarTime(this.ctx.currentTime,this.transportOrigin,bpm,.18);
    const id=++this.captureId;
    this.captureJob={id,track,bpm,bars,source,overdub,punch,overdubGain,onState,onDone,onError,startTime:at,originTime:this.transportOrigin};
    this.captureNode.port.postMessage({
      type:'arm',id,startFrame:Math.round(at*this.ctx.sampleRate),frames,source
    });
    onState?.('queued',at);
    return {id,bpm,bars,startTime:at};
  }

  cancelCapture() {
    const job=this.captureJob;
    if(!job)return;
    this.captureJob=null;
    this.captureNode?.port.postMessage({type:'abort'});
    job.onError?.(new Error('Capture cancelled'));
  }

  setLoopBuffer(index,buffer,bpm,bars) {
    this.stopLoopTrack(index);
    this.loopBuffers.set(index,{buffer,bpm,bars});
  }

  getLoopTrack(index) {
    if(this.loopMix.has(index))return this.loopMix.get(index);
    const gain=this.ctx.createGain(),panner=this.ctx.createStereoPanner(),analyser=this.ctx.createAnalyser();
    analyser.fftSize=256;
    analyser.connect(panner);
    panner.connect(gain);
    // Recorded loops enter after the dry input capture bus.
    gain.connect(this.master);
    const channel={input:analyser,analyser,panner,gain,volume:.8,muted:false,solo:false,pan:0};
    this.loopMix.set(index,channel);
    return channel;
  }

  applyLoopMixer() {
    if(!this.ctx)return;
    const soloActive=[...this.loopMix.values()].some(track=>track.solo);
    for(const track of this.loopMix.values()){
      const audible=!track.muted&&(!soloActive||track.solo);
      track.gain.gain.setTargetAtTime(audible?track.volume:0,this.ctx.currentTime,.012);
      track.panner.pan.setTargetAtTime(track.pan,this.ctx.currentTime,.012);
    }
  }

  setLoopTrack(index,options={}) {
    const track=this.getLoopTrack(index);
    if(options.volume!==undefined)track.volume=clamp(options.volume,0,1);
    if(options.muted!==undefined)track.muted=options.muted===true;
    if(options.solo!==undefined)track.solo=options.solo===true;
    if(options.pan!==undefined)track.pan=clamp(options.pan,-1,1);
    this.applyLoopMixer();
  }

  readInputLevel() {
    return this.sampleMeter(this.micInput?.analyser);
  }

  readLoopLevels() {
    return Array.from({length:4},(_,i)=>this.sampleMeter(this.loopMix.get(i)?.analyser));
  }

  sampleMeter(analyser) {
    if(!analyser)return 0;
    const values=new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(values);
    let peak=0;
    for(const sample of values)peak=Math.max(peak,Math.abs(sample));
    return Math.min(1,peak);
  }

  playLoopTrack(index) {
    if(!this.ctx || !this.playing || !this.loopBuffers.has(index))return;
    this.stopLoopTrack(index);
    const {buffer,bpm}=this.loopBuffers.get(index);
    const output=this.getLoopTrack(index);
    const source=this.ctx.createBufferSource();
    source.buffer=buffer;
    source.loop=true;
    source.loopStart=0;source.loopEnd=buffer.duration;
    const rate=this.bpm/bpm;
    source.playbackRate.value=rate;
    source.connect(output.input);
    // A short late-start offset keeps playback bar-phase coherent after capturing a take.
    const at=Math.max(this.ctx.currentTime+.04,this.transportOrigin);
    const elapsed=Math.max(0,at-this.transportOrigin);
    const offset=(elapsed*rate)%buffer.duration;
    source.start(at,offset);
    this.loopSources.set(index,source);
  }

  stopLoopTrack(index) {
    const source=this.loopSources.get(index);
    if(source) {
      try{source.stop();}catch { /* already stopped */ }
      source.disconnect();
    }
    this.loopSources.delete(index);
  }

  removeLoopTrack(index) {
    this.stopLoopTrack(index);
    this.loopBuffers.delete(index);
    this.loopUndo.delete(index);
    this.loopRedo.delete(index);
  }

  canUndoLoop(index) { return this.loopUndo.has(index); }
  canRedoLoop(index) { return this.loopRedo.has(index); }

  restoreLoopVersion(index, direction='undo') {
    const from=direction==='redo'?this.loopRedo:this.loopUndo;
    const to=direction==='redo'?this.loopUndo:this.loopRedo;
    if(!from.has(index))return undefined;
    const snapshot=from.get(index);
    const current=this.loopBuffers.get(index)||null;
    from.delete(index);
    to.set(index,current);
    this.stopLoopTrack(index);
    if(snapshot) {
      this.setLoopBuffer(index,snapshot.buffer,snapshot.bpm,snapshot.bars);
      if(this.playing)this.playLoopTrack(index);
    } else this.loopBuffers.delete(index);
    return snapshot;
  }

  retimeLoops() {
    if(!this.ctx)return;
    for(const [index,source] of this.loopSources) {
      const loop=this.loopBuffers.get(index);
      if(loop)source.playbackRate.setTargetAtTime(this.bpm/loop.bpm,this.ctx.currentTime,.035);
    }
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

  outputGain(time, amplitude, attack = 0.002, decay = 0.24, destination = this.input) {
    const g = this.ctx.createGain();
    const a = Math.max(0.001, attack);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + a + Math.max(0.015, decay));
    g.connect(destination);
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

  noise(time, length, level, filterType = 'highpass', cutoff = 1600, destination = this.input) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    const gain = this.outputGain(time, level, 0.001, length, destination);
    src.connect(filter).connect(gain);
    src.start(time, Math.random() * 0.3);
    src.stop(time + length + 0.02);
  }

  playDrum(kind, velocity, time, tune = 0, destination = this.input) {
    const v = clamp(velocity, 0.05, 1);
    const pitch = Math.pow(2, clamp(tune, -12, 12) / 12);
    if (kind === 'kick') {
      const gain = this.outputGain(time, v * 0.95, 0.002, 0.48, destination);
      this.oscillator(155 * pitch, 'sine', time, 0.5, gain, 45 * pitch);
      return;
    }
    if (kind === 'snare') {
      this.noise(time, 0.16, v * 0.44, 'highpass', 1300, destination);
      this.oscillator(175 * pitch, 'triangle', time, 0.12, this.outputGain(time, v * 0.22, 0.001, 0.1, destination), 100 * pitch);
      return;
    }
    if (kind === 'hat' || kind === 'openhat') {
      this.noise(time, kind === 'hat' ? 0.075 : 0.43, v * 0.31, 'highpass', 6900, destination);
      return;
    }
    if (kind === 'clap') {
      [0, 0.025, 0.054].forEach((d, i) => this.noise(time + d, i === 2 ? 0.19 : 0.025, v * 0.31, 'bandpass', 1600, destination));
      return;
    }
    if (kind === 'tom') {
      this.oscillator(175 * pitch, 'sine', time, 0.36, this.outputGain(time, v * 0.55, 0.002, 0.34, destination), 76 * pitch);
      return;
    }
    if (kind === 'rim') {
      this.oscillator(680 * pitch, 'square', time, 0.05, this.outputGain(time, v * 0.12, 0.001, 0.035, destination));
      this.noise(time, 0.038, v * 0.19, 'highpass', 3600, destination);
      return;
    }
    if (kind === 'perc') {
      this.oscillator(430 * pitch, 'triangle', time, 0.2, this.outputGain(time, v * 0.38, 0.002, 0.18, destination), 210 * pitch);
    }
  }

  playSynth(frequency, velocity, time, kind = 'lead', override = {}, destination = this.input) {
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
    const env = this.outputGain(time, level * clamp(velocity, 0.04, 1), kind === 'drone' ? 0.12 : 0.006, length, destination);
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

  async loadChopSource(id, file) {
    await this.ensure();
    if (this.chopSources.has(id)) return this.getChopInfo(id);
    if (!file || file.size > 20 * 1024 * 1024) throw new Error('Use a break under 20 MB.');
    const buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
    if (buffer.duration > 180) throw new Error('Breaks must be under 3 minutes. Trim longer files first.');
    if (!buffer.length) throw new Error('Audio file was empty.');
    this.chopSources.set(id, buffer);
    return this.getChopInfo(id);
  }

  getChopInfo(id) {
    const buffer = this.chopSources.get(id);
    return buffer ? { duration: buffer.duration, peaks: audioPeaks(buffer) } : null;
  }

  analyzeChop(id) {
    const buffer = this.chopSources.get(id);
    if (!buffer) throw new Error('Load the original break before analyzing.');
    let analysis = this.analysisCache.get(id);
    if (!analysis) {
      analysis = onsetEnvelope(buffer);
      this.analysisCache.set(id, analysis);
    }
    return { bpm: estimatedTempo(analysis), smart: smartTransientMarkers(analysis), duration: buffer.duration };
  }

  setChopSync(mode) {
    this.chopSync = ['off', 'tape', 'grain'].includes(mode) ? mode : 'off';
  }

  getReversedSource(id) {
    if (this.reverseSources.has(id)) return this.reverseSources.get(id);
    const forward = this.chopSources.get(id);
    if (!forward) return null;
    const reversed = this.ctx.createBuffer(forward.numberOfChannels, forward.length, forward.sampleRate);
    for (let channel = 0; channel < forward.numberOfChannels; channel++) {
      const original = forward.getChannelData(channel);
      const target = reversed.getChannelData(channel);
      for (let index = 0; index < original.length; index++) target[index] = original[original.length - 1 - index];
    }
    this.reverseSources.set(id, reversed);
    return reversed;
  }

  playChop(chop, velocity = 0.86, tune = 0, when, preview = false, destination = this.input) {
    const forward = this.chopSources.get(chop?.sourceId);
    if (!forward) throw new Error('Chop source unavailable. Reload the break in Chop Shop.');
    const window = playbackWindow(chop, forward.duration, tune);
    if (!window) throw new Error('Invalid chop region. Please slice the sample again.');
    const reversed = chop.reverse ? this.getReversedSource(chop.sourceId) : forward;
    const { offset: start, duration } = window;
    const time = Math.max(this.ctx.currentTime, when ?? this.ctx.currentTime);
    const ratio = Number.isFinite(chop.sourceBpm) ? tempoFactor(chop.sourceBpm, this.bpm) : 1;
    const useSync = this.chopSync !== 'off' && Number.isFinite(chop.sourceBpm);
    const useGrains = useSync && this.chopSync === 'grain' && duration <= 8 && ratio !== 1;
    if (preview) this.stopChopPreview();

    if (useGrains) {
      const grains = grainTimeline(duration, ratio, .09, .045);
      const nodes = [];
      const tuneRate = Math.pow(2, clamp(tune, -12, 12)/12);
      for (const entry of grains) {
        const remainingSource = duration - entry.sourceOffset;
        const bufferSeconds = Math.min(remainingSource, entry.duration * tuneRate);
        if (bufferSeconds <= 0.0004) continue;
        const outputSeconds = bufferSeconds / tuneRate;
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const at = time + entry.at;
        const fade = Math.min(.034, outputSeconds / 2);
        const loudness = clamp(velocity, .05, 1)*.75;
        src.buffer = reversed;
        src.playbackRate.value = tuneRate;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(loudness, at + fade);
        gain.gain.setValueAtTime(loudness, at + Math.max(fade, outputSeconds - fade));
        gain.gain.linearRampToValueAtTime(0.0001, at + outputSeconds);
        src.connect(gain).connect(destination);
        src.start(at, start + entry.sourceOffset, bufferSeconds);
        src.stop(at + outputSeconds + .015);
        nodes.push(src);
      }
      if (preview) this.previewGrains = nodes;
      return nodes[0] || null;
    }

    const rate = window.rate * (useSync && this.chopSync === 'tape' ? 1 / ratio : 1);
    const audibleSeconds = duration / rate;
    const fade = Math.min(0.006, audibleSeconds / 4);
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = reversed;
    source.playbackRate.value = rate;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(clamp(velocity, 0.05, 1) * 0.8, time + fade);
    gain.gain.setValueAtTime(clamp(velocity, 0.05, 1) * 0.8, time + Math.max(fade, audibleSeconds - fade));
    gain.gain.linearRampToValueAtTime(0.0001, time + audibleSeconds);
    source.connect(gain).connect(destination);
    source.start(time, start, duration);
    source.stop(time + audibleSeconds + 0.025);
    if (preview) {
      this.previewVoice = source;
      source.onended = () => { if (this.previewVoice === source) this.previewVoice = null; };
    }
    return source;
  }

  stopChopPreview() {
    if (this.previewVoice) {
      try { this.previewVoice.stop(); } catch { /* Preview already ended. */ }
      this.previewVoice = null;
    }
    for (const source of this.previewGrains) {
      try { source.stop(); } catch { /* Grain already ended. */ }
    }
    this.previewGrains = [];
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
    const destination=this.getPadDestination(index,pad.padFx);
    if (pad.chop) {
      this.playChop(pad.chop, velocity, Number(pad.tune) || 0, time, false, destination);
      return;
    }
    const sample = this.samples.get(index);
    if (sample) {
      const src = this.ctx.createBufferSource();
      src.buffer = sample;
      const output = this.ctx.createGain();
      output.gain.value = clamp(velocity, 0.05, 1) * 0.8;
      src.playbackRate.value = Math.pow(2, (Number(pad.tune) || 0) / 12);
      src.connect(output).connect(destination);
      src.start(time);
    } else if (pad.group === 'drums') {
      this.playDrum(pad.kind, velocity, time, pad.tune || 0, destination);
    } else {
      this.playSynth(midiToHz(pad.note + (Number(pad.tune) || 0)), velocity, time, pad.kind, {}, destination);
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
    this.transportOrigin=this.nextNoteTime;
    for(const index of this.loopBuffers.keys())this.playLoopTrack(index);
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
    this.retimeLoops();
  }

  stop() {
    this.cancelCapture();
    for(const index of [...this.loopSources.keys()])this.stopLoopTrack(index);
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stepTimeouts.forEach(clearTimeout);
    this.stepTimeouts = [];
    this.stepTimeline = [];
    this.sequenceIndex = 0;
  }

  async connectInput(deviceId=null) {
    if(!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Input recording needs HTTPS, microphone permission and getUserMedia.');
    }
    // Serializes user permission requests so a late grant never overrides a newer source.
    const request=++this.micRequestId;
    const audioConstraints={
      echoCancellation:false,noiseSuppression:false,autoGainControl:false,
      ...(deviceId ? {deviceId:{ideal:deviceId}} : {})
    };
    const stream=await navigator.mediaDevices.getUserMedia({audio:audioConstraints,video:false});
    if(request!==this.micRequestId){
      stream.getTracks().forEach(track=>track.stop());
      throw new Error('Input connection was cancelled.');
    }
    try {
      await this.ensure();
      this.disconnectInput(false);
      const node=this.ctx.createMediaStreamSource(stream);
      const gain=this.ctx.createGain();
      const analyser=this.ctx.createAnalyser(); analyser.fftSize=256;
      const monitor=this.ctx.createGain();monitor.gain.value=0;
      node.connect(gain);
      gain.connect(analyser);
      gain.connect(monitor);
      monitor.connect(this.master);
      if(this.micCaptureBus)analyser.connect(this.micCaptureBus);
      this.micInput={stream,node,gain,analyser,monitor,monitoring:false,volume:.85};
      gain.gain.value=.85;
      return stream.getAudioTracks()[0]?.label || 'AUDIO INPUT CONNECTED';
    }catch(error){
      stream.getTracks().forEach(track=>track.stop());
      throw error;
    }
  }

  setInputSettings({volume,monitoring}={}) {
    if(!this.micInput)throw new Error('Connect an input first.');
    const mic=this.micInput;
    if(volume!==undefined)mic.volume=clamp(volume,0,1.5);
    if(monitoring!==undefined)mic.monitoring=monitoring===true;
    mic.gain.gain.setTargetAtTime(mic.volume,this.ctx.currentTime,.015);
    mic.monitor.gain.setTargetAtTime(mic.monitoring?1:0,this.ctx.currentTime,.015);
  }

  disconnectInput(invalidate=true) {
    if(invalidate)this.micRequestId++;
    const mic=this.micInput;
    if(!mic)return;
    mic.stream.getTracks().forEach(track=>track.stop());
    for(const node of [mic.node,mic.gain,mic.analyser,mic.monitor]){
      try{node.disconnect();}catch{/* node disconnected */ }
    }
    this.micInput=null;
  }

  async listInputDevices() {
    if(!navigator.mediaDevices?.enumerateDevices)return [];
    const all=await navigator.mediaDevices.enumerateDevices();
    return all.filter(device=>device.kind==='audioinput')
      .map(device=>({id:device.deviceId,label:device.label||'Audio input'}));
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
