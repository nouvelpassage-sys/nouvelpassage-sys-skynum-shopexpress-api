import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(fileName = ".env") {
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

export function readBotConfig() {
  loadEnv();

  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramApiBaseUrl: process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org/",
    allowedChatIds: parseList(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    telegramAutoPublishReady: (process.env.TELEGRAM_AUTO_PUBLISH_READY ?? "false").toLowerCase() === "true",
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.4",
    dataDir: process.env.PRODUCT_ASSISTANT_DATA_DIR ?? "data/product-assistant",
    publicBaseUrl: process.env.PRODUCT_ASSISTANT_PUBLIC_BASE_URL,
    imageStorage: {
      provider: process.env.IMAGE_STORAGE_PROVIDER ?? "none",
      dir: process.env.IMAGE_STORAGE_DIR ?? "data/product-assistant/public-images",
      publicBaseUrl: process.env.IMAGE_STORAGE_PUBLIC_BASE_URL,
      salesBoxApiBaseUrl: process.env.SALESBOX_ADMIN_API_BASE_URL ?? "https://prod.salesbox.me/api/",
      salesBoxApiToken: process.env.SALESBOX_ADMIN_API_TOKEN,
      salesBoxCompanyId: process.env.SALESBOX_ADMIN_COMPANY_ID,
      salesBoxItemType: process.env.SALESBOX_UPLOAD_ITEM_TYPE ?? "services",
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
      cloudinaryUploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
      cloudinaryFolder: process.env.CLOUDINARY_FOLDER ?? "nouvel-amour/products"
    },
    salesBox: {
      baseUrl: process.env.SALESBOX_API_BASE_URL ?? "https://prod.salesbox.me/openapi/",
      apiToken: process.env.SALESBOX_API_TOKEN,
      companyId: process.env.SALESBOX_COMPANY_ID,
      writeEnabled: (process.env.SALESBOX_WRITE_ENABLED ?? "false").toLowerCase() === "true"
    },
    shopExpress: {
      enabled: (process.env.SHOP_EXPRESS_CHANNEL_ENABLED ?? "false").toLowerCase() === "true",
      writeEnabled: (process.env.SHOP_EXPRESS_WRITE_ENABLED ?? "false").toLowerCase() === "true",
      importFilePath:
        process.env.SHOP_EXPRESS_IMPORT_QUEUE_PATH ?? "data/product-assistant/shopexpress-pending-import.csv",
      importLinkEnabled: (process.env.SHOP_EXPRESS_IMPORT_LINK_ENABLED ?? "true").toLowerCase() === "true",
      importLinkCloudName: process.env.SHOP_EXPRESS_IMPORT_CLOUDINARY_CLOUD_NAME ?? process.env.CLOUDINARY_CLOUD_NAME,
      importLinkUploadPreset:
        process.env.SHOP_EXPRESS_IMPORT_CLOUDINARY_UPLOAD_PRESET ?? process.env.CLOUDINARY_UPLOAD_PRESET,
      importLinkFolder:
        process.env.SHOP_EXPRESS_IMPORT_CLOUDINARY_FOLDER ??
        `${process.env.CLOUDINARY_FOLDER ?? "nouvel-amour/products"}/imports`,
      baseUrl: process.env.SHOP_EXPRESS_BASE_URL,
      username: process.env.SHOP_EXPRESS_USERNAME,
      password: process.env.SHOP_EXPRESS_PASSWORD,
      productsUpsertPath: process.env.SHOP_EXPRESS_PRODUCTS_UPSERT_PATH ?? "/api/products"
    }
  };
}

function parseList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
