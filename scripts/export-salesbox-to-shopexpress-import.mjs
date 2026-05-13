import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readBotConfig } from "../src/productAssistant/env.js";
import { SalesBoxClient } from "../src/productAssistant/salesBoxClient.js";
import {
  buildShopExpressImportFromSalesBoxOffers,
  getShopExpressImportStats
} from "../src/productAssistant/salesBoxToShopExpressImport.js";

const outputPath = resolve(
  process.cwd(),
  process.argv.includes("--output")
    ? process.argv[process.argv.indexOf("--output") + 1]
    : "data/product-assistant/salesbox-to-shopexpress-import.csv"
);
const reportPath = outputPath.replace(/\.csv$/i, "-report.json");
const pageSize = readNumberArg("--page-size", 100);
const maxPages = readNumberArg("--max-pages", 20);

const config = readBotConfig();
const client = new SalesBoxClient({ ...config.salesBox, writeEnabled: false });
const offers = [];

for (let page = 1; page <= maxPages; page += 1) {
  const response = await client.getOffers({ lang: "uk", page, pageSize });
  const pageOffers = normalizeOffersResponse(response);
  offers.push(...pageOffers);
  if (pageOffers.length < pageSize) {
    break;
  }
}

const csv = buildShopExpressImportFromSalesBoxOffers(offers);
const stats = getShopExpressImportStats(offers);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, csv, "utf8");
await writeFile(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...stats }, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      reportPath,
      stats
    },
    null,
    2
  )
);

function normalizeOffersResponse(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (Array.isArray(response?.data)) {
    return response.data;
  }
  if (Array.isArray(response?.data?.items)) {
    return response.data.items;
  }
  return [];
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}
