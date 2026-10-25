import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePunch,punchFraction,punchWeight,renderPunch} from '../src/audio/punch.js';
const buffer=(left,right=left,rate=1600)=>({
  length:left.length,sampleRate:rate,numberOfChannels:2,getChannelData:c=>c?right:left
});
test('only valid punch boundaries are accepted',()=>{
  assert.deepEqual(normalizePunch({start:.25,end:.5}),{start:.25,end:.5});
  assert.equal(normalizePunch({start:.5,end:.5}),null);
  assert.equal(normalizePunch({start:-1,end:.9}),null);
  assert.equal(normalizePunch({start:0,end:2}),null);
  assert.equal(punchFraction(125,100),.25);
  assert.equal(punchWeight(.7,.25,.5,.01),0);
});
test('punch replaces a chosen region while keeping other PCM intact',()=>{
  const old=buffer(new Float32Array(1600).fill(.25));
  const hit=buffer(new Float32Array(1600).fill(.75));
  const mixed=renderPunch(old,hit,{oldBpm:120,newBpm:120,
    originTime:0,startTime:0,region:{start:.25,end:.5}});
  const out=mixed.pcm[0];
  assert.ok(Math.abs(out[100]-.25)<1e-5);
  assert.ok(Math.abs(out[600]-.75)<1e-5);
  assert.ok(Math.abs(out[1200]-.25)<1e-5);
  assert.ok(Math.abs(old.getChannelData(0)[600]-.25)<1e-5);
});
test('punch placement stays tied to loop phase when recording starts later',()=>{
  const old=buffer(Float32Array.from([.1,.2,.3,.4]),undefined,4);
  const hit=buffer(Float32Array.from([.9,.9,.9,.9]),undefined,4);
  const mixed=renderPunch(old,hit,{oldBpm:120,newBpm:120,originTime:0,startTime:.5,
    region:{start:.25,end:.75},fadeSeconds:0});
  // Starts at phase .5. First sample replaces old .3; third sample starts phase 0 so original .1.
  assert.ok(Math.abs(mixed.pcm[0][0]-.9)<1e-6);
  assert.ok(Math.abs(mixed.pcm[0][2]-.1)<1e-6);
});
test('fade boundaries prevent hard seam and gain is validated',()=>{
  const old=buffer(new Float32Array(1600).fill(.2));
  const hit=buffer(new Float32Array(1600).fill(.8));
  const options={oldBpm:120,newBpm:120,originTime:0,startTime:0,
    region:{start:.25,end:.5},gain:.5,fadeSeconds:.02};
  const mixed=renderPunch(old,hit,options).pcm[0];
  assert.ok(Math.abs(mixed[400]-.2)<1e-5);
  assert.ok(mixed[416]>.2 && mixed[416]<.4);
  assert.ok(Math.abs(mixed[600]-.4)<1e-5);
  assert.throws(()=>renderPunch(old,hit,{...options,gain:2}),/Invalid punch/);
});
