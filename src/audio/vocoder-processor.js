/* Eight-band envelope-following filter-bank vocoder. Mic = input 0, carrier = input 1. */
class Bandpass {
  constructor(freq, rate) {
    const q = 1.25;
    const omega = 2 * Math.PI * freq / rate;
    const alpha = Math.sin(omega) / (2 * q);
    const divisor = 1 + alpha;
    this.b0 = alpha / divisor;
    this.b1 = 0;
    this.b2 = -alpha / divisor;
    this.a1 = (-2 * Math.cos(omega)) / divisor;
    this.a2 = (1 - alpha) / divisor;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  next(x) {
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2 - this.a1*this.y1 - this.a2*this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
class PhiVocoder extends AudioWorkletProcessor {
  constructor() {
    super();
    const bands = [190, 300, 460, 720, 1100, 1750, 2800, 4400];
    this.modulators = bands.map(f => new Bandpass(f, sampleRate));
    this.carriers = bands.map(f => new Bandpass(f, sampleRate));
    this.envelopes = bands.map(() => 0);
    this.attack = 1 - Math.exp(-1/(0.008 * sampleRate));
    this.release = 1 - Math.exp(-1/(0.07 * sampleRate));
  }
  process(inputs, outputs) {
    const mic = inputs[0]?.[0];
    const carrier = inputs[1]?.[0];
    const out = outputs[0];
    if (!out?.[0]) return true;
    for (let i = 0; i < out[0].length; i++) {
      const m = mic?.[i] || 0;
      const c = carrier?.[i] || 0;
      let sample = 0;
      for (let b = 0; b < this.modulators.length; b++) {
        const envelope = Math.abs(this.modulators[b].next(m));
        const rate = envelope > this.envelopes[b] ? this.attack : this.release;
        this.envelopes[b] += (envelope - this.envelopes[b]) * rate;
        sample += this.carriers[b].next(c) * this.envelopes[b];
      }
      const value = Math.tanh(sample * 5.5);
      for (let channel = 0; channel < out.length; channel++) out[channel][i] = value;
    }
    return true;
  }
}
registerProcessor('phi-vocoder', PhiVocoder);
