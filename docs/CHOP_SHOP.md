# PhiBox R3 / The Sample Chop Shop

## Quick start

1. Scroll to **Φ Sample Chop Shop** and click **LOAD A BREAK** (or drag/drop an audio file into the waveform). Use a local WAV, MP3, OGG, FLAC or other browser-decodable audio file, **20 MB or smaller** and **3 minutes or shorter**.
2. See the source waveform divided into 16 equal regions. Click a numbered slice below the waveform to select it, then **PREVIEW**.
3. Grab the thin vertical marker lines and drag them left/right to adjust chop boundaries without modifying the source.
4. Set optional **ORDER 16 → 01** to distribute the slices to pads backwards.
5. Click **CHOP → 16 PADS**. Now play pads with keyboard 1–4, Q–R, A–F, Z–V, or click the pads. The recorded notes and existing patterns in banks A–D continue to work.
6. Select any pad and use its existing **TUNE** knob to transpose the chop up or down 12 semitones. Press **REVERSE** to reverse just that selected pad; press **UNDO CHOP** to restore its underlying sample or synthesized voice.
7. Experiment with PhiBox's existing filter, delay, drive and reverb while arranging the chops in the step sequencer or overdubbing with REC PADS.

**Remember:** dragging waveform boundaries changes the edit preview. To propagate new boundaries to the sixteen assigned pads, click **CHOP → 16 PADS** again. Routing resets pad tuning and reverse flags to defaults. Source waveforms are never altered.

## Non-destructive audio and persistence

Chops are stored as \`{ sourceId, start, end, reverse }\`, where \`sourceId\` is the original file's SHA-256 and boundaries are fractions (0–1) of the audio buffer's duration. The Audio engine plays only the selected range, including correct reversed-buffer offsets, with short fades to suppress clicks. One original file is stored per hash in the browser's IndexedDB database, not sixteen separate audio copies.

Previous pad sample recordings remain untouched in IndexedDB when chops are mapped to pads. Undoing a chop brings back its previous sound. Importing a *new* sample onto a pad replaces the chop assignment on that one pad.

**Exported JSON does not include audio.** The v3 project file saves chop metadata, markers and sound mappings but **not** the source waveform, imported pad audio or audio output. On another device, load the original break again to match its SHA-256; any broken sample links will be silent until relinked. Keep your own original source files backed up.

Browsers can clear IndexedDB data if space is scarce, in private modes or on user request. The engine keeps decoded audio in RAM during the session.

## Scope of R3

Included: waveform display, 16-slice equal cuts, adjustable markers, individual slice audition, reverse audition, optional reversed pad *order*, per-pad reverse, per-pad transpose, non-destructive mapping and session migration.

Not yet included: automatic transient detection, beat slicing based on BPM, offline time stretching, tempo warping, per-pad independent FX chains, built-in copyrighted sample packs, WAV stem exports and VST3. Those are roadmap features, not shipped R3 controls.

Tests cover normalized boundaries, minimum slice widths, backwards mapping, invalid metadata rejection and small audio buffers.
