import { CHOP_COUNT, validMarkers } from './chops.js';

export const TEMPO_MIN = 65;
export const TEMPO_MAX = 190;

// Downmix to a coarse transient/energy envelope, rather than allocating a full-size copy.
export function onsetEnvelope(buffer, frameSeconds = 0.01) {
  if (!buffer || !buffer.sampleRate || !buffer.length || !buffer.numberOfChannels) return null;
  const channels = Array.from({length:Math.min(2,buffer.numberOfChannels)}, (_,i)=>buffer.getChannelData(i));
  const hop = Math.max(64, Math.round(buffer.sampleRate * frameSeconds));
  const length = Math.ceil(buffer.length / hop);
  const energy = new Float32Array(length);
  for (let frame=0; frame<length;frame++){
    let power=0, count=0;
    const start=frame*hop, end=Math.min(buffer.length,start+hop);
    // Sample every 4th frame to keep 3-minute files responsive.
    for (let i=start;i<end;i+=4) {
      for (const channel of channels) {
        const v=channel[i]||0;
        power+=v*v;
        count++;
      }
    }
    energy[frame]=Math.sqrt(power/Math.max(1,count));
  }
  // Positive logarithmic RMS changes identify attacks while suppressing slow sustained notes.
  const flux = new Float32Array(length);
  for(let i=1;i<length;i++){
    const previous=Math.max(0,energy[i-1]);
    const now=Math.max(0,energy[i]);
    flux[i]=Math.max(0, Math.log1p(now*80)-Math.log1p(previous*80));
  }
  // Normalization caps exceptionally strong attacks from dominating the BPM score.
  const smooth=new Float32Array(length);
  for(let i=1;i<length-1;i++){
    smooth[i]=Math.min(2, Math.max(flux[i-1],flux[i],flux[i+1]));
  }
  return {energy,flux:smooth,frameSeconds:hop/buffer.sampleRate,duration:buffer.duration||buffer.length/buffer.sampleRate};
}

export function estimatedTempo(analysis) {
  if (!analysis?.flux?.length || analysis.duration < 1.5) return null;
  const {flux,frameSeconds}=analysis;
  let energy=0, max=0;
  for(let i=0;i<flux.length;i++){ energy+=flux[i]*flux[i]; max=Math.max(max,flux[i]); }
  if(max < 0.015 || energy < 0.01) return null;
  const results=[];
  for(let bpm=TEMPO_MIN;bpm<=TEMPO_MAX;bpm++){
    const lag=Math.round(60/bpm/frameSeconds);
    if(lag<=2 || lag>=flux.length)continue;
    let correlation=0, sum1=0, sum2=0;
    for(let i=lag;i<flux.length;i++){
      const a=flux[i], b=flux[i-lag];
      correlation+=a*b; sum1+=a*a; sum2+=b*b;
    }
    const score=correlation/Math.sqrt(Math.max(1e-9,sum1*sum2));
    results.push({bpm,score});
  }
  results.sort((a,b)=>b.score-a.score);
  const winner=results[0];
  if(!winner || winner.score<0.13)return null;
  return {bpm:winner.bpm, confidence:Math.round(winner.score*100)/100};
}

export function smartTransientMarkers(analysis, count = CHOP_COUNT) {
  if(!analysis?.flux?.length || !Number.isInteger(count) || count!==CHOP_COUNT) return null;
  const {flux,frameSeconds,duration}=analysis;
  const candidates=[];
  // Ignore the beginning and end: boundaries stay within the source.
  const neighborhood=Math.max(1,Math.round(0.025/frameSeconds));
  let maxScore=0;
  for(let i=neighborhood;i<flux.length-neighborhood;i++){
    const v=flux[i];
    maxScore=Math.max(maxScore,v);
    if(v<0.025)continue;
    let isPeak=true;
    for(let j=Math.max(0,i-neighborhood);j<=Math.min(flux.length-1,i+neighborhood);j++){
      if(j!==i && flux[j]>v){isPeak=false;break;}
    }
    if(isPeak)candidates.push({fraction:i*frameSeconds/duration,score:v});
  }
  if(maxScore<0.025||!candidates.length) return null;
  const markers=[0];
  let snapped=0;
  for(let i=1;i<CHOP_COUNT;i++){
    const expected=i/CHOP_COUNT;
    // Favor real attacks within a neighborhood of each expected sixteenth.
    const radius=0.028;
    let choice=null, value=-Infinity;
    for(const candidate of candidates){
      const displacement=Math.abs(candidate.fraction-expected);
      if(displacement>radius || candidate.score < maxScore*0.09)continue;
      const weight=candidate.score/(maxScore+1e-9) - displacement/radius*0.34;
      if(weight>value){value=weight;choice=candidate;}
    }
    let marker=choice?choice.fraction:expected;
    marker=Math.min((i+1)/CHOP_COUNT-0.002,Math.max(markers[i-1]+0.002,marker));
    markers.push(marker);
    if(choice)snapped++;
  }
  markers.push(1);
  return validMarkers(markers) ? {markers,snapped,candidates:candidates.length} : null;
}

// One, two, or four bars are sliced into exactly 16 pads.
// For non-integer bar samples the loop occupies a true sub-region, not fake whole-file subdivisions.
export function beatGridMarkers(duration, bpm, bars = 4, startSeconds = 0) {
  if(!Number.isFinite(duration)||duration<=0 ||
     !Number.isFinite(bpm)||bpm<TEMPO_MIN||bpm>TEMPO_MAX||
     ![1,2,4].includes(bars)||!Number.isFinite(startSeconds))return null;
  const length=bars*4*60/bpm;
  if(length>duration+1e-5 || startSeconds<0 || startSeconds+length>duration+1e-5)return null;
  const start=Math.max(0,startSeconds);
  const marks=Array.from({length:CHOP_COUNT+1},(_,i)=>
    Math.min(1,(start+length*i/CHOP_COUNT)/duration));
  return validMarkers(marks)?marks:null;
}

export function safeTempo(value, fallback=120) {
  const bpm=Number(value);
  return Number.isFinite(bpm) && bpm>=TEMPO_MIN && bpm<=TEMPO_MAX ?
    Math.round(bpm) : fallback;
}

export function tempoFactor(sourceBpm, targetBpm) {
  if(!Number.isFinite(sourceBpm)||!Number.isFinite(targetBpm)||
    sourceBpm<=0||targetBpm<=0)return 1;
  return Math.min(2,Math.max(.5,sourceBpm/targetBpm));
}

// Grain positioning in output seconds and original-source seconds.
// Used by WebAudio for an approximate pitch-preserving overlap-add mode.
export function grainTimeline(sourceDuration, factor, grainSeconds=.09, hopSeconds=.045) {
  if(!Number.isFinite(sourceDuration)||sourceDuration<=0||
     !Number.isFinite(factor)||factor<=0)return [];
  const length=Math.min(15,sourceDuration*factor);
  const sourceHop=hopSeconds/factor;
  const plan=[];
  for(let n=0;n<=Math.ceil(length/hopSeconds) && n<384;n++){
    const output=n*hopSeconds;
    const input=n*sourceHop;
    if(output>=length || input>=sourceDuration)break;
    const outputLength=Math.min(grainSeconds,length-output);
    const inputLength=Math.min(outputLength,sourceDuration-input);
    if(inputLength<=0)break;
    plan.push({at:output,sourceOffset:input,duration:inputLength});
  }
  return plan;
}
