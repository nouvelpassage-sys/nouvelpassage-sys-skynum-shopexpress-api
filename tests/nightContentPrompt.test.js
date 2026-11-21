import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiContentClient } from '../src/productAssistant/openAiContentClient.js';
test('night-only photo audit and composition rules preserve private single-photo requests',async(t)=>{
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  const requests=[];
  globalThis.fetch=async(_url,options)=>{
    requests.push({body:JSON.parse(options.body),signal:options.signal});
    return new Response(JSON.stringify({output_text:'{}'}));
  };
  const client=new OpenAiContentClient({apiKey:'test',model:'test'});
  const image='data:image/jpeg;base64,TESTIMAGE';
  await client.generateProductContent({imageDataUrl:image});
  await client.generateProductContent({imageDataUrl:image,imageDataUrls:[image,image],nightContent:true});
  const privateContent=requests[0].body.input[1].content;
  const nightContent=requests[1].body.input[1].content;
  assert.equal(privateContent.filter(x=>x.type==='input_image').length,1);
  assert.equal(nightContent.filter(x=>x.type==='input_image').length,2);
  assert.equal(requests[0].signal,undefined);
  assert.ok(requests[1].signal);
  assert.equal(JSON.parse(privateContent[0].text).nightPhotoReview,undefined);
  assert.match(JSON.parse(nightContent[0].text).nightPhotoReview,/selectedImageIndex/);
  assert.doesNotMatch(nightContent[0].text,/TESTIMAGE/);
});
