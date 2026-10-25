/* ΦBOX R9 · ChippyDip pattern compatibility adapter.
 * This versioned interchange mirrors ChippyDip's v1-v5 JSON contract.
 * Do not bundle PCM; pattern files only contain sound settings and notes.
 * All incoming data is validated before a new PhiBox state is produced.
 */
import {CHIP_PATCHES, makeInstrument, sanitizeInstrument} from './instrument-state.js';

import {sanitizeCustom,normalizedOverride} from './chip-validation.js';
const IDS=Object.values(CHIP_PATCHES).flat();
const DUTIES=[.125,.25,.5,.75];
const bounded=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const FAMILY=Object.fromEntries(Object.entries(CHIP_PATCHES).flatMap(([family,ids])=>ids.map(id=>[id,family])));
export function readChippyDipPattern(input){
  if(!plain(input)||input.format!=='chippydip-pattern'||![1,2,3,4,5].includes(input.version)){
    throw new Error('Choose a ChippyDip pattern JSON (version 1–5).');
  }
  if(!IDS.includes(input.preset))throw new Error('Unknown ChippyDip factory preset');
  if(!bounded(input.bpm,60,200)||!DUTIES.includes(input.duty))
    throw new Error('ChippyDip BPM or pulse duty is outside the supported range');
  if(!Array.isArray(input.steps)||input.steps.length!==16||
    !input.steps.every(n=>n===null||(Number.isInteger(n)&&n>=24&&n<=108)))
    throw new Error('Invalid 16-step ChippyDip melody');
  const family=FAMILY[input.preset];
  const layers=makeInstrument().layers;
  let mode='single';
  const custom={};
  // Strict validation of any optional top-level edit, just like ChippyDip.
  const top=normalizedOverride(input.preset,input);
  if(top)custom[input.preset]=top;
  if(input.version===5){
    if(!['single','double'].includes(input.mode)||
      !Array.isArray(input.layers)||input.layers.length!==4)
      throw new Error('Invalid Double Dip rack');
    mode=input.mode;
    for(let i=0;i<4;i++){
      const value=input.layers[i],base=layers[i];
      if(!plain(value)||value.chip!==base.chip||!CHIP_PATCHES[base.chip].includes(value.presetId)||
        typeof value.enabled!=='boolean'||!bounded(value.gain,0,1)||
        !Number.isInteger(value.transpose)||!bounded(value.transpose,-24,24))
        throw new Error('Invalid Double Dip layer '+(i+1));
      const unexpected=Object.keys(value).filter(k=>!['chip','presetId','enabled','gain','transpose','table','fm','sample'].includes(k));
      if(unexpected.length)throw new Error('Unexpected layer parameters');
      const patch=normalizedOverride(value.presetId,value);
      layers[i]={chip:value.chip,presetId:value.presetId,enabled:value.enabled,
        gain:value.gain,transpose:value.transpose};
      if(patch)custom[value.presetId]=patch;
    }
  }else if(input.mode!==undefined&&input.mode!=='single'){
    // Older versions ignore nonexistent layer mode; reject misleading edits.
    throw new Error('This ChippyDip version cannot contain Double Dip mode');
  }
  return {
    rack:sanitizeInstrument({
      mode:'chip',family:mode==='double'?'double':family,presetId:input.preset,
      duty:input.duty,layers,custom,sequence:input.steps,sequenceOn:true,
      note:60,gate:.8
    }),
    bpm:input.bpm,
    sourceVersion:input.version
  };
}
export function writeChippyDipPattern(rawRack,bpm){
  const rack=sanitizeInstrument(rawRack);
  const selected=IDS.includes(rack.presetId)?rack.presetId:'hero';
  const custom=sanitizeCustom(rack.custom);
  const single=custom[selected]||{};
  // ChippyDip accepts 60..200; explicitly clamp PhiBox's broader tempo.
  const tempo=Number.isFinite(Number(bpm))?Math.max(60,Math.min(200,Math.round(Number(bpm)))):120;
  const layers=rack.layers.map(layer=>({
    chip:layer.chip,presetId:layer.presetId,enabled:layer.enabled,gain:layer.gain,transpose:layer.transpose,
    ...(custom[layer.presetId]||{})
  }));
  return {
    format:'chippydip-pattern',version:5,preset:selected,
    duty:DUTIES.includes(rack.duty)?rack.duty:.5,bpm:tempo,
    steps:[...rack.sequence],
    ...single,
    mode:rack.family==='double'?'double':'single',
    layers
  };
}
// For in-app custom-patch editing, use the same strict validators.
export function applyPatchEdit(custom,id,edit){
  if(!IDS.includes(id))throw new Error('Unknown factory sound');
  const normalized=normalizedOverride(id,edit);
  return {...sanitizeCustom(custom),[id]:normalized||{}};
}
