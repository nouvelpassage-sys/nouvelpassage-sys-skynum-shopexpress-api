// The production API can report payload.count/pagesCount=0 for a nonempty page.
// Never infer absence from those counters or from a partial/failed scan.
export async function readNightCatalog(client, { pageSize = 100, maxPages = 100 } = {}) {
  const offers = [];
  const ids = new Set();
  for (let page = 1; page <= maxPages; page++) {
    const result = await client.getOffers({ lang: 'uk', page, pageSize });
    if (result?.success !== true || !Array.isArray(result.data)) throw new Error('Unverified SalesBox catalog response');
    if (result.data.length === 0) return offers;
    for (const offer of result.data) {
      if (!offer?.id || ids.has(String(offer.id))) throw new Error('Unstable SalesBox pagination');
      ids.add(String(offer.id));
      offers.push(offer);
    }
  }
  throw new Error('SalesBox catalog scan limit reached');
}

export function reconcileNightOffer(offers, draft, { knownDrafts = [] } = {}) {
  const own = offers.filter((offer) => offer.externalId === draft.id || offer.internalId === draft.sku);
  if (own.length > 1) return { status: 'review', reason: 'multiple-identity-matches' };
  if (own.length === 1) {
    const offer = own[0];
    const photoMatches = [offer.originalURL, offer.previewURL, offer.previewURLBig].includes(draft.photoUrl);
    const matches = Number(offer.price) === Number(draft.price) && offer.name === draft.nameUk &&
      offer.description === draft.descriptionUk && offer.available === true &&
      offer.availableStatus === 'AVAILABLE' && photoMatches;
    return matches ? { status: 'verified', remoteId: offer.id } : {
      status: 'review', reason: 'published-fields-differ', remoteId: offer.id
    };
  }
  const prior = knownDrafts.filter((item) => item.id !== draft.id &&
    (item.photoFileId === draft.photoFileId || (item.photoUrl && item.photoUrl === draft.photoUrl)));
  const duplicate = offers.find((offer) =>
    [offer.originalURL, offer.previewURL, offer.previewURLBig].filter(Boolean).includes(draft.photoUrl) ||
    prior.some((item) => offer.externalId === item.id || offer.internalId === item.sku));
  if (duplicate) return { status: 'review', reason: 'existing-photo-or-source', remoteId: duplicate.id };
  // Exact identifiers alone do not prove a manually uploaded/re-encoded photo is new.
  // Publish adapters must add a verified visual/source review before treating this as absent.
  return { status: 'review', reason: 'manual-catalog-duplicate-review-required' };
}
