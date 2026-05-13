import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContentTask,
  normalizeSkynumProduct,
  toShopExpressProductPayload
} from "../src/mappers/productMapper.js";

test("maps a Skynum product into a Shop-Express payload", () => {
  const normalized = normalizeSkynumProduct(
    {
      id: 55,
      name: "Тестовий товар",
      article: "SKU-55",
      ean: "4820000000000",
      retailPrice: 199,
      availableQuantity: 12,
      manufacturer: "Brand",
      photos: ["https://example.com/image.jpg"]
    },
    { autoFillSeo: true }
  );

  assert.deepEqual(toShopExpressProductPayload(normalized, "sku"), {
    externalId: "55",
    matchKey: "sku",
    matchValue: "SKU-55",
    name: "Тестовий товар",
    sku: "SKU-55",
    barcode: "4820000000000",
    price: 199,
    currency: "UAH",
    stock: 12,
    category: undefined,
    brand: "Brand",
    description: "",
    seoTitle: "Тестовий товар | Brand | SKU-55",
    seoDescription:
      "Тестовий товар (Brand, код SKU-55): в наявності. Актуальна ціна, опис і характеристики в інтернет-магазині.",
    slug: undefined,
    images: [{ url: "https://example.com/image.jpg" }]
  });
});

test("creates content tasks for missing media and weak descriptions", () => {
  const normalized = normalizeSkynumProduct(
    {
      id: 77,
      name: "Product without content",
      sku: "SKU-77",
      stock: 0
    },
    { autoFillSeo: true }
  );

  assert.deepEqual(buildContentTask(normalized)?.missing, ["images", "description"]);
});
