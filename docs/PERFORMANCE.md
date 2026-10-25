# Performing with PhiBox R2

PhiBox separates **two recording modes** deliberately:

- **REC PADS** in the Step Sequencer: armed MIDI/computer-keyboard/mouse pad hits are captured into the 16-step grid, retaining velocity. It starts the transport if stopped. Press again to disarm. Stopping the transport also disarms.
- **Red record circle** next to Play: starts/stops an audio master capture and downloads the take. This button does not place hits into the sequencer.

## Live pad overdub

1. Set a tempo and optionally turn on **SONG MODE**.
2. In the sequencer, choose 1/16, 1/8, or 1/4 quantization.
3. Choose **KEY VELOCITY** for your computer keyboard and mouse (MIDI pad velocity comes from the controller).
4. Click **REC PADS** and play keys 1-4, Q-R, A-F, Z-V. Or click/tap pads. MIDI notes 36–51 trigger the corresponding pad.
5. Watch the pattern cells light up and the status bar display the most recent capture. Existing steps remain on, so performances are **overdubbed**, not replaced.
6. Press **STOP PAD REC** to disarm while playback continues. Stop transport to stop and disarm both.

Recorded hits play immediately for live monitoring. The sequencer remembers the closest eligible step determined by its Web Audio scheduling clock, rather than screen animation or JavaScript key-event times. Velocity is clamped from 5–100%.

**Quantization:** 1/16 lands on the nearest sixteenth; 1/8 on even sixteenths; 1/4 on downbeats (steps 1, 5, 9 and 13). Each pattern is 16 steps, and the earliest step of the next bar can receive a late hit near the boundary.

**Step velocity:** click an existing step to select that voice and step; move the STEP VELOCITY slider to modify loudness. Touching the slider creates a note if that step was off. Clicking an on-step again disables it.

## Pattern chain / basic song mode

The Pattern Chain section appears below the sequencer.

- Press **SONG MODE ON** to play a repeating sequence of pattern banks (A–D).
- Each block is **one 16-step bar**. Click a block to cycle A → B → C → D.
- **ADD BAR** appends a new bar, up to 16 bars. **REMOVE BAR** removes the final bar, leaving at least one.
- With song mode off, transport loops the manually selected pattern as before.
- The editor follows the currently playing bank in song mode. Pad recording writes into the bank scheduled to play at the quantized step. Reusing a bank in multiple song slots edits the same shared pattern.

Changing a pattern bank during playback may affect the next scheduled lookahead notes; pattern chaining is a compact arranger, not audio clip rendering.

## Project compatibility

Project JSON exports now include `version: 2`, per-step velocity banks, song slots, song-mode state, the computer-keyboard velocity and quantize choice. Existing v1 projects (16×16 boolean patterns) import and auto-migrate active steps to an 86% default velocity. Browser localStorage is still used for projects; custom samples remain in IndexedDB and **are not included in JSON exports**. Samples must be backed up/reloaded separately across devices.

## Not yet included

- Free, unquantized microtiming or time-stretched audio
- Punch in/out, count-in, clip editing, independent tracks or a true linear song timeline
- Exporting separate WAV stems or native VST3 plugins
- MIDI learn, aftertouch/MPE, hardware pad banks beyond note numbers 36–51

These are future development steps, not existing controls.
