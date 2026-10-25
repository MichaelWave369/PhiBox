# PhiBox R7 · The Live Room

R7 adds permission-based **microphone/audio-interface recording**, optional direct monitoring, **isolated input-only capture**, per-track solo/pan and real input/loop meters, and a **punch-in/out** recording workflow. R7 builds on the existing R1–R6 synth, pads, chop engine and four-loop recording.

## Getting an instrument into PhiBox

1. Open PhiBox on HTTPS or localhost in a modern browser with Web Audio, AudioWorklet and \`getUserMedia\`.
2. In Loop Forge, find **R7 / LIVE ROOM** and click **CONNECT INPUT**. Your browser should ask to permit a microphone. An attached audio interface that appears as a browser audio input may also work.
3. After permission is granted, choose an available **INPUT DEVICE**. Set **INPUT GAIN** while watching the real input peak meter.
4. **MONITOR OFF is the default.** You can record with it off while listening through an audio interface's hardware direct monitoring.
5. Use **MONITOR ON** only when wearing headphones. Monitoring feeds the instrument/mic into the stereo master. Speakers can produce dangerous feedback, especially with a live microphone.
6. Press **DISCONNECT INPUT** to release the media stream and audio-device resource. Navigating away also disconnects.

PhiBox never uploads the microphone stream. The browser may expose device labels only after you grant permission. Using \`getUserMedia\` with a monitor switch is separate from the original Vocoder microphone permission; both flows remain opt-in.

## Choosing what goes on a track

**RECORD SOURCE** has two choices:

- **PADS + INPUT:** capture the original pads/synth/sequencer dry bus plus connected external input, whether or not input monitoring is enabled.
- **INPUT ONLY:** capture solely the microphone/audio-interface input, *excluding the pads, existing loops, and master FX*. A source must be connected before recording.

Both modes record one, two, or four bars on the next transport bar boundary and feed the corresponding Loop Forge lane. Playback, replace and overdub remain available.

## Punch-in/out editing

Punch works on **an existing Loop Forge track**.

1. Record a loop, then select **PUNCH IN (ZONE)** and **PUNCH OUT (AFTER ZONE)**. There are 16 equally spaced zones across the *whole track*, whether it is 1, 2, or 4 bars.
2. Select PADS + INPUT or INPUT ONLY as the recording source.
3. Click **PUNCH IN/OUT** on that loop's track.
4. PhiBox queues a full-length capture at the next bar boundary, but replaces only the audio in the selected zone interval. Outside the punch region the prior audio is retained.
5. A short ~7 ms crossfade smooths the punch boundary, and the previous version remains available through **UNDO** / **REDO** until another editing take or page reload.

The selection refers to loop phase relative to its entire recorded duration, not necessarily the start of the next bar. A 4-bar loop may punch across a boundary even if the new recording starts during bar 2. This is handled by sample-phase mapping. Punch recording is a fixed-length pass, not live manual punch activation while playing.

**R6 OVERDUB remains distinct:** overdub adds a new layer over the complete track; punch replaces only selected zones.

## Stereo loop mixer

Each loop track now has **LEVEL, PAN, MUTE and SOLO** in addition to REC/OVERDUB/PUNCH/UNDO/REDO/CLEAR/WAV.

- PAN changes the position of loop playback on the stereo master.
- SOLO listens only to solo-selected tracks. Multiple tracks can be soloed.
- MUTE still silences an otherwise soloed track.
- Loop and live-input peak meters use the real analyser signal rather than simulated animations. Loop meters are before fader/mute.
- Per-pad FX from R5 and the global master FX rack still apply; loop tracks join the master bus after live dry-input capture.

## Storage and limitations

Audio is stored in the existing IndexedDB loop-take store. Exporting a JSON project saves settings only, **not source files or microphone audio**. Use each track's **WAV** export for an independent audio backup. Microphone monitoring is not auto-enabled on reload for safety.

Importing old R1–R6 sessions retains original patterns/chops, with default loop pan centered, solo off, input source PADS + INPUT, and monitoring off. Real audio-device latency depends on the browser, interface, driver and computer; there is no automatic hardware latency calibration in R7.

R7 is still a browser groovebox, not a native VST3/CLAP/AU, full multi-input DAW, hardware-interface mixer with ASIO, or latency-compensated punch editor. Multi-input aggregation, count-in and persistent unlimited take history remain future work.
