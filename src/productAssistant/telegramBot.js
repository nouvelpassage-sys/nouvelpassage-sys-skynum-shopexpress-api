import { createProductDraft, parseProductMessage } from "./contentGenerator.js";
import { formatQualityIssues, validateProductDraft } from "./productDraftQuality.js";
import { buildSalesBoxYmlFeed, getSalesBoxYmlExportReport } from "./salesBoxYmlFeed.js";

export class ProductAssistantBot {
  constructor({
    telegram,
    store,
    contentClient,
    imageStorage,
    salesBox,
    shopExpress,
    shopExpressImportQueueLinkPublisher,
    allowedChatIds,
    autoPublishReady = false
  }) {
    this.telegram = telegram;
    this.store = store;
    this.contentClient = contentClient;
    this.imageStorage = imageStorage;
    this.salesBox = salesBox;
    this.shopExpress = shopExpress;
    this.shopExpressImportQueueLinkPublisher = shopExpressImportQueueLinkPublisher;
    this.allowedChatIds = new Set(allowedChatIds);
    this.autoPublishReady = autoPublishReady;
    this.offset = undefined;
    this.lastDraftByChat = new Map();
    this.recentPhotoMessages = new Map();
    this.recentMediaGroups = new Map();
    this.mediaGroupBuffers = new Map();
    this.mediaGroupTimers = new Map();
    this.runningActions = new Set();
  }

  async start() {
    console.log("Product assistant bot is running");
    for (;;) {
      const updates = await this.telegram.getUpdates(this.offset).catch(async (error) => {
        console.error(error);
        const retryDelayMs = isTelegramPollingConflict(error) ? 15000 : 3000;
        await delay(retryDelayMs);
        return [];
      });
      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handleUpdate(update).catch((error) => {
          console.error(error);
        });
      }
    }
  }

  async handleUpdate(update) {
    console.log("telegram update", JSON.stringify(summarizeUpdate(update)));
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  async handleMessage(message) {
    const chatId = String(message.chat.id);
    console.log(
      "telegram message",
      JSON.stringify({
        chatId,
        fromId: message.from?.id,
        text: message.text,
        hasCaption: Boolean(message.caption),
        photoCount: message.photo?.length ?? 0,
        isAllowed: this.isAllowed(chatId)
      })
    );
    if (!this.isAllowed(chatId)) {
      await this.telegram.sendMessage(chatId, "Цей бот закритий для приватної роботи Nouvel Amour.");
      return;
    }

    const text = message.caption || message.text || "";
    const command = normalizeCommandText(message.text);
    if (command === "/start") {
      await this.telegram.sendMessage(chatId, getStartMessage());
      return;
    }

    if (command === "/help") {
      await this.telegram.sendMessage(chatId, getHelpMessage());
      return;
    }

    if (command === "/start") {
      await this.telegram.sendMessage(
        chatId,
        "Надішли фото товару з ціною в підписі, наприклад: <b>280 автопарфум Lost Cherry</b>."
      );
      return;
    }

    if (command === "/help") {
      await this.telegram.sendMessage(
        chatId,
        [
          "<b>Як створити картку</b>",
          "1. Надішли фото товару.",
          "2. У підписі напиши ціну і коротку підказку: <b>280 автопарфум Lost Cherry</b>.",
          "3. Я підготую назву, опис, SEO, категорію, артикул і чернетку.",
          "",
          "<b>Редагування останньої картки</b>",
          "/redo - перестворити все заново",
          "/rewrite - переписати опис",
          "/premium - зробити преміальніше",
          "/shorter - скоротити",
          "/fix - виправити слабкі місця"
        ].join("\n")
      );
      return;
    }

    if (command === "/status") {
      const storageStatus = this.imageStorage?.configured
        ? "Сховище фото увімкнене: Telegram фото підуть у Cloudinary/сховище та дадуть public URL."
        : "Сховище фото не налаштоване: для SalesBox потрібен public URL.";
      const shopExpressStatus = renderShopExpressStatus(this.shopExpress);
      await this.telegram.sendMessage(
        chatId,
        [
          this.salesBox.canWrite()
            ? "SalesBox запис увімкнений. Бот може створювати товари після підтвердження."
            : "Працюю у безпечному режимі: створюю локальні чернетки, запис у SalesBox вимкнений.",
          shopExpressStatus,
          storageStatus
        ].join("\n")
      );
      return;
    }

    const shopExpressImportMode = getShopExpressImportModeFromText(message.text);
    if (shopExpressImportMode) {
      if (shopExpressImportMode === "clear") {
        await this.handleShopExpressImportQueueClearCommand(chatId);
      } else if (shopExpressImportMode === "status") {
        await this.handleShopExpressImportQueueStatusCommand(chatId);
      } else {
        await this.handleShopExpressImportLinkCommand(chatId);
      }
      return;
    }

    const revisionMode = getRevisionModeFromText(message.text);
    if (revisionMode) {
      await this.handleRevisionCommand(chatId, revisionMode);
      return;
    }

    if (getPublishModeFromText(message.text)) {
      await this.handlePublishCommand(chatId);
      return;
    }

    const exportMode = getExportModeFromText(message.text);
    if (exportMode) {
      await this.handleExportCommand(chatId, exportMode);
      return;
    }

    if (command?.startsWith("/")) {
      await this.telegram.sendMessage(chatId, "Команду не впізнав. Для інструкції натисни /help.");
      return;
    }

    const photoFileId = getLargestPhotoFileId(message.photo);
    if (!photoFileId) {
      await this.telegram.sendMessage(chatId, getPhotoFirstInstruction());
      return;
    }

    if (message.media_group_id) {
      this.queueMediaGroupMessage(message);
      return;
    }

    const captionIssue = getCaptionIssue(text);
    if (captionIssue) {
      await this.telegram.sendMessage(chatId, captionIssue);
      return;
    }

    if (this.isRecentDuplicatePhotoMessage(chatId, photoFileId, text)) {
      await this.telegram.sendMessage(chatId, "Це фото з таким самим підписом я вже обробляю або щойно обробив. Щоб створити нову версію, натисни кнопку редагування під карткою.");
      return;
    }

    const draft = await this.createDraftFromMessage({ chatId, text, photoFileId, photoFileIds: [photoFileId] });
    const filePath = await this.store.save(draft);

    await this.sendDraft(chatId, draft, filePath);
    await this.maybeAutoPublishReadyDraft(chatId, draft.id, draft);
  }

  async createDraftFromMessage({ chatId, text, photoFileId, photoFileIds = [] }) {
    let imageDataUrls = [];
    let imageFiles = [];

    if (photoFileIds.length && this.contentClient && this.telegram.getFileDataUrl) {
      await this.telegram.sendMessage(chatId, "Розпізнаю фото й готую опис українською та англійською...");
      try {
        imageFiles = await Promise.all(photoFileIds.map((fileId) => this.telegram.getFileImage
          ? this.telegram.getFileImage(fileId)
          : this.telegram.getFileDataUrl(fileId).then((dataUrl) => ({ dataUrl }))));
        imageDataUrls = imageFiles.map((imageFile) => imageFile.dataUrl).filter(Boolean);
      } catch (error) {
        console.error(error);
        await this.telegram.sendMessage(chatId, "Фото отримав, але не зміг завантажити його для GPT. Створю чернетку з тексту.");
      }
    }

    const existingDrafts = this.store.list
      ? await this.store.list({ limit: 1000 })
      : [];
    const usedNames = existingDrafts.flatMap((item) => [item.nameUk, item.nameEn]).filter(Boolean);
    let draft;
    try {
      draft = await createProductDraft({
        text,
        photoFileId,
        photoFileIds,
        imageDataUrls,
        imageDataUrl: imageDataUrls[0] ?? null,
        openAiClient: this.contentClient,
        usedNames
      });
    } catch (error) {
      console.error(error);
      if (this.contentClient) {
        await this.telegram.sendMessage(chatId, getAiFailureMessage(error));
        draft = await createProductDraft({
          text,
          photoFileId,
          photoFileIds,
          openAiClient: null,
          usedNames
        });
      } else {
        throw error;
      }
    }

    return this.attachStoredImages({ chatId, draft, imageFiles });
  }

  async attachStoredImages({ chatId, draft, imageFiles = [] }) {
    if (!imageFiles.length || !this.imageStorage?.configured) {
      return draft;
    }

    try {
      const storedImages = (await Promise.all(imageFiles.map((imageFile, index) => this.imageStorage.storeProductImage({
        draftId: imageFiles.length === 1 ? draft.id : `${draft.id}-${index + 1}`,
        bytes: imageFile.bytes,
        contentType: imageFile.contentType,
        sourceFilePath: imageFile.sourceFilePath
      })))).filter((storedImage) => storedImage?.url);
      if (!storedImages.length) return draft;
      const photos = storedImages.map((storedImage, index) => ({
        url: storedImage.url,
        previewURL: storedImage.previewUrl,
        contentType: storedImage.contentType,
        order: index
      }));
      return {
        ...draft,
        photoUrl: photos[0].url,
        previewUrl: photos[0].previewURL,
        photos
      };
    } catch (error) {
      console.error(error);
      await this.telegram.sendMessage(chatId, "Photo storage failed. I created the draft, but SalesBox dry-run will show that the public image URL is missing.");
      return draft;
    }
  }

  async attachStoredImage({ chatId, draft, imageFile }) {
    return this.attachStoredImages({ chatId, draft, imageFiles: imageFile ? [imageFile] : [] });
  }

  async sendDraft(chatId, draft, filePath) {
    this.lastDraftByChat.set(chatId, draft.id);
    await this.telegram.sendMessage(chatId, renderDraft(draft, filePath), {
      reply_markup: buildDraftKeyboard(draft)
    });
  }

  async handleRevisionCommand(chatId, mode) {
    const draftId = this.lastDraftByChat.get(chatId);
    if (!draftId) {
      await this.telegram.sendMessage(chatId, "Ще немає останньої картки для редагування. Надішли фото з ціною, а потім можна писати /redo, /rewrite, /premium або /shorter.");
      return;
    }

    await this.regenerateDraft(chatId, draftId, mode);
  }

  async handlePublishCommand(chatId) {
    const draftId = this.lastDraftByChat.get(chatId);
    if (!draftId) {
      await this.telegram.sendMessage(chatId, "Ще немає останньої картки для публікації. Спочатку надішли фото з ціною.");
      return;
    }

    await this.publishDraft(chatId, draftId);
  }

  async maybeAutoPublishReadyDraft(chatId, draftId, draft) {
    if (!this.autoPublishReady) {
      return;
    }

    if (!this.salesBox.canWrite()) {
      await this.telegram.sendMessage(
        chatId,
        "Автопублікація готових карток увімкнена, але SalesBox live-запис ще вимкнений. Картка залишилась чернеткою."
      );
      return;
    }

    const qualityIssues = Array.isArray(draft.qualityIssues) ? draft.qualityIssues : validateProductDraft(draft);
    if (qualityIssues.length) {
      await this.telegram.sendMessage(chatId, "Картку створено, але я не публікую її автоматично, бо є QA-зауваження.");
      return;
    }

    await this.telegram.sendMessage(chatId, "Картка пройшла QA. Автоматично відправляю в SalesBox і ShopExpress...");
    await this.publishDraft(chatId, draftId);
  }

  async handleExportCommand(chatId, mode) {
    const drafts = await this.store.list({ limit: 1000 });
    const report = getSalesBoxYmlExportReport(drafts);
    const summary = renderExportSummary(report);

    if (mode === "status") {
      await this.telegram.sendMessage(chatId, summary);
      return;
    }

    if (!report.ready.length) {
      await this.telegram.sendMessage(chatId, `${summary}\n\nПоки немає жодної готової картки для SalesBox YML.`);
      return;
    }

    const yml = buildSalesBoxYmlFeed(drafts);
    if (this.telegram.sendDocument) {
      await this.telegram.sendMessage(chatId, summary);
      await this.telegram.sendDocument(chatId, Buffer.from(yml, "utf8"), {
        filename: "nouvel-amour-salesbox-feed.yml",
        contentType: "application/xml",
        caption: "SalesBox YML готовий. Якщо live API ще вимкнений, цей файл можна імпортувати в SalesBox."
      });
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      `${summary}\n\nФайл сформовано, але цей Telegram-клієнт ще не вміє надсилати документи. Відкрий дашборд і натисни Download YML.`
    );
  }

  async handleShopExpressImportLinkCommand(chatId) {
    if (!this.shopExpressImportQueueLinkPublisher) {
      await this.telegram.sendMessage(chatId, "Публічне посилання для ShopExpress ще не налаштоване в цьому запуску бота.");
      return;
    }

    await this.telegram.sendMessage(chatId, "Готую публічне посилання на CSV-чергу ShopExpress...");

    try {
      const result = await this.shopExpressImportQueueLinkPublisher.publishQueueFile();
      if (!result.enabled) {
        await this.telegram.sendMessage(chatId, "Функція посилання на імпорт зараз вимкнена.");
        return;
      }

      if (result.empty) {
        await this.telegram.sendMessage(chatId, "Черга ShopExpress поки порожня. Спочатку опублікуй хоча б одну картку з фото.");
        return;
      }

      if (!result.queued || !result.importUrl) {
        await this.telegram.sendMessage(
          chatId,
          [
            "Не вдалося підготувати посилання для імпорту.",
            result.reason ? `Причина: <code>${escapeHtml(result.reason)}</code>` : null
          ]
            .filter(Boolean)
            .join("\n")
        );
        return;
      }

      await this.telegram.sendMessage(
        chatId,
        [
          "<b>ShopExpress CSV готовий</b>",
          `Рядків у черзі: <b>${result.rowCount}</b>`,
          `<a href="${escapeHtml(result.importUrl)}">Відкрити CSV-посилання</a>`,
          "",
          "Далі в ShopExpress: Імпорт товарів -> Вказати посилання на файл -> встав URL -> Далі."
        ].join("\n")
      );
    } catch (error) {
      console.error(error);
      await this.telegram.sendMessage(
        chatId,
        [
          "Не вийшло завантажити CSV у Cloudinary.",
          "Перевір Cloudinary налаштування і спробуй ще раз командою /shopimport.",
          `<code>${escapeHtml(String(error?.message ?? error))}</code>`
        ].join("\n")
      );
    }
  }

  async handleShopExpressImportQueueClearCommand(chatId) {
    if (!this.shopExpressImportQueueLinkPublisher) {
      await this.telegram.sendMessage(chatId, "Очищення черги ShopExpress ще не налаштоване в цьому запуску бота.");
      return;
    }

    try {
      const result = await this.shopExpressImportQueueLinkPublisher.clearQueueFile();
      if (!result.cleared) {
        await this.telegram.sendMessage(chatId, "Не вдалося очистити чергу ShopExpress.");
        return;
      }
      await this.telegram.sendMessage(
        chatId,
        [
          "<b>Чергу ShopExpress очищено</b>",
          "Тепер нові товари підуть у чистий CSV без дублів із попереднього імпорту."
        ].join("\n")
      );
    } catch (error) {
      console.error(error);
      await this.telegram.sendMessage(
        chatId,
        [
          "Помилка під час очищення черги ShopExpress.",
          `<code>${escapeHtml(String(error?.message ?? error))}</code>`
        ].join("\n")
      );
    }
  }

  async handleShopExpressImportQueueStatusCommand(chatId) {
    if (!this.shopExpressImportQueueLinkPublisher) {
      await this.telegram.sendMessage(chatId, "Статус черги ShopExpress ще не налаштований у цьому запуску бота.");
      return;
    }

    try {
      const status = await this.shopExpressImportQueueLinkPublisher.getQueueStatus();
      await this.telegram.sendMessage(
        chatId,
        [
          "<b>ShopExpress Queue Status</b>",
          `Файл: <code>${escapeHtml(status.importFilePath ?? "data/product-assistant/shopexpress-pending-import.csv")}</code>`,
          `Рядків у черзі: <b>${status.rowCount ?? 0}</b>`,
          status.bytes != null ? `Розмір: <b>${status.bytes}</b> bytes` : null
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (error) {
      console.error(error);
      await this.telegram.sendMessage(
        chatId,
        [
          "Помилка під час перевірки черги ShopExpress.",
          `<code>${escapeHtml(String(error?.message ?? error))}</code>`
        ].join("\n")
      );
    }
  }

  async regenerateDraft(chatId, draftId, mode) {
    const previousDraft = await this.store.get(draftId);
    await this.telegram.sendMessage(chatId, getRevisionProgressMessage(mode));

    let imageDataUrls = [];
    let imageFiles = [];
    const previousPhotoFileIds = previousDraft.photoFileIds?.length
      ? previousDraft.photoFileIds
      : (previousDraft.photoFileId ? [previousDraft.photoFileId] : []);
    if (previousPhotoFileIds.length && this.contentClient && this.telegram.getFileDataUrl) {
      try {
        imageFiles = await Promise.all(previousPhotoFileIds.map((fileId) => this.telegram.getFileImage
          ? this.telegram.getFileImage(fileId)
          : this.telegram.getFileDataUrl(fileId).then((dataUrl) => ({ dataUrl }))));
        imageDataUrls = imageFiles.map((imageFile) => imageFile.dataUrl).filter(Boolean);
      } catch (error) {
        console.error(error);
        await this.telegram.sendMessage(chatId, "Фото не зміг повторно завантажити, тому редагую картку за текстом і попередньою підказкою.");
      }
    }

    const revisionInstruction = getRevisionInstruction(mode);
    const sourceCategory = shouldPreserveCategoryOnRevision(mode) ? previousDraft.category : undefined;
    let draft;
    try {
      draft = await createProductDraft({
        text: previousDraft.sourceText,
        photoFileId: previousPhotoFileIds[0],
        photoFileIds: previousPhotoFileIds,
        imageDataUrls,
        imageDataUrl: imageDataUrls[0] ?? null,
        openAiClient: this.contentClient,
        sourceCategory,
        revisionInstruction,
        sourceDraftId: previousDraft.id
      });
    } catch (error) {
      console.error(error);
      await this.telegram.sendMessage(chatId, getAiFailureMessage(error));
      draft = await createProductDraft({
        text: previousDraft.sourceText,
        photoFileId: previousPhotoFileIds[0],
        photoFileIds: previousPhotoFileIds,
        openAiClient: null,
        sourceCategory,
        revisionInstruction,
        sourceDraftId: previousDraft.id
      });
    }
    draft = await this.attachStoredImages({ chatId, draft, imageFiles });
    draft = preservePublicImageFromPreviousDraft(draft, previousDraft);
    const filePath = await this.store.save(draft);
    await this.sendDraft(chatId, draft, filePath);
  }

  async handleCallback(callbackQuery) {
    const chatId = String(callbackQuery.message.chat.id);
    const [action, draftId] = String(callbackQuery.data ?? "").split(":");
    const actionKey = `${action}:${draftId}`;

    if (!this.isAllowed(chatId)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Немає доступу");
      return;
    }

    if (this.runningActions.has(actionKey)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Вже виконую цю дію");
      return;
    }

    const callbackRevisionMode = getRevisionModeFromCallbackAction(action);
    if (callbackRevisionMode) {
      await this.withRunningAction(actionKey, async () => {
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Готую нову версію");
        try {
          await this.regenerateDraft(chatId, draftId, callbackRevisionMode);
        } catch (error) {
          if (isMissingDraftError(error)) {
            await this.sendMissingDraftMessage(chatId);
            return;
          }
          throw error;
        }
      });
      return;
    }

    if (action === "keep") {
      try {
        await this.store.update(draftId, { status: "kept" });
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Залишено як чернетку");
      } catch (error) {
        if (!isMissingDraftError(error)) {
          throw error;
        }
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Картка вже недоступна");
        await this.sendMissingDraftMessage(chatId);
      }
      return;
    }

    if (action === "publish") {
      let publishResult;
      try {
        publishResult = await this.withRunningAction(actionKey, () => this.publishDraft(chatId, draftId));
      } catch (error) {
        if (!isMissingDraftError(error)) {
          throw error;
        }
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Картка вже недоступна");
        await this.sendMissingDraftMessage(chatId);
        return;
      }
      await this.telegram.answerCallbackQuery(callbackQuery.id, getPublishCallbackMessage(publishResult));
    }
  }

  async sendMissingDraftMessage(chatId) {
    await this.telegram.sendMessage(
      chatId,
      "Ця картка була створена до перезапуску сервера і вже недоступна. Надішліть фото з ціною ще раз, я створю нову картку і її можна буде опублікувати."
    );
  }

  async publishDraft(chatId, draftId) {
    const draft = await this.store.get(draftId);
    if (draft.status === "published" && draft.salesBoxResult?.dryRun === false) {
      const shouldSyncShopExpress =
        this.shopExpress?.enabled && shouldRetryShopExpressPublish(draft.shopExpressResult);
      if (shouldSyncShopExpress) {
        const shopExpressResult = await this.shopExpress.publishDraft(draft);
        const result = {
          dryRun: false,
          salesBoxResult: draft.salesBoxResult,
          shopExpressResult
        };
        await this.store.update(draftId, { shopExpressResult });
        await this.telegram.sendMessage(chatId, renderPublicationResult(result));
        return result;
      }

      const result = {
        dryRun: false,
        alreadyPublished: true,
        salesBoxResult: draft.salesBoxResult,
        shopExpressResult: draft.shopExpressResult
      };
      await this.telegram.sendMessage(chatId, renderPublicationResult(result));
      return result;
    }

    const qualityIssues = Array.isArray(draft.qualityIssues) ? draft.qualityIssues : validateProductDraft(draft);
    if (qualityIssues.length) {
      await this.store.update(draftId, { status: "blocked", qualityIssues });
      await this.telegram.sendMessage(chatId, renderQualityBlock(qualityIssues));
      return {
        blocked: true,
        dryRun: true,
        endpoint: "quality-check",
        missingRequiredFields: qualityIssues
      };
    }

    const salesBoxResult = await this.salesBox.createOfferFromDraft(draft);
    const shopExpressResult = this.shopExpress
      ? await this.shopExpress.publishDraft(draft)
      : {
          enabled: false,
          dryRun: true,
          queued: false,
          reason: "ShopExpress channel is not configured."
        };
    const result = {
      dryRun: salesBoxResult.dryRun,
      salesBoxResult,
      shopExpressResult
    };
    await this.store.update(draftId, {
      status: salesBoxResult.dryRun ? "dry-run" : "published",
      salesBoxResult,
      shopExpressResult
    });
    await this.telegram.sendMessage(chatId, renderPublicationResult(result));
    return result;
  }

  isAllowed(chatId) {
    return this.allowedChatIds.size === 0 || this.allowedChatIds.has(chatId);
  }

  shouldIgnoreMediaGroupPhoto(message) {
    if (!message.media_group_id) {
      return false;
    }

    const key = `${message.chat.id}:${message.media_group_id}`;
    const now = Date.now();
    pruneRecentMap(this.recentMediaGroups, now, 10 * 60 * 1000);

    if (message.caption) {
      this.recentMediaGroups.set(key, now);
      return false;
    }

    return this.recentMediaGroups.has(key);
  }

  queueMediaGroupMessage(message) {
    const key = `${message.chat.id}:${message.media_group_id}`;
    const current = this.mediaGroupBuffers.get(key) ?? [];
    current.push(message);
    this.mediaGroupBuffers.set(key, current);
    if (this.mediaGroupTimers.has(key)) {
      clearTimeout(this.mediaGroupTimers.get(key));
    }
    this.mediaGroupTimers.set(key, setTimeout(() => {
      this.mediaGroupTimers.delete(key);
      const messages = this.mediaGroupBuffers.get(key) ?? [];
      this.mediaGroupBuffers.delete(key);
      void this.processMediaGroup(messages).catch((error) => console.error(error));
    }, 900));
  }

  async processMediaGroup(messages) {
    if (!messages.length) return;
    const chatId = String(messages[0].chat.id);
    const photoFileIds = [...new Set(messages
      .sort((left, right) => (left.message_id ?? 0) - (right.message_id ?? 0))
      .map((message) => getLargestPhotoFileId(message.photo))
      .filter(Boolean))];
    const text = messages.map((message) => message.caption || message.text || "").find(Boolean) ?? "";
    const captionIssue = getCaptionIssue(text);
    if (captionIssue) {
      await this.telegram.sendMessage(chatId, captionIssue);
      return;
    }
    if (this.isRecentDuplicatePhotoMessage(chatId, photoFileIds.join(","), text)) {
      await this.telegram.sendMessage(chatId, "Цей альбом із таким самим підписом уже обробляється або щойно оброблений.");
      return;
    }
    const draft = await this.createDraftFromMessage({
      chatId,
      text,
      photoFileId: photoFileIds[0],
      photoFileIds
    });
    const filePath = await this.store.save(draft);
    await this.sendDraft(chatId, draft, filePath);
    await this.maybeAutoPublishReadyDraft(chatId, draft.id, draft);
  }

  isRecentDuplicatePhotoMessage(chatId, photoFileId, text) {
    const now = Date.now();
    pruneRecentMap(this.recentPhotoMessages, now, 3 * 60 * 1000);
    const key = `${chatId}:${photoFileId}:${String(text ?? "").trim().toLowerCase()}`;
    if (this.recentPhotoMessages.has(key)) {
      return true;
    }

    this.recentPhotoMessages.set(key, now);
    return false;
  }

  async withRunningAction(actionKey, action) {
    this.runningActions.add(actionKey);
    try {
      return await action();
    } finally {
      this.runningActions.delete(actionKey);
    }
  }
}

function isTelegramPollingConflict(error) {
  return /Bot API getUpdates failed: 409|terminated by other getUpdates request/i.test(String(error?.message ?? error));
}

function isMissingDraftError(error) {
  return error?.code === "ENOENT" && String(error?.path ?? "").includes("drafts");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeUpdate(update) {
  const message = update.message ?? update.callback_query?.message;
  return {
    updateId: update.update_id,
    hasMessage: Boolean(update.message),
    hasCallback: Boolean(update.callback_query),
    chatId: message?.chat?.id,
    text: update.message?.text,
    hasCaption: Boolean(update.message?.caption),
    photoCount: update.message?.photo?.length ?? 0,
    mediaGroupId: update.message?.media_group_id,
    callbackData: update.callback_query?.data
  };
}

function pruneRecentMap(map, now, maxAgeMs) {
  for (const [key, timestamp] of map) {
    if (now - timestamp > maxAgeMs) {
      map.delete(key);
    }
  }
}

function getPublishCallbackMessage(publishResult) {
  if (publishResult.blocked) {
    return "Картка не пройшла QA";
  }
  if (publishResult.alreadyPublished) {
    return "Ця картка вже створена";
  }
  if (publishResult.dryRun) {
    return "Поки dry-run: запис у SalesBox вимкнено";
  }
  const shopExpress = publishResult.shopExpressResult;
  if (!shopExpress?.enabled) {
    return "Створено в SalesBox";
  }
  if (shopExpress.missingRequiredFields?.length) {
    return "SalesBox створено, ShopExpress очікує дані";
  }
  if (shopExpress.queued) {
    return "SalesBox створено, ShopExpress додано в чергу";
  }
  if (shopExpress.dryRun) {
    return "SalesBox створено, ShopExpress dry-run";
  }
  return "Створено в SalesBox і ShopExpress";
}

function renderShopExpressStatus(shopExpress) {
  if (!shopExpress || !shopExpress.enabled) {
    return "ShopExpress канал вимкнений.";
  }

  if (shopExpress.canWrite()) {
    return "ShopExpress live API увімкнено: товари будуть оновлюватися на сайті одразу.";
  }

  return [
    "ShopExpress live API ще не увімкнено: зараз працюємо через чергу імпорту.",
    `Черга: <code>${escapeHtml(shopExpress.importFilePath ?? "data/product-assistant/shopexpress-pending-import.csv")}</code>`
  ].join("\n");
}

function shouldRetryShopExpressPublish(previousResult) {
  if (!previousResult) {
    return true;
  }

  if (!previousResult.enabled) {
    return true;
  }

  if (previousResult.missingRequiredFields?.length) {
    return true;
  }

  if (previousResult.dryRun && !previousResult.queued) {
    return true;
  }

  return false;
}

const REVISION_ACTIONS = new Map([
  ["regen", "redo"],
  ["desc", "rewrite"],
  ["prem", "premium"],
  ["short", "shorter"],
  ["fix", "fix"]
]);

const REVISION_INSTRUCTIONS = {
  redo:
    "Recreate the entire product card from the same photo and seller hint. Produce a fresh better creative name, clearer product type, stronger boutique description, and SEO. Keep the real category, price, and visible product facts.",
  rewrite:
    "Rewrite the product copy. Keep the real product, price, category, and product type, but make the Ukrainian and English descriptions more specific, premium, warm, and commercially useful. Remove dry technical catalog wording.",
  premium:
    "Make the whole product card feel more premium and boutique with a light French-inspired tone. Stay concrete and restrained; avoid cheap luxury words, vague poetry, and invented facts.",
  shorter:
    "Make the description shorter and sharper: 1-2 polished sentences. Keep the name, category, product type, and factual image evidence clear.",
  fix:
    "Fix weak parts of the product card: wrong or vague category, unclear product type, boring name, dry description, SEO issues, and generic wording. Keep factual evidence and allowed category rules."
};

export function getRevisionInstruction(mode) {
  return REVISION_INSTRUCTIONS[mode] ?? REVISION_INSTRUCTIONS.fix;
}

export function getRevisionModeFromCallbackAction(action) {
  return REVISION_ACTIONS.get(action) ?? null;
}

export function getRevisionModeFromText(text) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return null;
  }

  if (/^\/(redo|recreate|again|new|restart|заново|перествори|перегенеруй)$/.test(normalized)) {
    return "redo";
  }
  if (/^\/(rewrite|description|desc|опис|перепиши)$/.test(normalized)) {
    return "rewrite";
  }
  if (/^\/(premium|premiumize|преміум|преміальніше)$/.test(normalized)) {
    return "premium";
  }
  if (/^\/(short|shorter|коротше|скороти)$/.test(normalized)) {
    return "shorter";
  }
  if (/^\/(fix|виправ)$/.test(normalized)) {
    return "fix";
  }

  if (/перествор|перегенер|заново|нову верс|спочатку/.test(normalized)) {
    return "redo";
  }
  if (/коротш|скороти|стисл/.test(normalized)) {
    return "shorter";
  }
  if (/преміальн|премиальн|дорожч|бутик|француз/.test(normalized)) {
    return "premium";
  }
  if (/перепиш|опис|текст/.test(normalized)) {
    return "rewrite";
  }
  if (/виправ|поправ|погано|не подоба|чорт|слабк|позор|жесть/.test(normalized)) {
    return "fix";
  }

  return null;
}

export function getPublishModeFromText(text) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return false;
  }

  if (/^\/(publish|post|salesbox|create|опублікуй|публікуй|створи|запиши)$/.test(normalized)) {
    return true;
  }

  return /(опублікуй|публікуй|створи.*salesbox|створити.*salesbox|відправ.*salesbox|залий.*salesbox|запиши.*salesbox)/i.test(
    normalized
  );
}

export function getExportModeFromText(text) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return null;
  }

  if (/^\/(ready|status|статус|готові|готово)$/.test(normalized)) {
    return "status";
  }
  if (/^\/(export|feed|yml|xml|salesbox-yml|експорт|файл)$/.test(normalized)) {
    return "file";
  }
  if (/(salesbox.*yml|yml.*salesbox|скинь.*файл|дай.*файл|експорт.*salesbox|файл.*salesbox)/i.test(normalized)) {
    return "file";
  }

  return null;
}

export function getShopExpressImportModeFromText(text) {
  const normalized = normalizeCommandText(text);
  if (!normalized) {
    return null;
  }

  if (/^\/(shopimport|shoplink|queue|черга|імпорт-shop|shop-express-import)$/.test(normalized)) {
    return "link";
  }
  if (/^\/(shopstatus|queuestatus|статус-черги|черга-статус)$/.test(normalized)) {
    return "status";
  }
  if (/^\/(shopdone|shopclear|clearqueue|очистити-чергу|очисти-чергу)$/.test(normalized)) {
    return "clear";
  }

  if (/(shop.?express.*(очист|прибери).*черг)/i.test(normalized)) {
    return "clear";
  }
  if (/(shop.?express.*(статус|скільки).*черг)/i.test(normalized)) {
    return "status";
  }
  if (/(shop.?express.*(черг|імпорт|посилан)|дай.*shop.*посилан|csv.*shop)/i.test(normalized)) {
    return "link";
  }

  return null;
}

function normalizeCommandText(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/([a-z0-9_а-яіїєґ-]+)@[a-z0-9_]+/iu, "/$1");
}

function renderExportSummary(report) {
  const skippedPreview = report.skipped
    .slice(0, 5)
    .map((item) => `- ${item.nameUk || item.id || "Без назви"}: ${item.reasons.join(", ")}`);

  return [
    "<b>SalesBox export</b>",
    `Готові: <b>${report.stats.exportable}</b>`,
    `Пропущено: <b>${report.stats.skipped}</b>`,
    `Всього чернеток: <b>${report.stats.total}</b>`,
    skippedPreview.length ? "" : null,
    skippedPreview.length ? "<b>Що заважає першим пропущеним:</b>" : null,
    ...skippedPreview
  ]
    .filter(Boolean)
    .join("\n");
}

function getCaptionIssue(text) {
  const parsed = parseProductMessage(text);
  if (!parsed.price && !parsed.titleSeed) {
    return "Додай у підписі до фото ціну і коротку підказку. Наприклад: 2500 букет у ніжній гамі.";
  }
  if (!parsed.price) {
    return "Бачу фото, але не бачу ціну. Надішли фото ще раз з підписом: ціна + коротка підказка.";
  }
  if (!parsed.titleSeed) {
    return "Бачу фото і ціну, але потрібна коротка підказка: букет, композиція в коробці, рослина, аромат, іграшка тощо.";
  }
  return null;
}

function getStartMessage() {
  return [
    "<b>Nouvel Amour Product Assistant</b>",
    "",
    "Надішли фото товару з підписом:",
    "<code>2500 букет у ніжній гамі</code>",
    "<code>1900 спатифілум у кашпо, 2 шт</code>",
    "",
    "Я створю картку, перевірю якість і підготую її до SalesBox та ShopExpress."
  ].join("\n");
}

function getHelpMessage() {
  return [
    "<b>Щоденний сценарій</b>",
    "1. Зроби фото товару.",
    "2. У підписі напиши ціну і коротку підказку.",
    "3. Бот створить картку і покаже кнопки дій.",
    "4. Після публікації картка піде в SalesBox і паралельно в ShopExpress (live або в чергу імпорту).",
    "",
    "<b>Команди</b>",
    "/rewrite - переписати опис",
    "/premium - зробити преміальніше",
    "/shorter - скоротити",
    "/fix - виправити слабкі місця",
    "/redo - створити заново",
    "/ready - стан готових карток",
    "/export - надіслати SalesBox YML файл",
    "/shopimport - дати публічне посилання на CSV-чергу ShopExpress",
    "/shopstatus - показати, скільки товарів зараз у черзі ShopExpress",
    "/shopdone - очистити CSV-чергу після успішного імпорту в ShopExpress"
  ].join("\n");
}

function getPhotoFirstInstruction() {
  return "Для нової картки надішли саме фото товару з підписом: ціна + коротка підказка. Наприклад: 2500 букет у ніжній гамі.";
}

function getRevisionProgressMessage(mode) {
  const messages = {
    redo: "Перестворюю картку заново з тієї ж підказки й фото.",
    rewrite: "Переписую опис так, щоб він звучав як преміальна картка, а не технічний список.",
    premium: "Піднімаю тон: більше бутикового Nouvel Amour, але без порожньої розкоші.",
    shorter: "Скорочую й загострюю опис.",
    fix: "Перевіряю слабкі місця й роблю охайнішу версію."
  };

  return messages[mode] ?? messages.fix;
}

export function shouldPreserveCategoryOnRevision(mode) {
  return mode === "rewrite" || mode === "shorter";
}

function buildDraftKeyboard(draft) {
  return {
    inline_keyboard: [
      [
        { text: "Опублікувати (SalesBox + ShopExpress)", callback_data: `publish:${draft.id}` },
        { text: "Лише чернетка", callback_data: `keep:${draft.id}` }
      ],
      [
        { text: "Перестворити", callback_data: `regen:${draft.id}` },
        { text: "Переписати опис", callback_data: `desc:${draft.id}` }
      ],
      [
        { text: "Преміальніше", callback_data: `prem:${draft.id}` },
        { text: "Коротше", callback_data: `short:${draft.id}` },
        { text: "Виправити", callback_data: `fix:${draft.id}` }
      ]
    ]
  };
}

function getAiFailureMessage(error) {
  if (String(error?.message ?? "").includes("insufficient_quota")) {
    return "OpenAI ключ підключений, але зараз на акаунті немає доступної API-квоти/кредитів. Щоб не зупиняти роботу, створю базову чернетку без розпізнавання фото.";
  }

  return "GPT зараз не відповів. Щоб не зупиняти роботу, створю базову чернетку без розпізнавання фото.";
}

export function preservePublicImageFromPreviousDraft(draft, previousDraft) {
  if (draft.photoUrl || !previousDraft?.photoUrl) {
    return draft;
  }

  return {
    ...draft,
    photoUrl: previousDraft.photoUrl,
    previewUrl: previousDraft.previewUrl ?? previousDraft.photoUrl,
    photos: previousDraft.photos?.length
      ? previousDraft.photos
      : [
          {
            url: previousDraft.photoUrl,
            previewURL: previousDraft.previewUrl ?? previousDraft.photoUrl
          }
        ]
  };
}

function getLargestPhotoFileId(photos = []) {
  if (!photos.length) {
    return null;
  }

  return photos.reduce((best, photo) => {
    const bestSize = (best?.width ?? 0) * (best?.height ?? 0);
    const currentSize = (photo.width ?? 0) * (photo.height ?? 0);
    return currentSize > bestSize ? photo : best;
  }, photos[0]).file_id;
}

function renderDraft(draft) {
  const qualityIssues = draft.qualityIssues ?? [];
  const ready = !qualityIssues.length && draft.photoUrl;
  const lines = [
    ready ? "<b>Картка готова до SalesBox</b>" : "<b>Картка потребує перевірки</b>",
    "",
    `<b>Назва:</b> ${escapeHtml(draft.nameUk)}`,
    `<b>Ціна:</b> ${draft.price ? `${draft.price} грн` : "потрібно уточнити"}`,
    `<b>Категорія:</b> ${escapeHtml(draft.category)}`,
    `<b>Тип:</b> ${escapeHtml(draft.productTypeUk)}`,
    `<b>Фото:</b> ${draft.photoUrl ? "готово" : "немає public URL"}`,
    "",
    `<b>Опис:</b> ${escapeHtml(draft.descriptionUk)}`
  ];

  if (qualityIssues.length) {
    lines.push("", "<b>Що треба виправити:</b>", escapeHtml(formatQualityIssues(qualityIssues)));
  } else if (ready) {
    lines.push("", "Можна натиснути <b>Створити в SalesBox</b> або написати <code>опублікуй</code>.");
  } else {
    lines.push("", "Картка збережена, але для SalesBox потрібне публічне фото.");
  }

  return lines.join("\n");
}

function renderDryRun(result) {
  const missing = result.missingRequiredFields?.length
    ? ["", "<b>Missing for live SalesBox write:</b>", `<code>${escapeHtml(result.missingRequiredFields.join(", "))}</code>`]
    : [];

  return [
    "<b>SalesBox dry-run</b>",
    "Картка готова, але автоматичний запис вимкнено або ще немає повних API-даних.",
    "",
    `<b>Endpoint:</b> <code>${escapeHtml(result.endpoint)}</code>`,
    ...missing
  ].join("\n");
}

function renderPublicationResult(result) {
  const salesBox = result.salesBoxResult ?? result;
  const shopExpress = result.shopExpressResult;
  const lines = [];

  if (salesBox.dryRun) {
    lines.push(renderDryRun(salesBox));
  } else {
    lines.push("<b>SalesBox</b>: товар створено.");
  }

  if (!salesBox.dryRun && salesBox.seoResult?.updated) {
    lines.push("<b>SalesBox SEO</b>: title, description, keywords і slug записано.");
  } else if (!salesBox.dryRun && salesBox.seoResult?.error) {
    lines.push(
      [
        "<b>SalesBox SEO</b>: треба перевірити вручну.",
        `<code>${escapeHtml(salesBox.seoResult.error)}</code>`
      ].join("\n")
    );
  }

  if (!shopExpress) {
    return lines.join("\n\n");
  }

  if (!shopExpress.enabled) {
    lines.push("<b>ShopExpress</b>: канал ще не увімкнений.");
  } else if (shopExpress.missingRequiredFields?.length) {
    lines.push(
      [
        "<b>ShopExpress</b>: не додано в чергу.",
        "Не вистачає полів:",
        `<code>${escapeHtml(shopExpress.missingRequiredFields.join(", "))}</code>`
      ].join("\n")
    );
  } else if (shopExpress.queued) {
    lines.push(
      [
        "<b>ShopExpress</b>: додано в чергу імпорту.",
        `<code>${escapeHtml(shopExpress.importFilePath)}</code>`,
        shopExpress.duplicate ? "Ця картка вже була в черзі." : "Готово для перевірки й імпорту в ShopExpress."
      ].join("\n")
    );
  } else if (shopExpress.dryRun) {
    lines.push("<b>ShopExpress</b>: dry-run.");
  } else {
    lines.push("<b>ShopExpress</b>: товар створено.");
  }

  return lines.join("\n\n");
}

function renderQualityBlock(issues) {
  return [
    "<b>Публікацію зупинено</b>",
    "Картка не проходить редакційний контроль, тому я не відправляю її в SalesBox.",
    "",
    escapeHtml(formatQualityIssues(issues)),
    "",
    "Натисни <b>Виправити</b> або напиши /fix, щоб перестворити картку без старої помилки."
  ].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

