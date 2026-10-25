/* Frame-accurate AudioWorklet PCM capture. Input 0 = live/dry bus; input 1 = master. */
class PhiLoopCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.job = null;
    this.port.onmessage = event => {
      const command = event.data;
      if (command.type === 'abort') {
        if (this.job) this.port.postMessage({ type: 'aborted', id: this.job.id });
        this.job = null;
      }
      if (command.type === 'arm' && !this.job) {
        const { id, startFrame, frames, source } = command;
        const maxFrames = Math.ceil(sampleRate * 25);
        if (!Number.isSafeInteger(frames) || frames < 1 || frames > maxFrames ||
          !Number.isSafeInteger(startFrame) || source !== 'live' && source !== 'master') {
          this.port.postMessage({ type:'error', id, message: 'Invalid capture window' });
          return;
        }
        this.job = {
          id, startFrame, frames, source, cursor: 0, started: false,
          left: new Float32Array(frames), right: new Float32Array(frames)
        };
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (output) for (const channel of output) channel.fill(0);
    const job = this.job;
    if (!job) return true;
    const input = inputs[job.source === 'master' ? 1 : 0] || [];
    const left = input[0], right = input[1] || left;
    const framesInBlock = output?.[0]?.length || left?.length || 128;
    for(let i=0;i<framesInBlock;i++){
      const frame=currentFrame+i;
      if(frame<job.startFrame)continue;
      if(!job.started){job.started=true;this.port.postMessage({type:'started',id:job.id});}
      if(job.cursor>=job.frames)break;
      job.left[job.cursor] = left?.[i] || 0;
      job.right[job.cursor] = right?.[i] || 0;
      job.cursor++;
    }
    if (job.cursor >= job.frames) {
      this.job=null;
      this.port.postMessage({
        type:'complete',id:job.id,frames:job.frames,source:job.source,
        left:job.left.buffer,right:job.right.buffer
      },[job.left.buffer,job.right.buffer]);
    }
    return true;
  }
}
registerProcessor('phi-loop-capture',PhiLoopCapture);
