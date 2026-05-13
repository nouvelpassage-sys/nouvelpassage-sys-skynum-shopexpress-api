import test from "node:test";
import assert from "node:assert/strict";
import { SALESBOX_CATEGORY_IDS } from "../src/productAssistant/salesBoxClient.js";
import {
  buildSalesBoxYmlFeed,
  getSalesBoxYmlExportReport,
  getSalesBoxYmlExportStats
} from "../src/productAssistant/salesBoxYmlFeed.js";

const bouquetCategory = Object.keys(SALESBOX_CATEGORY_IDS).at(-3);

const readyDraft = {
  id: "draft-ready",
  sku: "NF-BQT-001",
  nameUk: "Maison Calme",
  nameEn: "Maison Calme",
  brand: "Nouvel Flowers",
  productTypeUk: "Р±СѓРєРµС‚ РїС–РІРѕРЅС–Р№",
  category: bouquetCategory,
  price: 2500,
  currency: "UAH",
  stockMode: "unlimited",
  availability: "available",
  photoUrl: "https://res.cloudinary.com/demo/image/upload/bouquet.jpg",
  descriptionUk: "Boutique description without ingredient list.",
  descriptionEn: "Boutique English description.",
  seo: {
    slug: "maison-calme",
    descriptionUk: "SEO text"
  },
  qualityIssues: []
};

test("builds a SalesBox YML feed from ready product drafts", () => {
  const yml = buildSalesBoxYmlFeed([readyDraft], {
    now: new Date("2026-05-11T12:30:00Z")
  });

  assert.match(yml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(yml, /<yml_catalog date="2026-05-11 \d\d:30">/);
  assert.match(yml, /<offer id="NF-BQT-001" available="true">/);
  assert.match(yml, /<name>Maison Calme<\/name>/);
  assert.match(yml, /<picture>https:\/\/res.cloudinary.com\/demo\/image\/upload\/bouquet.jpg<\/picture>/);
  assert.match(yml, /<param name="stock_type">endless<\/param>/);
});

test("skips drafts that are not ready for SalesBox feed export", () => {
  const brokenDraft = {
    ...readyDraft,
    id: "draft-broken",
    photoUrl: null
  };

  const stats = getSalesBoxYmlExportStats([readyDraft, brokenDraft]);
  const yml = buildSalesBoxYmlFeed([readyDraft, brokenDraft]);

  assert.deepEqual(stats, {
    total: 2,
    exportable: 1,
    skipped: 1
  });
  assert.match(yml, /draft-ready|NF-BQT-001/);
  assert.doesNotMatch(yml, /draft-broken/);
});

test("reports why drafts are skipped from SalesBox YML export", () => {
  const report = getSalesBoxYmlExportReport([
    readyDraft,
    {
      id: "draft-no-photo",
      nameUk: "No Photo",
      descriptionUk: "Good text",
      category: bouquetCategory,
      price: 1200,
      qualityIssues: []
    },
    {
      id: "draft-with-qa",
      nameUk: "Blocked",
      descriptionUk: "Good text",
      category: bouquetCategory,
      price: 1200,
      photoUrl: "https://example.com/photo.jpg",
      qualityIssues: ["Bad description"]
    }
  ]);

  assert.equal(report.ready.length, 1);
  assert.equal(report.skipped.length, 2);
  assert.deepEqual(report.stats, {
    total: 3,
    exportable: 1,
    skipped: 2
  });
  assert.ok(report.skipped[0].reasons.includes("Missing public photo URL."));
  assert.ok(report.skipped[1].reasons.some((reason) => reason.startsWith("QA issues")));
});
