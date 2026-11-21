import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readNightCatalog, reconcileNightOffer } from './nightSalesBoxCatalog.js';
import { fingerprintPhoto, similarPhoto } from './nightPhotoFingerprint.js';
import { isKyivNight } from './nightContentQueue.js';

export function createNightSalesBoxAdapter({ client, store, queue, now = () => new Date(), fetchImpl = fetch }) {
  const dir = join(queue.dir, 'photo-fingerprints');
  async function remoteFingerprint(offer) {
    // Origins observed in the complete production catalog, 2026-11-21.
    // Other origins/redirects require review, never an optimistic uniqueness result.
    const url = new URL(offer.originalURL || offer.previewURL || '');
    if (url.protocol !== 'https:' || !['res.cloudinary.com', 'sales-box-photos.s3-eu-central-1.amazonaws.com', 'www.nouvelamour.kiev.ua', 'd3og57k1dk4307.cloudfront.net'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Unverified image origin');
    const key = createHash('sha256').update(`${url.href}|${offer.updatedAt ?? ''}`).digest('hex');
    const path = join(dir, `${key}.json`);
    try { return JSON.parse(await readFile(path,'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok || !response.body) throw new Error('Catalog photo unavailable');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 12*1024*1024) throw new Error('Catalog photo too large');
      chunks.push(chunk);
    }
    const result = fingerprintPhoto(Buffer.concat(chunks));
    await mkdir(dir,{recursive:true});
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp,JSON.stringify(result));
    await rename(temp,path);
    return result;
  }
  return {
    async reconcile(job) {
      const draft = job.preparation?.result?.draft;
      if (!draft) return { status: 'review', reason: 'missing-prepared-draft' };
      const offers = await readNightCatalog(client);
      const exact = reconcileNightOffer(offers,draft,{knownDrafts:await store.list({limit:Infinity})});
      if (exact.status === 'verified') await store.update(draft.id, { status: 'published', verifiedSalesBoxId: exact.remoteId });
      if (exact.reason !== 'manual-catalog-duplicate-review-required') return exact;
      if (!draft.sourcePhotoFingerprint) return { status:'review',reason:'missing-photo-fingerprint' };
      for (const offer of offers) {
        if (!isKyivNight(now())) return { status:'review',reason:'outside-window' };
        try {
          if (similarPhoto(draft.sourcePhotoFingerprint,await remoteFingerprint(offer))) {
            return {status:'review',reason:'similar-existing-photo',remoteId:offer.id};
          }
        } catch { return {status:'review',reason:'catalog-photo-review-incomplete',remoteId:offer.id}; }
      }
      return {status:'absent',checkedOffers:offers.length};
    },
    async publish(job, price) {
      const current = (await queue.read()).jobs[job.id];
      if (!isKyivNight(now()) || current?.hold || current?.status !== 'queued' ||
          current.updatedAt !== job.updatedAt || current.channels.salesbox?.status !== 'writing' ||
          current.price !== price || !client.canWrite()) throw new Error('Publication guard rejected write');
      const draft = current.preparation.result.draft;
      const result = await client.createOfferFromDraft(draft);
      if (result.dryRun) throw new Error('SalesBox did not publish');
      await store.save({...draft,status:'publication-pending',salesBoxResult:result});
    }
  };
}
