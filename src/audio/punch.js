import { linearLoopSample } from './overdub.js';

// A punch is expressed as 0..1 of a full loop (not the capture timeline).
// The recorder still captures one full loop to preserve phase even if the take
// begins on bar 2 of a four-bar recording.
export function normalizePunch(input) {
  const start=Number(input?.start), end=Number(input?.end);
  if (!Number.isFinite(start)||!Number.isFinite(end)||
    start<0 || end>1 || end-start<1/64) return null;
  return {start,end};
}
export function punchFraction(sampleOffset,loopLength) {
  if(!Number.isFinite(sampleOffset)||!Number.isFinite(loopLength)||loopLength<=0)return 0;
  return ((sampleOffset%loopLength)+loopLength)%loopLength/loopLength;
}
export function punchWeight(fraction,start,end,fadeFraction) {
  if(fraction<start || fraction>=end)return 0;
  const f=Math.min(fadeFraction,(end-start)/4);
  if(f<=0)return 1;
  return Math.max(0,Math.min(1,(fraction-start)/f,(end-fraction)/f));
}
export function renderPunch(existing,fresh,options) {
  const {oldBpm,newBpm,originTime,startTime,region,gain=1,fadeSeconds=.007}=options||{};
  const punch=normalizePunch(region);
  if(!punch || !existing || !fresh || existing.length<1 || fresh.length<1 ||
    !Number.isFinite(existing.sampleRate)||!Number.isFinite(fresh.sampleRate) ||
    !Number.isFinite(oldBpm)||oldBpm<=0 || !Number.isFinite(newBpm)||newBpm<=0 ||
    !Number.isFinite(originTime)||!Number.isFinite(startTime)||
    !Number.isFinite(gain)||gain<0||gain>1.5)throw new Error('Invalid punch region or recording');
  const rate=newBpm/oldBpm;
  const phaseOffset=Math.max(0,startTime-originTime)*rate*existing.sampleRate;
  const increment=rate*existing.sampleRate/fresh.sampleRate;
  const channels=Math.min(2,fresh.numberOfChannels);
  const pcm=Array.from({length:channels},()=>new Float32Array(fresh.length));
  const fadeFraction=Math.max(0,Math.min(.1,fadeSeconds/(existing.length/existing.sampleRate)));
  for(let ch=0;ch<channels;ch++){
    const original=existing.getChannelData(Math.min(ch,existing.numberOfChannels-1));
    const captured=fresh.getChannelData(Math.min(ch,fresh.numberOfChannels-1));
    const result=pcm[ch];
    for(let i=0;i<fresh.length;i++){
      const phase=phaseOffset+i*increment;
      const fraction=punchFraction(phase,existing.length);
      const weight=punchWeight(fraction,punch.start,punch.end,fadeFraction);
      const previous=linearLoopSample(original,phase);
      result[i]=Math.max(-1,Math.min(1,previous*(1-weight)+(captured[i]||0)*gain*weight));
    }
  }
  return {length:fresh.length,sampleRate:fresh.sampleRate,pcm};
}
