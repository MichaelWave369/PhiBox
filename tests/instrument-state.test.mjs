import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInstrument,sanitizeInstrument,setChipStep,bankForPreset,ALL_CHIP_IDS,CHIP_PATCHES} from '../src/audio/instrument-state.js';
test('PhiFLEX defaults keep existing Oscillator Lab audible',()=>{
 const settings=makeInstrument();
 assert.equal(settings.mode,'osc');assert.equal(settings.sequence.length,16);
 assert.equal(settings.layers.length,4);
 assert.ok(ALL_CHIP_IDS.length>=17);
});
test('all source presets map to one real chip family',()=>{
 for(const [bank,ids] of Object.entries(CHIP_PATCHES))for(const id of ids)
  assert.equal(bankForPreset(id),bank);
});
test('malformed imported JSON cannot inject foreign patches or unsafe notes',()=>{
 const result=sanitizeInstrument({mode:'chip',family:'injected',presetId:'nefarious',
 layers:[{chip:'snes',presetId:'snes-harp',gain:10,transpose:99,enabled:false}],
 favorites:['hero','fake','hero'],
 sequence:[1,2,3],gate:99,note:204});
 assert.equal(result.family,'nes');
 assert.equal(result.presetId,'hero');
 assert.equal(result.layers[0].presetId,'hero');
 assert.equal(result.layers[0].gain,1);
 assert.equal(result.layers[0].transpose,24);
 assert.deepEqual(result.favorites,['hero']);
 assert.deepEqual(result.sequence,Array(16).fill(null));
 assert.equal(result.note,96);assert.equal(result.gate,1);
});
test('chip sequencer allows toggles and preserves independent step cells',()=>{
 let steps=makeInstrument().sequence;
 steps=setChipStep(steps,1,64);
 assert.equal(steps[1],64);assert.equal(steps[0],null);
 steps=setChipStep(steps,1,null);
 assert.equal(steps[1],null);
 assert.equal(setChipStep(steps,50,60),steps);
});
