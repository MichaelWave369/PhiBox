# ΦBOX R9 · ChippyDip Patch Portal

R9 connects the **custom patch** workflow between two independent projects:

- **ChippyDip**: the retro-inspired NES, Game Boy, Genesis FM, SNES, and four-layer Double Dip instrument design studio.
- **PhiBox / ΦFLEX**: a sequencer, sampler, loop station and mix environment that can now play those custom ChippyDip settings instead of only the factory presets.

The bridge imports ChippyDip's real versioned pattern JSON (versions **1–5**) and exports the current ΦFLEX instrument as a **ChippyDip version 5** pattern JSON. No service, account, token, remote cross-origin request, ROM or sample library is required.

## ChippyDip → PhiBox

1. In [ChippyDip](https://michaelwave369.github.io/ChippyDip/), design a patch or Double Dip layered setup. Save/export a ChippyDip pattern JSON.
2. Open PhiBox, scroll to ΦFLEX / ChippyDip Instrument Bay, and find **R9 / Inter-App Patch Portal**.
3. Click **IMPORT CHIPPYDIP JSON**, selecting that JSON file (up to 150 KB).
4. PhiBox validates ChippyDip's format, supported version, factory preset IDs, sequence notes, pulse duty, 60–200 BPM, Double Dip layer definitions, and all relevant editor parameters. Corrupt/unknown sound data is rejected before changing the live rack.
5. The instrument, its custom edits, the 16-note melody, and the pattern tempo load into ΦFLEX. Existing PhiBox pads, patterns, effects, and stored loop recordings are untouched.
6. Use the PhiBox piano, MIDI, melodic step sequencer and Loop Forge recording/resampling to hear and record that instrument.

**Importing a ChippyDip pattern intentionally changes PhiBox's BPM to the ChippyDip source tempo**. The rest of the beat/song data is unchanged.

## PhiBox → ChippyDip

Click **EXPORT TO CHIPPYDIP**. The resulting JSON has ChippyDip's \`format: "chippydip-pattern"\` and \`version: 5\` with selected factory ID, 16-note sequence, pulse duty, BPM, sound-mode, four layer settings and validated custom wave/FM/SNES edits. Load this file using ChippyDip's pattern import control.

ChippyDip limits BPM to 60–200. PhiBox supports a larger 40–240 range, so R9 clamps BPM to 60–200 **in the exported ChippyDip file only**, preserving the PhiBox project tempo. PhiBox project's JSON format is version 9 and stores all R9 custom settings directly in its \`instrument\` field. An existing R1–R8 project still imports with factory sounds and/or the original oscillator selected.

## Editing inside PhiBox

- **Game Boy wave:** Edit the 32 cells of the 4-bit wave, each 0–15.
- **Genesis FM:** Choose one of ChippyDip's four FM routing algorithms, edit modulation index, and adjust ratio, level and decay on each of four operators.
- **SNES-style sample:** Adjust tune, echo mix, release and whether the factory/generated sample loops.
- **NES pulse:** Select a factory-supported 12.5%, 25%, 50% or 75% duty setting.
- **Double Dip:** Select a layer to edit. Custom wavetable/FM/SNES settings are associated with each factory preset and applied when that layer plays.

The PhiBox audio engine routes all these overrides to **ChippyDip's original createVoice and createLayerVoice Web Audio DSP functions**, rather than synthesizing replacements. Edits are persisted in the PhiBox browser project and in its JSON export. Use **RESTORE FACTORY PATCH** to drop edits for the selected preset.

Imported settings are stored as pure numeric JSON. R9 **does not import/export user-provided sample PCM/audio bytes**. ChippyDip patterns intentionally exclude these, so any independent sample you imported in ChippyDip must be reimported there when needed.

## Constraints

This is pattern-file interoperability, not a bidirectional realtime socket, background sync, plugin or running two apps inside the same page. The native ChippyDip VST3 candidate is separately developed and still needs its own FL Studio acceptance tests.

The editable fields exposed by PhiBox are a practical subset of ChippyDip's full editors; the import/export adapter preserves all supported settings (e.g. additional FM ADSR values that the simplified PhiBox editor does not currently expose). To edit everything, use the full ChippyDip app. A modern browser is needed for PhiBox's Web Audio instruments and sampler.

The bridge is tested for versioned imports, strict malformed-patch rejection, round-trip Double Dip layer settings, custom wave and FM shape fidelity, and backwards-compatible default oscillator behavior.
