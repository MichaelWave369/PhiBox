import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOP_COUNT, equalMarkers, validMarkers, normalizeMarkers, moveMarker,
  sliceFor, chopAssignments, normalizeChop, playbackWindow, audioPeaks
} from '../src/audio/chops.js';

const id = 'b'.repeat(64);
test('equal slicing covers the full file with 16 contiguous segments', () => {
  const markers = equalMarkers(), pads = chopAssignments(id, markers);
  assert.equal(markers.length, 17);
  assert.equal(pads.length, CHOP_COUNT);
  assert.equal(pads[0].start, 0);
  assert.equal(pads[15].end, 1);
  assert.equal(pads[0].end, pads[1].start);
  assert.equal(sliceFor(markers, 7).start, 7 / 16);
});
test('flipped order preserves individual slice bounds', () => {
  const pads = chopAssignments(id, equalMarkers(), true);
  assert.equal(pads[0].start, 15 / 16);
  assert.equal(pads[15].end, 1 / 16);
});
test('marker drags stay between neighbors and never alter endpoints', () => {
  const markers = equalMarkers();
  assert.equal(moveMarker(markers, 1, -10)[1], 0.002);
  assert.equal(moveMarker(markers, 16, 0.5)[16], 1);
  assert.equal(moveMarker(markers, 1, Number.NaN)[1], 1/16);
});
test('invalid metadata is rejected rather than scheduling an unsafe range', () => {
  assert.equal(validMarkers([0, 1]), false);
  assert.deepEqual(normalizeMarkers([0, 1]), equalMarkers());
  assert.equal(normalizeChop({ sourceId:id, start: .8, end: .2 }), null);
  assert.equal(normalizeChop({ sourceId:'bad', start:0, end:.5 }), null);
  assert.deepEqual(normalizeChop({ sourceId:id, start:.125, end:.25, reverse:true }),
    { sourceId:id, start:.125, end:.25, reverse:true });
});
test('waveform peak extraction is finite on a tiny buffer', () => {
  const channel = Float32Array.from([-.8, .6, 0, .5, -.2]);
  const peaks = audioPeaks({length:5,numberOfChannels:1,getChannelData:()=>channel},64);
  assert.equal(peaks.length,64);
  assert.ok(peaks.every(p => Number.isFinite(p.min) && Number.isFinite(p.max)));
});

test('reverse playback addresses exactly the mirrored segment without changing source audio', () => {
  const forward = playbackWindow({sourceId:id,start:0.25,end:0.375,reverse:false}, 8, 0);
  const reversed = playbackWindow({sourceId:id,start:0.25,end:0.375,reverse:true}, 8, 12);
  assert.deepEqual(forward, {offset:2,duration:1,rate:1,audibleSeconds:1});
  assert.deepEqual(reversed, {offset:5,duration:1,rate:2,audibleSeconds:0.5});
  assert.equal(playbackWindow({sourceId:id,start:0,end:2,reverse:false}, 8), null);
});
