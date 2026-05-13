import { readBotConfig } from "./productAssistant/env.js";
import { DraftStore } from "./productAssistant/draftStore.js";
import { resolveImageContentType } from "./productAssistant/imageDataUrl.js";
import { createImageStorage } from "./productAssistant/imageStorage.js";
import { OpenAiContentClient } from "./productAssistant/openAiContentClient.js";
import { SalesBoxClient } from "./productAssistant/salesBoxClient.js";
import { createShopExpressImportQueueLinkPublisher } from "./productAssistant/shopExpressImportQueueLink.js";
import { createShopExpressPublisher } from "./productAssistant/shopExpressPublisher.js";
import { ProductAssistantBot } from "./productAssistant/telegramBot.js";
import { createServer } from "node:http";

class JsonApiClient {
  constructor({ apiBaseUrl, token }) {
    this.apiBaseUrl = new URL(apiBaseUrl);
    this.token = token;
    this.baseUrl = new URL(`/bot${token}/`, this.apiBaseUrl);
  }

  async getUpdates(offset) {
    return this.call("getUpdates", {
      timeout: 25,
      allowed_updates: ["message", "callback_query"],
      ...(offset ? { offset } : {})
    });
  }

  async sendMessage(chatId, text, options = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...options
    });
  }

  async sendDocument(chatId, bytes, { filename, contentType = "application/octet-stream", caption } = {}) {
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("document", new Blob([bytes], { type: contentType }), filename ?? "document.bin");
    if (caption) {
      form.set("caption", caption);
    }

    const response = await fetch(new URL("sendDocument", this.baseUrl), {
      method: "POST",
      body: form
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(`Bot API sendDocument failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return body.result;
  }

  async answerCallbackQuery(callbackQueryId, text) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text
    });
  }

  async getFileDataUrl(fileId) {
    const image = await this.getFileImage(fileId);
    return image.dataUrl;
  }

  async getFileImage(fileId) {
    const file = await this.call("getFile", { file_id: fileId });
    const response = await fetch(new URL(`/file/bot${this.token}/${file.file_path}`, this.apiBaseUrl));
    if (!response.ok) {
      throw new Error(`Bot API file download failed: ${response.status}`);
    }

    const contentType = resolveImageContentType({
      filePath: file.file_path,
      responseContentType: response.headers.get("content-type")
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      contentType,
      sourceFilePath: file.file_path,
      dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`
    };
  }

  async call(method, payload) {
    const response = await fetch(new URL(method, this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok || !body.ok) {
      throw new Error(`Bot API ${method} failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return body.result;
  }
}

const config = readBotConfig();

if (!config.telegramToken) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
}

startHealthServer();

const bot = new ProductAssistantBot({
  telegram: new JsonApiClient({
    apiBaseUrl: config.telegramApiBaseUrl,
    token: config.telegramToken
  }),
  store: new DraftStore(config.dataDir),
  contentClient: config.openAiApiKey
    ? new OpenAiContentClient({ apiKey: config.openAiApiKey, model: config.openAiModel })
    : null,
  imageStorage: createImageStorage(config.imageStorage),
  salesBox: new SalesBoxClient(config.salesBox),
  shopExpress: createShopExpressPublisher(config.shopExpress),
  shopExpressImportQueueLinkPublisher: createShopExpressImportQueueLinkPublisher(config.shopExpress),
  allowedChatIds: config.allowedChatIds,
  autoPublishReady: config.telegramAutoPublishReady
});

await bot.start();

function startHealthServer() {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }

  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "nouvel-product-assistant-bot" }));
      return;
    }

    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("OK");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health server is listening on 0.0.0.0:${port}`);
  });
}
