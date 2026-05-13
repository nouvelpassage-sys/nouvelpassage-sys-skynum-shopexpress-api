import { readBotConfig } from "../src/productAssistant/env.js";
import { DraftStore } from "../src/productAssistant/draftStore.js";
import { SalesBoxClient } from "../src/productAssistant/salesBoxClient.js";

const config = readBotConfig();
const store = new DraftStore(config.dataDir);
const salesBox = new SalesBoxClient({
  ...config.salesBox,
  writeEnabled: true,
  seoRetryCount: 3,
  seoRetryDelayMs: 1000
});

if (!config.salesBox.apiToken) {
  throw new Error("SALESBOX_API_TOKEN is missing.");
}

const drafts = await store.list({ limit: 5000 });
const publishedDrafts = drafts.filter((draft) => draft.salesBoxResult?.dryRun === false && draft.seo);

let updated = 0;
let failed = 0;
for (const draft of publishedDrafts) {
  try {
    const result = await salesBox.updateSeoFieldsForDraft(draft);
    updated += 1;
    console.log(`updated ${draft.id} -> ${result.offerId}`);
  } catch (error) {
    failed += 1;
    console.error(`failed ${draft.id}: ${error.message}`);
  }
}

console.log(
  JSON.stringify(
    {
      totalPublishedDrafts: publishedDrafts.length,
      updated,
      failed
    },
    null,
    2
  )
);
