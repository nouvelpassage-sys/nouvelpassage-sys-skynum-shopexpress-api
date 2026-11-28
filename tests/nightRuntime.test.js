import test from 'node:test';
import assert from 'node:assert/strict';
import { readNightConfig, createNightRuntime } from '../src/productAssistant/nightRuntime.js';
test('night feature defaults off and requires an exact group ID when enabled', () => {
  assert.deepEqual(readNightConfig({}), {mode:'off'});
  for (const env of [{NIGHT_CONTENT_MODE:'unknown'}, {NIGHT_CONTENT_MODE:'publish'}, {NIGHT_CONTENT_MODE:'collect',NIGHT_CONTENT_CHAT_ID:'123'}]) assert.throws(()=>readNightConfig(env));
  assert.deepEqual(readNightConfig({NIGHT_CONTENT_MODE:'collect',NIGHT_CONTENT_CHAT_ID:'-123'}),{mode:'collect',chatId:'-123'});
});
test('off and collect modes do not start preparation or publication', () => {
  assert.deepEqual(createNightRuntime({config:{mode:'off'}}),{queue:null,worker:null});
  const runtime=createNightRuntime({config:{mode:'collect',chatId:'-123'},dataDir:'/unused-test-path'});
  assert.equal(runtime.worker,null);
  assert.equal(runtime.queue.chatId,'-123');
});
test('publication fails closed without required dependencies or SalesBox write authorization', () => {
  assert.throws(()=>createNightRuntime({config:{mode:'prepare',chatId:'-123'},dataDir:'/unused-test-path'}));
  assert.throws(()=>createNightRuntime({config:{mode:'publish',chatId:'-123'},dataDir:'/unused-test-path',contentClient:{},imageStorage:{configured:true},salesBox:{canWrite:()=>false}}));
});
test('production pipeline uses seven-hour batches without a night restriction', () => {
  const {worker}=createNightRuntime({config:{mode:'prepare',chatId:'-123'},dataDir:'/unused-test-path',contentClient:{},imageStorage:{configured:true},photoStudio:{}});
  assert.equal(worker.batchIntervalMs,7*60*60*1000);
  assert.equal(worker.publicationAllowed(new Date('2026-11-28T10:00:00Z')),true);
});
