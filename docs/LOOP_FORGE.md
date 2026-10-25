# PhiBox R5 · The Loop Forge

**Four independent live loop tracks, a processed-master resampler, and per-pad FX sends.** This release is a compact browser loop station, not a full multitrack DAW.

## How to build a layered performance

1. Open PhiBox, make a pattern or play pads on the computer keyboard.
2. Scroll to **Φ Loop Forge**. Select **1, 2, or 4 bars**. Tempo is locked while capture is active.
3. Click **REC LOOP** on Track 01. If transport is stopped, PhiBox starts it first. Recording queues for the **next bar line**, captures one full fixed-length take, then starts that take looping.
4. Jam something else and record Track 02, Track 03 or Track 04. Tracks have **MUTE** and independent **LEVEL** controls. Tracks are phase-aligned with the same transport.
5. Click **REPLACE** to record a new take on a track. Recording is one take per track, not overdub-to-the-same-PCM-track. Your prior recording remains until the replacement completes.
6. To stop a queued/in-progress capture without changing any saved track, click **CANCEL CAPTURE**.
7. **CLEAR** drops a track take from RAM and local IndexedDB. It does *not* delete chop source files.
8. Want to flip the result? Click **RESAMPLE → CHOP SHOP** to record the processed **stereo master** for the selected number of bars. PhiBox saves it locally as a WAV source and makes it the active sample in Chop Shop. Then slice/route your recording to the sixteen pads.

**Recording source choices matter.** Loop tracks capture the **live instrument bus before master effects**. Previously recorded tracks enter the master after that bus, so their audio is not re-captured into every new layer. **RESAMPLE → CHOP SHOP** captures the full processed master, including your active loop tracks, effects and anything else playing.

Recording starts on an audio-clock-aligned bar boundary via an AudioWorklet that captures stereo PCM with exact sample frame counts, not an approximate wall-clock MediaRecorder timeout. After capture, audio buffers are looped with phase offset to keep playback aligned to the transport.

When the transport is stopped, loop sources stop without erasing recordings. Starting transport again restarts loop tracks. Changing the BPM *after* capturing loops changes each playback rate to follow the new transport tempo: **pitch changes with tempo** (tape behavior). True pitch-preserving multitrack stretching is not part of R5.

## Per-pad FX buses

Every pad now has a small **PAD FX BUS** under its edit panel:
- **FILTER:** independent low-pass cutoff, from 200 Hz to 20 kHz
- **PAN:** independent stereo position, hard left to hard right
- **DELAY SEND:** additive send to PhiBox's existing master delay path
- **REVERB SEND:** additive send to PhiBox's existing convolution reverb path

Default settings preserve the old sound (filter open, centered pan, zero additional sends). The existing global master FX remain active. Some saturation, EQ or overlap of wet paths is normal when the global master FX sends are already above zero.

## Storage and safety

Loop audio is stored as stereo Float32 arrays in a new IndexedDB store (database upgrade from v2 to v3). The original pad samples and chop sources remain intact. Browser storage can be cleared by the browser, by private-browsing behavior, or by the user; keep independent backups of valuable performances.

Project JSON **does not include PCM loops or source sample files**. R5 saves mixer settings and project metadata, not a portable audio bundle. Loop takes remain local to the current browser/device and may not correspond to an imported project from elsewhere.

**RESAMPLE** does generate a local WAV-backed Chop Shop source. That WAV is saved to IndexedDB, but is still not embedded in JSON project exports. The standalone red transport record button still records compressed master-audio to a downloadable file when supported by the browser.

This feature uses AudioWorklet and requires a modern supported browser over HTTPS or localhost. For reliable low-latency performance, use a computer with a stable audio device. AudioWorklet capture memory is bounded by four bars at a minimum BPM of 40, maximum 25 seconds per take.

## Still on the roadmap

True same-track destructive/non-destructive overdub with undo, pre-roll/count-in, monitored recording of physical line/microphone input as a separate track, per-track time stretching and effect racks, sample-accurate host sync to external DAWs, full clip arranger, stem exports, and native VST3/CLAP/AU are future releases.
