import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createProductDraft, parseProductMessage } from "./productAssistant/contentGenerator.js";
import { DraftStore } from "./productAssistant/draftStore.js";
import { readBotConfig } from "./productAssistant/env.js";
import { createImageStorage } from "./productAssistant/imageStorage.js";
import { OpenAiContentClient } from "./productAssistant/openAiContentClient.js";
import { validateProductDraft } from "./productAssistant/productDraftQuality.js";
import { SalesBoxClient } from "./productAssistant/salesBoxClient.js";
import { createShopExpressPublisher } from "./productAssistant/shopExpressPublisher.js";
import {
  buildSalesBoxYmlFeed,
  getSalesBoxYmlExportReport,
  getSalesBoxYmlExportStats
} from "./productAssistant/salesBoxYmlFeed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const staticDir = join(rootDir, "public", "product-assistant-dashboard");

const config = readBotConfig();
const store = new DraftStore(config.dataDir);
const contentClient = config.openAiApiKey
  ? new OpenAiContentClient({ apiKey: config.openAiApiKey, model: config.openAiModel })
  : null;
const salesBox = new SalesBoxClient(config.salesBox);
const shopExpress = createShopExpressPublisher(config.shopExpress);
const imageStorage = createImageStorage(config.imageStorage);
const execFileAsync = promisify(execFile);

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected dashboard error."
    });
  }
});

const port = Number(process.env.PRODUCT_ASSISTANT_DASHBOARD_PORT ?? 4177);
server.listen(port, () => {
  console.log(`Product assistant dashboard is running at http://localhost:${port}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, {
      openAi: {
        configured: Boolean(config.openAiApiKey),
        model: config.openAiModel
      },
      salesBox: {
        configured: Boolean(config.salesBox.apiToken),
        companyId: config.salesBox.companyId ?? null,
        writeEnabled: Boolean(config.salesBox.writeEnabled),
        baseUrl: config.salesBox.baseUrl
      },
      shopExpress: {
        enabled: Boolean(config.shopExpress.enabled),
        writeEnabled: Boolean(config.shopExpress.writeEnabled),
        configured: Boolean(config.shopExpress.baseUrl && config.shopExpress.username && config.shopExpress.password),
        mode: config.shopExpress.writeEnabled ? "api" : "import-queue",
        importFilePath: config.shopExpress.importFilePath
      },
      imageStorage: {
        provider: config.imageStorage.provider,
        configured: Boolean(imageStorage.configured),
        recommendedProvider: "cloudinary-unsigned",
        missingFields: getImageStorageMissingFields(config.imageStorage),
        options: [
          {
            provider: "cloudinary-unsigned",
            label: "Cloudinary",
            role: "Швидкий публічний URL для SalesBox",
            env: [
              "IMAGE_STORAGE_PROVIDER=cloudinary-unsigned",
              "CLOUDINARY_CLOUD_NAME=your_cloud_name",
              "CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset",
              "CLOUDINARY_FOLDER=nouvel-amour/products"
            ]
          },
          {
            provider: "salesbox-s3",
            label: "SalesBox S3",
            role: "Найкращий довгостроковий варіант після отримання admin upload token",
            env: [
              "IMAGE_STORAGE_PROVIDER=salesbox-s3",
              "SALESBOX_ADMIN_API_TOKEN=admin_upload_token",
              "SALESBOX_ADMIN_COMPANY_ID=internal_company_uuid",
              "SALESBOX_UPLOAD_ITEM_TYPE=services"
            ]
          },
          {
            provider: "static-public",
            label: "Static public hosting",
            role: "Запасний варіант, якщо є власний public CDN/server",
            env: [
              "IMAGE_STORAGE_PROVIDER=static-public",
              "IMAGE_STORAGE_DIR=data/product-assistant/public-images",
              "IMAGE_STORAGE_PUBLIC_BASE_URL=https://example.com/product-images/"
            ]
          }
        ]
      },
      telegram: await getTelegramRuntimeStatus()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/drafts") {
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const drafts = await store.list({ limit: Number.isFinite(limit) ? limit : 20 });
    sendJson(response, 200, {
      drafts: drafts.map(toDraftListItem)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/salesbox-feed.yml") {
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const drafts = await store.list({ limit: Number.isFinite(limit) ? limit : 500 });
    const yml = buildSalesBoxYmlFeed(drafts);
    const stats = getSalesBoxYmlExportStats(drafts);
    response.writeHead(200, {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="nouvel-amour-salesbox-feed.yml"',
      "x-export-total": String(stats.total),
      "x-export-ready": String(stats.exportable),
      "x-export-skipped": String(stats.skipped)
    });
    response.end(yml);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/salesbox-feed-status") {
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const drafts = await store.list({ limit: Number.isFinite(limit) ? limit : 500 });
    const report = getSalesBoxYmlExportReport(drafts);
    sendJson(response, 200, {
      ...report,
      ready: report.ready.map(({ draft, ...item }) => item),
      skipped: report.skipped.slice(0, 50)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/drafts") {
    const body = await readJsonBody(request);
    const text = String(body.text ?? "").trim();
    if (!text) {
      sendJson(response, 400, { error: "Додай ціну, коротку підказку або посилання на фото." });
      return;
    }
    if (!hasDraftImageInput({ text, imageDataUrl: body.imageDataUrl, publicPhotoUrl: body.publicPhotoUrl })) {
      sendJson(response, 400, {
        error: "Для нової картки потрібне фото: обери локальне фото або додай public image URL."
      });
      return;
    }

    const draft = await createProductDraft({
      text,
      imageDataUrl: body.imageDataUrl,
      sourceCategory: body.sourceCategory,
      revisionInstruction: body.revisionInstruction,
      openAiClient: contentClient
    });
    const publicPhotoUrl = normalizePublicImageUrl(body.publicPhotoUrl);
    let storedImage = null;
    try {
      storedImage = await storeLocalImageIfPossible({
        draft,
        imageDataUrl: body.imageDataUrl,
        sourceFilePath: body.imageFileName
      });
    } catch (error) {
      draft.imageStorageWarning = error instanceof Error ? error.message : "Image upload failed.";
    }
    const photoUrl = publicPhotoUrl ?? storedImage?.url;
    const previewUrl = publicPhotoUrl ?? storedImage?.previewUrl ?? storedImage?.url;
    if (photoUrl) {
      setDraftPhoto(draft, { photoUrl, previewUrl });
    }
    await store.save(draft);

    sendJson(response, 201, {
      draft,
      salesBox: salesBox.createOfferPreview(draft)
    });
    return;
  }

  const draftMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
  if (request.method === "GET" && draftMatch) {
    const draft = await store.get(decodeURIComponent(draftMatch[1]));
    sendJson(response, 200, {
      draft,
      salesBox: salesBox.createOfferPreview(draft)
    });
    return;
  }

  if (request.method === "PATCH" && draftMatch) {
    const draft = await store.get(decodeURIComponent(draftMatch[1]));
    const body = await readJsonBody(request);
    const updated = applyDraftPatch(draft, body);
    await store.save(updated);
    sendJson(response, 200, {
      draft: updated,
      salesBox: salesBox.createOfferPreview(updated)
    });
    return;
  }

  const reviseMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/revise$/);
  if (request.method === "POST" && reviseMatch) {
    const sourceDraft = await store.get(decodeURIComponent(reviseMatch[1]));
    const body = await readJsonBody(request);
    const revised = await createRevisedDraft(sourceDraft, body);
    await store.save(revised);
    sendJson(response, 201, {
      sourceDraftId: sourceDraft.id,
      draft: revised,
      salesBox: salesBox.createOfferPreview(revised)
    });
    return;
  }

  const publishMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/publish$/);
  if (request.method === "POST" && publishMatch) {
    const draft = await store.get(decodeURIComponent(publishMatch[1]));
    const salesBoxResult = await salesBox.createOfferFromDraft(draft);
    const shopExpressResult = await shopExpress.publishDraft(draft);
    sendJson(response, 200, {
      draft,
      result: {
        dryRun: salesBoxResult.dryRun,
        salesBoxResult,
        shopExpressResult
      }
    });
    return;
  }

  const payloadMatch = url.pathname.match(/^\/api\/drafts\/([^/]+)\/salesbox-payload$/);
  if (request.method === "GET" && payloadMatch) {
    const draft = await store.get(decodeURIComponent(payloadMatch[1]));
    sendJson(response, 200, {
      draft,
      salesBox: salesBox.createOfferPreview(draft)
    });
    return;
  }

  sendJson(response, 404, { error: "Dashboard API route not found." });
}

async function storeLocalImageIfPossible({ draft, imageDataUrl, sourceFilePath }) {
  if (!imageDataUrl || !imageStorage.configured) {
    return null;
  }

  const image = parseImageDataUrl(imageDataUrl);
  return imageStorage.storeProductImage({
    draftId: draft.id,
    bytes: image.bytes,
    contentType: image.contentType,
    sourceFilePath
  });
}

function parseImageDataUrl(value) {
  const match = String(value ?? "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Некоректний формат локального фото.");
  }

  return {
    contentType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

function normalizePublicImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Публічне фото має бути http або https посиланням.");
  }
  return url.href;
}

function hasDraftImageInput({ text, imageDataUrl, publicPhotoUrl }) {
  return Boolean(imageDataUrl || normalizeOptionalString(publicPhotoUrl) || parseProductMessage(text).imageUrl);
}

function setDraftPhoto(draft, { photoUrl, previewUrl }) {
  draft.photoUrl = photoUrl;
  draft.previewUrl = previewUrl ?? photoUrl;
  draft.photos = [
    {
      url: draft.photoUrl,
      previewURL: draft.previewUrl,
      order: 0,
      type: "image",
      resourceType: "image"
    }
  ];
}

function toDraftListItem(draft) {
  return {
    id: draft.id,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    nameUk: draft.nameUk,
    productTypeUk: draft.productTypeUk,
    category: draft.category,
    price: draft.price,
    currency: draft.currency,
    photoUrl: draft.previewUrl ?? draft.photoUrl,
    qualityIssuesCount: draft.qualityIssues?.length ?? 0
  };
}

function getImageStorageMissingFields(imageStorageConfig) {
  if (imageStorageConfig.provider === "cloudinary-unsigned") {
    return [
      imageStorageConfig.cloudinaryCloudName ? null : "CLOUDINARY_CLOUD_NAME",
      imageStorageConfig.cloudinaryUploadPreset ? null : "CLOUDINARY_UPLOAD_PRESET"
    ].filter(Boolean);
  }

  if (imageStorageConfig.provider === "salesbox-s3") {
    return [
      imageStorageConfig.salesBoxApiToken ? null : "SALESBOX_ADMIN_API_TOKEN",
      imageStorageConfig.salesBoxCompanyId ? null : "SALESBOX_ADMIN_COMPANY_ID"
    ].filter(Boolean);
  }

  if (imageStorageConfig.provider === "static-public") {
    return [
      imageStorageConfig.dir ? null : "IMAGE_STORAGE_DIR",
      imageStorageConfig.publicBaseUrl ? null : "IMAGE_STORAGE_PUBLIC_BASE_URL"
    ].filter(Boolean);
  }

  return ["IMAGE_STORAGE_PROVIDER"];
}

async function getTelegramRuntimeStatus() {
  const configured = Boolean(config.telegramToken);
  let running = false;
  try {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.CommandLine -like '*src/product-assistant-runner.js*' } | Select-Object -First 1 -ExpandProperty ProcessId"
    ], { timeout: 5000 });
    running = Boolean(stdout.trim());
  } catch {
    running = false;
  }

  return {
    configured,
    running,
    imageStorageProvider: config.imageStorage.provider,
    imageStorageConfigured: Boolean(imageStorage.configured),
    salesBoxWriteEnabled: Boolean(config.salesBox.writeEnabled),
    shopExpressChannelEnabled: Boolean(config.shopExpress.enabled),
    shopExpressWriteEnabled: Boolean(config.shopExpress.writeEnabled)
  };
}

function applyDraftPatch(draft, patch) {
  const updated = {
    ...draft,
    updatedAt: new Date().toISOString()
  };

  for (const field of [
    "nameUk",
    "nameEn",
    "productTypeUk",
    "productTypeEn",
    "descriptionUk",
    "descriptionEn",
    "category",
    "availability",
    "stockMode"
  ]) {
    if (patch[field] !== undefined) {
      updated[field] = normalizeOptionalString(patch[field]);
    }
  }

  if (patch.price !== undefined) {
    const price = Number(patch.price);
    updated.price = Number.isFinite(price) ? price : null;
  }

  if (patch.photoUrl !== undefined) {
    const photoUrl = normalizePublicImageUrl(patch.photoUrl);
    if (photoUrl) {
      setDraftPhoto(updated, { photoUrl, previewUrl: photoUrl });
    } else {
      updated.photoUrl = null;
      updated.previewUrl = null;
      updated.photos = [];
    }
  }

  updated.seo = {
    ...(updated.seo ?? {}),
    ...(patch.seo ?? {})
  };
  updated.qualityIssues = validateProductDraft(updated);
  return updated;
}

async function createRevisedDraft(sourceDraft, body) {
  const instruction = String(body.revisionInstruction ?? "").trim() || "Перепиши картку краще, преміально і природно.";
  const sourceText = buildRevisionSourceText(sourceDraft);
  const revised = await createProductDraft({
    text: sourceText,
    sourceCategory: sourceDraft.category,
    revisionInstruction: instruction,
    sourceDraftId: sourceDraft.id,
    openAiClient: contentClient
  });

  if (!revised.photoUrl && sourceDraft.photoUrl) {
    setDraftPhoto(revised, {
      photoUrl: sourceDraft.photoUrl,
      previewUrl: sourceDraft.previewUrl ?? sourceDraft.photoUrl
    });
  }

  revised.price = sourceDraft.price ?? revised.price;
  revised.currency = sourceDraft.currency ?? revised.currency;
  revised.qualityIssues = validateProductDraft(revised);
  return revised;
}

function buildRevisionSourceText(draft) {
  return [
    draft.price,
    draft.productTypeUk,
    draft.visibleSummaryUk,
    draft.sourceText,
    draft.photoUrl
  ].filter(Boolean).join(" ");
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = normalize(decodeURIComponent(requestedPath))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = join(staticDir, normalized);

  if (!filePath.startsWith(staticDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function contentTypeFor(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
