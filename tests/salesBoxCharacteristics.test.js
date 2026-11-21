import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSalesBoxCharacteristics as select} from '../src/productAssistant/salesBoxCharacteristics.js';
const defs = [
  {id:'flowers',name:'Тип квітів',values:[{id:'rose',value:'троянди'},{id:'peony',value:'півонії'}]},
  {id:'color',name:'Колір',values:[{id:'pink',value:'рожевий'}]},
  {id:'budget',name:'Бюджет',values:[{id:'mid',value:'3000-5000'}]},
  {id:'form',name:'Формат',values:[{id:'bouquet',value:'букет'}]}
];
test('only high-confidence flowers and exact dictionary colors are selected',()=>{
  const selected=select({category:'Букети',price:3255,visualEvidence:{flowers:[{nameUk:'троянда',confidence:'high'},{nameUk:'півонія',confidence:'uncertain'}],colors:['рожевий','unknown']}},defs);
  assert.deepEqual(selected.map(x=>x.valueId),['pink','rose','mid','bouquet']);
  assert.ok(selected.every(x=>x.paramId && x.isModifier === true));
});
test('no invented size, recipient, season or budget at ambiguous boundaries',()=>{
  assert.deepEqual(select({price:3000},defs),[]);
  assert.deepEqual(select({price:null},defs),[]);
  assert.deepEqual(select({visualEvidence:{flowers:[{nameUk:'півонія',confidence:'uncertain'}]}},defs),[]);
});
test('duplicate dictionary names and values never choose arbitrary IDs',()=>{
  assert.deepEqual(select({category:'Букети'},[defs[3],defs[3]]),[]);
  assert.deepEqual(select({category:'Букети'},[{...defs[3],values:[...defs[3].values,...defs[3].values]}]),[]);
});
