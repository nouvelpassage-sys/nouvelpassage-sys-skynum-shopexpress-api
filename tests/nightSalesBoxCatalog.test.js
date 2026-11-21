import test from 'node:test';
import assert from 'node:assert/strict';
import { readNightCatalog, reconcileNightOffer } from '../src/productAssistant/nightSalesBoxCatalog.js';

test('catalog ignores false zero counters and scans through short pages to empty', async () => {
  const pages = [];
  const rows = await readNightCatalog({ getOffers: async ({ page }) => {
    pages.push(page);
    return { success: true, data: page < 3 ? [{ id: String(page) }] : [], payload: { count: 0, pagesCount: 0 } };
  } });
  assert.equal(rows.length, 2);
  assert.deepEqual(pages, [1, 2, 3]);
});

test('incomplete, repeated and failed catalog reads never establish absence', async () => {
  for (const response of [{ success: false, data: [] }, { success: true, data: {} }]) {
    await assert.rejects(readNightCatalog({ getOffers: async () => response }));
  }
  await assert.rejects(readNightCatalog({ getOffers: async () => ({ success: true, data: [{ id: 'same' }] }) }));
  await assert.rejects(readNightCatalog({ getOffers: async ({ page }) => ({ success: true, data: [{ id: String(page) }] }) }, { maxPages: 2 }));
});

const draft = { id: 'draft-1', sku: 'SKU-1', price: 3000, nameUk: 'Belle Nuit', descriptionUk: 'Опис', photoUrl: 'https://image.test/1.jpg', photoFileId: 'telegram-1' };
const offer = { id: 'remote-1', externalId: draft.id, price: 3000, name: draft.nameUk, description: draft.descriptionUk, available: true, availableStatus: 'AVAILABLE', originalURL: draft.photoUrl };

test('verified requires persisted identity, price, copy, photo and availability', () => {
  assert.equal(reconcileNightOffer([offer], draft).status, 'verified');
  for (const patch of [{ price: 3100 }, { available: false }, { description: 'other' }, { originalURL: 'other' }]) {
    assert.equal(reconcileNightOffer([{ ...offer, ...patch }], draft).status, 'review');
  }
});

test('manual photo duplicates are held and unknown photos require review', () => {
  assert.equal(reconcileNightOffer([{ ...offer, externalId: 'manual' }], draft).reason, 'existing-photo-or-source');
  assert.equal(reconcileNightOffer([], draft).reason, 'manual-catalog-duplicate-review-required');
  assert.equal(reconcileNightOffer([{ ...offer, externalId: 'old', originalURL: 'other' }], draft, {
    knownDrafts: [{ id: 'old', photoFileId: draft.photoFileId }]
  }).reason, 'existing-photo-or-source');
});
