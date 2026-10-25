import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOP_COUNT,validMarkers } from '../src/audio/chops.js';
import {
  onsetEnvelope, estimatedTempo, smartTransientMarkers, beatGridMarkers,
  tempoFactor, grainTimeline, safeTempo
} from '../src/audio/break-intelligence.js';

const makeBuffer = (seconds=8,bpm=120,sampleRate=12000) => {
  const pcm=new Float32Array(seconds*sampleRate);
  const spacing=60/bpm;
  for(let t=0;t<seconds;t+=spacing){
    const index=Math.round(t*sampleRate);
    for(let j=0;j<180&&index+j<pcm.length;j++){
      pcm[index+j]+=0.9*Math.exp(-j/23);
    }
  }
  return {
    length:pcm.length,sampleRate,duration:seconds,numberOfChannels:1,
    getChannelData:()=>pcm
  };
};
test('detects pulse-train onset candidates, producing 16 ordered regions',()=>{
  const analysis=onsetEnvelope(makeBuffer());
  const smart=smartTransientMarkers(analysis);
  assert.ok(smart);
  assert.equal(smart.markers.length,CHOP_COUNT+1);
  assert.equal(validMarkers(smart.markers),true);
  assert.ok(smart.snapped>=3);
});
test('tempo autocorrelation recognizes steady 120 BPM clicks',()=>{
  const tempo=estimatedTempo(onsetEnvelope(makeBuffer(9,120)));
  assert.ok(tempo);
  assert.ok(Math.abs(tempo.bpm-120)<=2,JSON.stringify(tempo));
});
test('silence cannot fabricate tempo or smart transients',()=>{
  const blank=makeBuffer(4);
  blank.getChannelData=()=>new Float32Array(blank.length);
  const analysis=onsetEnvelope(blank);
  assert.equal(estimatedTempo(analysis),null);
  assert.equal(smartTransientMarkers(analysis),null);
});
test('beat grid is an exact 4-bar loop inside longer source',()=>{
  const marks=beatGridMarkers(12,120,4,2);
  assert.ok(marks);
  assert.equal(marks.length,17);
  assert.ok(Math.abs(marks[0] - 2/12)<1e-9);
  assert.ok(Math.abs(marks[16] - 10/12)<1e-9);
  assert.ok(Math.abs((marks[4]-marks[0])*12-2)<1e-8);
});
test('beat-grid rejects too-short sources and invalid offsets',()=>{
  assert.equal(beatGridMarkers(4,120,4,0),null);
  assert.equal(beatGridMarkers(9,120,4,3),null);
  assert.equal(beatGridMarkers(10,0,4),null);
});
test('granular timeline changes duration without forcing playback rate',()=>{
  const stretched=grainTimeline(1,1.5);
  assert.ok(stretched.length>20);
  assert.ok(stretched.at(-1).at>1);
  assert.ok(stretched.every(g=>g.sourceOffset>=0 && g.sourceOffset+g.duration<=1+1e-6));
  assert.equal(tempoFactor(120,160),.75);
  assert.equal(tempoFactor(160,120),4/3);
  assert.equal(safeTempo('NaN',110),110);
});
