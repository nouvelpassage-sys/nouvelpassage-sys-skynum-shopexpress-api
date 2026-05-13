import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ShopExpressImportQueueLinkPublisher } from "../src/productAssistant/shopExpressImportQueueLink.js";

test("returns empty status when queue file is missing", async () => {
  const publisher = new ShopExpressImportQueueLinkPublisher({
    enabled: true,
    importFilePath: join(tmpdir(), "missing-shopexpress-queue.csv"),
    cloudName: "demo",
    uploadPreset: "preset",
    fetchImpl: async () => {
      throw new Error("fetch must not run for missing files");
    }
  });

  const result = await publisher.publishQueueFile();
  assert.equal(result.enabled, true);
  assert.equal(result.empty, true);
  assert.equal(result.rowCount, 0);
});

test("uploads queue csv to Cloudinary raw and returns URL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nouvel-shop-link-"));
  try {
    const queuePath = join(dir, "queue.csv");
    await writeFile(queuePath, `\uFEFF"ExternalID";"Name"\r\n"draft-1";"Maison Calme"\r\n`, "utf8");

    let called = false;
    const publisher = new ShopExpressImportQueueLinkPublisher({
      enabled: true,
      importFilePath: queuePath,
      cloudName: "demo",
      uploadPreset: "preset",
      fetchImpl: async () => {
        called = true;
        return new Response(
          JSON.stringify({
            secure_url: "https://res.cloudinary.com/demo/raw/upload/v1/queue.csv",
            public_id: "queue"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    });

    const result = await publisher.publishQueueFile();
    assert.equal(called, true);
    assert.equal(result.enabled, true);
    assert.equal(result.queued, true);
    assert.equal(result.rowCount, 1);
    assert.match(result.importUrl, /cloudinary\.com/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clearQueueFile keeps only CSV header row", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nouvel-shop-clear-"));
  try {
    const queuePath = join(dir, "queue.csv");
    await writeFile(queuePath, `\uFEFF"ExternalID";"Name"\r\n"draft-1";"Maison Calme"\r\n`, "utf8");

    const publisher = new ShopExpressImportQueueLinkPublisher({
      enabled: true,
      importFilePath: queuePath,
      cloudName: "demo",
      uploadPreset: "preset",
      fetchImpl: async () => {
        throw new Error("fetch must not run during clearQueueFile");
      }
    });

    const result = await publisher.clearQueueFile();
    const content = await readFile(queuePath, "utf8");
    assert.equal(result.cleared, true);
    assert.match(content, /ExternalID/);
    assert.doesNotMatch(content, /draft-1/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("getQueueStatus returns row count for existing file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nouvel-shop-status-"));
  try {
    const queuePath = join(dir, "queue.csv");
    await writeFile(queuePath, `\uFEFF"ExternalID";"Name"\r\n"draft-1";"A"\r\n"draft-2";"B"\r\n`, "utf8");
    const publisher = new ShopExpressImportQueueLinkPublisher({
      enabled: true,
      importFilePath: queuePath,
      cloudName: "demo",
      uploadPreset: "preset",
      fetchImpl: async () => {
        throw new Error("fetch must not run during status");
      }
    });

    const status = await publisher.getQueueStatus();
    assert.equal(status.rowCount, 2);
    assert.ok(status.bytes > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
