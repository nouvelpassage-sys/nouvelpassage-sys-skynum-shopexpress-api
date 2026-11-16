import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductDraft, slugify } from "../src/productAssistant/contentGenerator.js";
import { nameKey } from "../src/productAssistant/bouquetNames.js";
import { SalesBoxClient } from "../src/productAssistant/salesBoxClient.js";
import { DraftStore } from "../src/productAssistant/draftStore.js";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "nouvel-names-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

function suggest(name) {
  return {
    generateProductContent: async () => ({
      nameUk: name, nameEn: name, productTypeUk: "букет троянд", category: "Букети",
      descriptionUk: `${name} пасує для побачення.`, descriptionEn: `${name} for an evening together.`,
      seoTitleUk: `${name} від Nouvel Amour`, seoDescriptionUk: `Букет ${name} для побачення.`
    })
  };
}

test("two independent stores cannot allocate the same AI name, including English copy and SEO", async (t) => {
  const dir = await fixture(t);
  const stores = [new DraftStore(dir), new DraftStore(dir)];
  await Promise.all(stores.map((store) => store.getUsedNames()));
  const original = "Les escaliers dérobés";
  const drafts = await Promise.all(Array.from({ length: 14 }, async (_, i) => {
    const store = stores[i % 2];
    const draft = await createProductDraft({ store, text: "Букети 2100 троянди", openAiClient: suggest(original) });
    await store.save(draft);
    return draft;
  }));
  assert.equal(drafts.filter((d) => d.nameUk === original).length, 1);
  assert.equal(new Set(drafts.map((d) => nameKey(d.nameUk))).size, drafts.length);
  for (const d of drafts) {
    assert.equal(d.nameEn, d.nameUk);
    assert.ok(d.descriptionEn.includes(d.nameEn));
    assert.ok(d.seo.titleUk.includes(d.nameUk));
    assert.equal(d.seo.slug, slugify(d.nameUk));
    assert.ok(Buffer.byteLength(`publish:${d.id}`) <= 64);
  }
});

test("historical catalog names, earlier drafts and retired manual names stay occupied after restart", async (t) => {
  const dir = await fixture(t);
  const draftsDir = join(dir, "drafts");
  await mkdir(draftsDir);
  const old = { id: "old", nameUk: "Букет «Тиха пристань»", nameEn: "Under the Viaduct", createdAt: "2020-01-01" };
  await writeFile(join(draftsDir, "old.json"), JSON.stringify(old));
  for (let batch = 0; batch < 10; batch++) {
    await Promise.all(Array.from({ length: 100 }, (_, i) => {
      const id = `newer-${batch}-${i}`;
      return writeFile(join(draftsDir, `${id}.json`), JSON.stringify({ id, createdAt: "2025-01-01" }));
    }));
  }
  const store = new DraftStore(dir);
  for (const name of ["ТИХА-ПРИСТАНЬ", "under the viaduct", "ciel poudre"]) {
    assert.equal(await store.tryReserveName(name, "other"), false);
  }
  await store.save({ ...old, nameUk: "Été sans horloge" });
  await store.save({ ...old, nameUk: "Le souffle court" });
  await rm(join(draftsDir, "old.json"));
  const restarted = new DraftStore(dir);
  await assert.rejects(restarted.save({ id: "new", nameUk: "ETE—sans horloge" }), { code: "NAME_TAKEN" });
  assert.equal(await restarted.tryReserveName("тиха пристань", "new"), false);
});

test("offline bouquet revisions of an identical hint use different words and forms", async (t) => {
  const store = new DraftStore(await fixture(t));
  const titles = [];
  for (let i = 0; i < 45; i++) {
    const draft = await createProductDraft({ text: "Букети 2100 троянди", store, sourceDraftId: i ? "previous" : undefined });
    titles.push(draft.nameUk);
  }
  assert.equal(new Set(titles.map(nameKey)).size, titles.length);
  assert.ok(new Set(titles.map((name) => name.split(/\s+/u).length)).size >= 3);
  assert.ok(titles.every((name) => !/\d/u.test(name)));
});

test("new SalesBox titles and their translations are reserved, including later pages and offline restarts", async (t) => {
  const dir = await fixture(t);
  const client = new SalesBoxClient({});
  let nextTitle = "The Narrow Staircase";
  const pagesRead = [];
  client.getOffers = async ({ page }) => {
    pagesRead.push(page);
    const pages = [
      [{ id: "one", name: "Букет «Довга дорога»" }],
      [{ id: "two", name: "Le soir des lanternes", names: [{ lang: "en", name: nextTitle }] }]
    ];
    return { data: { items: pages[page - 1] ?? [] } };
  };
  const store = new DraftStore(dir, { fetchCatalogNames: () => client.getCatalogNames() });
  await store.getUsedNames();
  assert.deepEqual(pagesRead, [1, 2, 3]);
  assert.equal(await store.tryReserveName("довга дорога", "new"), false);
  nextTitle = "The Hidden Stairwell";
  const draft = await createProductDraft({ store, text: "Букети 1950", openAiClient: suggest(nextTitle) });
  assert.notEqual(draft.nameUk, nextTitle);
  const restarted = new DraftStore(dir);
  assert.equal(await restarted.tryReserveName("the narrow stairCASE", "new"), false);
  assert.equal(await restarted.tryReserveName(nextTitle, "new"), false);
});
