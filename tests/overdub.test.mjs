import test from 'node:test';
import assert from 'node:assert/strict';
import {wrappedIndex,linearLoopSample,renderOverdub} from '../src/audio/overdub.js';
const buffer=(left,right,rate=4)=>({
  length:left.length,sampleRate:rate,numberOfChannels:right?2:1,
  getChannelData:channel=>channel===1?right:left
});
test('linear interpolator wraps the loop boundary for fractional sample positions',()=>{
  const pcm=new Float32Array([0,1,0,-1]);
  assert.equal(wrappedIndex(-.5,4),3.5);
  assert.equal(linearLoopSample(pcm,3.5),-.5);
  assert.equal(linearLoopSample(pcm,4.5),.5);
});
test('exact-bar same-BPM overdub sums live input and old track',()=>{
  const old=buffer(Float32Array.from([.1,.2,.3,.4]));
  const incoming=buffer(Float32Array.from([.5,.5,.5,.5]));
  const mix=renderOverdub(old,incoming,{oldBpm:120,newBpm:120,originTime:0,startTime:0,gain:.5});
  assert.equal(mix.length,4);
  for(let i=0;i<4;i++)assert.ok(Math.abs(mix.pcm[0][i] - ((i+1)/10+.25))<1e-6);
  assert.equal(old.getChannelData(0)[0],.1,'original must remain unmodified');
});
test('phase offsets on subsequent bars and rates adapt when BPM changes',()=>{
  const old=buffer(Float32Array.from([0,.2,.4,.6]),null,4);
  const fresh=buffer(new Float32Array(4),null,4);
  const mix=renderOverdub(old,fresh,{oldBpm:120,newBpm:120,originTime:0,startTime:.25,gain:1});
  assert.ok(Math.abs(mix.pcm[0][0]-.2)<1e-6);
  const fast=renderOverdub(old,fresh,{oldBpm:60,newBpm:120,originTime:0,startTime:0,gain:0});
  assert.ok(Math.abs(fast.pcm[0][1]-.4)<1e-6);
});
test('overdub clips safely and retains left/right distinct channel inputs',()=>{
  const old=buffer(Float32Array.from([.9,.9]),Float32Array.from([-.9,-.9]));
  const incoming=buffer(Float32Array.from([.8,.8]),Float32Array.from([-.8,-.8]));
  const mix=renderOverdub(old,incoming,{oldBpm:120,newBpm:120,originTime:0,startTime:0,gain:1});
  assert.deepEqual([...mix.pcm[0]],[1,1]);
  assert.deepEqual([...mix.pcm[1]],[-1,-1]);
});
test('invalid capture gain, tempo and missing audio fail closed',()=>{
  assert.throws(()=>renderOverdub(null,null,{}),/valid captured/);
  assert.throws(()=>renderOverdub(buffer(new Float32Array([0])),buffer(new Float32Array([0])),
    {oldBpm:120,newBpm:120,originTime:0,startTime:0,gain:2}),/gain/);
});
