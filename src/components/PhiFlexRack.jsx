import React,{useMemo,useState} from 'react';
import { PRESETS } from '../chippydip/audio.ts';
import {CHIP_CATEGORIES,CHIP_PATCHES,bankForPreset,setChipStep} from '../audio/instrument-state.js';

const LABELS={nes:'NES CLASSICS',gameboy:'POCKET WAVE',genesis:'GENESIS FM',snes:'SNES SAMPLE',double:'DOUBLE DIP'};
const PHI_NOTE_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const noteLabel=n=>PHI_NOTE_NAMES[n%12]+(Math.floor(n/12)-1);

export default function PhiFlexRack({rack,onChange,playhead,playing,onAudition,onRelease}){
  const [query,setQuery]=useState('');
  const [favoritesOnly,setFavoritesOnly]=useState(false);
  const filtered=useMemo(()=>PRESETS.filter(p=>{
    const category=p.chip||'nes';
    const text=(p.name+' '+p.caption+' '+category).toLowerCase();
    return (rack.family==='double'||category===rack.family) &&
      text.includes(query.toLowerCase().trim()) &&
      (!favoritesOnly||rack.favorites.includes(p.id));
  }),[rack.family,rack.favorites,query,favoritesOnly]);
  const current=PRESETS.find(p=>p.id===rack.presetId);
  const patch=(id)=>{
    onChange({...rack,mode:'chip',family:bankForPreset(id),presetId:id});
  };
  const pickFamily=family=>{
    onChange({...rack,mode:'chip',family,
      presetId:family==='double'?rack.presetId:CHIP_PATCHES[family][0]});
    setQuery('');
  };
  const toggleFavorite=id=>{
    onChange({...rack,favorites:rack.favorites.includes(id)?
      rack.favorites.filter(p=>p!==id):[...rack.favorites,id].slice(0,20)});
  };
  const changeLayer=(index,change)=>{
    onChange({...rack,layers:rack.layers.map((v,i)=>i===index?{...v,...change}:v)});
  };
  const changeSequence=(step)=>{
    const note=rack.sequence[step]===rack.note?null:rack.note;
    onChange({...rack,sequence:setChipStep(rack.sequence,step,note)});
  };
  return (
    <section className="panel phiflex-panel" aria-label="PhiFLEX preset synthesizer">
      <div className="phiflex-heading">
        <div><span className="overline">08 / INSTRUMENT BAY · CHIPPYDIP POWERED</span>
          <h2>ΦFLEX <span className="phiflex-title-tag">PRESET SYNTH LAB</span></h2>
          <p>Real ChippyDip chip voices inside PhiBox's mixer, sequencer, effects, and Loop Forge.</p>
        </div>
        <a className="phiflex-lab-link" href="https://michaelwave369.github.io/ChippyDip/"
          target="_blank" rel="noreferrer">OPEN FULL CHIPPYDIP LAB ↗</a>
      </div>
      <div className="phiflex-mode" role="group" aria-label="Choose synthesizer engine">
        <button type="button" aria-pressed={rack.mode==='osc'} className={rack.mode==='osc'?'active':''}
          onClick={()=>onChange({...rack,mode:'osc'})}>ORIGINAL OSCILLATOR</button>
        <button type="button" aria-pressed={rack.mode==='chip'} className={rack.mode==='chip'?'active':''}
          onClick={()=>onChange({...rack,mode:'chip'})}>ΦFLEX · CHIPPYDIP DSP</button>
        <span>{rack.mode==='chip'?'CHIP ENGINE ACTIVE ON PIANO / MIDI':'ORIGINAL PHIBOX OSCILLATOR ACTIVE'}</span>
      </div>
      <div className="phiflex-categories" role="group" aria-label="Browse sound family">
        {CHIP_CATEGORIES.map(bank=><button key={bank} type="button"
          onClick={()=>pickFamily(bank)} className={rack.family===bank?'active':''}
          aria-pressed={rack.family===bank}>{LABELS[bank]}</button>)}
      </div>
      <div className="phiflex-browser-bar">
        <label>PRESET LIBRARY
          <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
            aria-label="Search ChippyDip patches" placeholder="Search patch names, sound or family…"/>
        </label>
        <button type="button" aria-pressed={favoritesOnly} className={favoritesOnly?'active':''}
          onClick={()=>setFavoritesOnly(v=>!v)}>☆ {favoritesOnly?'FAVORITES ONLY':'SHOW FAVORITES'}</button>
        <span>{filtered.length} PATCHES · ALL ORIGINAL CHIPPYDIP SOUNDS</span>
      </div>
      <div className="phiflex-preset-grid">
        {filtered.map(p=><div key={p.id}
          className={'phiflex-preset '+(rack.presetId===p.id&&rack.mode==='chip'&&rack.family!=='double'?'selected':'')}>
          <button type="button" className="phiflex-preset-select" onClick={()=>patch(p.id)}>
            <span>{LABELS[p.chip||'nes']}</span>
            <strong>{p.name}</strong>
            <small>{p.caption}</small>
          </button>
          <button type="button" className={'phiflex-favorite '+(rack.favorites.includes(p.id)?'favorite':'')}
            onClick={()=>toggleFavorite(p.id)} title="Toggle favorite"
            aria-label={(rack.favorites.includes(p.id)?'Remove':'Save')+' '+p.name+' favorite'}>
            {rack.favorites.includes(p.id)?'★':'☆'}
          </button>
        </div>)}
        {!filtered.length&&<p className="phiflex-no-results">No matching factory patches in this category.</p>}
      </div>
      {rack.family==='double'&&<div className="phiflex-double-dip">
        <div className="phiflex-double-head"><strong>DOUBLE DIP · FOUR CHIP LAYERS</strong>
          <span>STACK NES + GAME BOY + GENESIS + SNES INTO ONE NOTE</span></div>
        <div className="phiflex-layers">
          {rack.layers.map((layer,i)=><div className="phiflex-layer" key={layer.chip}>
            <label className="phiflex-layer-toggle"><input type="checkbox" checked={layer.enabled}
              onChange={e=>changeLayer(i,{enabled:e.target.checked})}/>{LABELS[layer.chip]}</label>
            <select value={layer.presetId} aria-label={layer.chip+' layer preset'}
              onChange={e=>changeLayer(i,{presetId:e.target.value})}>
              {PRESETS.filter(p=>(p.chip||'nes')===layer.chip).map(p=>
                <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label>LEVEL <input type="range" min="0" max="1" step=".05" value={layer.gain}
              aria-label={layer.chip+' layer volume'} onChange={e=>changeLayer(i,{gain:Number(e.target.value)})}/>
              {Math.round(layer.gain*100)}%</label>
            <label>TRANSPOSE <select aria-label={layer.chip+' layer transpose'}
              value={layer.transpose} onChange={e=>changeLayer(i,{transpose:Number(e.target.value)})}>
              {[-24,-12,0,12,24].map(n=><option key={n} value={n}>{n>0?'+'+n:n} ST</option>)}
            </select></label>
          </div>)}
        </div>
      </div>}
      <div className="phiflex-performance">
        <div className="phiflex-current">
          <span className="overline">PERFORMANCE PATCH</span>
          <strong>{rack.family==='double'?'DOUBLE DIP · LAYERED CONSOLE':current?.name||'HERO PULSE'}</strong>
          <span>Use the existing PhiBox piano or MIDI keyboard below. This instrument routes into the master FX and loop recorder.</span>
        </div>
        <div className="phiflex-test">
          <button type="button" className="phiflex-audition"
            onPointerDown={()=>onAudition(rack.note)} onPointerUp={()=>onRelease(rack.note)}
            onPointerLeave={()=>onRelease(rack.note)} onPointerCancel={()=>onRelease(rack.note)}
            disabled={rack.mode!=='chip'}>♪ HOLD TO AUDITION {noteLabel(rack.note)}</button>
        </div>
      </div>
      <div className="phiflex-sequence">
        <div className="phiflex-sequence-head">
          <div><span className="overline">MELODIC PATTERN · 16 STEPS</span>
            <strong>Pitch Lane</strong><small>Click a step to set the chosen note. Click again to clear.</small></div>
          <label>WRITE NOTE
            <select aria-label="Instrument sequencer note" value={rack.note}
              onChange={e=>onChange({...rack,note:Number(e.target.value)})}>
              {Array.from({length:49},(_,i)=>i+48).map(n=><option key={n} value={n}>{noteLabel(n)}</option>)}
            </select>
          </label>
          <label>GATE
            <input type="range" min=".1" max="1" step=".05" value={rack.gate}
              aria-label="Instrument note gate length" onChange={e=>onChange({...rack,gate:Number(e.target.value)})}/>
            {Math.round(rack.gate*100)}%</label>
          <button type="button" className={rack.sequenceOn?'phiflex-sequence-enabled':''}
            aria-pressed={rack.sequenceOn} onClick={()=>onChange({...rack,sequenceOn:!rack.sequenceOn})}>
            {rack.sequenceOn?'STEP LANE ON':'STEP LANE OFF'}</button>
          <button type="button" onClick={()=>onChange({...rack,sequence:Array(16).fill(null)})}>CLEAR</button>
        </div>
        <div className="phiflex-steps" role="group" aria-label="Melodic sequencer steps">
          {rack.sequence.map((note,i)=><button key={i} type="button" onClick={()=>changeSequence(i)}
            title={note===null?'Set '+noteLabel(rack.note):noteLabel(note)}
            className={(note!==null?'note-on ':'')+(playing&&playhead===i?'playing':'')}
            aria-label={'Melodic step '+(i+1)+': '+(note===null?'empty':noteLabel(note))}>
            <span>{String(i+1).padStart(2,'0')}</span><strong>{note===null?'·':noteLabel(note)}</strong>
          </button>)}
        </div>
        <small className="phiflex-sequence-note">CHIP MODE + STEP LANE ON: SCHEDULED WITH THE SAME AUDIO CLOCK AS THE DRUMS. PITCH LANE IS SAVED IN PROJECT JSON.</small>
      </div>
      <div className="phiflex-credit">CHIPPYDIP MIT-licensed source DSP · ORIGINAL PATCHES ·
        <a href="https://github.com/MichaelWave369/ChippyDip" target="_blank" rel="noreferrer">
          SOURCE AND NATIVE VST3 DEVELOPMENT ↗</a>
      </div>
    </section>
  );
}
