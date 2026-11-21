import { NightContentQueue, NightContentWorker } from './nightContentQueue.js';
import { createNightPreparation } from './nightPreparation.js';
import { createNightSalesBoxAdapter } from './nightSalesBoxAdapter.js';

export function readNightConfig(env = process.env) {
  const mode = env.NIGHT_CONTENT_MODE ?? 'off';
  if (!['off','collect','prepare','publish'].includes(mode)) throw new Error('Invalid NIGHT_CONTENT_MODE');
  if (mode === 'off') return { mode };
  const chatId = env.NIGHT_CONTENT_CHAT_ID;
  if (!/^-\d+$/.test(chatId ?? '')) throw new Error('Verified NIGHT_CONTENT_CHAT_ID required');
  return { mode, chatId };
}

export function createNightRuntime({ config, dataDir, telegram, store, contentClient, imageStorage, salesBox, now }) {
  if (config.mode === 'off') return { queue: null, worker: null };
  const queue = new NightContentQueue({ dataDir, chatId: config.chatId, ...(now ? {now} : {}) });
  if (config.mode === 'collect') return { queue, worker: null };
  if (!contentClient || !imageStorage?.configured) throw new Error('Night content requires configured AI and image storage');
  if (config.mode === 'publish' && !salesBox.canWrite()) throw new Error('Night publication requires SalesBox writes enabled');
  const prepare = createNightPreparation({telegram,store,contentClient,imageStorage,now});
  const adapters = config.mode === 'publish' ? {
    salesbox: createNightSalesBoxAdapter({client:salesBox,store,queue,now})
  } : {};
  return { queue, worker: new NightContentWorker({queue,prepare,adapters,now}) };
}
