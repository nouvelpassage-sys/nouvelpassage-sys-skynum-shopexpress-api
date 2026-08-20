import test from "node:test";
import assert from "node:assert/strict";
import { SalesBoxClient, SALESBOX_CATEGORY_IDS, buildSalesBoxSeoCustomFields } from "../src/productAssistant/salesBoxClient.js";

const PLANTS_CATEGORY_ID = "bd061350-4f12-49d6-a2e2-8e0d99ee0b90";
const BOUQUETS_CATEGORY_ID = "710e87ac-5c0a-470b-a02e-e366179fef57";
const HOT_SHOWCASE_CATEGORY_ID = "edfe5f4b-2097-41ae-9d9b-0da8bd35e41e";
const categoryById = (categoryId) => Object.entries(SALESBOX_CATEGORY_IDS).find(([, id]) => id === categoryId)?.[0];
const hotShowcaseCategory = categoryById(HOT_SHOWCASE_CATEGORY_ID);

const draft = {
  id: "draft-test",
  nameUk: "Lumiere Douce",
  nameEn: "Lumiere Douce",
  descriptionUk: "Indoor plant in decorative wrapping.",
  descriptionEn: "A living indoor plant in decorative wrapping.",
  price: 950,
  currency: "UAH",
  sku: "PL-123456",
  brand: "Nouvel Amour Plants",
  availability: "available",
  stockMode: "counted",
  category: categoryById(PLANTS_CATEGORY_ID),
  seo: {
    titleUk: "Lumiere Douce - indoor plant",
    descriptionUk: "Indoor plant Lumiere Douce by Nouvel Amour.",
    keywordsUk: "indoor plant, Nouvel Amour",
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
  assert.equal(result.payload.offers[0].categories[0].id, PLANTS_CATEGORY_ID);
  assert.equal(result.payload.offers[0].categories[1].id, HOT_SHOWCASE_CATEGORY_ID);
  assert.equal(result.payload.offers[0].stockType, "limited");
  assert.equal(result.payload.offers[0].count, 1);
  assert.equal(result.payload.offers[0].isTop, true);
  assert.equal(result.payload.offers[0].order, 1);
  assert.ok(result.payload.offers[0].hashtags.some((tag) => tag.value === "tsina-do-1000"));
  assert.equal("basePrice" in result.payload.offers[0], false);
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
  assert.equal(payload.categories[0].id, PLANTS_CATEGORY_ID);
  assert.equal(payload.categories[1].id, HOT_SHOWCASE_CATEGORY_ID);
  assert.equal(payload.stockType, "limited");
  assert.equal(payload.externalId, "draft-test");
  assert.equal("basePrice" in payload, false);
  assert.equal(payload.isTop, true);
  assert.equal(payload.order, 1);
  assert.ok(payload.hashtags.some((tag) => tag.value === "novynka"));
  assert.ok(payload.hashtags.every((tag) => tag.showToClient === true));
  assert.ok(payload.hashtags.every((tag) => tag.availableForSearch === true));
  assert.equal(payload.photos[0].url, "https://example.com/product.jpg");
});

test("SalesBox payload forces every published product to the main page at position one", () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: "token",
    writeEnabled: false
  });

  const payload = client.toOfferPayload({
    ...draft,
    merchandising: { showOnMainPage: false, order: 47, hashtags: [] }
  });

  assert.equal(payload.isTop, true);
  assert.equal(payload.order, 1);
});

test("SalesBox payload adds each product to the hot showcase category without duplicates", () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: "token",
    writeEnabled: false
  });

  const payload = client.toOfferPayload({
    ...draft,
    category: hotShowcaseCategory
  });

  assert.deepEqual(payload.categories, [{ id: HOT_SHOWCASE_CATEGORY_ID }]);
});

test("SalesBox payload uses visible stock for always-available products", () => {
  const client = new SalesBoxClient({
    baseUrl: "https://prod.salesbox.me/openapi/",
    apiToken: "token",
    writeEnabled: false
  });

  const payload = client.toOfferPayload({
    ...draft,
    stockMode: "unlimited",
    category: categoryById(BOUQUETS_CATEGORY_ID)
  });

  assert.equal(payload.stockType, "endless");
  assert.equal(payload.allowNegativeStock, true);
  assert.equal(payload.count, 999);
  assert.equal(payload.minCount, 1);
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
