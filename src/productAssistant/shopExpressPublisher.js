import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DEFAULT_IMPORT_FILE = "data/product-assistant/shopexpress-pending-import.csv";

export class ShopExpressPublisher {
  constructor({
    enabled = false,
    writeEnabled = false,
    importFilePath = DEFAULT_IMPORT_FILE,
    baseUrl,
    username,
    password,
    productsUpsertPath = "/api/products",
    requestTimeoutMs = 20000
  } = {}) {
    this.enabled = Boolean(enabled);
    this.writeEnabled = Boolean(writeEnabled);
    this.importFilePath = importFilePath;
    this.baseUrl = baseUrl ? ensureTrailingSlash(baseUrl) : null;
    this.username = username;
    this.password = password;
    this.productsUpsertPath = productsUpsertPath;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  canWrite() {
    return Boolean(this.enabled && this.writeEnabled && this.baseUrl && this.username && this.password);
  }

  async publishDraft(draft) {
    if (!this.enabled) {
      return {
        enabled: false,
        dryRun: true,
        queued: false,
        reason: "ShopExpress publishing is not enabled."
      };
    }

    const payload = toShopExpressPayload(draft);
    const missingRequiredFields = getMissingFields(payload);
    if (missingRequiredFields.length) {
      return {
        enabled: true,
        dryRun: true,
        queued: false,
        missingRequiredFields,
        payload
      };
    }

    if (!this.canWrite()) {
      const queue = await this.appendImportRow(payload);
      return {
        enabled: true,
        dryRun: true,
        queued: true,
        importFilePath: queue.importFilePath,
        duplicate: queue.duplicate,
        payload
      };
    }

    const response = await fetch(new URL(this.productsUpsertPath, this.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      headers: {
        authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) {
      throw new Error(`ShopExpress product write failed: ${response.status} ${text.slice(0, 500)}`);
    }

    return {
      enabled: true,
      dryRun: false,
      queued: false,
      body
    };
  }

  async appendImportRow(payload) {
    await mkdir(dirname(this.importFilePath), { recursive: true });
    const row = toImportRow(payload);
    const header = SHOP_EXPRESS_IMPORT_HEADERS;
    const rowKey = csvKey(row);
    let rows = [header];

    if (existsSync(this.importFilePath)) {
      rows = parseCsv((await readFile(this.importFilePath, "utf8")).replace(/^\uFEFF/, ""));
      if (!rows.length) {
        rows = [header];
      }
      const existingHeader = rows[0];
      const existingKeyIndex = existingHeader.indexOf("ExternalID");
      if (existingKeyIndex !== -1) {
        const duplicate = rows.slice(1).some((existingRow) => existingRow[existingKeyIndex] === payload.externalId);
        if (duplicate) {
          return {
            importFilePath: this.importFilePath,
            duplicate: true
          };
        }
      }
    }

    rows.push(row);
    await writeFile(this.importFilePath, `\uFEFF${toCsv(rows)}`, "utf8");
    return {
      importFilePath: this.importFilePath,
      duplicate: false
    };
  }
}

export function createShopExpressPublisher(config = {}) {
  return new ShopExpressPublisher(config);
}

export function toShopExpressPayload(draft) {
  const images = Array.isArray(draft.photos) && draft.photos.length
    ? draft.photos.map((photo) => photo.url ?? photo.originalURL ?? photo.originalUrl ?? photo.imageUrl ?? photo.previewURL).filter(Boolean)
    : [draft.photoUrl ?? draft.previewUrl].filter(Boolean);
  const slug = draft.seo?.slug ?? slugify(draft.nameUk ?? draft.id);
  return {
    externalId: draft.id,
    name: draft.nameUk,
    nameEn: draft.nameEn,
    sku: draft.sku,
    price: draft.price == null ? undefined : Number(draft.price),
    currency: draft.currency ?? "UAH",
    category: draft.category,
    description: draft.descriptionUk,
    descriptionEn: draft.descriptionEn,
    shortDescription: draft.visibleSummaryUk ?? draft.productTypeUk,
    images,
    inStock: draft.stockMode === "counted" ? getPositiveCount(draft) : 999,
    isAvailable: draft.availability === "unavailable" ? "Unavailable" : "Available",
    unit: "шт",
    minOrder: 1,
    step: 1,
    alias: slug,
    metaTitle: draft.seo?.titleUk ?? draft.nameUk,
    metaDescription: draft.seo?.descriptionUk,
    metaKeywords: ""
  };
}

export const SHOP_EXPRESS_IMPORT_HEADERS = [
  "ExternalID",
  "Name",
  "NameDescription",
  "Price",
  "Sku",
  "Currency",
  "Categories",
  "Images",
  "Unit",
  "InStock",
  "IsAvailable",
  "Alias",
  "MetaTitle",
  "MetaDescription",
  "MetaKeywords",
  "ShortDescription",
  "Минимальный заказ",
  "Кратность"
];

function toImportRow(payload) {
  return [
    payload.externalId,
    payload.name,
    payload.description,
    payload.price,
    payload.sku,
    payload.currency,
    payload.category,
    payload.images.join(","),
    payload.unit,
    payload.inStock,
    payload.isAvailable,
    payload.alias,
    payload.metaTitle,
    payload.metaDescription,
    payload.metaKeywords,
    payload.shortDescription,
    payload.minOrder,
    payload.step
  ];
}

function getMissingFields(payload) {
  const missing = [];
  if (!payload.name) missing.push("Name");
  if (!Number.isFinite(payload.price)) missing.push("Price");
  if (!payload.category) missing.push("Categories");
  if (!payload.images.length) missing.push("Images");
  return missing;
}

function getPositiveCount(draft) {
  const count = Number(draft.count ?? draft.stockCount ?? draft.quantity ?? 1);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureTrailingSlash(value) {
  return String(value).endsWith("/") ? String(value) : `${value}/`;
}

function parseJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function csvKey(row) {
  return row.join("\u001f");
}

function parseCsv(text, delimiter = ";") {
  const parsedRows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      parsedRows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    parsedRows.push(row);
  }

  return parsedRows;
}

function toCsv(csvRows, delimiter = ";") {
  return csvRows.map((row) => row.map(escapeCsv).join(delimiter)).join("\r\n") + "\r\n";
}

function escapeCsv(field) {
  const text = String(field ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
