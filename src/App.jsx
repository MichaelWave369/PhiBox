import React, { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from './audio/engine.js';
import { clearSamples, getSamples, removeSample, storeSample, saveChopSource, getChopSources } from './audio/storage.js';
import {
  PAD_PRESETS, HOTKEYS, makePatternBanks, makeEmptyPattern, isPattern,
  midiToHz, noteName, clamp
} from './audio/patterns.js';
import { DEFAULT_VELOCITY, velocitiesFromBanks, normalizeVelocities, sanitizeChain } from './audio/performance.js';
import { equalMarkers, normalizeMarkers, normalizeChop, sliceFor, moveMarker, chopAssignments, sourceFingerprint } from './audio/chops.js';
import ChopWaveform from './components/ChopWaveform.jsx';

const KEY = 'phibox-project-v1';
const DEFAULT_FX = { volume: 0.78, cutoff: 14000, drive: 0.08, delay: 0.16, reverb: 0.12 };
const DEFAULT_SYNTH = { waveform: 'sawtooth', attack: 0.015, decay: 0.25, sustain: 0.46, release: 0.3 };
const freshPads = () => PAD_PRESETS.map(p => ({ ...p, tune: 0 }));
const factory = () => {
  const banks = makePatternBanks();
  return {
    name: 'FIRST CONTACT', pads: freshPads(), banks,
    velocities: velocitiesFromBanks(banks),
    bank: 0, bpm: 108, swing: 12, fx: { ...DEFAULT_FX }, synth: { ...DEFAULT_SYNTH },
    chain: [0, 1, 0, 2], songMode: false, quantize: '1/16', padVelocity: DEFAULT_VELOCITY,
    chopDeck: null, chopMarkers: equalMarkers(), flipChops: false
  };
};
function loadProject() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data && Array.isArray(data.banks) && data.banks.length === 4 &&
      data.banks.every(isPattern) && Array.isArray(data.pads) && data.pads.length === 16) {
      const d = factory();
      return {
        name: String(data.name || d.name).slice(0, 44),
        pads: d.pads.map((p, i) => ({
          ...p,
          tune: clamp(data.pads[i]?.tune, -12, 12),
          sampleName: typeof data.pads[i]?.sampleName === 'string' ? data.pads[i].sampleName.slice(0, 60) : undefined,
          chop: normalizeChop(data.pads[i]?.chop),
          chopName: typeof data.pads[i]?.chopName === 'string' ? data.pads[i].chopName.slice(0, 60) : undefined,
        })),
        banks: data.banks, velocities: normalizeVelocities(data.velocities, data.banks),
        bank: clamp(data.bank, 0, 3),
        chain: sanitizeChain(data.chain), songMode: data.songMode === true,
        chopDeck: typeof data.chopDeck?.id === 'string' && /^[a-f0-9]{64}$/.test(data.chopDeck.id)
          ? { id: data.chopDeck.id, name: String(data.chopDeck.name || 'BREAK').slice(0, 100) } : null,
        chopMarkers: normalizeMarkers(data.chopMarkers),
        flipChops: data.flipChops === true,
        quantize: ['1/16', '1/8', '1/4'].includes(data.quantize) ? data.quantize : '1/16',
        padVelocity: clamp(data.padVelocity ?? DEFAULT_VELOCITY, 0.05, 1),
        bpm: clamp(data.bpm, 40, 240), swing: clamp(data.swing, 0, 70),
        fx: { ...d.fx, ...data.fx }, synth: { ...d.synth, ...data.synth },
      };
    }
  } catch { /* Restore factory defaults on invalid local data. */ }
  return factory();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function Knob({ label, value, min, max, step = 1, display, onChange, accent = 'amber' }) {
  const ratio = (Number(value) - min) / (max - min);
  return (
    <label className={'knob-block knob-' + accent}>
      <div className="knob-face" style={{ '--angle': String(-135 + ratio * 270) + 'deg' }}>
        <div className="knob-center"><span className="knob-tick" /></div>
      </div>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} />
      <strong>{display ?? String(Math.round(Number(value) * 100) / 100)}</strong>
      <span className="knob-name">{label}</span>
    </label>
  );
}
function PanelHeader({ kicker, title, right }) {
  return <div className="panel-heading"><div><span className="overline">{kicker}</span><h2>{title}</h2></div>{right}</div>;
}
function Icon({ name, size = 18 }) {
  const paths = {
    play: <path d="m8 5 11 7-11 7z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
    record: <circle cx="12" cy="12" r="7" />,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5" /><path d="M4 17v4h16v-4" /></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5" /><path d="M4 17v4h16v-4" /></>,
    shuffle: <><path d="m17 3 4 4-4 4" /><path d="M3 17h4l10-10h4M3 7h4l2 2m4 6 4 2h4m-4 0 4-4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" /></>,
    power: <><path d="M12 2v10" /><path d="M5 5a9 9 0 1 0 14 0" /></>,
  };
  return <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
function Spectrum({ active }) {
  const ref = useRef(null);
  useEffect(() => {
    let frame;
    const draw = () => {
      const canvas = ref.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const count = 56;
      const data = new Uint8Array(audio.analyser?.frequencyBinCount || 128);
      if (audio.analyser) audio.analyser.getByteFrequencyData(data);
      for (let i = 0; i < count; i++) {
        const db = audio.analyser ? data[Math.min(data.length - 1, Math.floor(i * data.length / count))] / 255 : 0.035 + (i % 7) / 160;
        const val = Math.max(0.035, db);
        const bh = val * (h - 7);
        const x = i * w / count;
        const gradient = ctx.createLinearGradient(0, h, 0, h - bh);
        gradient.addColorStop(0, '#b065ff');
        gradient.addColorStop(0.6, '#fb9861');
        gradient.addColorStop(1, '#ffe2a0');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, h - bh, Math.max(2, w / count - 3), bh);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return <canvas ref={ref} width={336} height={58} className="spectrum-canvas" role="img" aria-label="Live audio spectrum" />;
}
const whiteNotes = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83];
const blackNotes = [
  [61, 0], [63, 1], [66, 3], [68, 4], [70, 5],
  [73, 7], [75, 8], [78, 10], [80, 11], [82, 12]
];

export default function App() {
  const [initial] = useState(loadProject);
  const [name, setName] = useState(initial.name);
  const [pads, setPads] = useState(initial.pads);
  const [banks, setBanks] = useState(initial.banks);
  const [velocities, setVelocities] = useState(initial.velocities);
  const [bank, setBank] = useState(initial.bank);
  const [armed, setArmed] = useState(false);
  const [quantize, setQuantize] = useState(initial.quantize);
  const [padVelocity, setPadVelocity] = useState(initial.padVelocity);
  const [selectedStep, setSelectedStep] = useState(0);
  const [chain, setChain] = useState(initial.chain);
  const [songMode, setSongMode] = useState(initial.songMode);
  const [activeBar, setActiveBar] = useState(0);
  const [chopDeck, setChopDeck] = useState(initial.chopDeck);
  const [chopMarkers, setChopMarkers] = useState(initial.chopMarkers);
  const [flipChops, setFlipChops] = useState(initial.flipChops);
  const [selectedSlice, setSelectedSlice] = useState(0);
  const [reversePreview, setReversePreview] = useState(false);
  const [wavePeaks, setWavePeaks] = useState([]);
  const [chopSeconds, setChopSeconds] = useState(0);
  const [bpm, setBpm] = useState(initial.bpm);
  const [swing, setSwing] = useState(initial.swing);
  const [fx, setFx] = useState(initial.fx);
  const [synth, setSynth] = useState(initial.synth);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(-1);
  const [selected, setSelected] = useState(0);
  const [lit, setLit] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [vocoding, setVocoding] = useState(false);
  const [vocoderPitch, setVocoderPitch] = useState(110);
  const [recording, setRecording] = useState(false);
  const [midi, setMidi] = useState('NOT CONNECTED');
  const [status, setStatus] = useState('READY TO MAKE NOISE');
  const [audioReady, setAudioReady] = useState(false);
  const fileRef = useRef(null);
  const chopFileRef = useRef(null);
  const loadingRef = useRef(null);
  const chopDeckRef = useRef(chopDeck);
  const projectRef = useRef(null);
  const targetRef = useRef(0);
  const loadedRef = useRef(false);
  const persistedSamples = useRef([]);
  const banksRef = useRef(banks);
  const velocityBanksRef = useRef(velocities);
  const bankRef = useRef(bank);
  const padsRef = useRef(pads);
  const chainRef = useRef(chain);
  const songModeRef = useRef(songMode);
  const armedRef = useRef(armed);
  const quantizeRef = useRef(quantize);
  const padVelocityRef = useRef(padVelocity);
  banksRef.current = banks;
  velocityBanksRef.current = velocities;
  bankRef.current = bank;
  padsRef.current = pads;
  chopDeckRef.current = chopDeck;
  chainRef.current = chain;
  songModeRef.current = songMode;
  armedRef.current = armed;
  quantizeRef.current = quantize;
  padVelocityRef.current = padVelocity;

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({
      name, pads, banks, velocities, bank, bpm, swing, fx, synth, chain, songMode, quantize, padVelocity,
      chopDeck, chopMarkers, flipChops
    }));
  }, [name, pads, banks, velocities, bank, bpm, swing, fx, synth, chain, songMode, quantize, padVelocity, chopDeck, chopMarkers, flipChops]);

  useEffect(() => {
    return () => { audio.stop(); audio.stopVocoder(); audio.stopChopPreview(); };
  }, []);

  useEffect(() => { audio.setFX(fx); }, [fx]);
  useEffect(() => { audio.setSynth(synth); }, [synth]);
  useEffect(() => { audio.setTransport(bpm, swing); }, [bpm, swing]);

  const ready = useCallback(async () => {
    await audio.ensure();
    setAudioReady(true);
    if (!loadingRef.current) {
      loadingRef.current = (async () => {
        const [samples, sources] = await Promise.all([getSamples(), getChopSources()]);
        persistedSamples.current = samples;
        for (const entry of samples) {
          try { await audio.loadSample(entry.index, entry.file); }
          catch { setStatus('ONE SAVED SAMPLE COULD NOT BE RESTORED'); }
        }
        const needed = new Set([
          chopDeckRef.current?.id,
          ...padsRef.current.map(pad => pad.chop?.sourceId)
        ].filter(Boolean));
        for (const item of sources) {
          if (!needed.has(item.id)) continue;
          try {
            const info = await audio.loadChopSource(item.id, item.file);
            if (item.id === chopDeckRef.current?.id) {
              setWavePeaks(info.peaks);
              setChopSeconds(info.duration);
            }
          } catch { setStatus('A CHOP SOURCE COULD NOT BE RESTORED'); }
        }
      })();
    }
    try { await loadingRef.current; }
    catch (error) { loadingRef.current = null; setStatus(error.message || 'LOCAL SAMPLE STORAGE UNAVAILABLE'); }
  }, []);

  const ensureChopSource = useCallback(async id => {
    if (audio.chopSources.has(id)) return audio.getChopInfo(id);
    const stored = (await getChopSources()).find(item => item.id === id);
    if (!stored) throw new Error('CHOP SOURCE MISSING / RELOAD THE ORIGINAL BREAK');
    return audio.loadChopSource(id, stored.file);
  }, []);

  const triggerPad = useCallback(async (index, velocity) => {
    try {
      await ready();
      const pad = padsRef.current[index];
      if (pad.chop) await ensureChopSource(pad.chop.sourceId);
      const hitVelocity = clamp(velocity ?? padVelocityRef.current, 0.05, 1);
      await audio.trigger(index, pad, hitVelocity);
      setSelected(index);
      if (armedRef.current && audio.playing) {
        const cell = audio.getCaptureCell(quantizeRef.current);
        if (cell) {
          setBanks(old => old.map((pattern, b) => b !== cell.bank ? pattern :
            pattern.map((row, p) => p !== index ? row : row.map((on, k) => k === cell.step ? true : on))));
          setVelocities(old => old.map((pattern, b) => b !== cell.bank ? pattern :
            pattern.map((row, p) => p !== index ? row : row.map((level, k) => k === cell.step ? hitVelocity : level))));
          setSelectedStep(cell.step);
          if (songModeRef.current) setBank(cell.bank);
          setStatus('OVERDUB: ' + padsRef.current[index].name + ' → BANK ' +
            'ABCD'[cell.bank] + ' / STEP ' + String(cell.step + 1).padStart(2, '0') +
            ' / ' + Math.round(hitVelocity * 100) + '%');
        }
      }
      setLit(old => [...old.filter(v => v !== index), index]);
      setTimeout(() => setLit(old => old.filter(v => v !== index)), 125);
    } catch (error) { setStatus(error.message || 'PAD ERROR'); }
  }, [ready, ensureChopSource]);

  useEffect(() => {
    const handler = event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (/^(input|textarea|select)$/i.test(event.target?.tagName) || event.target?.isContentEditable) return;
      const index = HOTKEYS.indexOf(event.key.toLowerCase());
      if (index !== -1) { event.preventDefault(); triggerPad(index); }
      if (event.code === 'Space') { event.preventDefault(); toggleTransport(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const startTransport = async () => {
    await ready();
    const missingSources = [];
    const sourceIds = [...new Set(padsRef.current.map(pad => pad.chop?.sourceId).filter(Boolean))];
    for (const id of sourceIds) {
      try { await ensureChopSource(id); }
      catch { missingSources.push(id); }
    }
    audio.start(index => ({
      steps: banksRef.current[index],
      velocities: velocityBanksRef.current[index],
      pads: padsRef.current
    }), bpm, swing, (step, playingBank, index) => {
      setPlayhead(step);
      setActiveBar(Math.floor(index / 16));
      if (songModeRef.current) setBank(playingBank);
    }, {
      getBank: () => bankRef.current,
      getChain: () => songModeRef.current ? chainRef.current : null
    });
    setPlaying(true);
    setStatus(missingSources.length ?
      'SEQUENCER RUNNING / ' + missingSources.length + ' CHOP SOURCE(S) MISSING: RELOAD ORIGINAL BREAKS' :
      'SEQUENCER RUNNING');
  };

  const stopTransport = () => {
    audio.stop();
    setPlaying(false);
    setArmed(false);
    armedRef.current = false;
    setPlayhead(-1);
    setActiveBar(0);
    setStatus('TRANSPORT STOPPED');
  };

  const toggleTransport = async () => {
    if (audio.playing) { stopTransport(); return; }
    try { await startTransport(); }
    catch (error) { setStatus(error.message || 'TRANSPORT ERROR'); }
  };

  const toggleOverdub = async () => {
    if (armedRef.current) {
      armedRef.current = false;
      setArmed(false);
      setStatus('PAD RECORDING DISARMED');
      return;
    }
    try {
      if (!audio.playing) await startTransport();
      armedRef.current = true;
      setArmed(true);
      setStatus('REC PADS ARMED / PLAY YOUR KEYS OR MIDI TO OVERDUB');
    } catch (error) { setStatus(error.message || 'FAILED TO ARM PAD RECORDING'); }
  };

  const toggleStep = (pad, step) => {
    const willEnable = !banksRef.current[bank][pad][step];
    setSelected(pad);
    setSelectedStep(step);
    setBanks(old => old.map((pattern, b) => b !== bank ? pattern :
      pattern.map((row, p) => p !== pad ? row : row.map((on, k) => k === step ? willEnable : on))));
    setVelocities(old => old.map((pattern, b) => b !== bank ? pattern :
      pattern.map((row, p) => p !== pad ? row : row.map((level, k) =>
        k === step ? (willEnable ? (level || DEFAULT_VELOCITY) : 0) : level))));
  };

  const setStepVelocity = value => {
    const level = clamp(value, 0.05, 1);
    setBanks(old => old.map((pattern, b) => b !== bank ? pattern :
      pattern.map((row, p) => p !== selected ? row : row.map((on, k) => k === selectedStep ? true : on))));
    setVelocities(old => old.map((pattern, b) => b !== bank ? pattern :
      pattern.map((row, p) => p !== selected ? row : row.map((v, k) => k === selectedStep ? level : v))));
  };

  const updateFx = (key, value) => setFx(old => ({ ...old, [key]: value }));
  const updateSynth = (key, value) => setSynth(old => ({ ...old, [key]: value }));

  const randomize = () => {
    const probabilities = [0.35, 0.18, 0.58, 0.09, 0.14, 0.1, 0.11, 0.18,
      0.2, 0.09, 0.04, 0.14, 0.06, 0.07, 0.04, 0.03];
    const result = makeEmptyPattern().map((row, i) =>
      row.map((_, step) => Math.random() < probabilities[i] *
        (i === 0 && step % 4 === 0 ? 1.85 : i === 1 && step % 8 === 4 ? 3 : 1)));
    setBanks(old => old.map((p, i) => i === bank ? result : p));
    setVelocities(old => old.map((p, i) => i === bank ? velocitiesFromBanks([result])[0] : p));
    setStatus('NEW PATTERN GENERATED');
  };
  const clearPattern = () => {
    setBanks(old => old.map((p, i) => i === bank ? makeEmptyPattern() : p));
    setVelocities(old => old.map((p, i) => i === bank ? velocitiesFromBanks([makeEmptyPattern()])[0] : p));
    setStatus('CURRENT BANK CLEARED');
  };
  const copyBank = () => {
    const next = (bank + 1) % 4;
    setBanks(old => old.map((p, i) => i === next ? old[bank].map(row => [...row]) : p));
    setVelocities(old => old.map((p, i) => i === next ? old[bank].map(row => [...row]) : p));
    setBank(next);
    setStatus('PATTERN COPIED TO BANK ' + 'ABCD'[next]);
  };

  const importSample = async (index, file) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i.test(file.name)) {
      setStatus('CHOOSE AN AUDIO FILE'); return;
    }
    try {
      await ready();
      const seconds = await audio.loadSample(index, file);
      await storeSample(index, file.name, file);
      persistedSamples.current = await getSamples();
      setPads(old => old.map((pad, i) => i === index ?
        ({ ...pad, sampleName: file.name, chop: null, chopName: undefined }) : pad));
      setStatus('SAMPLE LOADED: ' + file.name.slice(0, 28) + ' / ' + seconds.toFixed(1) + ' SEC');
    } catch (error) { setStatus(error.message || 'SAMPLE FAILED'); }
  };
  const removeSelectedSample = async () => {
    try {
      audio.removeSample(selected);
      await removeSample(selected);
      persistedSamples.current = persistedSamples.current.filter(entry => entry.index !== selected);
      setPads(old => old.map((pad, i) => i === selected ?
        ({ ...pad, sampleName: undefined, chop: null, chopName: undefined }) : pad));
      setStatus('SAMPLE REMOVED: ORIGINAL VOICE RESTORED');
    } catch (error) { setStatus(error.message); }
  };

  const loadBreak = async file => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setStatus('BREAK TOO LARGE / 20 MB MAX. TRIM OR COMPRESS IT FIRST.');
      return;
    }
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i.test(file.name)) {
      setStatus('CHOOSE AN AUDIO FILE'); return;
    }
    try {
      await ready();
      const id = await sourceFingerprint(file);
      const info = await audio.loadChopSource(id, file);
      const sameSource = chopDeckRef.current?.id === id;
      setChopDeck({ id, name: file.name });
      setWavePeaks(info.peaks);
      setChopSeconds(info.duration);
      if (!sameSource) { setChopMarkers(equalMarkers()); setSelectedSlice(0); setFlipChops(false); }
      setStatus('BREAK DECODED: ' + file.name.slice(0, 40) + ' / ' + info.duration.toFixed(2) + 's');
      try { await saveChopSource(id, file.name, file); }
      catch { setStatus('BREAK PLAYS NOW, BUT LOCAL STORAGE FAILED: RELOAD FILE NEXT VISIT'); }
    } catch (error) { setStatus(error.message || 'BREAK COULD NOT BE DECODED'); }
  };

  const mapChopsToPads = () => {
    if (!chopDeck || !audio.chopSources.has(chopDeck.id)) {
      setStatus('LOAD THE BREAK BEFORE SENDING SLICES TO PADS');
      return;
    }
    const regions = chopAssignments(chopDeck.id, chopMarkers, flipChops);
    const basename = chopDeck.name.replace(/\.[^.]+$/, '').slice(0, 9).toUpperCase();
    setPads(old => old.map((pad, i) => ({
      ...pad, chop: regions[i], chopName: basename + ' ' + String(i + 1).padStart(2, '0'), tune: 0
    })));
    setStatus('16 CHOPS ON PADS / LIVE SEQUENCER READY / ORIGINAL PAD SAMPLES PRESERVED');
  };

  const previewSlice = async () => {
    if (!chopDeck) { setStatus('LOAD A BREAK TO PREVIEW'); return; }
    try {
      await ready();
      const info = await ensureChopSource(chopDeck.id);
      if (!wavePeaks.length) {
        setWavePeaks(info.peaks);
        setChopSeconds(info.duration);
      }
      audio.playChop({
        sourceId: chopDeck.id,
        ...sliceFor(chopMarkers, selectedSlice), reverse: reversePreview
      }, 0.9, 0, undefined, true);
      setStatus('PREVIEWING SLICE ' + String(selectedSlice + 1).padStart(2, '0') + (reversePreview ? ' IN REVERSE' : ''));
    } catch (error) { setStatus(error.message || 'SLICE PREVIEW FAILED. RELOAD THE SOURCE FILE.'); }
  };

  const togglePadReverse = () => {
    if (!pads[selected].chop) return;
    setPads(old => old.map((pad, i) => i === selected ?
      ({ ...pad, chop: { ...pad.chop, reverse: !pad.chop.reverse } }) : pad));
    setStatus('PAD ' + String(selected + 1).padStart(2, '0') + ' REVERSE TOGGLED');
  };

  const clearPadChop = () => {
    setPads(old => old.map((pad, i) => i === selected ?
      ({ ...pad, chop: null, chopName: undefined }) : pad));
    setStatus('CHOP REMOVED / PREVIOUS PAD SAMPLE OR SYNTH RESTORED');
  };

  const onExport = () => {
    const project = { version: 3, name, pads, banks, velocities, bank, bpm, swing, fx, synth, chain, songMode, quantize, padVelocity,
      chopDeck, chopMarkers, flipChops,
      notice: 'Audio files are NOT embedded in JSON. Back up your source breaks and pad samples; reimport them on other devices.' };
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      'PhiBox-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 36) + '.json');
    setStatus('PROJECT EXPORTED / SAMPLES REMAIN LOCAL');
  };
  const importProject = async file => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.banks) || data.banks.length !== 4 ||
        !data.banks.every(isPattern) || !Array.isArray(data.pads) || data.pads.length !== 16)
        throw new Error('INVALID PHIBOX PROJECT');
      stopTransport();
      const d = factory();
      setName(String(data.name || d.name).slice(0, 44));
      setPads(d.pads.map((p, i) => ({
        ...p, tune: clamp(data.pads[i]?.tune, -12, 12),
        chop: normalizeChop(data.pads[i]?.chop),
        chopName: typeof data.pads[i]?.chopName === 'string' ? data.pads[i].chopName.slice(0, 60) : undefined
      })));
      const nextDeck = typeof data.chopDeck?.id === 'string' && /^[a-f0-9]{64}$/.test(data.chopDeck.id)
        ? { id: data.chopDeck.id, name: String(data.chopDeck.name || 'BREAK').slice(0, 100) } : null;
      setChopDeck(nextDeck);
      setChopMarkers(normalizeMarkers(data.chopMarkers));
      setFlipChops(data.flipChops === true);
      setSelectedSlice(0);
      if (nextDeck) {
        try {
          const info = await ensureChopSource(nextDeck.id);
          setWavePeaks(info.peaks); setChopSeconds(info.duration);
        } catch { setWavePeaks([]); setChopSeconds(0); }
      } else { setWavePeaks([]); setChopSeconds(0); }
      setBanks(data.banks); setVelocities(normalizeVelocities(data.velocities, data.banks));
      setBank(clamp(data.bank, 0, 3));
      setChain(sanitizeChain(data.chain)); setSongMode(data.songMode === true);
      setQuantize(['1/16', '1/8', '1/4'].includes(data.quantize) ? data.quantize : '1/16');
      setPadVelocity(clamp(data.padVelocity ?? DEFAULT_VELOCITY, 0.05, 1));
      setBpm(clamp(data.bpm, 40, 240)); setSwing(clamp(data.swing, 0, 70));
      setFx({ ...d.fx, ...data.fx }); setSynth({ ...d.synth, ...data.synth });
      await clearSamples();
      persistedSamples.current = [];
      audio.samples.clear();
      setStatus('PROJECT IMPORTED / ORIGINAL AUDIO NOT EMBEDDED. RELOAD ANY MISSING BREAK OR PAD SAMPLES.');
    } catch (error) { setStatus(error.message || 'IMPORT FAILED'); }
  };

  const toggleRecording = async () => {
    try {
      if (recording) {
        const blob = await audio.stopRecording();
        setRecording(false);
        if (blob) {
          const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
          download(blob, 'PhiBox-Take-' + new Date().toISOString().replace(/:/g, '-') + '.' + ext);
          setStatus('LIVE TAKE DOWNLOADED');
        }
      } else {
        await ready();
        await audio.startRecording();
        setRecording(true);
        setStatus('RECORDING MASTER OUTPUT');
      }
    } catch (error) { setStatus(error.message || 'RECORD ERROR'); }
  };

  const toggleVocoder = async () => {
    try {
      if (vocoding) { audio.stopVocoder(); setVocoding(false); setStatus('MIC RELEASED'); }
      else {
        await ready();
        await audio.startVocoder();
        audio.setVocoderPitch(vocoderPitch);
        setVocoding(true); setStatus('LIVE MIC VOCODER ON / USE HEADPHONES');
      }
    } catch (error) { setVocoding(false); setStatus(error.message || 'VOCODER ERROR'); }
  };

  const connectMidi = async () => {
    try {
      if (!navigator.requestMIDIAccess) throw new Error('WEB MIDI NEEDS A SUPPORTED CHROMIUM BROWSER');
      const access = await navigator.requestMIDIAccess({ sysex: false });
      const inputs = [...access.inputs.values()];
      if (!inputs.length) { setMidi('NO MIDI DEVICE FOUND'); return; }
      inputs.forEach(input => {
        input.onmidimessage = event => {
          const [command, note, vel] = event.data;
          const kind = command & 0xf0;
          if (kind === 0x90 && vel > 0) {
            if (note >= 36 && note <= 51) triggerPad(note - 36, vel / 127);
            else { ready().then(() => audio.noteOn(note)).catch(error => setStatus(error.message)); }
          } else if (kind === 0x80 || (kind === 0x90 && vel === 0)) audio.noteOff(note);
        };
      });
      setMidi(inputs.map(i => i.name).join(', ').slice(0, 38));
      setStatus('MIDI INPUT CONNECTED');
    } catch (error) { setStatus(error.message || 'MIDI FAILED'); }
  };

  const keyDown = async note => {
    try { await ready(); await audio.noteOn(note); setActiveNote(note); }
    catch (error) { setStatus(error.message); }
  };
  const keyUp = note => { audio.noteOff(note); setActiveNote(old => old === note ? null : old); };

  const pad = pads[selected];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span>Φ</span></div>
          <div><div className="brand-word">PHI<span>BOX</span><sup>™</sup></div>
            <div className="brand-sub">THE INFINITE GROOVE MACHINE</div></div>
        </div>
        <div className="topbar-center"><span className="live-light" /> BROWSER AUDIO WORKSTATION
          <span className="topbar-divider" /> V 0.3.0 <span className="beta-pill">ALPHA</span>
        </div>
        <a className="github-link" href="https://github.com/MichaelWave369/PhiBox" target="_blank" rel="noreferrer">
          SOURCE CODE <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main className="workspace">
        <div className="page-intro">
          <div><div className="overline title-kicker"><span className="tiny-diamond">◆</span> HARDWARE SOUL. SOFTWARE FREEDOM.</div>
            <h1>Make some <em>noise.</em></h1><p>Sixteen pads. Infinite possibilities. No permission slip required.</p>
          </div>
          <div className="visual-panel"><div className="spectrum-tag">PHI SPECTRAL ENGINE <span>● {audioReady ? 'LIVE' : 'STANDBY'}</span></div><Spectrum active={audioReady} />
            <div className="visual-foot"><span>LOW</span><span>MID</span><span>HIGH</span></div></div>
        </div>

        <section className="transport panel">
          <div className="project-label"><span className="overline">CURRENT PROJECT</span>
            <input aria-label="Project name" value={name} maxLength={44} onChange={e => setName(e.target.value.toUpperCase())} />
            <span className="mini-caption">AUTO-SAVED IN THIS BROWSER</span>
          </div>
          <div className="transport-main">
            <button className={'transport-play ' + (playing ? 'is-playing' : '')} onClick={toggleTransport}
              aria-label={playing ? 'Pause sequencer' : 'Play sequencer'}><Icon name={playing ? 'stop' : 'play'} size={25} /></button>
            <button className="transport-secondary" onClick={stopTransport} aria-label="Stop sequencer"><Icon name="stop" /></button>
            <button className={'transport-secondary record-button ' + (recording ? 'is-recording' : '')} onClick={toggleRecording}
              aria-label={recording ? 'Stop and download recording' : 'Record master audio'} title="Record audio to file, not sequencer steps">
              <Icon name="record" /></button>
          </div>
          <label className="tempo-block"><span className="overline">TEMPO / BPM</span>
            <div className="tempo-number"><input type="number" min="40" max="240" value={bpm} onChange={e => setBpm(clamp(e.target.value, 40, 240))} /><span>BPM</span></div></label>
          <label className="swing-block"><span className="overline">SWING</span>
            <div className="inline-range"><input aria-label="Swing amount" type="range" min="0" max="70" value={swing} onChange={e => setSwing(Number(e.target.value))} /><strong>{swing}%</strong></div></label>
          <div className="transport-right"><div className="sync-led"><i className={playing ? 'on' : ''} /> {armed ? 'OVERDUB' : playing ? 'PLAYING' : 'READY'}</div>
            <span>4 / 4 · 16 STEPS</span></div>
        </section>

        <div className="main-grid">
          <section className="panel pad-panel">
            <PanelHeader kicker="01 / PLAY SURFACE" title="The Pad Matrix" right={<span className="panel-count">16 VELOCITY VOICES</span>} />
            <div className="pads-grid">
              {pads.map((p, index) => <button key={index} type="button" onPointerDown={() => triggerPad(index)}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); importSample(index, e.dataTransfer.files[0]); }}
                className={'pad pad-' + p.color + (selected === index ? ' selected' : '') + (lit.includes(index) ? ' pad-hit' : '')}
                aria-label={'Play pad ' + (index + 1) + ': ' + (p.chop ? p.chopName : p.sampleName || p.name)}>
                <span className="pad-top"><span>{String(index + 1).padStart(2, '0')}</span><span className="pad-led" /></span>
                <span className="pad-middle">{p.chop ? '≋' : p.sampleName ? '◈' : p.group === 'drums' ? '✳' : '∿'}</span>
                <span className="pad-name">{p.chop ? p.chopName || 'CHOP ' + (index + 1) :
                  p.sampleName ? p.sampleName.replace(/\.[^.]+$/, '').slice(0, 12) : p.name}</span>
                <span className="pad-key">{HOTKEYS[index].toUpperCase()}</span>
              </button>)}
            </div>
            <div className="selected-editor">
              <div><span className="overline">PAD {String(selected + 1).padStart(2, '0')} / EDIT</span>
                <strong>{pad.chop ? pad.chopName || 'SLICED BREAK' : pad.sampleName ? pad.sampleName.slice(0, 24) : pad.name}</strong>
                <small>{pad.chop ? (pad.chop.reverse ? 'REVERSE CHOP' : 'SLICED AUDIO') + ' · NON-DESTRUCTIVE' :
                  pad.sampleName ? 'CUSTOM SAMPLE · LOCAL STORAGE' : pad.group === 'drums' ? 'ANALOG-MODELED DRUM' : 'SYNTHESIZED INSTRUMENT'}</small></div>
              <label className="tune-control"><span>TUNE</span>
                <input aria-label="Selected pad tuning in semitones" type="range" min="-12" max="12" value={pad.tune || 0}
                  onChange={e => setPads(old => old.map((p, i) => i === selected ? { ...p, tune: Number(e.target.value) } : p))} />
                <b>{pad.tune > 0 ? '+' : ''}{pad.tune || 0} ST</b></label>
              <div className="sample-actions">
                <button className="small-accent-button" onClick={() => { targetRef.current = selected; fileRef.current.click(); }}><Icon name="upload" size={14} /> LOAD SAMPLE</button>
                {pad.chop && <>
                  <button className="small-ghost-button" onClick={togglePadReverse}>
                    {pad.chop.reverse ? 'FORWARD ↗' : 'REVERSE ↶'}</button>
                  <button className="small-ghost-button" onClick={clearPadChop}>UNDO CHOP</button>
                </>}
                {!pad.chop && pad.sampleName && <button className="small-ghost-button" onClick={removeSelectedSample}>RESET</button>}
              </div>
            </div>
            <input ref={fileRef} hidden type="file" accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.ogg,.m4a"
              onChange={e => { importSample(targetRef.current, e.target.files?.[0]); e.target.value = ''; }} />
            <div className="panel-note">TIP · DRAG AUDIO ONTO ANY PAD OR USE KEYS 1–4, Q–R, A–F, Z–V</div>
          </section>

          <section className="panel sequencer-panel">
            <PanelHeader kicker="02 / RHYTHM ARCHITECT" title="Step Sequencer" right={<div className="bank-picker">
              {['A', 'B', 'C', 'D'].map((v, i) => <button key={v} className={i === bank ? 'active' : ''} onClick={() => setBank(i)}
                aria-label={'Pattern bank ' + v} aria-pressed={i === bank}>{v}</button>)}
            </div>} />
            <div className="sequence-meta"><div><span className="overline">PATTERN BANK</span><strong>{'ABCD'[bank]} / 01</strong></div>
              <div><span className="overline">RESOLUTION</span><strong>1 / 16</strong></div>
              <div><span className="overline">TIME SIGNATURE</span><strong>4 / 4</strong></div>
              <div><span className="overline">STEP</span><strong>{playhead < 0 ? '--' : String(playhead + 1).padStart(2, '0')} / 16</strong></div></div>
            <div className="sequence-scroll">
              <div className="seq-grid" role="group" aria-label="Sixteen-track step sequencer">
                <div className="seq-row seq-ruler"><span className="seq-label">VOICE / STEP</span>{Array.from({ length: 16 }, (_, i) =>
                  <span key={i} className={'seq-col-number ' + (playhead === i ? 'now' : '')}>{String(i + 1).padStart(2, '0')}</span>)}</div>
                {pads.map((p, row) => <div className={'seq-row ' + (selected === row ? 'seq-selected' : '')} key={row}>
                  <button className="seq-label seq-voice" onClick={() => { setSelected(row); triggerPad(row); }}>
                    <span className={'voice-dot voice-' + p.color} /><span>{p.sampleName ? p.sampleName.slice(0, 10).toUpperCase() : p.name}</span></button>
                  {banks[bank][row].map((on, step) => <button key={step}
                    type="button" aria-label={p.name + ' step ' + (step + 1) +
                      (on ? ' velocity ' + Math.round(velocities[bank][row][step] * 100) + '%' : '')}
                    aria-pressed={on}
                    onClick={() => toggleStep(row, step)}
                    style={on ? { '--step-strength': String(0.4 + velocities[bank][row][step] * 0.6) } : undefined}
                    className={'step-cell ' + (on ? 'on step-' + p.color : '') + (playhead === step ? ' at-playhead' : '') +
                      (selected === row && selectedStep === step ? ' step-editing' : '') +
                      (step % 4 === 0 ? ' beat-start' : '')}><i /></button>)}
                </div>)}
              </div>
            </div>
            <div className="capture-strip">
              <button type="button" className={'overdub-toggle ' + (armed ? 'is-armed' : '')}
                onClick={toggleOverdub} aria-pressed={armed}>
                <Icon name="record" size={15} /> {armed ? 'STOP PAD REC' : 'REC PADS'}
              </button>
              <label className="capture-select">QUANTIZE
                <select aria-label="Live record quantization" value={quantize} onChange={e => setQuantize(e.target.value)}>
                  <option value="1/16">1/16</option><option value="1/8">1/8</option><option value="1/4">1/4</option>
                </select>
              </label>
              <label className="capture-velocity">KEY VELOCITY
                <input type="range" min="0.05" max="1" step="0.01" value={padVelocity}
                  onChange={e => setPadVelocity(Number(e.target.value))} aria-label="Computer keyboard pad velocity" />
                <b>{Math.round(padVelocity * 100)}%</b>
              </label>
            </div>
            <div className="velocity-editor">
              <span>STEP VELOCITY · {'ABCD'[bank]} / {pads[selected].name} / {String(selectedStep + 1).padStart(2, '0')}</span>
              <input type="range" min="0.05" max="1" step="0.01"
                aria-label="Selected step velocity"
                value={velocities[bank][selected][selectedStep] || DEFAULT_VELOCITY}
                onChange={e => setStepVelocity(Number(e.target.value))} />
              <b>{banks[bank][selected][selectedStep] ? Math.round(velocities[bank][selected][selectedStep] * 100) + '%' : 'OFF'}</b>
            </div>
            <div className="sequencer-actions">
              <button onClick={randomize}><Icon name="shuffle" size={15} /> GENERATE</button>
              <button onClick={copyBank}>COPY TO NEXT BANK</button>
              <button onClick={clearPattern}><Icon name="trash" size={15} /> CLEAR BANK</button>
            </div>
            <div className="seq-bottom"><span><i /> {armed ? 'CAPTURING PERFORMANCE' : 'LIVE STEP SCHEDULING'}</span><span>PAD REC ≠ AUDIO EXPORT</span></div>
          </section>
        </div>

        <section className="panel arranger-panel">
          <div className="arranger-head">
            <div><span className="overline">03 / PERFORMANCE ARRANGER</span><h2>Pattern Chain</h2>
              <p>Choose a bank for each bar. Song mode loops this arrangement while you jam and record.</p></div>
            <button className={'song-toggle ' + (songMode ? 'active' : '')}
              onClick={() => setSongMode(old => !old)} aria-pressed={songMode}>
              <span className="song-toggle-led" /> SONG MODE {songMode ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="chain-grid" role="group" aria-label="Song arrangement, one pattern bank per bar">
            {chain.map((slot, index) => <button key={index} type="button"
              className={'chain-slot ' + (songMode && playing && activeBar % chain.length === index ? 'current' : '')}
              aria-label={'Bar ' + (index + 1) + ', bank ' + 'ABCD'[slot] + ', click to change'}
              title="Click to cycle through pattern banks A, B, C and D"
              onClick={() => setChain(old => old.map((v, i) => i === index ? (v + 1) % 4 : v))}>
              <span>BAR {String(index + 1).padStart(2, '0')}</span><b>{'ABCD'[slot]}</b></button>)}
          </div>
          <div className="arranger-actions"><span>{chain.length} BAR LOOP · CLICK A SLOT TO CYCLE BANKS</span>
            <div><button type="button" disabled={chain.length >= 16}
              onClick={() => setChain(old => [...old, old.at(-1) ?? 0])}>+ ADD BAR</button>
              <button type="button" disabled={chain.length <= 1}
                onClick={() => setChain(old => old.slice(0, -1))}>− REMOVE BAR</button></div>
          </div>
        </section>

        <section className="panel chop-shop-panel">
          <div className="chop-shop-head">
            <div>
              <span className="overline">07 / BREAK LABORATORY</span>
              <h2>Φ Sample Chop Shop <span className="chop-tag">R3 · NON-DESTRUCTIVE</span></h2>
              <p>Bring a break. Find the pocket. Slice it into sixteen new instruments.</p>
            </div>
            <button type="button" className="chop-load-button"
              onClick={() => chopFileRef.current?.click()}>
              <Icon name="upload" size={16} /> LOAD A BREAK
            </button>
            <input hidden ref={chopFileRef} type="file"
              accept="audio/*,.wav,.mp3,.flac,.aif,.aiff,.m4a,.ogg"
              onChange={e => { loadBreak(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div className="chop-meta-row">
            <span className="chop-source-label"><i className={wavePeaks.length ? 'active' : ''} />
              {chopDeck ? chopDeck.name : 'NO AUDIO SOURCE LOADED'}</span>
            <span>{chopSeconds ? chopSeconds.toFixed(2) + ' SEC' : '-- SEC'} · 16 CHOPS · 1 SOURCE FILE</span>
          </div>
          <div className="chop-drop-zone" onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); loadBreak(e.dataTransfer.files?.[0]); }}>
            <ChopWaveform peaks={wavePeaks} markers={chopMarkers}
              selected={selectedSlice} onSelect={setSelectedSlice}
              onMove={(index, fraction) => setChopMarkers(old => moveMarker(old, index, fraction))} />
          </div>
          <div className="chop-controls">
            <div className="chop-preview-actions">
              <button type="button" className="chop-preview" onClick={previewSlice}
                disabled={!chopDeck}><Icon name="play" size={16} /> PREVIEW {String(selectedSlice + 1).padStart(2, '0')}</button>
              <button type="button" className="chop-plain-button"
                onClick={() => audio.stopChopPreview()}>STOP PREVIEW</button>
              <button type="button" className={'chop-plain-button ' + (reversePreview ? 'selected' : '')}
                aria-pressed={reversePreview} onClick={() => setReversePreview(v => !v)}>
                {reversePreview ? '↶ REVERSE PREVIEW ON' : '↶ REVERSE PREVIEW'}
              </button>
            </div>
            <div className="chop-slice-info">
              <strong>SLICE {String(selectedSlice + 1).padStart(2, '0')}</strong>
              <span>{chopSeconds ? (chopMarkers[selectedSlice] * chopSeconds).toFixed(2) : '0.00'}s →
                {chopSeconds ? (chopMarkers[selectedSlice + 1] * chopSeconds).toFixed(2) : '0.00'}s</span>
            </div>
          </div>
          <div className="chop-routing">
            <div className="chop-routing-copy">
              <strong>ROUTE TO PAD MATRIX</strong>
              <span>Move marker lines to reshape slices. Routing replaces the pad sound, not its saved source sample.</span>
            </div>
            <div className="chop-route-buttons">
              <button type="button" className={'chop-plain-button ' + (flipChops ? 'selected' : '')}
                onClick={() => setFlipChops(v => !v)} aria-pressed={flipChops}>
                {flipChops ? 'ORDER: 16 → 01' : 'ORDER: 01 → 16'}
              </button>
              <button type="button" className="chop-route-main" onClick={mapChopsToPads}
                disabled={!chopDeck || !wavePeaks.length}>CHOP → 16 PADS <span>↗</span></button>
            </div>
          </div>
          <div className="chop-help">
            <span>DRAG A LINE TO MOVE A SLICE BOUNDARY · CLICK A REGION OR NUMBER TO PREVIEW</span>
            <span>AFTER EDITING, ROUTE AGAIN TO UPDATE THE PADS · EACH PAD HAS TUNE + REVERSE</span>
          </div>
          <div className="chop-warning">
            SOURCE AUDIO IS SAVED LOCALLY IN THIS BROWSER, NOT INSIDE PROJECT JSON.
            KEEP THE ORIGINAL FILE FOR MOVING TO ANOTHER MACHINE.
          </div>
        </section>

        <div className="lower-grid">
          <section className="panel synth-panel">
            <PanelHeader kicker="03 / SOUND DESIGN" title="Oscillator Lab" right={<span className="chip">POLYPHONIC SYNTH</span>} />
            <div className="wave-select"><span className="overline">WAVEFORM</span><div className="wave-options">
              {[['sine', '∿', 'SINE'], ['triangle', '△', 'TRIANGLE'], ['sawtooth', '⩘', 'SAW'], ['square', '⊓', 'SQUARE']].map(([wave, glyph, label]) =>
                <button key={wave} onClick={() => updateSynth('waveform', wave)}
                  className={synth.waveform === wave ? 'active' : ''} aria-pressed={synth.waveform === wave}><b>{glyph}</b><span>{label}</span></button>)}
            </div></div>
            <div className="knob-rack synth-knobs">
              <Knob label="ATTACK" min={0.005} max={1.2} step={0.005} value={synth.attack} display={synth.attack.toFixed(2) + 's'}
                onChange={v => updateSynth('attack', v)} accent="purple" />
              <Knob label="DECAY" min={0.02} max={1.5} step={0.01} value={synth.decay} display={synth.decay.toFixed(2) + 's'}
                onChange={v => updateSynth('decay', v)} accent="purple" />
              <Knob label="SUSTAIN" min={0} max={1} step={0.01} value={synth.sustain} display={Math.round(synth.sustain * 100) + '%'}
                onChange={v => updateSynth('sustain', v)} accent="purple" />
              <Knob label="RELEASE" min={0.02} max={2} step={0.01} value={synth.release} display={synth.release.toFixed(2) + 's'}
                onChange={v => updateSynth('release', v)} accent="purple" />
            </div>
            <div className="keyboard-info"><span>LIVE KEYS <b>C4 – B5</b></span><span>PLAY WITH MOUSE / TOUCH / MIDI</span></div>
            <div className="keyboard">
              {whiteNotes.map(note => <button key={note} onPointerDown={() => keyDown(note)} onPointerUp={() => keyUp(note)}
                onPointerLeave={() => keyUp(note)} onPointerCancel={() => keyUp(note)}
                className={'white-key ' + (activeNote === note ? 'key-active' : '')} aria-label={'Play ' + noteName(note)}>
                <span>{noteName(note)}</span></button>)}
              {blackNotes.map(([note, index]) => <button key={note}
                style={{ left: String((index + 0.71) / 14 * 100) + '%' }}
                onPointerDown={() => keyDown(note)} onPointerUp={() => keyUp(note)}
                onPointerLeave={() => keyUp(note)} onPointerCancel={() => keyUp(note)}
                className={'black-key ' + (activeNote === note ? 'key-active' : '')} aria-label={'Play ' + noteName(note)} />)}
            </div>
          </section>

          <section className="panel fx-panel">
            <PanelHeader kicker="04 / MASTER PROCESSING" title="The Effects Rack" right={<span className="chip">REAL-TIME DSP</span>} />
            <div className="fx-subheading"><span className="overline">SIGNAL CHAIN</span><span>DRIVE <b>→</b> FILTER <b>→</b> FX <b>→</b> COMPRESSOR</span></div>
            <div className="knob-rack fx-knobs">
              <Knob label="VOLUME" min={0} max={1} step={0.01} value={fx.volume}
                display={Math.round(fx.volume * 100) + '%'} onChange={v => updateFx('volume', v)} />
              <Knob label="CUTOFF" min={180} max={20000} step={20} value={fx.cutoff}
                display={(fx.cutoff / 1000).toFixed(1) + 'K'} onChange={v => updateFx('cutoff', v)} />
              <Knob label="DRIVE" min={0} max={1} step={0.01} value={fx.drive}
                display={Math.round(fx.drive * 100) + '%'} onChange={v => updateFx('drive', v)} />
              <Knob label="DELAY" min={0} max={0.8} step={0.01} value={fx.delay}
                display={Math.round(fx.delay * 100) + '%'} onChange={v => updateFx('delay', v)} />
              <Knob label="REVERB" min={0} max={0.8} step={0.01} value={fx.reverb}
                display={Math.round(fx.reverb * 100) + '%'} onChange={v => updateFx('reverb', v)} />
            </div>
            <div className="fx-signal"><div className="signal-light" /><div><strong>PHI AUDIO PATH</strong>
              <span>Web Audio · Stereo master · Live monitoring</span></div>
              <div className="signal-bars"><i /><i /><i /><i /><i /><i /><i /></div></div>
          </section>
        </div>

        <div className="utilities-grid">
          <section className="panel utility-panel vocal-panel">
            <PanelHeader kicker="05 / HUMAN INTERFACE" title="Voice Transformer"
              right={<span className="chip">8-BAND VOCODER</span>} />
            <p>Speak into your microphone. An eight-band filter bank reshapes a synthesized carrier with your voice.</p>
            <div className="voice-controls">
              <button className={'mic-button ' + (vocoding ? 'mic-live' : '')} onClick={toggleVocoder}>
                <Icon name="mic" size={20} /> {vocoding ? 'MIC ON · DISCONNECT' : 'ENABLE LIVE MIC'}</button>
              <label><span>CARRIER PITCH <b>{Math.round(vocoderPitch)} Hz</b></span>
                <input type="range" min="55" max="440" step="1" value={vocoderPitch} onChange={e => {
                  const pitch = Number(e.target.value); setVocoderPitch(pitch); audio.setVocoderPitch(pitch);
                }} /></label>
            </div>
            <div className="utility-footnote">HEADPHONES RECOMMENDED. MICROPHONE AUDIO IS PROCESSED LOCALLY, NOT UPLOADED.</div>
          </section>
          <section className="panel utility-panel session-panel">
            <PanelHeader kicker="06 / STUDIO MEMORY" title="Session & MIDI" right={<span className="chip">LOCAL FIRST</span>} />
            <p>Save your patterns and instrument settings. Imported samples stay in this browser's IndexedDB.</p>
            <div className="session-actions">
              <button onClick={onExport}><Icon name="download" size={16} /> EXPORT PROJECT</button>
              <button onClick={() => projectRef.current.click()}><Icon name="upload" size={16} /> IMPORT PROJECT</button>
              <button onClick={connectMidi}><span className="midi-dot" /> CONNECT MIDI</button>
            </div>
            <input hidden type="file" accept=".json,application/json" ref={projectRef}
              onChange={e => { importProject(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="midi-device"><span>DEVICE</span><b>{midi}</b></div>
          </section>
        </div>
        <footer className="studio-footer">
          <div className="status-text"><span className={'status-orb ' + (playing || vocoding || recording ? 'active' : '')} /> {status}</div>
          <div>PHIBOX / BUILT FOR THE FIELD <span>✦</span> NO CLOUD REQUIRED TO PLAY</div>
        </footer>
      </main>
    </div>
  );
}
