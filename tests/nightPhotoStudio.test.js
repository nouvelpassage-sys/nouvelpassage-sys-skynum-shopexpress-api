import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { NightPhotoStudio, photoReviewPassed } from '../src/productAssistant/nightPhotoStudio.js';
const png = new PNG({width:1024,height:1024});
for(let i=0;i<png.data.length;i++) png.data[i]=i%4===3?255:(Math.floor(i/4096)/5 + (i*17%31)) % 256;
const bytes=PNG.sync.write(png);
const image={bytes,contentType:'image/png'};
const pass={sameProduct:true,sameFlowers:true,sameColors:true,samePackaging:true,sameShape:true,wholeProductVisible:true,whiteBackground:true,naturalAppearance:true,collage:false,addedObjects:false,uncertain:false};
const now=()=>new Date('2026-11-21T21:30:00Z');
test('review requires all strict booleans; missing, uncertain and changed product fail',()=>{
 assert.equal(photoReviewPassed(pass),true);
 for(const patch of [{sameFlowers:false},{uncertain:true},{sameColors:'true'},{collage:true},{whiteBackground:undefined}]) assert.equal(photoReviewPassed({...pass,...patch}),false);
});
for (const daytime of [false, true]) test(`successful edit and comparison are durable and reused after restart (daytime=${daytime})`,async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'studio-'));let calls=0;
 const fetchImpl=async(url,options)=>{calls++;if(url.endsWith('/edits')) {assert.equal(options.body.get('model'),'gpt-image-2');assert.match(options.body.get('prompt'),/Minimal White/);return {ok:true,json:async()=>({data:[{b64_json:bytes.toString('base64')}]})};}return {ok:true,json:async()=>({output_text:JSON.stringify(pass)})};};
 try{const opts={apiKey:'test',reviewModel:'test',dataDir,fetchImpl,now:daytime?()=>new Date('2026-11-21T10:00:00Z'):now,...(daytime?{publicationAllowed:(await import('../src/productAssistant/nightRuntime.js')).publicationAllowed}:{})};const result=await new NightPhotoStudio(opts).process(image);assert.equal(result.ready,true);assert.equal(calls,2);const cached=await new NightPhotoStudio(opts).process(image);assert.equal(cached.outputSha256,result.outputSha256);assert.equal(calls,2);assert.equal((await readdir(join(dataDir,'night-content','studio',result.storageKey))).includes('original'),true);}finally{await rm(dataDir,{recursive:true,force:true});}
});
test('unknown paid result is not retried after restart',async()=>{
 const dataDir=await mkdtemp(join(tmpdir(),'studio-'));let calls=0;
 const opts={apiKey:'test',reviewModel:'test',dataDir,now,fetchImpl:async()=>{calls++;throw new Error('timeout')}};
 try{await assert.rejects(new NightPhotoStudio(opts).process(image));await assert.rejects(new NightPhotoStudio(opts).process(image));assert.equal(calls,1);}finally{await rm(dataDir,{recursive:true,force:true});}
});
test('daytime does not call paid API',async()=>{
 let calls=0;const studio=new NightPhotoStudio({apiKey:'x',reviewModel:'x',dataDir:'/unused',now:()=>new Date('2026-11-21T10:00:00Z'),fetchImpl:async()=>{calls++}});
 await assert.rejects(studio.process(image));assert.equal(calls,0);
});
