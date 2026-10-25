import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOP_DEFAULTS,normalizeLoops,barFrames,nextBarTime,encodeWav } from '../src/audio/loop-utils.js';

test('four independent tracks default to safe volumes and mute state',()=>{
  const tracks=normalizeLoops(null);
  assert.equal(tracks.length,4);
  assert.ok(tracks.every(t=>t.muted===false&&t.volume===.8));
  assert.equal(normalizeLoops([{muted:true,volume:99,name:'abc'}])[0].volume,1);
});
test('capture uses exact bar-length frames with limits',()=>{
  assert.equal(barFrames(120,1,48000),96000);
  assert.equal(barFrames(120,4,48000),384000);
  assert.equal(barFrames(40,4,48000),1152000);
  assert.equal(barFrames(5,4,48000),null);
  assert.equal(barFrames(120,3,48000),null);
});
test('next downbeat is future-guarded and stays phase-aligned',()=>{
  assert.equal(nextBarTime(10.2,10,120),12);
  assert.equal(nextBarTime(9.8,10,120),10);
  assert.equal(nextBarTime(11.96,10,120),14);
});
test('WAV encoder produces valid stereo PCM RIFF and hard size limit',()=>{
  const left=Float32Array.from([1,0,-1,0]),right=Float32Array.from([0,1,0,-1]);
  const wav=encodeWav({length:4,numberOfChannels:2,sampleRate:48000,getChannelData:i=>i?right:left});
  assert.equal(wav.type,'audio/wav');
  assert.equal(wav.size,60);
  assert.throws(()=>encodeWav({length:12000000,numberOfChannels:2,sampleRate:48000,getChannelData:()=>left}),/20 MB/);
});
