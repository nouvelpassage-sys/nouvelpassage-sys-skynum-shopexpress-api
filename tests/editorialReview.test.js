import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewEditorialContent } from '../src/productAssistant/editorialReview.js';
import { createProductDraft } from '../src/productAssistant/contentGenerator.js';
const description = 'Кремові троянди та блакитна гортензія зібрані у щільний округлий букет. Світле матове пакування залишає квіти відкритими й підкреслює прохолодну палітру. Можлива заміна окремих квітів зі збереженням стилю та палітри.';
const sample = {nameUk:'Écho du Matin',nameEn:'Écho du Matin',nameCandidates:['Rive Sereine'],descriptionUk:description,descriptionEn:'Cream roses and blue hydrangea in a rounded bouquet with pale wrapping. Individual flowers may be substituted while preserving the style and palette.',visualEvidence:{productForm:'ручний букет',flowers:[{nameUk:'троянди',confidence:'high'},{nameUk:'гортензія',confidence:'high'}],colors:['кремовий','блакитний'],packaging:'світле матове',uncertain:[]},category:'Букети',productTypeUk:'букет троянд і гортензії',productTypeEn:'Rose and hydrangea bouquet',seoTitleUk:'Écho du Matin — Nouvel Amour',seoDescriptionUk:'Кремові троянди й блакитна гортензія у світлому пакуванні.',seoKeywordsUk:'букет, троянди, гортензія',slug:'echo-du-matin'};
test('normalized duplicate name selects a genuinely different candidate without another AI call',()=>{
 const result=reviewEditorialContent(sample,[{name:'ECHO DU MATIN'}]);
 assert.equal(result.nameUk,'Rive Sereine');
 assert.equal(result.nameEn,'Rive Sereine');
 assert.match(result.seoTitleUk,/Rive Sereine/);
 assert.deepEqual(result.editorialIssues,[]);
});
test('duplicate descriptions and exhausted names are held, not rewritten to canned prose',()=>{
 const result=reviewEditorialContent({...sample,nameCandidates:[]},[{name:sample.nameUk,description}]);
 assert.equal(result.editorialIssues.length,2);
 assert.equal(result.descriptionUk,description);
});
test('missing visual evidence cannot pass unattended review',()=>{
 assert.ok(reviewEditorialContent({...sample,visualEvidence:undefined}).editorialIssues.length);
});
test('v2 preserves visible flowers and exact authored description through draft normalization',async()=>{
 const draft=await createProductDraft({text:'2500 грн',imageDataUrl:'data:image/jpeg;base64,AA',openAiClient:{generateProductContent:async()=>reviewEditorialContent(sample)}});
 assert.equal(draft.descriptionUk,description);
 assert.equal(draft.visualEvidence.flowers.length,2);
 assert.equal(draft.editorialVersion,2);
 assert.deepEqual(draft.qualityIssues,[]);
});
