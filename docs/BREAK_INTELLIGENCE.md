# ΦBOX R4 · Break Intelligence

R4 expands the original Sample Chop Shop with **automatic transient-assisted slicing, beat-grid regions, and two optional modes for matching chop playback to the project tempo**.

## Finding the real hits

1. Load a WAV, MP3, OGG, or other browser-decodable break in the Chop Shop, max 20 MB and 3 minutes.
2. Press **SMART TRANSIENTS + BPM**.
3. PhiBox scans the original sample's short-time energy changes, searches for rhythmic onset peaks, estimates tempo by envelope autocorrelation, and moves boundaries toward nearby attacks. It does not use ML or external services.
4. Preview a slice, then click **CHOP → 16 PADS** to assign the resulting boundaries. The original file is never changed.

An estimate is not a certainty: syncopation, half-time/double-time, noisy recordings, or sustained sounds can produce a mistaken BPM. If it sounds off, use SOURCE BPM to enter the correct value manually.

**SMART TRANSIENTS** aligns 15 boundaries near their regularly spaced positions to the closest prominent attacks. It aims for a playable distribution of slices, not an exhaustive beat transcription. If no strong onsets are found, previous markers remain unchanged.

## Beat grid: one, two, or four bars

Set the break's **SOURCE BPM**, choose **1 / 2 / 4 BARS**, and enter a **START OFFSET** in seconds. Press **SLICE ON BEAT GRID**.

PhiBox calculates the exact duration of those bars at the source tempo, creating sixteen adjacent chops covering that region of the original file. The region may start later than the beginning and end before the end of the file. For example, four bars at 120 BPM occupy eight seconds; with a two-second offset, an audio file at least ten seconds long can be chopped into sixteen *half-second beats* from 2.0–10.0 s.

Beat-grid slicing rejects an impossible selection, rather than silently warping the markers. If the file is too short, reduce the number of bars or start offset. Internal boundaries can still be dragged after applying the grid. Re-route chops to pads when finished.

## Tempo match: OFF / TAPE / GRAIN

The tempo matcher uses a saved BPM for each mapped chop and the project's transport BPM. It only affects chops created **after routing with a valid source tempo**; older projects retain original behavior until you route their chops again.

| Mode | What actually happens | Tradeoff |
| --- | --- | --- |
| **OFF** (default) | Original R3 playback speed, unaffected by project tempo | Fully backwards compatible |
| **TAPE** | Changes buffer playback rate in proportion to transport BPM / source BPM | Tempo sync also changes pitch |
| **GRAIN** | Schedules overlapping short grain windows with different input/output spacing | Rough pitch preservation, but can produce texture, flamming or comb-filtering; suitable for short rhythm chops |

Granular mode is deliberately **experimental**: this is a lightweight windowed overlap-add implementation, not professional WSOLA or phase-vocoder processing. It has a limited stretch range (half-speed to double-speed). Longer than eight-second slices fall back to normal speed. The short grain method can sound gritty, especially on melodic/harmonic loops. OFF and TAPE are safer starting points.

Pad **TUNE** is still independent and can shift the performed sample ±12 semitones. Changing source BPM after mapping does not silently rewrite pad metadata; route again.

## Keeping projects safe

R4 uses session JSON **version 4**, preserving loop markers, analysis settings, source BPM, bar length, start offset and tempo mode, as well as R1–R3 patterns, velocity data and pad mappings. Existing v1, v2, v3 session data remains supported and migrates conservatively with sync OFF.

Audio remains **local in IndexedDB**, not embedded in JSON. Keep a backup of your original source files. If sharing a project with someone else, they will need the exact original break file. No audio is uploaded for analysis.

## Not yet included

Full transient segmentation/beat tracking, continuous time stretch of whole tracks, DAW-quality phase vocoder, off-line render of individual stems, VST3/CLAP/AU, per-pad automation, and source file bundling remain on the roadmap. R4 focuses on live remixing with zero network dependency.
