/* PhiFLEX vendor bridge: original ChippyDip Web Audio code, MIT license.
   Upstream: https://github.com/MichaelWave369/ChippyDip
   Exact upstream source retained except local TypeScript import extensions.
   See src/chippydip/LICENSE.md for copyright and conditions. */
/**
 * ChippyDip's original 4-operator Web Audio FM engine.
 * Frequency modulation is routed through oscillator.frequency AudioParams.
 * Inspired by vintage Sega FM timbres; NOT a YM2612 register/timing emulator.
 * No borrowed emulation core, ROM or proprietary instruments.
 */
import type { Preset } from './audio.ts'

export type FmAlgorithm = 0 | 1 | 2 | 3
export interface FmOperator {
  ratio: number
  level: number
  attack: number
  decay: number
  sustain: number
  release: number
}
export interface FmPatch {
  algorithm: FmAlgorithm
  index: number
  operators: [FmOperator, FmOperator, FmOperator, FmOperator]
}
type FmRoute = { carriers: readonly number[]; edges: readonly (readonly [number, number])[]; label: string }

// The four original routing graphs are DAGs to avoid accidental unstable
// feedback. Operator 1 is output voice index 0, numbering in UI is 1..4.
export const FM_ALGORITHMS: readonly FmRoute[] = [
  { label: 'STACK / HEAVY FM', carriers: [0], edges: [[3, 2], [2, 1], [1, 0]] },
  { label: 'SPLIT / DOUBLE', carriers: [0, 1], edges: [[2, 0], [3, 1]] },
  { label: 'FORK / BRASS', carriers: [0], edges: [[3, 2], [2, 0], [1, 0]] },
  { label: 'LAYER / SHIMMER', carriers: [0, 1, 2], edges: [[3, 2]] },
]

export function isValidFmPatch(value: unknown): value is FmPatch {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const operators = candidate.operators
  const inside = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
  return Number.isInteger(candidate.algorithm) &&
    inside(candidate.algorithm, 0, FM_ALGORITHMS.length - 1) &&
    inside(candidate.index, 0, 12) &&
    Array.isArray(operators) &&
    operators.length === 4 &&
    operators.every(op => {
      if (!op || typeof op !== 'object') return false
      const o = op as Record<string, unknown>
      return inside(o.ratio, .5, 16) &&
        inside(o.level, 0, 1) &&
        inside(o.attack, .001, 2) &&
        inside(o.decay, .005, 3) &&
        inside(o.sustain, 0, 1) &&
        inside(o.release, .01, 4)
    })
}

const op = (ratio: number, level: number, decay: number, sustain: number, release: number, attack = .004): FmOperator =>
  ({ ratio, level, attack, decay, sustain, release })

const makePatch = (algorithm: FmAlgorithm, index: number, operators: [FmOperator, FmOperator, FmOperator, FmOperator]): FmPatch =>
  ({ algorithm, index, operators })

export const FM_PRESETS: Preset[] = [
  {
    id: 'fm-voltage', name: 'VOLTAGE LEAD', caption: 'Cutting four-op FM lead',
    chip: 'genesis', wave: 'fm', duty: .5, attack: .003, decay: .18, sustain: .72, release: .20,
    level: .25, accent: '#f5a2ce',
    fm: makePatch(0, 2.8, [op(1, .94, .22, .75, .22), op(2, .63, .17, .57, .17), op(3, .51, .10, .33, .11), op(1, .38, .08, .12, .10)]),
  },
  {
    id: 'fm-grit', name: 'MEGA GRIT', caption: 'Aggressive FM bass',
    chip: 'genesis', wave: 'fm', duty: .5, attack: .002, decay: .10, sustain: .70, release: .13,
    level: .24, accent: '#f4c16d',
    fm: makePatch(2, 4.3, [op(1, 1, .20, .77, .18), op(.5, .60, .15, .43, .13), op(2, .78, .12, .35, .09), op(3, .61, .045, .14, .07)]),
  },
  {
    id: 'fm-crystal', name: 'CRYSTAL KEYS', caption: 'Sparkling metallic keys',
    chip: 'genesis', wave: 'fm', duty: .5, attack: .002, decay: .42, sustain: .20, release: .47,
    level: .19, accent: '#9bbaff',
    fm: makePatch(1, 3.2, [op(1, .9, .65, .2, .55), op(2, .57, .55, .16, .43), op(4, .85, .21, .09, .18), op(7, .76, .13, .04, .21)]),
  },
  {
    id: 'fm-horizon', name: 'NEON HORIZON', caption: 'Lush arcade FM pad',
    chip: 'genesis', wave: 'fm', duty: .5, attack: .16, decay: .60, sustain: .81, release: 1.1,
    level: .18, accent: '#a8e6bb',
    fm: makePatch(3, 1.8, [op(1, .70, 1.3, .77, 1.2, .10), op(2, .44, .82, .67, .94, .18), op(.5, .56, .67, .56, 1.0, .13), op(3, .43, .27, .32, .46, .08)]),
  },
]

export function cloneFmPatch(value: FmPatch): FmPatch {
  return { algorithm: value.algorithm, index: value.index, operators: value.operators.map(operator => ({ ...operator })) as FmPatch['operators'] }
}

export function createFmVoice(
  host: AudioContext | OfflineAudioContext,
  destination: AudioNode,
  midi: number,
  patch: FmPatch,
  presetLevel: number,
  when: number,
  velocity = .85,
): (when?: number) => void {
  // On every voice, connect only the active topology for the selected patch.
  // The patch must already be trusted/validated by the UI or factory list.
  const baseFrequency = 440 * Math.pow(2, (midi - 69) / 12)
  const graph = FM_ALGORITHMS[patch.algorithm]
  const master = host.createGain()
  master.gain.value = presetLevel * Math.max(.1, Math.min(1, velocity)) * .95 / Math.sqrt(graph.carriers.length)
  master.connect(destination)
  const nodes = patch.operators.map(operator => {
    const oscillator = host.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(Math.min(18000, baseFrequency * operator.ratio), when)
    const envelope = host.createGain()
    const peak = Math.max(.00001, operator.level)
    const attackEnd = when + operator.attack
    const decayEnd = attackEnd + operator.decay
    envelope.gain.setValueAtTime(.00001, when)
    envelope.gain.linearRampToValueAtTime(peak, attackEnd)
    envelope.gain.setTargetAtTime(Math.max(.00001, peak * operator.sustain), decayEnd, Math.max(.006, operator.decay / 3))
    oscillator.connect(envelope)
    return { oscillator, envelope, release: operator.release }
  })
  for (const [from, to] of graph.edges) {
    const modulator = host.createGain()
    // FM index is measured in multiples of the fundamental frequency.
    // An audio-rate modulator is connected directly to another oscillator's
    // frequency AudioParam; this genuinely changes its instantaneous pitch.
    modulator.gain.value = Math.min(16000, baseFrequency * patch.index)
    nodes[from].envelope.connect(modulator)
    modulator.connect(nodes[to].oscillator.frequency)
  }
  for (const carrier of graph.carriers) nodes[carrier].envelope.connect(master)
  nodes.forEach(({ oscillator }) => oscillator.start(when))

  let stopped = false
  return (requested?: number) => {
    if (stopped) return
    stopped = true
    const at = Math.max(when + .003, requested ?? host.currentTime)
    for (const { oscillator, envelope, release } of nodes) {
      envelope.gain.cancelScheduledValues(at)
      // setTargetAtTime starts from the CURRENT scheduled envelope value.
      // Do not reset to peak; doing so makes audible release clicks.
      envelope.gain.setTargetAtTime(.00001, at, Math.max(.01, release / 4))
      oscillator.stop(at + Math.max(.01, release) * 3.5 + .04)
    }
  }
}
