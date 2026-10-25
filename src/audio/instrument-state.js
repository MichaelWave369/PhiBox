/* Serializable presets and arpeggio state shared by PhiBox R8.
   The actual chip sounds are played by vendored ChippyDip Web Audio modules. */
export const CHIP_CATEGORIES=['nes','gameboy','genesis','snes','double'];
export const CHIP_PATCHES={
  nes:['hero','pluck','hollow','bass','noise'],
  gameboy:['pocket-round','pocket-bite','pocket-bell','pocket-tooth'],
  genesis:['fm-voltage','fm-grit','fm-crystal','fm-horizon'],
  snes:['snes-harp','snes-bell','snes-strings','snes-choir']
};
export const ALL_CHIP_IDS=Object.values(CHIP_PATCHES).flat();
const DEFAULT_LAYERS=[
  {chip:'nes',presetId:'hero',enabled:true,gain:.6,transpose:0},
  {chip:'gameboy',presetId:'pocket-round',enabled:true,gain:.5,transpose:12},
  {chip:'genesis',presetId:'fm-grit',enabled:true,gain:.55,transpose:-12},
  {chip:'snes',presetId:'snes-strings',enabled:true,gain:.55,transpose:0}
];
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export function makeInstrument(){
  return {
    mode:'osc',family:'nes',presetId:'hero',layers:DEFAULT_LAYERS.map(l=>({...l})),
    favorites:[],sequence:Array(16).fill(null),sequenceOn:false,note:60,gate:.8
  };
}
export function sanitizeInstrument(raw){
  const d=makeInstrument();
  if(!raw || typeof raw!=='object')return d;
  const family=CHIP_CATEGORIES.includes(raw.family)?raw.family:d.family;
  const presetId=ALL_CHIP_IDS.includes(raw.presetId)?raw.presetId:d.presetId;
  const layers=Array.from({length:4},(_,i)=>{
    const seed=d.layers[i],v=Array.isArray(raw.layers)?raw.layers[i]:null;
    const allowed=CHIP_PATCHES[seed.chip];
    return {
      chip:seed.chip,presetId:allowed.includes(v?.presetId)?v.presetId:seed.presetId,
      enabled:typeof v?.enabled==='boolean'?v.enabled:seed.enabled,
      gain:Number.isFinite(v?.gain)?clamp(v.gain,0,1):seed.gain,
      transpose:Number.isInteger(v?.transpose)?clamp(v.transpose,-24,24):seed.transpose
    };
  });
  return {
    mode:raw.mode==='chip'?'chip':'osc',
    family,presetId,layers,
    favorites:Array.isArray(raw.favorites) ?
      [...new Set(raw.favorites.filter(id=>ALL_CHIP_IDS.includes(id)))].slice(0,20):[],
    sequence:Array.isArray(raw.sequence)&&raw.sequence.length===16?
      raw.sequence.map(n=>Number.isInteger(n)&&n>=36&&n<=96?n:null):d.sequence,
    sequenceOn:raw.sequenceOn===true,
    note:Number.isInteger(raw.note)?clamp(raw.note,36,96):d.note,
    gate:Number.isFinite(raw.gate)?clamp(raw.gate,.1,1):d.gate
  };
}
export function setChipStep(pattern,index,note){
  if(!Array.isArray(pattern)||pattern.length!==16||!Number.isInteger(index)||index<0||index>=16)return pattern;
  const next=[...pattern];
  if(note===null)next[index]=null;
  else if(Number.isInteger(note)&&note>=36&&note<=96)next[index]=note;
  return next;
}
export function bankForPreset(id){
  return Object.keys(CHIP_PATCHES).find(key=>CHIP_PATCHES[key].includes(id))||'nes';
}
