# ΦBOX R8 · ΦFLEX Instrument Bay / ChippyDip Home

## Why this exists

PhiBox is the recording studio and live groove machine. [ChippyDip](https://michaelwave369.github.io/ChippyDip/) remains its own full retro-chip instrument laboratory, including its separate native C++/VST3 work. The new **ΦFLEX** instrument rack takes the sound engines and factory patches from the actual ChippyDip source, under the ChippyDip MIT license, and runs them inside PhiBox's Web Audio graph.

This is **not** an iframe or a disconnected embedded webpage: ChippyDip instruments route to PhiBox's existing FX bus, analyser, live recorder and loop capture. The complete source is vendored under \`src/chippydip/\` (original files \`audio.ts\`, \`fm.ts\`, \`snes.ts\`, \`layers.ts\`, plus the MIT license). Only relative import extensions were adjusted for PhiBox's Vite module graph. The copied files remain under their original copyright and attribution. For upstream updates, compare the source folder against the latest ChippyDip commit and update consciously instead of silently overwriting fixes.

## Try it

1. Open the **ΦFLEX / Instrument Bay** section, below Chop Shop and above the Oscillator Lab.
2. Choose **ΦFLEX · CHIPPYDIP DSP**. The existing PhiBox piano and any general-purpose MIDI keyboard notes now play the selected ChippyDip instrument; choosing **ORIGINAL OSCILLATOR** returns to the previous synth behavior.
3. Browse factory sounds by **NES Classics**, **Pocket Wave**, **Genesis FM**, or **SNES Sample**. Search by patch name/caption, and star your favorites.
4. Press and hold **HOLD TO AUDITION** or play the existing piano (mouse/touch) or MIDI controller. The original drum pads and hotkeys remain unchanged.
5. Choose **DOUBLE DIP** to stack four families into one composite note. Each layer has a factory preset, enable toggle, level and transpose settings.
6. Turn on the **Pitch Lane** to schedule notes alongside the drum sequencer. Select **WRITE NOTE** and click cells in the sixteen-step melodic row. Re-click the same note to clear it. Adjust gate time for staccato or legato notes.
7. Hit **Play** and record the combined music with Loop Forge, or resample the master into Chop Shop.

**Existing projects stay compatible.** R8 exports/imports a \`version: 8\` project with the rack engine/family, selected preset, favorite IDs, four-layer mix settings, 16-step melodic pattern, note length, and keyboard audition pitch. Old project formats default to the original oscillator engine, so existing patterns keep sounding as before. ChippyDip's own standalone custom wavetable and FM patch editors still live in the full ChippyDip application; this bridge currently uses its factory sound definitions and Double Dip layer mixing.

## About the sounds

ChippyDip provides hardware-*inspired* synth instruments, not cycle-accurate NES, Game Boy, Genesis, or SNES emulation. Its SNES-inspired factory sounds are generated, not ripped from copyrighted game cartridges. No ROM, game soundtrack, copyrighted sample, or game BIOS is bundled. All synthesis is local Web Audio.

This preset-driven design is **inspired by the workflow of FL Studio FLEX** (bank browser, favorites, performance-focused control), not affiliated with, a port of, or a copy of FL Studio or Image-Line proprietary software.

## Next possible improvements

- Share/edit custom Game Boy waveforms and four-operator FM patches across ChippyDip and PhiBox through a carefully versioned patch interchange format.
- Standalone instrument tracks with independent 16-step or piano-roll clips, MIDI learn, track automation, patch morphing and stronger voice management.
- Link to the native ChippyDip VST3 candidate for actual FL Studio loading after host testing. A browser synth rack is not itself a VST3 plugin.
