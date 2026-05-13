import test from "node:test";
import assert from "node:assert/strict";
import { SalesBoxClient, buildSalesBoxSeoCustomFields } from "../src/productAssistant/salesBoxClient.js";

const draft = {
  id: "draft-test",
  nameUk: "Lumiere Douce",
  nameEn: "Lumiere Douce",
  descriptionUk: "Жива кімнатна рослина у декоративній упаковці.",
  descriptionEn: "A living indoor plant in decorative wrapping.",
  price: 950,
  currency: "UAH",
  sku: "PL-123456",
  brand: "Nouvel Amour Plants",
  availability: "available",
  stockMode: "counted",
  category: "Кімнатні рослини",
  seo: {
    titleUk: "Lumiere Douce - кімнатна рослина",
    descriptionUk: "Кімнатна рослина Lumiere Douce від Nouvel Amour.",
    keywordsUk: "кімнатна рослина, Nouvel Amour",
    slug: "lumiere-douce"
  },
  photoFileId: "photo-id",
  photoUrl: "https://example.com/product.jpg",
  previewUrl: "https://example.com/product-preview.jpg"
};

test("SalesBox client stays in dry-run when credentials are incomplete", async () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: undefined,
    writeEnabled: true
  });

  assert.equal(client.canWrite(), false);

  const result = await client.createOfferFromDraft(draft);
  assert.equal(result.dryRun, true);
  assert.equal(result.endpoint, "offers/createMany?lang=uk");
  assert.deepEqual(result.missingRequiredFields, []);
  assert.equal(result.payload.offers[0].categories[0].id, "bd061350-4f12-49d6-a2e2-8e0d99ee0b90");
  assert.equal(result.payload.offers[0].stockType, "limited");
  assert.equal(result.payload.offers[0].count, 1);
});

test("SalesBox payload keeps creative name separate from factual category data", () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: "token",
    writeEnabled: false
  });

  const payload = client.toOfferPayload(draft);

  assert.deepEqual(payload.names, [
    { lang: "uk", name: "Lumiere Douce" },
    { lang: "en", name: "Lumiere Douce" }
  ]);
  assert.equal(payload.categories[0].id, "bd061350-4f12-49d6-a2e2-8e0d99ee0b90");
  assert.equal(payload.stockType, "limited");
  assert.equal(payload.externalId, "draft-test");
  assert.equal(payload.basePrice, 950);
  assert.equal(payload.photos[0].url, "https://example.com/product.jpg");
});

test("SalesBox dry-run reports missing public photo URL", async () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: "token",
    writeEnabled: false
  });

  const result = await client.createOfferFromDraft({
    ...draft,
    photoUrl: undefined,
    previewUrl: undefined
  });

  assert.deepEqual(result.missingRequiredFields, ["offers.*.photos"]);
});

test("SalesBox dry-run includes SEO custom fields for the second write step", async () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: undefined,
    writeEnabled: true
  });

  const result = await client.createOfferFromDraft(draft);

  assert.equal(result.seoEndpoint, "offers/{offerId}/custom-fields?lang=uk");
  assert.deepEqual(
    result.seoFields.map((field) => field.key),
    [
      "thxsd2rona_seo_offertitle_hidden",
      "thxsd2rona_seo_offerdescription_hidden",
      "thxsd2rona_seo_offerkeywords_hidden",
      "thxsd2rona_seo_offerslug_hidden"
    ]
  );
  assert.equal(result.seoFields[3].value, "lumiere-douce");
  assert.deepEqual(result.missingRequiredFields, []);
});

test("SalesBox SEO custom fields fall back to draft content instead of staying empty", () => {
  const fields = buildSalesBoxSeoCustomFields({
    id: "draft-fallback",
    nameUk: "Maison Ambree",
    descriptionUk: "Premium gift item from Nouvel Amour.",
    category: "Gifts",
    brand: "Nouvel Amour"
  });

  assert.equal(fields[0].value, "Maison Ambree");
  assert.equal(fields[1].value, "Premium gift item from Nouvel Amour.");
  assert.equal(fields[2].value, "Gifts, Nouvel Amour");
  assert.equal(fields[3].value, "maison-ambree");
});
