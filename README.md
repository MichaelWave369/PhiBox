# Φ PhiBox

**The Infinite Groove Machine.**

PhiBox is an MPC-inspired, local-first React groovebox with real Web Audio sound generation. Sixteen performance pads, built-in drum synthesis, sample loading, a four-bank step sequencer, live keyboard synth, effects, an eight-band mic vocoder, MIDI input and performance recording.

## Live site

After merging the first pull request, set repository Settings → Pages → Build and deployment → **GitHub Actions**. The included workflow tests, builds and publishes the React app.

**https://michaelwave369.github.io/PhiBox/**

## Play it

- Click any of the sixteen pads, or trigger pads from the keyboard using rows 1 2 3 4 / Q W E R / A S D F / Z X C V.
- Press Play or Space to start the 16-step sequencer. Clicking any cell toggles that voice at that step. Banks A–D are separate patterns. Generate produces a randomized groove; Copy sends the current bank to the next bank.
- Change tempo (40–240 BPM) and swing live. Try the synthesized drums before loading samples.
- Choose a pad and use **Load Sample**, or drag a file directly onto a pad. Each file can be up to 20 MB. Supported formats depend on the browser decoder.
- Use the oscillator keyboard to play live notes. Sine, triangle, sawtooth and square modes have attack, decay, sustain and release.
- Experiment with master volume, cutoff, drive, delay and reverb. Spectrum responds to live output.
- **Enable Live Mic** requests microphone permission and enables an actual eight-band envelope-following filter-bank vocoder. Use headphones to avoid feedback.
- **Connect MIDI** requests a MIDI device. Incoming MIDI notes 36–51 trigger the sixteen pads; other notes play the keyboard synth.
- Press the red recording control to capture the master output. Press again to download the browser's recording file.

## Performance recorder and pattern chain (R2)

- **REC PADS** overdubs mouse, keyboard and MIDI pad hits into 16-step patterns using the audio clock and a selectable 1/16, 1/8 or 1/4 quantization grid.
- Each step saves its own playback velocity. MIDI preserves velocity; keyboard and mouse use the adjustable KEY VELOCITY. Edit any selected step with the STEP VELOCITY slider.
- **Pattern Chain** arranges up to 16 bars using A–D pattern banks; activate SONG MODE to loop the chain. An active recording follows the bank at the quantized capture point, even across bar transitions.
- Legacy v1 session JSON files are accepted and automatically receive default velocity values for active steps.

**[Read the live-recording and arranger guide](docs/PERFORMANCE.md)**. The red record button on the transport still exports audio; REC PADS separately writes pattern events.

## R3 / Φ Sample Chop Shop

Load your own break and view its waveform in the **Sample Chop Shop**. Edit sixteen slice boundaries by dragging their markers, audition regions forward or reversed, and route all sixteen cuts onto the pad matrix. You can then play, sequence, and overdub the chopped audio, adjust any pad's pitch (±12 semitones), reverse pads individually, and send the output through the existing effects rack. The original files are retained once per SHA-256 in local IndexedDB, and the project file stores the slice assignments.

**[See the Chop Shop guide](docs/CHOP_SHOP.md)** for precise instructions, limits and local-storage/backup caveats. The JSON project export does **not** embed any audio files; bring your original breaks to other devices.

## R4 / Break Intelligence

**Smart transient slicing** detects nearby attacks and estimates source BPM; **Beat Grid** extracts one, two, or four bars at the selected sample BPM and offset; **Tempo Match** offers OFF (original sound), TAPE (tempo and pitch coupled), and experimental GRAIN (windowed overlap-add with approximate pitch preservation).

Read the [R4 Break Intelligence guide](docs/BREAK_INTELLIGENCE.md) for instructions, assumptions, and experimental audio quality limits. R4 retains the original chopped-pad engine and migrates v1–v3 projects with sync OFF by default.

## Storage and privacy

PhiBox stores pattern banks, FX and synth parameters in **localStorage**, and any imported sample audio blobs in **IndexedDB**. Samples are processed locally. No account, server or telemetry is required to play.

**Export Project** creates a JSON file containing patterns and settings, but **not** sample audio. Samples stay in this browser and must be separately reimported when moving to a different device. Importing a session clears the current browser's custom sample assignments; back up any needed audio beforehand. Browser data clearing can delete saved projects and samples.

The recording button captures the PhiBox master bus, not independent microphone tracks. Vocoder microphone permission is opt-in.

## Development

Use Node.js 20.19+ or Node.js 22.12+.

~~~shell
npm install
npm test
npm run dev
npm run build
~~~

Vite uses the /PhiBox/ base path when GITHUB_PAGES=true for Actions deployment.

## Architecture

| Module | Purpose |
| --- | --- |
| src/App.jsx | React performance workstation UI |
| src/audio/engine.js | Audio scheduling, real instruments, FX and recording |
| src/audio/vocoder-processor.js | Eight-band voice-following AudioWorklet |
| src/audio/patterns.js | Pattern state, validation and voice presets |
| src/audio/storage.js | Local IndexedDB sample persistence |
| .github/workflows/pages.yml | Automated tests, production build, Pages deploy |

## What is not implemented yet

A browser app is not a **VST3**, **CLAP**, or **AU** plugin. That requires a plugin-compatible native real-time audio engine (for example, JUCE/C++ or a compatible Rust framework), host parameter automation, plugin state serialization, and host-specific testing. The future desktop / plugin PhiBox should share the musical models with this React version but avoid running real-time audio on React's UI thread.

Other roadmap targets: tempo-sync delay, quantized live recording, pad velocity lanes, sample waveform slicing and trimming, bank chaining, MIDI learn, direct WAV stems, automation lanes, a true arranger, better sample pack handling and possible standalone integration with PhiOS / BackSpin '96 / More Bounce Labs.

The synthesis voices here are originally generated by Web Audio. Please use samples you own or have the rights to.

MIT-licensed. **Ledger above ego. Sound above silence.**
