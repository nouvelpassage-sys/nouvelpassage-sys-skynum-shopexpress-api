import test from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { createNightPreparation } from '../src/productAssistant/nightPreparation.js';
const pixels = Buffer.from(Array.from({length: 64*64*4}, (_,i) => i % 256));
const bytes = jpeg.encode({data:pixels,width:64,height:64},80).data;
const night = () => new Date('2026-11-21T21:30:00Z');
const job = { id: '-123:message:1', price: 1899.50, messages: { 1: { messageId: 1, text: '1899,50 грн', photo: { fileId: 'file-1', uniqueId: 'unique-1' } } } };
const generated = {
  nameUk: 'Lumiere Douce', nameEn: 'Lumiere Douce', productTypeUk: 'букет півоній',
  visibleSummaryUk: 'букет півоній у рожевій палітрі', category: 'Букети',
  descriptionUk: 'Букет півоній у ніжній рожевій палітрі має м’яку округлу форму та делікатне пакування. Він доречний для побачення або теплого привітання. Можлива заміна квітів зі збереженням стилю та палітри.',
  descriptionEn: 'A pink peony bouquet.', seoTitleUk: 'Lumiere Douce', seoDescriptionUk: 'Букет півоній у Києві',
  nightPhotoAudit: { singleProduct: true, overallPhoto: true, collage: false, confidentComposition: true }
};
function setup(overrides = {}) {
  const saved = []; let uploads = 0; let requests = 0;
  const options = {
    now: night,
    photoStudio: { process: async image => ({ ...image, ready: true, profile: "test" }) },
    telegram: { getFileImage: async () => ({ bytes, dataUrl: 'data:image/jpeg;base64,aW1hZ2U=', contentType: 'image/jpeg' }) },
    contentClient: { generateProductContent: async (input) => { requests++; assert.equal(input.nightContent, true); return generated; } },
    imageStorage: { configured: true, storeProductImage: async () => { uploads++; return { url: 'https://image.test/product.jpg' }; } },
    store: { save: async (draft) => { saved.push(structuredClone(draft)); } }, ...overrides
  };
  return { prepare: createNightPreparation(options), saved, counts: () => ({ uploads, requests }) };
}
test('silent preparation preserves exact price and only stores the reviewed overall image', async () => {
  const fixture = setup();
  const result = await fixture.prepare(job);
  assert.equal(result.ready, true, JSON.stringify(fixture.saved.at(-1)?.qualityIssues));
  assert.equal(result.draft.price, 1899.5);
  assert.equal(result.draft.photos.length, 1);
  assert.equal(result.draft.sourcePhotoUniqueId, 'unique-1');
  assert.deepEqual(fixture.counts(), { uploads: 1, requests: 1 });
});
test('collage or missing audit stays a stored draft without image upload', async () => {
  for (const audit of [undefined, { ...generated.nightPhotoAudit, collage: true }]) {
    const fixture = setup({ contentClient: { generateProductContent: async () => ({ ...generated, nightPhotoAudit: audit }) } });
    const result = await fixture.prepare(job);
    assert.equal(result.ready, false);
    assert.equal(fixture.saved.length, 1);
    assert.equal(fixture.counts().uploads, 0);
  }
});
test('download failure and daytime do not spend generation requests', async () => {
  for (const options of [{ now: () => new Date('2026-11-21T10:00:00Z') }, { telegram: { getFileImage: async () => { throw new Error('network'); } } }]) {
    const fixture = setup(options);
    await assert.rejects(fixture.prepare(job));
    assert.deepEqual(fixture.counts(), { uploads: 0, requests: 0 });
  }
});
test('generation failure never falls back to text-only content', async () => {
  const fixture = setup({ contentClient: { generateProductContent: async () => { throw new Error('timeout'); } } });
  await assert.rejects(fixture.prepare(job));
  assert.equal(fixture.saved.length, 0);
  assert.equal(fixture.counts().uploads, 0);
});

test('two-photo album can select the second overall image in the same AI request', async () => {
  const album=structuredClone(job);
  album.messages[2]={messageId:2,text:'',photo:{fileId:'file-2',uniqueId:'unique-2'}};
  let calls=0;
  const fixture=setup({contentClient:{generateProductContent:async(input)=>{
    calls++; assert.equal(input.imageDataUrls.length,2);
    return {...generated,nightPhotoAudit:{...generated.nightPhotoAudit,selectedImageIndex:1}};
  }}});
  const result=await fixture.prepare(album);
  assert.equal(result.ready,true);
  assert.equal(result.draft.photoFileId,'file-2');
  assert.equal(result.draft.photos.length,1);
  assert.equal(calls,1);
});
test('larger albums stay for photo selection without spending AI',async()=>{
  const album=structuredClone(job);
  album.messages[2]={messageId:2,photo:{fileId:'2'}};
  album.messages[3]={messageId:3,photo:{fileId:'3'}};
  const fixture=setup();
  assert.equal((await fixture.prepare(album)).reason,'album-needs-photo-selection');
  assert.equal(fixture.counts().requests,0);
});

test('studio rejection never uploads or returns a publishable card', async () => {
  const fixture=setup({photoStudio:{process:async image=>({...image,ready:false,review:{uncertain:true}})}});
  const result=await fixture.prepare(job);
  assert.equal(result.reason,'studio-photo-needs-review');
  assert.equal(fixture.counts().uploads,0);
  assert.equal(fixture.saved.at(-1).photoStudio.ready,false);
});
test('studio failure does not fall back to unprocessed photo', async () => {
  const fixture=setup({photoStudio:{process:async()=>{throw new Error('edit timeout')}}});
  await assert.rejects(fixture.prepare(job));
  assert.equal(fixture.counts().uploads,0);
});

test('invalid original bytes are rejected before paid AI even with a JPG filename',async()=>{
  const fixture=setup({telegram:{getFileImage:async()=>({bytes:Buffer.from('not-an-image'),dataUrl:'data:image/jpeg;base64,bm90',contentType:'image/jpeg'})}});
  await assert.rejects(fixture.prepare(job));
  assert.deepEqual(fixture.counts(),{uploads:0,requests:0});
});
