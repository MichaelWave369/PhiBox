/* PhiFLEX vendor bridge: original ChippyDip Web Audio code, MIT license.
   Upstream: https://github.com/MichaelWave369/ChippyDip
   Exact upstream source retained except local TypeScript import extensions.
   See src/chippydip/LICENSE.md for copyright and conditions. */
/**
 * The Double Dip four-family rack is versioned independently from audio UI.
 * One lane per chip family. Per-layer edits are immutable copies of factory
 * patch metadata. Imported PCM is NEVER carried by the JSON layer model.
 */
import { PRESETS, isValidWaveTable } from './audio.ts'
import type { ChipFamily } from './audio.ts'
import { cloneFmPatch, isValidFmPatch } from './fm.ts'
import type { FmPatch } from './fm.ts'
import { cloneSnesPatch, isValidSnesPatch } from './snes.ts'
import type { SnesPatch } from './snes.ts'

export const CHIP_ORDER: readonly ChipFamily[] = ['nes', 'gameboy', 'genesis', 'snes']
export type PlayMode = 'single' | 'double'

export interface SoundLayer {
  chip: ChipFamily
  presetId: string
  enabled: boolean
  gain: number
  transpose: number
  table?: number[]
  fm?: FmPatch
  sample?: SnesPatch
}

export const DEFAULT_LAYERS: SoundLayer[] = [
  { chip: 'nes', presetId: 'hero', enabled: true, gain: .60, transpose: 0 },
  { chip: 'gameboy', presetId: 'pocket-round', enabled: true, gain: .50, transpose: 12 },
  { chip: 'genesis', presetId: 'fm-grit', enabled: true, gain: .55, transpose: -12 },
  { chip: 'snes', presetId: 'snes-strings', enabled: true, gain: .55, transpose: 0 },
]

export function cloneLayers(layers: readonly SoundLayer[]): SoundLayer[] {
  return layers.map(layer => ({
    chip: layer.chip,
    presetId: layer.presetId,
    enabled: layer.enabled,
    gain: layer.gain,
    transpose: layer.transpose,
    ...(layer.table !== undefined ? { table: [...layer.table] } : {}),
    ...(layer.fm !== undefined ? { fm: cloneFmPatch(layer.fm) } : {}),
    ...(layer.sample !== undefined ? { sample: cloneSnesPatch(layer.sample) } : {}),
  }))
}

export function isValidLayerRack(value: unknown): value is SoundLayer[] {
  if (!Array.isArray(value) || value.length !== CHIP_ORDER.length) return false
  return value.every((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const layer = entry as Record<string, unknown>
    const keys = Object.keys(layer)
    if (!keys.every(key => ['chip', 'presetId', 'enabled', 'gain', 'transpose', 'table', 'fm', 'sample'].includes(key))) return false
    if (layer.chip !== CHIP_ORDER[index] || typeof layer.presetId !== 'string') return false
    const preset = PRESETS.find(p => p.id === layer.presetId && (p.chip ?? 'nes') === layer.chip)
    if (!preset) return false
    if (typeof layer.enabled !== 'boolean') return false
    if (typeof layer.gain !== 'number' || !Number.isFinite(layer.gain) || layer.gain < 0 || layer.gain > 1) return false
    if (!Number.isInteger(layer.transpose) || typeof layer.transpose !== 'number' || layer.transpose < -24 || layer.transpose > 24) return false
    if (layer.table !== undefined && (preset.wave !== 'wavetable' || !isValidWaveTable(layer.table))) return false
    if (layer.fm !== undefined && (preset.wave !== 'fm' || !isValidFmPatch(layer.fm))) return false
    if (layer.sample !== undefined && (preset.wave !== 'sample' || !isValidSnesPatch(layer.sample))) return false
    return true
  })
}

export function activeLayers(layers: readonly SoundLayer[]): SoundLayer[] {
  return layers.filter(layer => layer.enabled && layer.gain > 0)
}
