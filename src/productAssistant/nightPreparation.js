import { createHash } from 'node:crypto';
import { createProductDraft } from './contentGenerator.js';
import { validateProductDraft } from './productDraftQuality.js';
import { fingerprintPhoto } from './nightPhotoFingerprint.js';
import { isKyivNight } from './nightContentQueue.js';

// The private-chat generator remains unchanged; this wrapper adds silent,
// fail-closed review for unattended work and never retries a paid generation.
export function createNightPreparation({ telegram, contentClient, imageStorage, store, photoStudio, now = () => new Date() }) {
  return async (job) => {
    if (!isKyivNight(now())) throw new Error('Outside publication window');
    if (!contentClient || !imageStorage?.configured || !photoStudio) throw new Error('Night preparation dependencies unavailable');
    const photos = Object.values(job.messages).filter((message) => message.photo)
      .sort((a, b) => a.messageId - b.messageId);
    if (!photos.length || !(job.price > 0)) return { ready: false, reason: 'missing-photo-or-price' };
    if (photos.length > 2) return { ready: false, reason: 'album-needs-photo-selection' };
    const images = [];
    for (const message of photos) images.push(await telegram.getFileImage(message.photo.fileId, { timeoutMs: 20000 }));
    // Decode before any paid AI request, including both candidate originals.
    const fingerprints = images.map((item) => fingerprintPhoto(item.bytes));
    let photo = photos[0].photo;
    let image = images[0];
    if (!image?.bytes?.length || !image.dataUrl) throw new Error('Photo download failed');
    if (!isKyivNight(now())) throw new Error('Outside publication window');
    let audit;
    const draft = await createProductDraft({
      text: `${job.price} грн\n${Object.values(job.messages).map((message) => message.text).join('\n')}`,
      photoFileId: photo.fileId,
      imageDataUrl: image.dataUrl,
      revisionInstruction: 'Describe the confidently visible main flowers and palette in Ukrainian. Do not invent exact counts or varieties. Mention possible substitutions preserving style and palette.',
      openAiClient: { generateProductContent: async (input) => {
        const generated = await contentClient.generateProductContent({ ...input, price: job.price, nightContent: true, imageDataUrls: images.map((item) => item.dataUrl) });
        audit = generated.nightPhotoAudit;
        return generated;
      } }
    });
    const selected = audit?.selectedImageIndex ?? (images.length === 1 ? 0 : -1);
    const validSelection = Number.isInteger(selected) && selected >= 0 && selected < images.length;
    if (validSelection) { image = images[selected]; photo = photos[selected].photo; }
    draft.photoFileId = photo.fileId;
    draft.id = `night-${createHash('sha256').update(job.id).digest('hex').slice(0,24)}`;
    draft.price = job.price;
    if (!/замін/iu.test(draft.descriptionUk ?? '')) {
      draft.descriptionUk = `${draft.descriptionUk ?? ''} Можлива заміна окремих квітів зі збереженням стилю та палітри.`.trim();
    }
    draft.sourceGroupJobId = job.id;
    draft.sourcePhotoUniqueId = photo.uniqueId;
    draft.sourceImageSha256 = createHash('sha256').update(image.bytes).digest('hex');
    draft.sourcePhotoFingerprint = fingerprints[validSelection ? selected : 0];
    draft.nightPhotoAudit = audit;
    draft.qualityIssues = validateProductDraft(draft);
    await store.save(draft);
    const reviewed = validSelection && audit?.singleProduct === true && audit?.overallPhoto === true &&
      audit?.collage === false && audit?.confidentComposition === true;
    if (!reviewed || draft.qualityIssues.length) return { ready: false, draftId: draft.id, reason: 'photo-or-copy-needs-review' };
    if (!isKyivNight(now())) return { ready: false, draftId: draft.id, reason: 'window-ended-before-image-storage' };
    const processed = await photoStudio.process(image);
    draft.photoStudio = { profile: processed.profile, storageKey: processed.storageKey, review: processed.review, ready: processed.ready };
    await store.save(draft);
    if (!processed.ready) return { ready: false, draftId: draft.id, reason: 'studio-photo-needs-review' };
    draft.processedPhotoFingerprint = fingerprintPhoto(processed.bytes);
    image = processed;
    if (!isKyivNight(now())) return { ready: false, draftId: draft.id, reason: 'window-ended-after-studio' };
    const saved = await imageStorage.storeProductImage({ draftId: draft.id, ...image, signal: AbortSignal.timeout(20000) });
    if (!saved?.url || !/^https:\/\//.test(saved.url)) throw new Error('Public product image unavailable');
    draft.photoUrl = saved.url;
    draft.previewUrl = saved.previewUrl ?? saved.url;
    draft.photos = [{ url: draft.photoUrl, previewURL: draft.previewUrl, contentType: image.contentType }];
    await store.save(draft);
    return { ready: true, draftId: draft.id, draft };
  };
}
