import { readBotConfig } from "../src/productAssistant/env.js";
import { createShopExpressImportQueueLinkPublisher } from "../src/productAssistant/shopExpressImportQueueLink.js";

const config = readBotConfig();
const publisher = createShopExpressImportQueueLinkPublisher(config.shopExpress);
const result = await publisher.publishQueueFile();

console.log(JSON.stringify(result, null, 2));

