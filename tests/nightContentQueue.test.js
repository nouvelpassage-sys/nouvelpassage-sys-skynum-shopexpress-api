import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NightContentQueue, NightContentWorker, isKyivNight, explicitPrice } from '../src/productAssistant/nightContentQueue.js';
import { ProductAssistantBot } from '../src/productAssistant/telegramBot.js';

const night = () => new Date('2026-11-21T21:30:00Z');
function message(id, extra = {}) {
  return { update_id: id, message: { message_id: id, date: id, chat: { id: -123, type: 'supergroup' }, ...extra } };
}
function photo(id, caption = '3000 грн', extra = {}) {
  return message(id, { photo: [{ file_id: `file-${id}`, file_unique_id: `unique-${id}` }], caption, ...extra });
}
async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'night-content-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  return new NightContentQueue({ dataDir, chatId: '-123', now: night });
}
const jobs = async (queue) => Object.values((await queue.read()).jobs);

test('Kyiv night is inclusive at 23:00 and exclusive at 07:00 in winter and summer', () => {
  for (const [date, expected] of [
    ['2026-11-21T20:59:59Z', false], ['2026-11-21T21:00:00Z', true],
    ['2026-11-22T04:59:59Z', true], ['2026-11-22T05:00:00Z', false],
    ['2026-07-21T19:59:59Z', false], ['2026-07-21T20:00:00Z', true],
    ['2026-07-22T03:59:59Z', true], ['2026-07-22T04:00:00Z', false]
  ]) assert.equal(isKyivNight(new Date(date)), expected, date);
});

test('price parsing rejects quantities and conflicting amounts', () => {
  assert.equal(explicitPrice('3000'), 3000);
  assert.equal(explicitPrice('Букет 3000 грн'), 3000);
  assert.equal(explicitPrice('Ціна: 3200,50'), 3200.5);
  for (const text of ['25 троянд', '3000 грн або 3200 грн', '21.11.2026', 'без ціни']) assert.equal(explicitPrice(text), null);
});

test('exact group identity only, durable album and replay deduplication', async (t) => {
  const queue = await fixture(t);
  const update = photo(1, '3000 грн', { media_group_id: 'album' });
  assert.equal(await queue.ingest({ message: { ...update.message, chat: { id: -124, type: 'supergroup', title: 'Квіти Контент' } } }), false);
  assert.equal(queue.matches({ id: -123, type: 'private' }), false);
  await queue.ingest(update);
  await queue.ingest(photo(2, '', { media_group_id: 'album' }));
  await queue.ingest(update);
  await queue.checkpoint(3);
  const restarted = new NightContentQueue({ dataDir: join(queue.dir, '..'), chatId: '-123' });
  assert.equal((await restarted.read()).offset, 3);
  const [job] = await jobs(restarted);
  assert.equal(Object.keys(job.messages).length, 2);
  assert.equal(job.status, 'queued');
  assert.deepEqual(job.prices, { salesbox: 3000 });
});

test('reply price binds to photo; unrelated price remains a separate draft', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1, ''));
  await queue.ingest(message(2, { text: '3000', reply_to_message: { message_id: 1 } }));
  await queue.ingest(message(3, { text: '5000' }));
  const result = await jobs(queue);
  assert.equal(result[0].price, 3000);
  assert.equal(result[0].status, 'queued');
  assert.equal(result[1].status, 'draft');
});

test('conflicting album prices and duplicate photos are held', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1, '3000 грн', { media_group_id: 'a' }));
  await queue.ingest(photo(2, '5000 грн', { media_group_id: 'a' }));
  await queue.ingest(photo(3, '3000 грн', { photo: [{ file_id: 'new-file', file_unique_id: 'unique-1' }] }));
  const result = await jobs(queue);
  assert.equal(result[0].status, 'draft');
  assert.equal(result[1].hold, 'duplicate-photo');
});

test('all configured group messages and callbacks are silent, including failures', async (t) => {
  const queue = await fixture(t);
  const forbidden = () => { throw new Error('Telegram output forbidden'); };
  const bot = new ProductAssistantBot({ telegram: { sendMessage: forbidden, answerCallbackQuery: forbidden }, allowedChatIds: [], nightQueue: queue });
  await bot.handleUpdate(photo(1));
  await bot.handleUpdate(message(2, { text: '/start' }));
  await bot.handleUpdate({ callback_query: { id: 'c', message: message(1).message, data: 'publish:any' } });
  await mkdir(`${queue.path}.lock`);
  await assert.rejects(bot.handleUpdate(photo(3)), { code: 'ELOCKED' });
});

test('daytime worker does not prepare or publish; restart reuses preparation', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  let preparations = 0, publications = 0, exists = false;
  const options = { queue, settleMs: 0, prepare: async () => { preparations++; return { ready: true }; }, adapters: {
    salesbox: { reconcile: async () => exists ? { status: 'verified', remoteId: 'offer-1' } : { status: 'absent' }, publish: async (_job, price) => { assert.equal(price, 3000); publications++; exists = true; } }
  } };
  await new NightContentWorker({ ...options, now: () => new Date('2026-11-21T10:00:00Z') }).tick();
  assert.equal(preparations, 0);
  await new NightContentWorker({ ...options, now: night }).tick();
  await new NightContentWorker({ ...options, now: night }).tick();
  assert.equal(preparations, 1);
  assert.equal(publications, 1);
  assert.equal((await jobs(queue))[0].channels.salesbox.status, 'verified');
});

test('uncertain publication is reconciled without resubmitting', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  let publications = 0;
  const options = { queue, now: night, settleMs: 0, prepare: async () => ({ ready: true }), adapters: {
    salesbox: { reconcile: async () => ({ status: 'absent' }), publish: async () => { publications++; throw new Error('response lost'); } }
  } };
  await new NightContentWorker(options).tick();
  await new NightContentWorker(options).tick();
  assert.equal(publications, 1);
  assert.equal((await jobs(queue))[0].channels.salesbox.status, 'uncertain');
});

test('manual existing publication prevents a new write', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  await new NightContentWorker({ queue, now: night, settleMs: 0, prepare: async () => ({ ready: true }), adapters: {
    salesbox: { reconcile: async () => ({ status: 'verified', remoteId: 'manual-offer' }), publish: async () => assert.fail('duplicate') }
  } }).tick();
  assert.equal((await jobs(queue))[0].channels.salesbox.remoteId, 'manual-offer');
});

test('night ending during preparation prevents any publication', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  let now = night();
  await new NightContentWorker({ queue, now: () => now, settleMs: 0, prepare: async () => { now = new Date('2026-11-22T05:00:00Z'); return { ready: true }; }, adapters: {
    salesbox: { reconcile: async () => assert.fail('daytime request') }
  } }).tick();
  assert.deepEqual((await jobs(queue))[0].channels, {});
});

test('failed or interrupted preparation is not charged a second time', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  let calls = 0;
  const worker = new NightContentWorker({ queue, now: night, settleMs: 0, prepare: async () => { calls++; throw new Error('AI timeout'); } });
  await worker.tick(); await worker.tick();
  assert.equal(calls, 1);
  const [job] = await jobs(queue);
  await queue.patch(job.id, (current) => { current.status = 'queued'; current.preparation = { status: 'started' }; });
  await worker.tick();
  assert.equal(calls, 1);
});

test('edits after preparation hold the job and preserve existing evidence', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  await new NightContentWorker({ queue, now: night, settleMs: 0, prepare: async () => ({ ready: true }) }).tick();
  await queue.ingest({ edited_message: { ...photo(1, '5000 грн').message, edit_date: 5 } });
  const [job] = await jobs(queue);
  assert.equal(job.status, 'draft');
  assert.equal(job.hold, 'source-changed-after-preparation');
  assert.equal(job.preparation.status, 'done');
});

test('an edit while catalog reconciliation is in flight prevents publication', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  await new NightContentWorker({ queue, now: night, settleMs: 0, prepare: async () => ({ ready: true }), adapters: {
    salesbox: {
      reconcile: async () => {
        await queue.ingest({ edited_message: { ...photo(1, '5000 грн').message, edit_date: 9 } });
        return { status: 'absent' };
      },
      publish: async () => assert.fail('stale price must never be published')
    }
  } }).tick();
  const [job] = await jobs(queue);
  assert.equal(job.price, 5000);
  assert.equal(job.hold, 'source-changed-after-preparation');
  assert.equal(job.channels.salesbox, undefined);
});

test('a queue changed before the preparation claim does not consume AI', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  const originalPatch = queue.patch.bind(queue);
  let intervened = false;
  queue.patch = async (id, fn) => {
    if (!intervened) {
      intervened = true;
      await originalPatch(id, (job) => { job.status = 'draft'; job.price = null; });
    }
    return originalPatch(id, fn);
  };
  await new NightContentWorker({ queue, now: night, settleMs: 0,
    prepare: async () => assert.fail('changed draft must not spend API credits') }).tick();
  assert.equal((await jobs(queue))[0].preparation, undefined);
});


test('ambiguous caption cannot be overridden by another album price', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1, '3000 грн або 4000 грн', { media_group_id: 'a' }));
  await queue.ingest(photo(2, '3000 грн', { media_group_id: 'a' }));
  assert.equal((await jobs(queue))[0].status, 'draft');
  assert.equal((await jobs(queue))[0].price, null);
});


test('stale crash leases recover but fresh leases remain exclusive', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1));
  const path = `${queue.path}.lock`;
  await mkdir(path);
  await assert.rejects(queue.checkpoint(2), { code: 'ELOCKED' });
  const expired = new Date(Date.now() - 120000);
  await utimes(path, expired, expired);
  await queue.checkpoint(2);
  assert.equal((await queue.read()).offset, 2);
});

test('private actions run only after checkpoint; group intake is durable before checkpoint',async(t)=>{
  const queue=await fixture(t);
  const bot=new ProductAssistantBot({telegram:{},allowedChatIds:[],nightQueue:queue});
  let actions=0;
  bot.handleUpdate=async()=>{actions++;};
  const original=queue.checkpoint.bind(queue);
  queue.checkpoint=async()=>{throw new Error('disk unavailable');};
  await assert.rejects(bot.processPolledUpdate({update_id:1,message:{chat:{id:123,type:'private'}}}));
  assert.equal(actions,0);
  queue.checkpoint=original;
  await bot.processPolledUpdate({update_id:1,message:{chat:{id:123,type:'private'}}});
  assert.equal(actions,1);
  assert.equal((await queue.read()).offset,2);
  bot.handleUpdate=ProductAssistantBot.prototype.handleUpdate.bind(bot);
  queue.checkpoint=async()=>{throw new Error('checkpoint failed');};
  await assert.rejects(bot.processPolledUpdate(photo(2)));
  assert.equal((await jobs(queue)).length,1);
  assert.equal((await queue.read()).offset,2);
});

test('unconfigured groups cannot trigger private commands or group replies',async()=>{
  const bot=new ProductAssistantBot({telegram:{sendMessage:()=>assert.fail('unexpected group output'),answerCallbackQuery:()=>assert.fail('unexpected group output')},allowedChatIds:['-123']});
  await bot.handleUpdate(message(1,{text:'/start'}));
  await bot.handleUpdate({callback_query:{id:'c',message:message(1).message,data:'publish:any'}});
});


test('missing or unreadable photo price defaults to 1500 and survives restart', async (t) => {
  const queue = await fixture(t);
  for (const [i, caption] of ['', '25 троянд', 'Ціна: не вказана'].entries()) {
    await queue.ingest(photo(i + 1, caption));
  }
  const restarted = new NightContentQueue({ dataDir: join(queue.dir, '..'), chatId: '-123' });
  for (const job of await jobs(restarted)) {
    assert.equal(job.price, 1500);
    assert.equal(job.priceSource, 'default-1500');
    assert.deepEqual(job.prices, { salesbox: 1500 });
    assert.equal(job.status, 'queued');
  }
});

test('recognized publication price wins and a linked reply replaces fallback', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1, '2500 грн'));
  await queue.ingest(photo(2, ''));
  await queue.ingest(message(3, { text: '3200 грн', reply_to_message: { message_id: 2 } }));
  const result = await jobs(queue);
  assert.deepEqual(result.map(j => [j.price, j.priceSource]), [[2500, 'publication'], [3200, 'publication']]);
});

test('fallback reaches night SalesBox adapter while unlinked text never becomes a product', async (t) => {
  const queue = await fixture(t);
  await queue.ingest(photo(1, ''));
  await queue.ingest(message(2, { text: 'ціна невідома' }));
  let exists = false;
  await new NightContentWorker({ queue, now: night, settleMs: 0,
    prepare: async job => { assert.equal(job.price, 1500); return { ready: true }; },
    adapters: { salesbox: {
      reconcile: async () => exists ? { status: 'verified', remoteId: 'offer-default' } : { status: 'absent' },
      publish: async (_job, price) => { assert.equal(price, 1500); exists = true; }
    } }
  }).tick();
  const result = await jobs(queue);
  assert.equal(result[0].status, 'published');
  assert.equal(result[1].status, 'draft');
  assert.equal(result[1].price, null);
});

test('original JPG documents join albums and bind reply prices across restart', async(t)=>{
  const queue=await fixture(t);
  const first=message(501,{document:{file_id:'original-jpg',file_unique_id:'doc-501',file_name:'IMG_8539.JPG',mime_type:'image/jpeg',file_size:4600000},media_group_id:'files'});
  await queue.ingest(first);
  await queue.ingest(message(502,{document:{file_id:'original-png',file_unique_id:'doc-502',file_name:'image.png',mime_type:'application/octet-stream'},media_group_id:'files'}));
  await queue.ingest(message(503,{text:'6300 грн',reply_to_message:{message_id:501}}));
  await queue.ingest(first);
  const restarted=new NightContentQueue({dataDir:join(queue.dir,'..'),chatId:'-123'});
  const [job]=await jobs(restarted);
  assert.equal(job.status,'queued');
  assert.equal(job.price,6300);
  assert.equal(job.messages[501].photo.fileId,'original-jpg');
  assert.equal(Object.keys(job.messages).length,3);
});
test('HEIC and oversized originals remain durable review jobs, never thumbnails',async(t)=>{
  const queue=await fixture(t);
  for(const [id,name,size] of [[601,'IMG_1150.HEIC',2500000],[602,'huge.jpg',13000000]]) {
    await queue.ingest(message(id,{document:{file_id:`original-${id}`,file_unique_id:`doc-${id}`,file_name:name,mime_type:name.endsWith('HEIC')?'image/heic':'image/jpeg',file_size:size,thumbnail:{file_id:'tiny'}},caption:'3500 грн'}));
  }
  for(const job of await jobs(queue)) {
    assert.equal(job.status,'draft');
    assert.equal(job.hold,'image-file-needs-review');
    assert.ok(Object.values(job.messages)[0].photo.fileId.startsWith('original-'));
  }
  await queue.ingest(message(603,{document:{file_id:'pdf',file_name:'invoice.pdf',mime_type:'application/pdf'},caption:'5000 грн'}));
  assert.equal((await jobs(queue))[2].reason,'unlinked-price-or-no-photo');
});

test('all-day worker publishes once during daytime and survives restart', async(t)=>{
 const {publicationAllowed}=await import('../src/productAssistant/nightRuntime.js');
 const queue=await fixture(t); await queue.ingest(photo(42));
 let exists=false,writes=0;
 const opts={queue,publicationAllowed,now:()=>new Date('2026-11-22T10:00:00Z'),settleMs:0,prepare:async()=>({ready:true}),adapters:{salesbox:{reconcile:async()=>exists?{status:'verified',remoteId:'r'}:{status:'absent'},publish:async()=>{writes++;exists=true;}}}};
 await new NightContentWorker(opts).tick(); await new NightContentWorker(opts).tick();
 assert.equal(writes,1); assert.equal((await jobs(queue))[0].status,'published');
});

test('seven-hour batch persists across restart while new messages remain in durable intake', async (t) => {
  const queue = await fixture(t);
  const { publicationAllowed, CONTENT_BATCH_INTERVAL_MS } = await import('../src/productAssistant/nightRuntime.js');
  let time = Date.parse('2026-11-28T10:00:00Z'), calls = 0;
  const options = { queue, publicationAllowed, batchIntervalMs: CONTENT_BATCH_INTERVAL_MS, settleMs: 0, now: () => new Date(time), prepare: async () => { calls++; return { ready: false }; } };
  await queue.ingest(photo(901));
  await new NightContentWorker(options).tick();
  assert.equal(calls, 1);
  const due = (await queue.read()).nextBatchAt;
  assert.equal(due, '2026-11-28T17:00:00.000Z');
  await queue.ingest(photo(902));
  time += CONTENT_BATCH_INTERVAL_MS - 1;
  await new NightContentWorker(options).tick();
  assert.equal(calls, 1);
  assert.equal((await queue.read()).nextBatchAt, due);
  assert.equal((await jobs(queue)).filter(j => j.status === 'queued').length, 1);
  time++;
  await new NightContentWorker(options).tick();
  assert.equal(calls, 2);
  time += CONTENT_BATCH_INTERVAL_MS * 3;
  await new NightContentWorker(options).tick();
  assert.equal(calls, 2);
  assert.equal((await queue.read()).nextBatchAt, new Date(time + CONTENT_BATCH_INTERVAL_MS).toISOString());
});
