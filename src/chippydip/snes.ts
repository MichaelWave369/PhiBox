/* PhiFLEX vendor bridge: original ChippyDip Web Audio code, MIT license.
   Upstream: https://github.com/MichaelWave369/ChippyDip
   Exact upstream source retained except local TypeScript import extensions.
   See src/chippydip/LICENSE.md for copyright and conditions. */
/**
 * ChippyDip's original sampled-instrument lab, inspired by the SNES era.
 * Factory sounds are generated procedurally, not taken from game ROMs.
 * This is NOT SPC700/S-DSP or BRR hardware emulation.
 */
import type { Preset } from './audio.ts'

export type SampleShape = 'harp' | 'bell' | 'strings' | 'choir'
export interface SampleData {
  pcm: Float32Array
  sampleRate: number
  rootMidi: number
  name: string
}
export interface SnesPatch {
  shape: SampleShape
  tune: number
  loop: boolean
  attack: number
  decay: number
  sustain: number
  release: number
  echoMix: number
  echoTime: number
}
export const SNES_SAMPLE_IDS: readonly SampleShape[] = ['harp', 'bell', 'strings', 'choir']

function patch(shape: SampleShape, loop: boolean, attack: number, decay: number, sustain: number,
  release: number, echoMix: number, echoTime: number): SnesPatch {
  return { shape, loop, tune: 0, attack, decay, sustain, release, echoMix, echoTime }
}

export const SNES_PRESETS: Preset[] = [
  { id: 'snes-harp', name: 'STARLIGHT HARP', caption: 'Warm sampled plucks', chip: 'snes', wave: 'sample', duty: .5, attack: .002, decay: .28, sustain: .26, release: .34, level: .30, accent: '#f8d396',
    sample: patch('harp', false, .002, .28, .26, .34, .14, .22) },
  { id: 'snes-bell', name: 'MOON BELL', caption: 'Shimmering fantasy mallet', chip: 'snes', wave: 'sample', duty: .5, attack: .003, decay: .50, sustain: .26, release: .58, level: .23, accent: '#afd6ff',
    sample: patch('bell', false, .003, .5, .26, .58, .27, .29) },
  { id: 'snes-strings', name: 'PIXEL STRINGS', caption: 'Soft looping ensemble', chip: 'snes', wave: 'sample', duty: .5, attack: .10, decay: .38, sustain: .76, release: .72, level: .21, accent: '#d4b6fa',
    sample: patch('strings', true, .10, .38, .76, .72, .21, .24) },
  { id: 'snes-choir', name: 'NEON CHOIR', caption: 'Ethereal sampled voices', chip: 'snes', wave: 'sample', duty: .5, attack: .17, decay: .4, sustain: .74, release: 1.1, level: .19, accent: '#b0e7c8',
    sample: patch('choir', true, .17, .40, .74, 1.1, .35, .30) },
]

export function cloneSnesPatch(value: SnesPatch): SnesPatch {
  return { ...value }
}

export function isValidSnesPatch(input: unknown): input is SnesPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const v = input as Record<string, unknown>
  const bounded = (n: unknown, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  return SNES_SAMPLE_IDS.includes(v.shape as SampleShape) &&
    typeof v.loop === 'boolean' &&
    bounded(v.tune, -12, 12) &&
    bounded(v.attack, .001, 2) &&
    bounded(v.decay, .005, 3) &&
    bounded(v.sustain, 0, 1) &&
    bounded(v.release, .01, 4) &&
    bounded(v.echoMix, 0, .7) &&
    bounded(v.echoTime, .07, .5)
}

/** Independently synthesised mono PCM factory samples, rendered once per shape. */
const factoryCache = new Map<SampleShape, SampleData>()
export function makeFactorySample(shape: SampleShape): SampleData {
  const existing = factoryCache.get(shape)
  if (existing) return existing
  const sampleRate = 32000
  // Looping timbres use 1 second with integer-cycle partials at 220 Hz.
  const looped = shape === 'strings' || shape === 'choir'
  const duration = looped ? 1 : 1.8
  const rootMidi = 57 // A3: 220 Hz, integer periodic across a 1-second buffer
  const pcm = new Float32Array(Math.round(sampleRate * duration))
  const twopi = Math.PI * 2
  let noiseState = 0x13572468
  const noise = () => {
    noiseState ^= noiseState << 13
    noiseState ^= noiseState >>> 17
    noiseState ^= noiseState << 5
    return ((noiseState >>> 0) / 0xffffffff) * 2 - 1
  }
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate
    const phase = twopi * 220 * t
    let v = 0
    if (shape === 'harp') {
      const a = Math.exp(-3.4 * t)
      v = a * (Math.sin(phase) * .70 + .25 * Math.sin(2 * phase) * Math.exp(-1.7 * t)
        + .13 * Math.sin(3 * phase) * Math.exp(-3 * t) + .07 * noise() * Math.exp(-28 * t))
    } else if (shape === 'bell') {
      v = .56 * Math.sin(phase) * Math.exp(-1.8 * t) +
        .27 * Math.sin(phase * 2.4) * Math.exp(-3.6 * t) +
        .18 * Math.sin(phase * 4.2) * Math.exp(-5.7 * t)
    } else if (shape === 'strings') {
      // Integer-cycle partials make the complete 1-second loop periodic.
      for (let harmonic = 1; harmonic <= 9; harmonic++) {
        v += Math.sin(phase * harmonic + harmonic * .31) / (harmonic * harmonic) * .80
      }
      v += .09 * Math.sin(phase / 2)
    } else {
      v = .40 * Math.sin(phase) + .33 * Math.sin(2 * phase) +
        .21 * Math.sin(3 * phase) + .09 * Math.sin(5 * phase)
    }
    // Per-sample start/end softness for one-shots; looping samples retain
    // their periodic, continuous boundaries instead.
    if (!looped) v *= Math.min(1, i / 80, (pcm.length - 1 - i) / 80)
    pcm[i] = Math.max(-.94, Math.min(.94, v * .8))
  }
  const sample = { pcm, sampleRate, rootMidi, name: shape.toUpperCase() + ' / ORIGINAL' }
  factoryCache.set(shape, sample)
  return sample
}

export function isValidSampleData(data: unknown): data is SampleData {
  if (!data || typeof data !== 'object') return false
  const v = data as Record<string, unknown>
  return v.pcm instanceof Float32Array &&
    v.pcm.length > 0 && v.pcm.length <= 384000 &&
    typeof v.sampleRate === 'number' && Number.isFinite(v.sampleRate) && v.sampleRate >= 8000 && v.sampleRate <= 96000 &&
    v.pcm.length / v.sampleRate <= 8 &&
    typeof v.rootMidi === 'number' && Number.isInteger(v.rootMidi) && v.rootMidi >= 24 && v.rootMidi <= 108 &&
    typeof v.name === 'string' && v.name.length <= 160 &&
    v.pcm.every(Number.isFinite)
}

/** Decode a browser-supported audio file; never upload it to a server. */
export async function decodeSampleFile(file: File): Promise<SampleData> {
  if (file.size <= 0 || file.size > 6 * 1024 * 1024) throw new Error('Maximum sample size is 6 MiB')
  const ctx = new AudioContext()
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    if (buffer.duration <= 0 || buffer.duration > 8 || buffer.numberOfChannels > 2) {
      throw new Error('Sample must be mono/stereo and 8 seconds or shorter')
    }
    const pcm = new Float32Array(buffer.length)
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
    for (let i = 0; i < pcm.length; i++) {
      let sum = 0
      for (const channel of channels) sum += channel[i]
      pcm[i] = Math.max(-1, Math.min(1, sum / channels.length))
    }
    const sample: SampleData = { pcm, sampleRate: buffer.sampleRate, rootMidi: 60, name: file.name.slice(0, 160) }
    if (!isValidSampleData(sample)) throw new Error('Unsupported sample size or format')
    return sample
  } finally {
    await ctx.close()
  }
}

const bufferCache = new WeakMap<AudioContext | OfflineAudioContext, WeakMap<SampleData, AudioBuffer>>()
function audioBuffer(host: AudioContext | OfflineAudioContext, sample: SampleData): AudioBuffer {
  let map = bufferCache.get(host)
  if (!map) {
    map = new WeakMap()
    bufferCache.set(host, map)
  }
  const found = map.get(sample)
  if (found) return found
  const buffer = host.createBuffer(1, sample.pcm.length, sample.sampleRate)
  buffer.copyToChannel(new Float32Array(sample.pcm), 0)
  map.set(sample, buffer)
  return buffer
}

export function createSampleVoice(
  host: AudioContext | OfflineAudioContext,
  destination: AudioNode,
  midi: number,
  patch: SnesPatch,
  presetLevel: number,
  when: number,
  velocity = .85,
  sampleOverride?: SampleData,
): (when?: number) => void {
  const sample = sampleOverride ?? makeFactorySample(patch.shape)
  const source = host.createBufferSource()
  source.buffer = audioBuffer(host, sample)
  source.playbackRate.setValueAtTime(Math.pow(2, (midi - sample.rootMidi + patch.tune) / 12), when)
  source.loop = patch.loop
  const envelope = host.createGain()
  const peak = presetLevel * Math.max(.1, Math.min(1, velocity))
  envelope.gain.setValueAtTime(.00001, when)
  envelope.gain.linearRampToValueAtTime(Math.max(.00002, peak), when + patch.attack)
  envelope.gain.setTargetAtTime(Math.max(.00001, peak * patch.sustain),
    when + patch.attack + patch.decay, Math.max(.006, patch.decay / 3))
  source.connect(envelope)
  envelope.connect(destination)
  if (patch.echoMix > 0) {
    const delay = host.createDelay(.6)
    delay.delayTime.value = patch.echoTime
    const feedback = host.createGain()
    feedback.gain.value = .22
    const wet = host.createGain()
    wet.gain.value = patch.echoMix
    envelope.connect(delay)
    delay.connect(wet)
    wet.connect(destination)
    delay.connect(feedback)
    feedback.connect(delay)
  }
  source.start(when)
  let stopped = false
  return (requested?: number) => {
    if (stopped) return
    stopped = true
    const at = Math.max(when + .003, requested ?? host.currentTime)
    envelope.gain.cancelScheduledValues(at)
    envelope.gain.setTargetAtTime(.00001, at, Math.max(.01, patch.release / 4))
    source.stop(at + patch.release * 3.5 + .03)
  }
}
