/* Non-destructive same-track overdub: render existing loop at current transport
   speed/phase, then mix a fresh live-bus capture into the same bar-length PCM. */

export function wrappedIndex(index, length) {
  if (!Number.isFinite(index) || !Number.isInteger(length) || length < 1) return 0;
  return ((index % length) + length) % length;
}

export function linearLoopSample(samples, position) {
  if (!(samples instanceof Float32Array) || !samples.length) return 0;
  const phase=wrappedIndex(position,samples.length);
  const a=Math.floor(phase), b=(a+1)%samples.length, t=phase-a;
  return samples[a]*(1-t)+samples[b]*t;
}

export function renderOverdub(existing, fresh, options) {
  const {oldBpm,newBpm,originTime,startTime,gain=0.85}=options||{};
  if (!existing || !fresh || existing.numberOfChannels<1 || fresh.numberOfChannels<1 ||
      !Number.isFinite(existing.sampleRate)||!Number.isFinite(fresh.sampleRate) ||
      !Number.isFinite(oldBpm)||oldBpm<=0 || !Number.isFinite(newBpm)||newBpm<=0 ||
      !Number.isFinite(originTime)||!Number.isFinite(startTime) ||
      !Number.isFinite(existing.length)||existing.length<1||
      !Number.isFinite(fresh.length)||fresh.length<1) {
    throw new Error('Cannot overdub without valid captured audio and tempo');
  }
  if (gain<0 || gain>1.5 || !Number.isFinite(gain)) throw new Error('Invalid overdub gain');
  const rate=newBpm/oldBpm;
  const offset=Math.max(0,startTime-originTime)*rate*existing.sampleRate;
  const increment=rate*existing.sampleRate/fresh.sampleRate;
  const channels=Math.min(2,fresh.numberOfChannels);
  const pcm=Array.from({length:channels},()=>new Float32Array(fresh.length));
  for(let channel=0;channel<channels;channel++){
    const old=existing.getChannelData(Math.min(channel,existing.numberOfChannels-1));
    const incoming=fresh.getChannelData(channel);
    const out=pcm[channel];
    for(let i=0;i<out.length;i++){
      const prior=linearLoopSample(old,offset+i*increment);
      const value=prior+(incoming[i]||0)*gain;
      out[i]=Math.max(-1,Math.min(1,value));
    }
  }
  return {length:fresh.length,sampleRate:fresh.sampleRate,pcm};
}

// Used by the audio engine to build a Web Audio AudioBuffer without modifying
// either the previous take or the fresh recording.
export function toAudioBuffer(ctx, result) {
  const buffer=ctx.createBuffer(result.pcm.length,result.length,result.sampleRate);
  result.pcm.forEach((channel,index)=>buffer.copyToChannel(channel,index));
  return buffer;
}
