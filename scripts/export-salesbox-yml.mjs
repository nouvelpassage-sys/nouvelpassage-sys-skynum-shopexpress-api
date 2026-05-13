import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DraftStore } from "../src/productAssistant/draftStore.js";
import { readBotConfig } from "../src/productAssistant/env.js";
import { buildSalesBoxYmlFeed, getSalesBoxYmlExportReport } from "../src/productAssistant/salesBoxYmlFeed.js";

const config = readBotConfig();
const store = new DraftStore(config.dataDir);
const drafts = await store.list({ limit: 1000 });
const report = getSalesBoxYmlExportReport(drafts);
const yml = buildSalesBoxYmlFeed(drafts);

const outputDir = config.dataDir;
await mkdir(outputDir, { recursive: true });

const ymlPath = join(outputDir, "nouvel-amour-salesbox-feed.yml");
const reportPath = join(outputDir, "nouvel-amour-salesbox-feed-report.json");

await writeFile(ymlPath, yml, "utf8");
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      stats: report.stats,
      ready: report.ready.map(({ draft, ...item }) => item),
      skipped: report.skipped
    },
    null,
    2
  )}\n`,
  "utf8"
);

console.log(`SalesBox YML written: ${ymlPath}`);
console.log(`Export report written: ${reportPath}`);
console.log(`Ready: ${report.stats.exportable}, skipped: ${report.stats.skipped}, total: ${report.stats.total}`);
