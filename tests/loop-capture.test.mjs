import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function makeProcessor() {
  const source=await readFile(new URL('../src/audio/loop-capture-processor.js',import.meta.url),'utf8');
  const posted=[];
  const scope={
    sampleRate:48000,currentFrame:0,Float32Array,Math,Number,
    AudioWorkletProcessor:class { constructor() {this.port={ postMessage:(message)=>posted.push(message) };} },
    registerProcessor:(name,Class)=>{scope.Capture=Class;}
  };
  vm.runInNewContext(source,scope);
  assert.equal(typeof scope.Capture,'function');
  return {scope,posted,processor:new scope.Capture()};
}
test('worklet captures exact frame boundaries from live bus and ignores master',async()=>{
  const {scope,posted,processor}=await makeProcessor();
  processor.port.onmessage({data:{type:'arm',id:1,startFrame:64,frames:180,source:'live'}});
  for(let block=0;block<3;block++) {
    scope.currentFrame=block*128;
    const live=new Float32Array(128).map((_,i)=>block*128+i);
    const master=new Float32Array(128).fill(999);
    processor.process([[live,live], [master,master]],[[new Float32Array(128),new Float32Array(128)]]);
  }
  assert.equal(posted.filter(x=>x.type==='started').length,1);
  const completed=posted.find(x=>x.type==='complete');
  assert.equal(completed.frames,180);
  const data=new Float32Array(completed.left);
  assert.equal(data[0],64);
  assert.equal(data[179],243);
});
test('master resample selects input one; cancel discards pending capture',async()=>{
  const {scope,posted,processor}=await makeProcessor();
  processor.port.onmessage({data:{type:'arm',id:2,startFrame:0,frames:8,source:'master'}});
  processor.process([[new Float32Array(128).fill(.25)], [new Float32Array(128).fill(.75)]],[[new Float32Array(128)]]);
  assert.equal(new Float32Array(posted.find(x=>x.type==='complete').left)[0],.75);
  processor.port.onmessage({data:{type:'arm',id:3,startFrame:400,frames:16,source:'live'}});
  scope.currentFrame=128;
  processor.port.onmessage({data:{type:'abort'}});
  assert.ok(posted.some(x=>x.type==='aborted'&&x.id===3));
  assert.equal(processor.job,null);
});

test('external-input-only capture selects the isolated third worklet input',async()=>{
  const {posted,processor}=await makeProcessor();
  processor.port.onmessage({data:{type:'arm',id:4,startFrame:0,frames:8,source:'input'}});
  const pads=new Float32Array(128).fill(.25);
  const master=new Float32Array(128).fill(.75);
  const mic=new Float32Array(128).fill(.5);
  processor.process([[pads,pads],[master,master],[mic,mic]],[[new Float32Array(128)]]);
  const result=posted.find(item=>item.id===4 && item.type==='complete');
  assert.ok(result);
  assert.equal(new Float32Array(result.left)[0],.5);
  assert.equal(new Float32Array(result.right)[0],.5);
});
