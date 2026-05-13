import test from "node:test";
import assert from "node:assert/strict";
import { SALESBOX_CATEGORY_IDS } from "../src/productAssistant/salesBoxClient.js";
import {
  getExportModeFromText,
  getRevisionInstruction,
  getRevisionModeFromCallbackAction,
  getRevisionModeFromText,
  getPublishModeFromText,
  getShopExpressImportModeFromText,
  preservePublicImageFromPreviousDraft,
  ProductAssistantBot,
  shouldPreserveCategoryOnRevision
} from "../src/productAssistant/telegramBot.js";

const bouquetCategory = Object.keys(SALESBOX_CATEGORY_IDS).at(-3);

test("maps Telegram callback actions to revision modes", () => {
  assert.equal(getRevisionModeFromCallbackAction("regen"), "redo");
  assert.equal(getRevisionModeFromCallbackAction("desc"), "rewrite");
  assert.equal(getRevisionModeFromCallbackAction("prem"), "premium");
  assert.equal(getRevisionModeFromCallbackAction("short"), "shorter");
  assert.equal(getRevisionModeFromCallbackAction("fix"), "fix");
  assert.equal(getRevisionModeFromCallbackAction("publish"), null);
});

test("recognizes product assistant revision commands", () => {
  assert.equal(getRevisionModeFromText("/redo"), "redo");
  assert.equal(getRevisionModeFromText("/rewrite"), "rewrite");
  assert.equal(getRevisionModeFromText("/premium"), "premium");
  assert.equal(getRevisionModeFromText("/shorter"), "shorter");
  assert.equal(getRevisionModeFromText("/fix"), "fix");
});

test("recognizes Telegram publish commands", () => {
  assert.equal(getPublishModeFromText("/publish"), true);
  assert.equal(getPublishModeFromText("/salesbox"), true);
  assert.equal(getPublishModeFromText("опублікуй"), true);
  assert.equal(getPublishModeFromText("створи в SalesBox"), true);
  assert.equal(getPublishModeFromText("перепиши опис"), false);
});

test("recognizes Telegram export commands", () => {
  assert.equal(getExportModeFromText("/ready"), "status");
  assert.equal(getExportModeFromText("/export"), "file");
  assert.equal(getExportModeFromText("/yml"), "file");
  assert.equal(getExportModeFromText("скинь файл SalesBox"), "file");
  assert.equal(getExportModeFromText("перепиши опис"), null);
});

test("recognizes natural Ukrainian revision requests", () => {
  assert.equal(getRevisionModeFromText("перепиши все заново"), "redo");
  assert.equal(getRevisionModeFromText("зроби опис преміальніше"), "premium");
  assert.equal(getRevisionModeFromText("скороти текст"), "shorter");
  assert.equal(getRevisionModeFromText("виправ, опис поганий"), "rewrite");
});

test("Telegram bot can publish the latest draft from a text command", async () => {
  const sentMessages = [];
  const updates = [];
  const draft = {
    id: "draft-ready",
    sourceText: "Р±СѓРєРµС‚ РїС–РІРѕРЅС–Р№ 1899 РіСЂРЅ",
    nameUk: "Maison Calme",
    nameEn: "Maison Calme",
    productTypeUk: "Р±СѓРєРµС‚ РїС–РІРѕРЅС–Р№",
    visibleSummaryUk: "Р±СѓРєРµС‚ РїС–РІРѕРЅС–Р№ Сѓ Рј'СЏРєС–Р№ РїР°Р»С–С‚СЂС–",
    category: "Р‘СѓРєРµС‚Рё",
    descriptionUk:
      "Р‘СѓРєРµС‚ Maison Calme РІРёРіР»СЏРґР°С” Р·С–Р±СЂР°РЅРѕ Р№ РґРѕСЂРѕРіРѕ Р·Р°РІРґСЏРєРё Р·Р°РіР°Р»СЊРЅРѕРјСѓ РЅР°СЃС‚СЂРѕСЋ, С„РѕСЂРјС– С‚Р° Рј'СЏРєС–Р№ РїРѕРґР°С‡С–. РўР°РєР° РїРѕР·РёС†С–СЏ РґРѕСЂРµС‡РЅР° РґР»СЏ РїСЂРёРІС–С‚Р°РЅРЅСЏ, РїРѕР±Р°С‡РµРЅРЅСЏ Р°Р±Рѕ РѕСЃРѕР±РёСЃС‚РѕРіРѕ РєРѕРјРїР»С–РјРµРЅС‚Сѓ Р±РµР· С‚РµС…РЅС–С‡РЅРѕРіРѕ РїРµСЂРµР»С–РєСѓ СЃРєР»Р°РґСѓ.",
    seo: {
      descriptionUk: "Р‘СѓРєРµС‚ Maison Calme РІС–Рґ Nouvel Amour.",
      slug: "maison-calme"
    },
    qualityIssues: []
  };
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      get: async (draftId) => {
        assert.equal(draftId, draft.id);
        return draft;
      },
      update: async (draftId, patch) => updates.push({ draftId, patch })
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: {
      canWrite: () => false,
      createOfferFromDraft: async (publishedDraft) => {
        assert.equal(publishedDraft.id, draft.id);
        return {
          dryRun: true,
          endpoint: "/api/v1/offers",
          missingRequiredFields: []
        };
      }
    }
  });
  bot.lastDraftByChat.set("1", draft.id);

  await bot.handleMessage({
    chat: { id: "1" },
    text: "створи в SalesBox"
  });

  assert.equal(updates[0].draftId, draft.id);
  assert.equal(updates[0].patch.status, "dry-run");
  assert.match(sentMessages.at(-1).text, /SalesBox dry-run/);
});

test("Telegram bot requires a photo for new product drafts", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      save: async () => {
        throw new Error("Text-only messages must not create drafts.");
      }
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: { canWrite: () => false }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "2500 букет у ніжній гамі"
  });

  assert.match(sentMessages.at(-1).text, /фото/iu);
});

test("Telegram bot status reports ShopExpress queue mode", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    imageStorage: { configured: true },
    salesBox: { canWrite: () => true },
    shopExpress: {
      enabled: true,
      canWrite: () => false,
      importFilePath: "data/product-assistant/shopexpress-pending-import.csv"
    }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "/status"
  });

  assert.match(sentMessages.at(-1).text, /ShopExpress live API ще не увімкнено/);
  assert.match(sentMessages.at(-1).text, /shopexpress-pending-import\.csv/);
});

test("Telegram bot requires price and hint in the photo caption", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      save: async () => {
        throw new Error("Incomplete captions must not create drafts.");
      }
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: { canWrite: () => false }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    photo: [{ file_id: "photo-id", width: 100, height: 100 }],
    caption: "2500"
  });

  assert.match(sentMessages.at(-1).text, /підказка/iu);
});

test("Telegram bot sends a SalesBox YML file from an export command", async () => {
  const sentMessages = [];
  const sentDocuments = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text }),
      sendDocument: async (chatId, bytes, options) => sentDocuments.push({ chatId, bytes, options })
    },
    store: {
      list: async () => [
        {
          id: "draft-ready",
          sku: "NF-BQT-001",
          nameUk: "Maison Calme",
          nameEn: "Maison Calme",
          productTypeUk: "bouquet",
          category: bouquetCategory,
          price: 2500,
          currency: "UAH",
          stockMode: "unlimited",
          availability: "available",
          photoUrl: "https://res.cloudinary.com/demo/image/upload/bouquet.jpg",
          descriptionUk: "Boutique description.",
          descriptionEn: "Boutique English description.",
          qualityIssues: []
        }
      ]
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: { canWrite: () => false }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "/export"
  });

  assert.match(sentMessages[0].text, /Готові: <b>1<\/b>/);
  assert.equal(sentDocuments.length, 1);
  assert.equal(sentDocuments[0].options.filename, "nouvel-amour-salesbox-feed.yml");
  assert.match(sentDocuments[0].bytes.toString("utf8"), /<yml_catalog/);
});

test("Telegram bot can auto-publish a clean draft when live writing is enabled", async () => {
  const sentMessages = [];
  const updates = [];
  const draft = {
    id: "draft-ready",
    nameUk: "Maison Calme",
    descriptionUk: "Boutique description.",
    category: bouquetCategory,
    price: 2500,
    photoUrl: "https://res.cloudinary.com/demo/image/upload/bouquet.jpg",
    qualityIssues: []
  };
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      get: async (draftId) => {
        assert.equal(draftId, draft.id);
        return draft;
      },
      update: async (draftId, patch) => updates.push({ draftId, patch })
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    autoPublishReady: true,
    salesBox: {
      canWrite: () => true,
      createOfferFromDraft: async (publishedDraft) => {
        assert.equal(publishedDraft.id, draft.id);
        return {
          dryRun: false,
          body: { id: "salesbox-offer-id" }
        };
      }
    }
  });

  await bot.maybeAutoPublishReadyDraft("1", draft.id, draft);

  assert.ok(sentMessages.some((message) => message.text.includes("Автоматично")));
  assert.equal(updates[0].patch.status, "published");
});

test("Telegram draft message is concise for mobile use", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text, options) => sentMessages.push({ chatId, text, options })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: { canWrite: () => false }
  });

  await bot.sendDraft(
    "1",
    {
      id: "draft-ready",
      nameUk: "Maison Calme",
      productTypeUk: "bouquet",
      category: bouquetCategory,
      price: 2500,
      photoUrl: "https://res.cloudinary.com/demo/image/upload/bouquet.jpg",
      descriptionUk: "Boutique description.",
      qualityIssues: []
    },
    "C:/internal/path/draft-ready.json"
  );

  assert.match(sentMessages[0].text, /Картка готова до SalesBox/);
  assert.doesNotMatch(sentMessages[0].text, /internal\/path|draft-ready\.json/);
  assert.ok(sentMessages[0].options.reply_markup.inline_keyboard.length >= 2);
});

test("provides concrete revision instructions for GPT", () => {
  assert.match(getRevisionInstruction("redo"), /Recreate the entire product card/);
  assert.match(getRevisionInstruction("rewrite"), /Rewrite the product copy/);
  assert.match(getRevisionInstruction("unknown"), /Fix weak parts/);
});

test("allows fix and redo to correct a previously wrong category", () => {
  assert.equal(shouldPreserveCategoryOnRevision("rewrite"), true);
  assert.equal(shouldPreserveCategoryOnRevision("shorter"), true);
  assert.equal(shouldPreserveCategoryOnRevision("redo"), false);
  assert.equal(shouldPreserveCategoryOnRevision("fix"), false);
  assert.equal(shouldPreserveCategoryOnRevision("premium"), false);
});

test("preserves Cloudinary public photo URL when regenerating a draft without a new stored image", () => {
  const draft = {
    id: "new-draft",
    photoUrl: null,
    previewUrl: null
  };
  const previousDraft = {
    photoUrl: "https://res.cloudinary.com/demo/image/upload/product.png",
    previewUrl: "https://res.cloudinary.com/demo/image/upload/product-preview.png"
  };

  const result = preservePublicImageFromPreviousDraft(draft, previousDraft);

  assert.equal(result.photoUrl, previousDraft.photoUrl);
  assert.equal(result.previewUrl, previousDraft.previewUrl);
  assert.equal(result.photos[0].previewURL, previousDraft.previewUrl);
});

test("Telegram bot stores attached photo through shared image storage", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    salesBox: { canWrite: () => false },
    imageStorage: {
      configured: true,
      storeProductImage: async ({ draftId, bytes, contentType }) => ({
        url: `https://res.cloudinary.com/demo/image/upload/${draftId}.jpg`,
        previewUrl: `https://res.cloudinary.com/demo/image/upload/${draftId}.jpg`,
        contentType,
        byteLength: bytes.length
      })
    }
  });

  const result = await bot.attachStoredImage({
    chatId: "1",
    draft: { id: "draft-cloudinary" },
    imageFile: {
      bytes: Buffer.from("image-bytes"),
      contentType: "image/jpeg",
      sourceFilePath: "telegram-photo.jpg"
    }
  });

  assert.equal(result.photoUrl, "https://res.cloudinary.com/demo/image/upload/draft-cloudinary.jpg");
  assert.equal(result.photos[0].previewURL, result.photoUrl);
  assert.deepEqual(sentMessages, []);
});

test("Telegram bot ignores duplicate photo messages with the same caption", async () => {
  const savedDrafts = [];
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text, options) => sentMessages.push({ chatId, text, options })
    },
    store: {
      save: async (draft) => {
        savedDrafts.push(draft);
        return "C:/internal/path/draft.json";
      }
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: { canWrite: () => false }
  });
  const message = {
    chat: { id: "1" },
    photo: [{ file_id: "same-photo-id", width: 100, height: 100 }],
    caption: "2500 bouquet in soft palette"
  };

  await bot.handleMessage(message);
  await bot.handleMessage(message);

  assert.equal(savedDrafts.length, 1);
  assert.ok(sentMessages.some((message) => message.text.includes("вже обробляю")));
});

test("Telegram bot does not publish an already published SalesBox draft twice", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      get: async () => ({
        id: "draft-published",
        status: "published",
        salesBoxResult: { dryRun: false, body: { id: "salesbox-offer-id" } },
        shopExpressResult: { enabled: true, queued: true, duplicate: true, importFilePath: "queue.csv" }
      }),
      update: async () => {
        throw new Error("Already published drafts must not be updated again.");
      }
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: {
      canWrite: () => true,
      createOfferFromDraft: async () => {
        throw new Error("Already published drafts must not call SalesBox again.");
      }
    }
  });

  const result = await bot.publishDraft("1", "draft-published");

  assert.equal(result.alreadyPublished, true);
  assert.match(sentMessages.at(-1).text, /SalesBox/);
});

test("Telegram bot can sync ShopExpress for an already published SalesBox draft", async () => {
  const sentMessages = [];
  const updates = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: {
      get: async () => ({
        id: "draft-published-salesbox-only",
        status: "published",
        nameUk: "Maison Calme",
        category: "Букети",
        price: 2500,
        photoUrl: "https://res.cloudinary.com/demo/image/upload/bouquet.jpg",
        salesBoxResult: { dryRun: false, body: { id: "salesbox-offer-id" } },
        shopExpressResult: { enabled: false, dryRun: true, queued: false }
      }),
      update: async (draftId, patch) => updates.push({ draftId, patch })
    },
    contentClient: null,
    allowedChatIds: [],
    imageStorage: null,
    salesBox: {
      canWrite: () => true,
      createOfferFromDraft: async () => {
        throw new Error("Already published drafts must not call SalesBox again.");
      }
    },
    shopExpress: {
      enabled: true,
      publishDraft: async () => ({
        enabled: true,
        dryRun: true,
        queued: true,
        duplicate: false,
        importFilePath: "data/product-assistant/shopexpress-pending-import.csv"
      })
    }
  });

  const result = await bot.publishDraft("1", "draft-published-salesbox-only");

  assert.equal(result.salesBoxResult.dryRun, false);
  assert.equal(result.shopExpressResult.queued, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].draftId, "draft-published-salesbox-only");
  assert.equal(updates[0].patch.shopExpressResult.queued, true);
  assert.match(sentMessages.at(-1).text, /ShopExpress/);
});

test("recognizes ShopExpress import link command aliases", () => {
  assert.equal(getShopExpressImportModeFromText("/shopimport"), "link");
  assert.equal(getShopExpressImportModeFromText("/shoplink"), "link");
  assert.equal(getShopExpressImportModeFromText("/shopstatus"), "status");
  assert.equal(getShopExpressImportModeFromText("/shopdone"), "clear");
  assert.equal(getShopExpressImportModeFromText("дай shop посилання"), "link");
  assert.equal(getShopExpressImportModeFromText("shop express статус черги"), "status");
  assert.equal(getShopExpressImportModeFromText("shop express очистити чергу"), "clear");
  assert.equal(getShopExpressImportModeFromText("/rewrite"), null);
});

test("Telegram bot can return a ShopExpress import URL from queue", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    imageStorage: { configured: true },
    salesBox: { canWrite: () => true },
    shopExpressImportQueueLinkPublisher: {
      publishQueueFile: async () => ({
        enabled: true,
        queued: true,
        rowCount: 4,
        importUrl: "https://example.test/shopexpress-pending-import.csv"
      })
    }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "/shopimport"
  });

  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[0].text, /Готую публічне посилання/);
  assert.match(sentMessages[1].text, /ShopExpress CSV готовий/);
  assert.match(sentMessages[1].text, /example\.test/);
});

test("Telegram bot can clear ShopExpress queue after import", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    imageStorage: { configured: true },
    salesBox: { canWrite: () => true },
    shopExpressImportQueueLinkPublisher: {
      clearQueueFile: async () => ({
        enabled: true,
        cleared: true
      })
    }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "/shopdone"
  });

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /чергу ShopExpress очищено/i);
});

test("Telegram bot can report ShopExpress queue status", async () => {
  const sentMessages = [];
  const bot = new ProductAssistantBot({
    telegram: {
      sendMessage: async (chatId, text) => sentMessages.push({ chatId, text })
    },
    store: null,
    contentClient: null,
    allowedChatIds: [],
    imageStorage: { configured: true },
    salesBox: { canWrite: () => true },
    shopExpressImportQueueLinkPublisher: {
      getQueueStatus: async () => ({
        enabled: true,
        importFilePath: "data/product-assistant/shopexpress-pending-import.csv",
        rowCount: 7,
        bytes: 2048
      })
    }
  });

  await bot.handleMessage({
    chat: { id: "1" },
    text: "/shopstatus"
  });

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text, /Queue Status/);
  assert.match(sentMessages[0].text, /7/);
});
