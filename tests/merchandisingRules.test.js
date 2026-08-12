import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAIN_PAGE_ORDER,
  PUSH_NOTIFICATION_SCHEDULE,
  buildMerchandisingProfile,
  buildSalesBoxHashtags
} from "../src/productAssistant/merchandisingRules.js";

test("merchandising profile keeps new products on top and visible on main page", () => {
  const profile = buildMerchandisingProfile({
    price: 2400,
    sourceText: "romantic bouquet for anniversary",
    category: "Bouquets"
  });

  assert.equal(profile.showOnMainPage, true);
  assert.equal(profile.order, DEFAULT_MAIN_PAGE_ORDER);
  assert.ok(profile.hashtags.some((tag) => tag.value === "tsina-2000-3500"));
  assert.ok(profile.hashtags.some((tag) => tag.value === "podija-romantyka"));
});

test("SalesBox hashtags include price, occasion, and type tags", () => {
  const hashtags = buildSalesBoxHashtags({
    price: 850,
    sourceText: "plant for home",
    productTypeUk: "plant",
    category: "Plants"
  });

  assert.ok(hashtags.some((tag) => tag.value === "tsina-do-1000"));
  assert.ok(hashtags.some((tag) => tag.value === "podija-dlia-domu"));
  assert.ok(hashtags.some((tag) => tag.value === "typ-roslyny"));
  assert.ok(hashtags.every((tag) => tag.showToClient === true));
  assert.ok(hashtags.every((tag) => tag.availableForSearch === true));
});

test("push notification schedule is planned twice per day for all clients", () => {
  assert.equal(PUSH_NOTIFICATION_SCHEDULE.length, 2);
  assert.deepEqual(
    PUSH_NOTIFICATION_SCHEDULE.map((item) => item.audience),
    ["all_clients", "all_clients"]
  );
  assert.deepEqual(
    PUSH_NOTIFICATION_SCHEDULE.map((item) => item.time),
    ["10:30", "18:30"]
  );
});
