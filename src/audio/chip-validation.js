import {CHIP_PATCHES} from './instrument-state.js';
const IDS=Object.values(CHIP_PATCHES).flat();
const DUTIES=[.125,.25,.5,.75];
const bounded=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const own=(x,key)=>Object.prototype.hasOwnProperty.call(x,key);
const FAMILY=Object.fromEntries(Object.entries(CHIP_PATCHES).flatMap(([family,ids])=>ids.map(id=>[id,family])));
const WAVES=new Set(CHIP_PATCHES.gameboy);
const FMS=new Set(CHIP_PATCHES.genesis);
const SNES=new Set(CHIP_PATCHES.snes);
const SHAPES=['harp','bell','strings','choir'];

export function validWave(table){
  return Array.isArray(table)&&table.length===32&&table.every(n=>Number.isInteger(n)&&n>=0&&n<=15);
}
export function validFM(input){
  return plain(input)&&Number.isInteger(input.algorithm)&&bounded(input.algorithm,0,3)&&
    bounded(input.index,0,12)&&Array.isArray(input.operators)&&input.operators.length===4&&
    input.operators.every(op=>plain(op)&&bounded(op.ratio,.5,16)&&bounded(op.level,0,1)&&
      bounded(op.attack,.001,2)&&bounded(op.decay,.005,3)&&bounded(op.sustain,0,1)&&
      bounded(op.release,.01,4));
}
export function validSample(v){
  return plain(v)&&SHAPES.includes(v.shape)&&typeof v.loop==='boolean'&&
    bounded(v.tune,-12,12)&&bounded(v.attack,.001,2)&&bounded(v.decay,.005,3)&&
    bounded(v.sustain,0,1)&&bounded(v.release,.01,4)&&
    bounded(v.echoMix,0,.7)&&bounded(v.echoTime,.07,.5);
}
export function normalizedOverride(id,src){
  if(!plain(src))return null;
  const res={};
  if(own(src,'table')){if(!WAVES.has(id)||!validWave(src.table))throw new Error('Invalid ChippyDip wavetable');res.table=[...src.table];}
  if(own(src,'fm')){if(!FMS.has(id)||!validFM(src.fm))throw new Error('Invalid ChippyDip FM operators');res.fm={
    algorithm:src.fm.algorithm,index:src.fm.index,operators:src.fm.operators.map(op=>({
      ratio:op.ratio,level:op.level,attack:op.attack,decay:op.decay,sustain:op.sustain,release:op.release
    }))
  };}
  if(own(src,'sample')){if(!SNES.has(id)||!validSample(src.sample))throw new Error('Invalid ChippyDip SNES patch');res.sample={
    shape:src.sample.shape,tune:src.sample.tune,loop:src.sample.loop,
    attack:src.sample.attack,decay:src.sample.decay,sustain:src.sample.sustain,
    release:src.sample.release,echoMix:src.sample.echoMix,echoTime:src.sample.echoTime
  };}
  return Object.keys(res).length?res:null;
}
export function sanitizeCustom(raw){
  if(!plain(raw))return {};
  const sanitized={};
  for(const id of IDS){
    if(!own(raw,id))continue;
    try{
      const patch=normalizedOverride(id,raw[id]);
      if(patch)sanitized[id]=patch;
    }catch{/* Do not save malformed values into Web Audio code. */}
  }
  return sanitized;
}
