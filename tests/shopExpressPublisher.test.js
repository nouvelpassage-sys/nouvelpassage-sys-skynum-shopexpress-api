import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ShopExpressPublisher, toShopExpressPayload } from "../src/productAssistant/shopExpressPublisher.js";

const draft = {
  id: "draft-shop",
  nameUk: "Petit Calin",
  nameEn: "Petit Calin",
  productTypeUk: "іграшка",
  visibleSummaryUk: "М'яка іграшка для подарунка.",
  category: "Іграшки",
  price: 650,
  currency: "UAH",
  descriptionUk: "М'яка іграшка у теплому бежевому відтінку.",
  descriptionEn: "A soft beige toy.",
  photoUrl: "https://res.cloudinary.com/demo/image/upload/toy.jpg",
  seo: {
    slug: "petit-calin",
    titleUk: "Petit Calin",
    descriptionUk: "М'яка іграшка Petit Calin від Nouvel Amour."
  }
};

test("maps Telegram product draft to ShopExpress payload", () => {
  const payload = toShopExpressPayload(draft);

  assert.equal(payload.externalId, draft.id);
  assert.equal(payload.name, draft.nameUk);
  assert.equal(payload.price, 650);
  assert.equal(payload.category, "Іграшки");
  assert.equal(payload.images[0], draft.photoUrl);
  assert.equal(payload.inStock, 999);
  assert.equal(payload.isAvailable, "Available");
  assert.equal(payload.minOrder, 1);
  assert.equal(payload.step, 1);
});

test("queues ShopExpress import row while live API is disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nouvel-shopexpress-"));
  try {
    const importFilePath = join(dir, "queue.csv");
    const publisher = new ShopExpressPublisher({
      enabled: true,
      writeEnabled: false,
      importFilePath
    });

    const result = await publisher.publishDraft(draft);
    const content = await readFile(importFilePath, "utf8");

    assert.equal(result.enabled, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.queued, true);
    assert.match(content, /ExternalID/);
    assert.match(content, /draft-shop/);
    assert.match(content, /Petit Calin/);
    assert.match(content, /Минимальный заказ/);
    assert.match(content, /Кратность/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("maps all stored photos to ShopExpress import payload", () => {
  const payload = toShopExpressPayload({
    ...draft,
    photos: [
      { url: "https://cdn.example.com/one.jpg" },
      { url: "https://cdn.example.com/two.jpg" }
    ]
  });

  assert.deepEqual(payload.images, ["https://cdn.example.com/one.jpg", "https://cdn.example.com/two.jpg"]);
});
