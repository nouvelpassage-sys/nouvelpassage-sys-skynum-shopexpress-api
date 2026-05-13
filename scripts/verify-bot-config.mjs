import { readBotConfig } from "../src/productAssistant/env.js";

const config = readBotConfig();
const missing = [];
const warnings = [];

if (!config.telegramToken) missing.push("TELEGRAM_BOT_TOKEN");
if (!config.openAiApiKey) warnings.push("OPENAI_API_KEY (бот працюватиме, але без GPT-генерації)");
if (!config.salesBox?.apiToken) missing.push("SALESBOX_API_TOKEN");
if (!config.salesBox?.companyId) missing.push("SALESBOX_COMPANY_ID");

if (!config.imageStorage?.provider || config.imageStorage.provider === "none") {
  warnings.push("IMAGE_STORAGE_PROVIDER=none (для карток із фото рекомендовано cloudinary-unsigned)");
}
if (config.imageStorage?.provider === "cloudinary-unsigned") {
  if (!config.imageStorage?.cloudinaryCloudName) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!config.imageStorage?.cloudinaryUploadPreset) missing.push("CLOUDINARY_UPLOAD_PRESET");
}

if (config.shopExpress?.enabled) {
  if (!config.shopExpress?.importFilePath) missing.push("SHOP_EXPRESS_IMPORT_QUEUE_PATH");
  if (!config.shopExpress?.baseUrl) warnings.push("SHOP_EXPRESS_BASE_URL (канал увімкнено, але base URL порожній)");
  if (!config.shopExpress?.username) warnings.push("SHOP_EXPRESS_USERNAME (канал увімкнено)");
  if (!config.shopExpress?.password) warnings.push("SHOP_EXPRESS_PASSWORD (канал увімкнено)");
}

const report = {
  ok: missing.length === 0,
  missing,
  warnings,
  summary: missing.length
    ? "Є критичні пропуски змінних середовища."
    : "Критичних пропусків немає. Можна запускати бота."
};

console.log(JSON.stringify(report, null, 2));

if (missing.length) {
  process.exitCode = 1;
}

