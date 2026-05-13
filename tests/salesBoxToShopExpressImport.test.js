import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShopExpressImportFromSalesBoxOffers,
  getShopExpressImportStats,
  salesBoxOfferToShopExpressRow
} from "../src/productAssistant/salesBoxToShopExpressImport.js";

const offer = {
  id: "offer-id",
  internalId: "TY-165500",
  externalId: "draft-1",
  price: 650,
  baseCurrency: "UAH",
  available: true,
  stockType: "endless",
  originalURL: "https://res.cloudinary.com/demo/toy.jpg",
  names: [
    { lang: "uk", name: "Petit Calin" },
    { lang: "en", name: "Petit Calin" }
  ],
  descriptions: [
    { lang: "uk", description: "М'яка іграшка для подарунка." },
    { lang: "en", description: "A soft toy for a gift." }
  ],
  categories: [{ name: "Іграшки" }]
};

test("maps SalesBox offer to ShopExpress import row", () => {
  const row = salesBoxOfferToShopExpressRow(offer);

  assert.equal(row[0], "draft-1");
  assert.equal(row[1], "Petit Calin");
  assert.equal(row[3], 650);
  assert.equal(row[4], "TY-165500");
  assert.equal(row[6], "Іграшки");
  assert.equal(row[7], offer.originalURL);
  assert.equal(row[9], 999);
  assert.equal(row[10], "Available");
  assert.equal(row.at(-2), 1);
  assert.equal(row.at(-1), 1);
});

test("builds ShopExpress CSV from SalesBox offers", () => {
  const csv = buildShopExpressImportFromSalesBoxOffers([offer]);
  const stats = getShopExpressImportStats([offer]);

  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /ExternalID/);
  assert.match(csv, /Petit Calin/);
  assert.match(csv, /Минимальный заказ/);
  assert.equal(stats.total, 1);
  assert.equal(stats.ready, 1);
  assert.equal(stats.skipped, 0);
});
