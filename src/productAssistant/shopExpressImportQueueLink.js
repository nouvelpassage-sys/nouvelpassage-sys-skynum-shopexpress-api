import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { SHOP_EXPRESS_IMPORT_HEADERS } from "./shopExpressPublisher.js";

const DEFAULT_QUEUE_PATH = "data/product-assistant/shopexpress-pending-import.csv";

export class ShopExpressImportQueueLinkPublisher {
  constructor({
    enabled = true,
    importFilePath = DEFAULT_QUEUE_PATH,
    cloudName,
    uploadPreset,
    folder = "nouvel-amour/products/imports",
    fetchImpl = fetch
  } = {}) {
    this.enabled = Boolean(enabled);
    this.importFilePath = importFilePath;
    this.cloudName = cloudName;
    this.uploadPreset = uploadPreset;
    this.folder = folder;
    this.fetch = fetchImpl;
  }

  isConfigured() {
    return Boolean(this.enabled && this.cloudName && this.uploadPreset);
  }

  async publishQueueFile() {
    if (!this.enabled) {
      return {
        enabled: false,
        queued: false,
        reason: "ShopExpress import link publishing is disabled."
      };
    }

    if (!this.isConfigured()) {
      return {
        enabled: true,
        queued: false,
        reason: "Cloudinary config for queue upload is missing."
      };
    }

    if (!existsSync(this.importFilePath)) {
      return {
        enabled: true,
        queued: false,
        empty: true,
        rowCount: 0
      };
    }

    const bytes = await readFile(this.importFilePath);
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    const rowCount = countDataRows(text);
    if (!rowCount) {
      return {
        enabled: true,
        queued: false,
        empty: true,
        rowCount: 0
      };
    }

    const uploadResult = await this.uploadRawCsv(bytes);
    return {
      enabled: true,
      queued: true,
      rowCount,
      bytes: bytes.length,
      importUrl: uploadResult.secureUrl,
      publicId: uploadResult.publicId,
      uploadedAt: new Date().toISOString()
    };
  }

  async clearQueueFile() {
    await writeFile(this.importFilePath, buildCsvWithHeaderOnly(), "utf8");
    return {
      enabled: this.enabled,
      cleared: true,
      importFilePath: this.importFilePath
    };
  }

  async getQueueStatus() {
    if (!this.enabled) {
      return {
        enabled: false,
        importFilePath: this.importFilePath,
        rowCount: 0
      };
    }

    if (!existsSync(this.importFilePath)) {
      return {
        enabled: true,
        importFilePath: this.importFilePath,
        rowCount: 0
      };
    }

    const bytes = await readFile(this.importFilePath);
    const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
    const rowCount = countDataRows(text);
    return {
      enabled: true,
      importFilePath: this.importFilePath,
      rowCount,
      bytes: bytes.length
    };
  }

  async uploadRawCsv(bytes) {
    const now = Date.now();
    const publicId = `shopexpress-pending-import-${now}`;
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "text/csv" }), basename(this.importFilePath) || "shopexpress-pending-import.csv");
    form.append("upload_preset", this.uploadPreset);
    if (this.folder) {
      form.append("folder", this.folder);
    }
    form.append("public_id", publicId);

    const response = await this.fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName)}/raw/upload`, {
      method: "POST",
      body: form
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(`Cloudinary raw upload failed: ${response.status} ${JSON.stringify(payload).slice(0, 500)}`);
    }

    const secureUrl = payload?.secure_url ?? payload?.url;
    if (!secureUrl) {
      throw new Error(`Cloudinary raw upload failed: missing URL ${JSON.stringify(payload).slice(0, 500)}`);
    }

    return {
      secureUrl,
      publicId: payload?.public_id ?? publicId
    };
  }
}

export function createShopExpressImportQueueLinkPublisher(config = {}) {
  return new ShopExpressImportQueueLinkPublisher({
    enabled: config.importLinkEnabled,
    importFilePath: config.importFilePath,
    cloudName: config.importLinkCloudName,
    uploadPreset: config.importLinkUploadPreset,
    folder: config.importLinkFolder
  });
}

function countDataRows(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return 0;
  }
  return Math.max(lines.length - 1, 0);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

function buildCsvWithHeaderOnly() {
  const csvHeader = SHOP_EXPRESS_IMPORT_HEADERS.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(";");
  return `\uFEFF${csvHeader}\r\n`;
}
