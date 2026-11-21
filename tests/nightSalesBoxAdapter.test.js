import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { fingerprintPhoto } from '../src/productAssistant/nightPhotoFingerprint.js';
import { createNightSalesBoxAdapter } from '../src/productAssistant/nightSalesBoxAdapter.js';
const night=()=>new Date('2026-11-21T21:30:00Z');
const pixels=Buffer.from(Array.from({length:64*64*4},(_,i)=>i%256));
const image=jpeg.encode({data:pixels,width:64,height:64},80).data;
async function setup(t,offers=[]) {
  const dir=await mkdtemp(join(tmpdir(),'night-adapter-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const draft={id:'night-1',sku:'sku-1',price:3000,nameUk:'Belle Nuit',descriptionUk:'Опис',photoUrl:'https://res.cloudinary.com/shop/source.jpg',sourcePhotoFingerprint:fingerprintPhoto(image)};
  const job={id:'job-1',price:3000,status:'queued',updatedAt:'v1',channels:{salesbox:{status:'writing'}},preparation:{result:{draft}}};
  let writes=0,downloads=0; const saved=[];
  const options={
    now:night,queue:{dir,read:async()=>({jobs:{[job.id]:job}})},
    store:{list:async()=>[],save:async(d)=>saved.push(d),update:async(id,patch)=>saved.push({id,...patch})},
    client:{canWrite:()=>true,getOffers:async({page})=>({success:true,data:page===1?offers:[]}),createOfferFromDraft:async()=>{writes++;return{dryRun:false};}},
    fetchImpl:async()=>{downloads++; return new Response(image);}
  };
  return {draft,job,options,saved,counts:()=>({writes,downloads}),adapter:createNightSalesBoxAdapter(options)};
}
test('similar manually added photo blocks creation and fingerprint cache avoids downloads',async(t)=>{
  const fixture=await setup(t,[{id:'manual',originalURL:'https://res.cloudinary.com/shop/manual.jpg'}]);
  assert.equal((await fixture.adapter.reconcile(fixture.job)).reason,'similar-existing-photo');
  await fixture.adapter.reconcile(fixture.job);
  assert.deepEqual(fixture.counts(),{writes:0,downloads:1});
});
test('missing or unverified catalog image origin never establishes absence',async(t)=>{
  const fixture=await setup(t,[{id:'manual',originalURL:'http://localhost/private'}]);
  assert.equal((await fixture.adapter.reconcile(fixture.job)).reason,'catalog-photo-review-incomplete');
  assert.equal(fixture.counts().downloads,0);
});
test('source edit and daytime are checked immediately before write',async(t)=>{
  const fixture=await setup(t);
  const snapshot=structuredClone(fixture.job);
  fixture.job.hold='source-changed';
  await assert.rejects(fixture.adapter.publish(snapshot,3000));
  delete fixture.job.hold;
  const day=createNightSalesBoxAdapter({...fixture.options,now:()=>new Date('2026-11-21T10:00:00Z')});
  await assert.rejects(day.publish(snapshot,3000));
  assert.equal(fixture.counts().writes,0);
});
test('write acknowledgement is pending until persisted catalog fields are verified',async(t)=>{
  const fixture=await setup(t);
  await fixture.adapter.publish(fixture.job,3000);
  assert.equal(fixture.saved.at(-1).status,'publication-pending');
  const offer={id:'remote',externalId:fixture.draft.id,price:3000,name:fixture.draft.nameUk,description:fixture.draft.descriptionUk,originalURL:fixture.draft.photoUrl,available:true,availableStatus:'AVAILABLE'};
  fixture.options.client.getOffers=async({page})=>({success:true,data:page===1?[offer]:[]});
  assert.equal((await fixture.adapter.reconcile(fixture.job)).status,'verified');
  assert.equal(fixture.saved.at(-1).status,'published');
});
