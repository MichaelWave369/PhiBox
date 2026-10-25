import test from 'node:test';
import assert from 'node:assert/strict';
import {readChippyDipPattern,writeChippyDipPattern,applyPatchEdit} from '../src/audio/chippydip-bridge.js';
import {makeInstrument,sanitizeInstrument} from '../src/audio/instrument-state.js';
import {validWave,validFM,validSample} from '../src/audio/chip-validation.js';

const base = {
  format:'chippydip-pattern',version:5,preset:'pocket-bite',
  duty:.125,bpm:133,steps:[60,64,67,72,null,null,70,null,60,null,84,null,null,null,null,65],
  mode:'single',layers:makeInstrument().layers
};
const wave=Array.from({length:32},(_,i)=>i%16);
const fm={algorithm:2,index:3.5,operators:Array.from({length:4},(_,i)=>({
  ratio:i+1,level:.75,attack:.01,decay:.2,sustain:.4,release:.3
}))};
const sample={shape:'choir',tune:-3,loop:true,attack:.12,decay:.4,sustain:.7,release:.9,echoMix:.23,echoTime:.24};

test('imports actual ChippyDip v5 schema with edited 32-cell wave, preserves pattern and tempo',()=>{
  const result=readChippyDipPattern({...base,table:wave});
  assert.equal(result.rack.mode,'chip');
  assert.equal(result.rack.family,'gameboy');
  assert.equal(result.rack.presetId,'pocket-bite');
  assert.deepEqual(result.rack.custom['pocket-bite'].table,wave);
  assert.deepEqual(result.rack.sequence,base.steps);
  assert.equal(result.bpm,133);
  assert.equal(result.rack.duty,.125);
});
test('v5 export is lossless for four layer edits, FM and sample shaping',()=>{
  const pattern={
    ...base,mode:'double',preset:'fm-grit',fm,
    layers:base.layers.map((l,i)=>({...l,...(
      i===1?{table:wave}:i===2?{fm}:i===3?{sample}:{}
    )}))
  };
  const first=readChippyDipPattern(pattern);
  assert.equal(first.rack.family,'double');
  assert.equal(first.rack.custom['fm-grit'].fm.index,3.5);
  assert.equal(first.rack.custom['snes-strings'].sample.shape,'choir');
  const exported=writeChippyDipPattern(first.rack,first.bpm);
  assert.equal(exported.format,'chippydip-pattern');
  assert.equal(exported.version,5);
  assert.equal(exported.mode,'double');
  assert.deepEqual(exported.fm,fm);
  assert.deepEqual(exported.layers[1].table,wave);
  assert.deepEqual(exported.layers[2].fm,fm);
  assert.deepEqual(exported.layers[3].sample,sample);
  const again=readChippyDipPattern(exported);
  assert.deepEqual(again.rack.custom,first.rack.custom);
  assert.deepEqual(again.rack.layers,first.rack.layers);
});
test('older version 1-4 patches migrate into PhiFLEX without changing drum banks',()=>{
  for(const v of [1,2,3,4]){
    const {rack}=readChippyDipPattern({...base,version:v,mode:undefined,layers:undefined,table:wave});
    assert.equal(rack.family,'gameboy');
    assert.equal(rack.sequence.length,16);
    assert.equal(rack.sequence[0],60);
  }
});
test('oversized or illegal imported sound metadata cannot reach active DSP',()=>{
  assert.equal(validWave(wave),true);
  assert.equal(validWave([...wave,9]),false);
  assert.equal(validFM(fm),true);
  assert.equal(validFM({...fm,operators:[...fm.operators,{...fm.operators[0]}]}),false);
  assert.equal(validSample(sample),true);
  assert.equal(validSample({...sample,echoMix:99}),false);
  assert.throws(()=>readChippyDipPattern({...base,table:[1]}),/wavetable/);
  assert.throws(()=>readChippyDipPattern({...base,version:12}),/v1–v5|version 1–5|version/);
  assert.throws(()=>readChippyDipPattern({...base,steps:[999]}),/16-step/);
  assert.throws(()=>readChippyDipPattern({...base,mode:'double',layers:[{}]}),/Double Dip/);
  assert.throws(()=>readChippyDipPattern({...base,preset:'not-real'}),/factory preset/);
  const sanitized=sanitizeInstrument({mode:'chip',custom:{'fm-grit':{fm:{...fm,index:999}}}});
  assert.deepEqual(sanitized.custom,{});
});
test('editor updates live validated patch without corrupting unrelated sounds',()=>{
 const custom=applyPatchEdit({},'pocket-bite',{table:wave});
 const result=applyPatchEdit(custom,'fm-grit',{fm});
 assert.deepEqual(result['pocket-bite'].table,wave);
 assert.deepEqual(result['fm-grit'].fm,fm);
 assert.throws(()=>applyPatchEdit(result,'fm-grit',{fm:{...fm,index:NaN}}),/FM/);
});
test('exports safe ChippyDip tempo and retains original oscillator compatibility',()=>{
 const pattern=writeChippyDipPattern(makeInstrument(),220);
 assert.equal(pattern.bpm,200);
 assert.equal(pattern.mode,'single');
 assert.equal(pattern.preset,'hero');
 assert.deepEqual(pattern.steps,Array(16).fill(null));
 const roundtrip=readChippyDipPattern(pattern);
 assert.equal(roundtrip.rack.mode,'chip');
 assert.equal(sanitizeInstrument({}).mode,'osc');
});
