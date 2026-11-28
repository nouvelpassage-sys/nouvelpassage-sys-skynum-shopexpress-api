import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';

export function isKyivNight(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', hourCycle: 'h23'
  }).format(date));
  return hour >= 23 || hour < 7;
}

// Deliberately conservative: quantities, dates and multiple amounts are not prices.
function priceAmounts(text = '') {
  const value = text.trim();
  const bare = value.match(/^(\d{2,6})(?:[.,](\d{1,2}))?\s*(?:грн|uah|₴)?$/iu);
  const marked = [...value.matchAll(/(?:ціна\s*[:—-]?\s*)(\d{2,6})(?:[.,](\d{1,2}))?|(?<![\d.,])(\d{2,6})(?:[.,](\d{1,2}))?\s*(?:грн|uah|₴)/giu)];
  const matches = bare ? [bare] : marked;
  return matches.map((match) => Number(`${match[1] ?? match[3]}.${match[2] ?? match[4] ?? '0'}`)).filter((amount) => amount > 0);
}

export function explicitPrice(text = '') {
  const amounts = priceAmounts(text);
  return amounts.length === 1 ? amounts[0] : null;
}

export class NightContentQueue {
  constructor({ dataDir, chatId, now = () => new Date() }) {
    if (!/^-\d+$/.test(String(chatId))) throw new Error('A verified negative Telegram group ID is required');
    this.chatId = String(chatId);
    this.dir = join(dataDir, 'night-content');
    this.path = join(this.dir, 'queue.json');
    this.now = now;
    this.serial = Promise.resolve();
  }

  matches(chat) {
    return String(chat?.id) === this.chatId && ['group', 'supergroup'].includes(chat?.type);
  }

  async read() {
    try {
      const state = JSON.parse(await readFile(this.path, 'utf8'));
      if (state.chatId !== this.chatId) throw new Error('Night queue source group changed');
      return state;
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { version: 1, chatId: this.chatId, offset: null, jobs: {}, messages: {} };
    }
  }

  async transaction(fn) {
    const run = this.serial.then(async () => {
      await mkdir(this.dir, { recursive: true });
      // Heartbeat lease recovers after a crash; compromised ownership terminates
      // the process by default, preventing further writes under a lost lease.
      const release = await lockfile.lock(this.path, { realpath: false, stale: 60000, update: 10000 });
      const temp = `${this.path}.${randomUUID()}.tmp`;
      try {
        const state = await this.read();
        if (state.version !== 1) throw new Error('Unsupported night queue version');
        const result = await fn(state);
        const file = await open(temp, 'wx');
        try { await file.writeFile(JSON.stringify(state)); await file.sync(); }
        finally { await file.close(); }
        await rename(temp, this.path);
        const directory = await open(this.dir, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
        return result;
      } finally {
        await rm(temp, { force: true });
        await release();
      }
    });
    this.serial = run.catch(() => {});
    return run;
  }

  async ingest(update) {
    const message = update.message ?? update.edited_message;
    if (!this.matches(message?.chat)) return false;
    await this.transaction((state) => {
      const id = String(message.message_id);
      const revision = message.edit_date ?? message.date ?? 0;
      const prior = state.messages[id];
      if (prior && prior.revision >= revision) return;
      const document = message.document;
      const imageDocument = document && (/^image\//i.test(document.mime_type ?? '') || /\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i.test(document.file_name ?? ''));
      const photo = message.photo?.at(-1) ?? (imageDocument ? document : null);
      const replyId = String(message.reply_to_message?.message_id ?? '');
      const reply = state.messages[replyId];
      const key = prior?.jobId ?? (photo
        ? `${this.chatId}:${message.media_group_id ? `album:${message.media_group_id}` : `message:${id}`}`
        : reply?.jobId ?? `${this.chatId}:unlinked:${id}`);
      const job = state.jobs[key] ??= {
        id: key, status: 'draft', createdAt: this.now().toISOString(), messages: {}, channels: {}
      };
      // An edit after preparation must not silently change an already queued publication.
      if (job.preparation || Object.keys(job.channels).length) job.hold = 'source-changed-after-preparation';
      state.messages[id] = { jobId: key, revision };
      job.messages[id] = {
        messageId: message.message_id, date: message.date,
        text: message.caption ?? message.text ?? '', replyId: replyId || null,
        photo: photo ? {
          fileId: photo.file_id, uniqueId: photo.file_unique_id,
          ...(imageDocument ? { document: true, fileName: document.file_name, mimeType: document.mime_type, fileSize: document.file_size } : {})
        } : null
      };
      job.updatedAt = this.now().toISOString();
      const photos = Object.values(job.messages).filter((item) => item.photo);
      // Preserve original image files, but hold formats the decoder cannot verify.
      // Never substitute a document thumbnail: it may be cropped or too small.
      if (photos.some(({photo}) => photo.document && (
        Number(photo.fileSize) > 12 * 1024 * 1024 ||
        !(/\.(jpe?g|png)$/i.test(photo.fileName ?? '') && ['image/jpeg', 'image/png', 'application/octet-stream', undefined].includes(photo.mimeType))
      ))) job.hold = 'image-file-needs-review';
      const texts = Object.values(job.messages).map((item) => item.text);
      const prices = texts.map(explicitPrice).filter((price) => price !== null);
      // An ambiguous caption cannot be rescued by a single price in another message.
      const ambiguous = texts.some((text) => /(?:грн|uah|₴|ціна)/iu.test(text) && explicitPrice(text) === null);
      // Owner-approved fallback is per photo job, never for an unlinked text.
      // Conflicting explicit amounts still require review rather than inventing a choice.
      const fallback = photos.length > 0 && prices.length === 0 && !texts.some((text) => priceAmounts(text).length > 1);
      job.price = !ambiguous && prices.length && new Set(prices).size === 1 ? prices[0] : fallback ? 1500 : null;
      job.priceSource = job.price === null ? null : fallback ? 'default-1500' : 'publication';
      job.prices = job.price === null ? null : {
        salesbox: job.price
      };
      job.status = job.hold || !photos.length || job.price === null ? 'draft' : 'queued';
      job.reason = job.hold ?? (!photos.length ? 'unlinked-price-or-no-photo' : job.price === null ? 'missing-or-conflicting-price' : null);
      const identities = new Set(photos.map((item) => item.photo.uniqueId).filter(Boolean));
      for (const other of Object.values(state.jobs)) {
        if (other.id === key) continue;
        if (Object.values(other.messages).some((item) => identities.has(item.photo?.uniqueId))) {
          job.status = 'draft'; job.hold = 'duplicate-photo'; job.reason = job.hold;
        }
      }
    });
    return true;
  }

  async checkpoint(offset) {
    await this.transaction((state) => { state.offset = Math.max(state.offset ?? 0, offset); });
  }

  async patch(id, fn) {
    return this.transaction((state) => fn(state.jobs[id], state));
  }
}

// Adapters must reconcile the full catalog (including manual entries) and verify
// each platform's actual final state. No endpoint or successful status is inferred.
export class NightContentWorker {
  constructor({ queue, prepare, adapters = {}, now = () => new Date(), settleMs = 60000, publicationAllowed = isKyivNight }) {
    Object.assign(this, { queue, prepare, adapters, now, settleMs, publicationAllowed });
  }

  async tick() {
    if (this.running || !this.publicationAllowed(this.now())) return;
    this.running = true;
    let lease;
    try {
      await mkdir(this.queue.dir, { recursive: true });
      lease = await lockfile.lock(join(this.queue.dir, 'worker'), { realpath: false, stale: 60000, update: 10000 });
      const state = await this.queue.read();
      for (const snapshot of Object.values(state.jobs)) {
        if (!this.publicationAllowed(this.now())) break;
        if (snapshot.status !== 'queued' || snapshot.hold || (snapshot.nextAttemptAt && this.now() < new Date(snapshot.nextAttemptAt)) || this.now() - new Date(snapshot.updatedAt) < this.settleMs) continue;
        let job = snapshot;
        if (!job.preparation) {
          const claimed = await this.queue.patch(job.id, (current) => {
            if (current.hold || current.status !== 'queued' || current.preparation ||
                current.updatedAt !== snapshot.updatedAt || !this.publicationAllowed(this.now())) return false;
            current.preparation = { status: 'started' };
            return true;
          });
          if (!claimed) continue;
          try {
            const prepared = await this.prepare(job);
            await this.queue.patch(job.id, (current) => {
              current.preparation = { status: 'done', result: prepared };
              if (!prepared?.ready) { current.status = 'draft'; current.reason = 'preparation-needs-review'; }
            });
          } catch {
            await this.queue.patch(job.id, (current) => {
              current.preparation = { status: 'uncertain' }; current.status = 'draft'; current.reason = 'preparation-failed';
            });
          }
        }
        job = (await this.queue.read()).jobs[job.id];
        // A crash after starting AI never automatically spends again.
        if (job.preparation?.status === 'started') {
          await this.queue.patch(job.id, (current) => { current.status = 'draft'; current.reason = 'interrupted-preparation-needs-review'; });
        }
        if (job.preparation?.status !== 'done' || !job.preparation.result?.ready || job.hold) continue;
        for (const channel of ['salesbox']) {
          if (!this.publicationAllowed(this.now())) break;
          job = (await this.queue.read()).jobs[job.id];
          if (job.hold) break;
          if (job.channels[channel]?.status === 'verified') continue;
          const adapter = this.adapters[channel];
          if (!adapter) {
            await this.queue.patch(job.id, (current) => { current.channels[channel] = { status: 'blocked', reason: 'adapter-not-verified' }; });
            continue;
          }
          try {
            const found = await adapter.reconcile(job);
            if (found?.status === 'verified' && found.remoteId) {
              await this.queue.patch(job.id, (current) => { current.channels[channel] = found; current.status = 'published'; });
              continue;
            }
            // Unknown write outcomes must be reconciled, never blindly recreated.
            if (['writing', 'uncertain'].includes(job.channels[channel]?.status)) {
              await this.queue.patch(job.id, (current) => { current.nextAttemptAt = new Date(this.now().getTime() + 300000).toISOString(); });
              continue;
            }
            if (found?.status !== 'absent') {
              await this.queue.patch(job.id, (current) => { current.channels[channel] = found ?? { status: 'review', reason: 'unverified-catalog' };
                if (found?.reason !== 'outside-window') { current.status = 'draft'; current.reason = found?.reason ?? 'unverified-catalog'; } });
              continue;
            }
            if (!this.publicationAllowed(this.now())) break;
            const claimed = await this.queue.patch(job.id, (current) => {
              if (current.hold || current.status !== 'queued' || !this.publicationAllowed(this.now()) ||
                  ['writing', 'uncertain', 'verified'].includes(current.channels[channel]?.status)) return false;
              current.channels[channel] = { status: 'writing' };
              return true;
            });
            if (!claimed) continue;
            await adapter.publish(job, job.prices[channel]);
            const verified = await adapter.reconcile(job);
            await this.queue.patch(job.id, (current) => {
              current.channels[channel] = verified?.status === 'verified' && verified.remoteId
                ? verified : { status: 'uncertain', reason: 'publication-not-verified' };
              if (current.channels[channel].status === 'verified') current.status = 'published';
              else current.nextAttemptAt = new Date(this.now().getTime() + 300000).toISOString();
            });
          } catch {
            await this.queue.patch(job.id, (current) => {
              if (current.channels[channel]?.status === 'writing') current.channels[channel] = { status: 'uncertain' };
              current.nextAttemptAt = new Date(this.now().getTime() + 300000).toISOString();
            });
          }
        }
      }
    } finally {
      if (lease) await lease();
      this.running = false;
    }
  }
}
