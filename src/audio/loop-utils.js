export const LOOP_TRACKS = 4;
export const LOOP_BARS = [1,2,4];
export const LOOP_MAX_SECONDS = 25;
export const LOOP_DEFAULTS = () => Array.from({length:LOOP_TRACKS},(_,i)=>({
  id:i, name:'LOOP '+String(i+1).padStart(2,'0'), muted:false,volume:0.8, bars:1, bpm:120, hasAudio:false
}));
export const clamp01 = n => Math.min(1,Math.max(0,Number(n)||0));
export function normalizeLoops(raw) {
  const defaults=LOOP_DEFAULTS();
  if(!Array.isArray(raw))return defaults;
  return defaults.map((fallback,i)=>{
    const entry=raw[i] || {};
    return {
      ...fallback,
      muted:entry.muted===true,
      volume:clamp01(entry.volume ?? fallback.volume),
      name:typeof entry.name==='string' ? entry.name.slice(0,32):fallback.name,
      bpm:Number.isFinite(entry.bpm)&&entry.bpm>=40&&entry.bpm<=240?entry.bpm:120,
      bars:LOOP_BARS.includes(entry.bars)?entry.bars:1,
      hasAudio:entry.hasAudio===true
    };
  });
}
export function nextBarTime(currentTime, origin, bpm, guard=0.16) {
  if (![currentTime,origin,bpm,guard].every(Number.isFinite)||bpm<=0)return null;
  const duration=240/bpm;
  const now=currentTime+Math.max(guard,0);
  const count=Math.max(0,Math.ceil((now-origin)/duration));
  return origin+count*duration;
}
export function barFrames(bpm,bars,sampleRate){
  if(!Number.isFinite(bpm)||bpm<40||bpm>240||
     !LOOP_BARS.includes(bars)||!Number.isFinite(sampleRate)||sampleRate<=0) return null;
  const frames=Math.round(bars*240/bpm*sampleRate);
  return frames>0 && frames<=LOOP_MAX_SECONDS*sampleRate?frames:null;
}
export function encodeWav(buffer){
  if(!buffer || !Number.isFinite(buffer.length)||buffer.length<1 ||
    buffer.numberOfChannels<1||!Number.isFinite(buffer.sampleRate)) throw new Error('Invalid audio buffer');
  const channels=Math.min(2,buffer.numberOfChannels), frames=buffer.length;
  const bytes=44+frames*channels*2;
  if(bytes>20*1024*1024)throw new Error('Resample exceeds the Chop Shop 20 MB limit.');
  const array=new ArrayBuffer(bytes), data=new DataView(array);
  const tag=(offset,value)=>{for(let i=0;i<4;i++)data.setUint8(offset+i,value.charCodeAt(i));};
  tag(0,'RIFF');data.setUint32(4,bytes-8,true);tag(8,'WAVE');tag(12,'fmt ');
  data.setUint32(16,16,true);data.setUint16(20,1,true);data.setUint16(22,channels,true);
  data.setUint32(24,buffer.sampleRate,true);data.setUint32(28,buffer.sampleRate*channels*2,true);
  data.setUint16(32,channels*2,true);data.setUint16(34,16,true);tag(36,'data');
  data.setUint32(40,bytes-44,true);
  const pcm=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  for(let frame=0;frame<frames;frame++)for(let c=0;c<channels;c++){
    const sample=Math.max(-1,Math.min(1,pcm[c][frame]||0));
    data.setInt16(44+(frame*channels+c)*2,sample<0?Math.round(sample*32768):Math.round(sample*32767),true);
  }
  return new Blob([array],{type:'audio/wav'});
}
