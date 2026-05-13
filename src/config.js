import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env");

function loadEnvFile(fileName) {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumber(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function readStatusMapping() {
  const raw = process.env.STATUS_MAPPING_JSON ?? "{}";

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("STATUS_MAPPING_JSON must be a JSON object");
    }

    return parsed;
  } catch (error) {
    throw new Error(`Invalid STATUS_MAPPING_JSON: ${error.message}`);
  }
}

function readProductMatchKey() {
  const value = process.env.PRODUCT_MATCH_KEY ?? "sku";
  if (!["sku", "barcode", "id"].includes(value)) {
    throw new Error("PRODUCT_MATCH_KEY must be one of: sku, barcode, id");
  }

  return value;
}

export const config = {
  shopExpress: {
    baseUrl: requireEnv("SHOP_EXPRESS_BASE_URL"),
    username: requireEnv("SHOP_EXPRESS_USERNAME"),
    password: requireEnv("SHOP_EXPRESS_PASSWORD"),
    ordersListPath: process.env.SHOP_EXPRESS_ORDERS_LIST_PATH ?? "/api/orders",
    orderStatusPathTemplate:
      process.env.SHOP_EXPRESS_ORDER_STATUS_PATH_TEMPLATE ?? "/api/orders/{id}/status",
    productsUpsertPath: process.env.SHOP_EXPRESS_PRODUCTS_UPSERT_PATH ?? "/api/products",
    productStockPathTemplate:
      process.env.SHOP_EXPRESS_PRODUCT_STOCK_PATH_TEMPLATE ?? "/api/products/{id}/stock",
    productImagesPathTemplate:
      process.env.SHOP_EXPRESS_PRODUCT_IMAGES_PATH_TEMPLATE ?? "/api/products/{id}/images"
  },
  skynum: {
    baseUrl: requireEnv("SKYNUM_API_BASE_URL"),
    token: requireEnv("SKYNUM_API_TOKEN"),
    partnerToken: process.env.SKYNUM_PARTNER_TOKEN,
    stockId: process.env.SKYNUM_STOCK_ID,
    productsListPath: process.env.SKYNUM_PRODUCTS_LIST_PATH ?? "/api/products",
    remainsReportPath: process.env.SKYNUM_REMAINS_REPORT_PATH ?? "/v1/reports/remains",
    ordersUpsertPath: process.env.SKYNUM_ORDERS_UPSERT_PATH ?? "/api/orders",
    orderStatusPathTemplate:
      process.env.SKYNUM_ORDER_STATUS_PATH_TEMPLATE ?? "/api/orders/{id}/status"
  },
  sync: {
    mode: process.env.SYNC_MODE ?? "products",
    intervalSeconds: readNumber("SYNC_INTERVAL_SECONDS", "60"),
    lookbackDays: readNumber("SYNC_LOOKBACK_DAYS", "30"),
    dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() === "true",
    productMatchKey: readProductMatchKey(),
    autoFillSeo: (process.env.AUTO_FILL_SEO ?? "true").toLowerCase() === "true",
    contentTaskReportPath: process.env.CONTENT_TASK_REPORT_PATH ?? "reports/product-content-tasks.json",
    statusMapping: readStatusMapping()
  }
};
