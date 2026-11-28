import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readNightCatalog, reconcileNightOffer } from './nightSalesBoxCatalog.js';
import { fingerprintPhoto, similarPhoto } from './nightPhotoFingerprint.js';
import { isKyivNight } from './nightContentQueue.js';

export function createNightSalesBoxAdapter({ client, store, queue, publicationAllowed = isKyivNight, now = () => new Date(), fetchImpl = fetch }) {
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
      const exclusions = await readPhotoExclusions(join(queue.dir, 'photo-review-exclusions.json'));
      const exact = reconcileNightOffer(offers,draft,{knownDrafts:await store.list({limit:Infinity})});
      if (exact.status === 'verified') {
        let completeness;
        try { completeness = await client.verifyOfferCompleteness(exact.remoteId, draft); }
        catch { return { status: 'review', reason: 'published-details-unverified', remoteId: exact.remoteId }; }
        if (!completeness.verified) return { status: 'review', reason: 'published-card-incomplete', remoteId: exact.remoteId, issues: completeness.issues };
        await store.update(draft.id, { status: 'published', verifiedSalesBoxId: exact.remoteId });
      }
      if (exact.reason !== 'manual-catalog-duplicate-review-required') return exact;
      if (!draft.sourcePhotoFingerprint) return { status:'review',reason:'missing-photo-fingerprint' };
      for (const offer of offers) {
        if (exclusions.has(String(offer.id))) continue;
        if (!publicationAllowed(now())) return { status:'review',reason:'outside-window' };
        try {
          const remote = await remoteFingerprint(offer);
          if (similarPhoto(draft.sourcePhotoFingerprint,remote) || (draft.processedPhotoFingerprint && similarPhoto(draft.processedPhotoFingerprint,remote))) {
            return {status:'review',reason:'similar-existing-photo',remoteId:offer.id};
          }
        } catch { return {status:'review',reason:'catalog-photo-review-incomplete',remoteId:offer.id}; }
      }
      return {status:'absent',checkedOffers:offers.length,excludedPhotos:offers.filter((offer) => exclusions.has(String(offer.id))).length};
    },
    async publish(job, price) {
      const current = (await queue.read()).jobs[job.id];
      if (!publicationAllowed(now()) || current?.hold || current?.status !== 'queued' ||
          current.updatedAt !== job.updatedAt || current.channels.salesbox?.status !== 'writing' ||
          current.price !== price || !client.canWrite()) throw new Error('Publication guard rejected write');
      const draft = current.preparation.result.draft;
      const result = await client.createOfferFromDraft(draft);
      if (result.dryRun) throw new Error('SalesBox did not publish');
      await store.save({...draft,status:'publication-pending',salesBoxResult:result});
    }
  };
}


export async function readPhotoExclusions(path) {
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return new Set(); throw error; }
  if (value.version !== 1 || !value.approvedAt || !Array.isArray(value.offerIds) ||
      value.offerIds.length > 500 || value.offerIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error('Invalid approved photo exclusions');
  }
  return new Set(value.offerIds);
}
