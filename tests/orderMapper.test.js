import test from "node:test";
import assert from "node:assert/strict";
import { normalizeShopExpressOrder, toSkynumOrderPayload } from "../src/mappers/orderMapper.js";

test("maps a Shop-Express order into a Skynum payload", () => {
  const normalized = normalizeShopExpressOrder(
    {
      id: 123,
      number: "SE-123",
      status: "paid",
      currency: "UAH",
      total: 250,
      customer: {
        id: 7,
        name: "Test Customer",
        phone: "+380501112233"
      },
      items: [
        {
          id: 1,
          productId: 44,
          name: "Product",
          sku: "SKU-1",
          quantity: 2,
          price: 100
        }
      ]
    },
    { paid: "payment_received" }
  );

  assert.deepEqual(toSkynumOrderPayload(normalized), {
    externalId: "123",
    source: "shop-express",
    number: "SE-123",
    status: "payment_received",
    createdAt: undefined,
    updatedAt: undefined,
    currency: "UAH",
    total: 250,
    customer: {
      externalId: "7",
      name: "Test Customer",
      email: undefined,
      phone: "+380501112233"
    },
    items: [
      {
        externalId: "1",
        productExternalId: "44",
        name: "Product",
        sku: "SKU-1",
        barcode: undefined,
        quantity: 2,
        price: 100,
        total: 200
      }
    ],
    delivery: undefined,
    payment: undefined
  });
});
