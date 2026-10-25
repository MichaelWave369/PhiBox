import React,{useRef,useState} from 'react';
import {PRESETS} from '../chippydip/audio.ts';
import {CHIP_PATCHES} from '../audio/chip-catalog.js';
import {applyPatchEdit} from '../audio/chippydip-bridge.js';

const TYPES={wavetable:'32 × 4-BIT WAVETABLE',fm:'4-OPERATOR FM',sample:'SNES PCM SHAPER',pulse:'NES DUTY WAVE'};
const friendly=n=>n>0?'+'+n:n;
export default function PatchPortal({rack,onChange,onImport,onExport}){
  const fileRef=useRef(null);
  const [layerIndex,setLayerIndex]=useState(0);
  const targetId=rack.family==='double'?rack.layers[layerIndex].presetId:rack.presetId;
  const selected=PRESETS.find(p=>p.id===targetId);
  const edited=rack.custom?.[targetId]||{};
  const wave=edited.table||selected?.table;
  const fm=edited.fm||selected?.fm;
  const sample=edited.sample||selected?.sample;
  const save=(edit)=>{
    try {
      onChange({...rack,custom:applyPatchEdit(rack.custom,targetId,edit)});
    }catch(error) { console.warn('PhiFLEX edit was rejected',error); }
  };
  const updateFm=(key,value)=>{
    if(!fm)return;
    save({fm:{...fm,[key]:value}});
  };
  const updateOperator=(index,key,value)=>{
    if(!fm)return;
    save({fm:{...fm,operators:fm.operators.map((op,i)=>i===index?{...op,[key]:value}:op)}});
  };
  const updateSample=(key,value)=>{
    if(sample)save({sample:{...sample,[key]:value}});
  };
  const updateWave=(index,value)=>{
    if(!wave)return;
    const next=[...wave];next[index]=value;save({table:next});
  };
  const onFile=event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(file)onImport(file);
  };
  return <div className="patch-portal">
    <div className="patch-portal-header">
      <div><span className="overline">R9 / INTER-APP PATCH PORTAL</span>
        <strong>CHIPPYDIP ↔ ΦFLEX</strong>
        <p>Bring in custom ChippyDip sound design, edit it here, and send a versioned pattern back.</p>
      </div>
      <div className="patch-portal-actions">
        <button type="button" className="patch-import" onClick={()=>fileRef.current?.click()}>
          <span aria-hidden="true">⇩</span> IMPORT CHIPPYDIP JSON
        </button>
        <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={onFile}/>
        <button type="button" className="patch-export" onClick={onExport}>
          <span aria-hidden="true">⇧</span> EXPORT TO CHIPPYDIP
        </button>
      </div>
    </div>
    <div className="patch-portal-info">
      <span>COMPATIBLE: CHIPPYDIP V1–V5 IMPORT · V5 EXPORT</span>
      <span>NO ROMS · NO AUDIO BYTES IN JSON · CHANGES SAVED IN PHIBOX PROJECT</span>
    </div>
    {rack.family==='double'&&<label className="patch-edit-layer">EDIT DOUBLE DIP LAYER
      <select value={layerIndex} aria-label="Layer to edit sound" onChange={e=>setLayerIndex(Number(e.target.value))}>
        {rack.layers.map((layer,i)=><option key={i} value={i}>
          {layer.chip.toUpperCase()} / {PRESETS.find(p=>p.id===layer.presetId)?.name||layer.presetId}
        </option>)}
      </select>
    </label>}
    <div className="patch-edit-head">
      <div><span className="overline">EDIT ACTIVE FACTORY PATCH OVERRIDE</span>
        <strong>{selected?.name||'SELECT A SOUND'}</strong>
        <small>{TYPES[selected?.wave]||'ORIGINAL CHIP INSTRUMENT'} · {edited.table||edited.fm||edited.sample?'CUSTOM SETTINGS':'FACTORY DEFAULTS'}</small>
      </div>
      <button type="button" className="patch-reset" disabled={!Object.keys(edited).length}
        onClick={()=>{const next={...rack.custom};delete next[targetId];onChange({...rack,custom:next});}}>
        RESTORE FACTORY PATCH
      </button>
    </div>
    {selected?.wave==='wavetable'&&wave&&<div className="patch-wave-editor">
      <p>32 four-bit wave cells. Raise or lower each column to redraw the voice, while the note is sounding.</p>
      <div className="patch-wave-columns">
        {wave.map((level,i)=><label key={i} title={'Column '+(i+1)+' · '+level+'/15'}>
          <input type="range" min="0" max="15" step="1"
            aria-label={'Wave column '+(i+1)} value={level}
            onChange={e=>updateWave(i,Number(e.target.value))}/>
          <span>{i+1}</span>
        </label>)}
      </div>
    </div>}
    {selected?.wave==='fm'&&fm&&<div className="patch-fm-editor">
      <div className="patch-fm-master">
        <label>ROUTING ALGORITHM
          <select value={fm.algorithm} aria-label="FM routing algorithm"
            onChange={e=>updateFm('algorithm',Number(e.target.value))}>
            {['STACK','SPLIT','FORK','LAYER'].map((name,i)=><option value={i} key={name}>{i+1} · {name}</option>)}
          </select>
        </label>
        <label>MOD INDEX <b>{fm.index.toFixed(1)}</b>
          <input type="range" min="0" max="12" step=".1" value={fm.index}
            aria-label="FM modulation index" onChange={e=>updateFm('index',Number(e.target.value))}/>
        </label>
      </div>
      <div className="patch-fm-operators">
        {fm.operators.map((op,i)=><div className="patch-fm-op" key={i}>
          <strong>OPERATOR {i+1}</strong>
          <label>RATIO <b>{op.ratio.toFixed(1)}</b>
            <input type="range" min=".5" max="16" step=".5" value={op.ratio}
              aria-label={'FM operator '+(i+1)+' ratio'} onChange={e=>updateOperator(i,'ratio',Number(e.target.value))}/></label>
          <label>LEVEL <b>{Math.round(op.level*100)}%</b>
            <input type="range" min="0" max="1" step=".01" value={op.level}
              aria-label={'FM operator '+(i+1)+' level'} onChange={e=>updateOperator(i,'level',Number(e.target.value))}/></label>
          <label>DECAY <b>{op.decay.toFixed(2)}s</b>
            <input type="range" min=".005" max="3" step=".005" value={op.decay}
              aria-label={'FM operator '+(i+1)+' decay'} onChange={e=>updateOperator(i,'decay',Number(e.target.value))}/></label>
        </div>)}
      </div>
    </div>}
    {selected?.wave==='sample'&&sample&&<div className="patch-snes-editor">
      <label>TUNE <b>{friendly(sample.tune)} ST</b>
        <input type="range" min="-12" max="12" step="1" value={sample.tune}
          aria-label="SNES sample tuning" onChange={e=>updateSample('tune',Number(e.target.value))}/></label>
      <label>ECHO <b>{Math.round(sample.echoMix*100)}%</b>
        <input type="range" min="0" max=".7" step=".01" value={sample.echoMix}
          aria-label="SNES sample echo mix" onChange={e=>updateSample('echoMix',Number(e.target.value))}/></label>
      <label>RELEASE <b>{sample.release.toFixed(2)}s</b>
        <input type="range" min=".01" max="4" step=".01" value={sample.release}
          aria-label="SNES sample release" onChange={e=>updateSample('release',Number(e.target.value))}/></label>
      <label className="patch-snes-loop"><input type="checkbox" checked={sample.loop}
        onChange={e=>updateSample('loop',e.target.checked)}/> LOOP SAMPLE</label>
    </div>}
    {selected?.wave==='pulse'&&<div className="patch-pulse-editor">
      <label>NES PULSE DUTY
        <select aria-label="NES pulse duty" value={rack.duty}
          onChange={e=>onChange({...rack,duty:Number(e.target.value)})}>
          {[.125,.25,.5,.75].map(n=><option key={n} value={n}>{Math.round(n*1000)/10}%</option>)}
        </select></label>
    </div>}
    {selected && !['wavetable','fm','sample','pulse'].includes(selected.wave)&&
      <p className="patch-no-editor">This voice plays the original factory waveform. Its tuning and envelopes are controlled by ChippyDip's source engine.</p>}
  </div>;
}
