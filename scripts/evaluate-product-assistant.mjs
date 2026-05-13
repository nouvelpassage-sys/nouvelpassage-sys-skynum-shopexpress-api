import fs from "node:fs/promises";
import path from "node:path";
import { readBotConfig } from "../src/productAssistant/env.js";
import { createProductDraft, hasProductNameStopWords } from "../src/productAssistant/contentGenerator.js";
import { getAllowedCategories } from "../src/productAssistant/catalogRules.js";
import { needsImprovement } from "../src/productAssistant/copyQuality.js";
import { OpenAiContentClient } from "../src/productAssistant/openAiContentClient.js";

const DEFAULT_INPUT = "C:\\Users\\milan\\OneDrive\\Desktop\\salesbox-product-load\\salesbox-products-ready.csv";
const DEFAULT_OUTPUT_DIR = "data/product-assistant/evaluations";

function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toRecords(rows) {
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, ""));
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function pickSamples(records) {
  const samples = [];
  const seen = new Set();
  for (const category of getAllowedCategories()) {
    const record = records.find((item) =>
      item.salesbox_category === category &&
      item.primary_image_url &&
      item.active_price_uah &&
      !seen.has(item.source_id)
    );
    if (record) {
      samples.push(record);
      seen.add(record.source_id);
    }
  }
  return samples;
}

async function imageUrlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function evaluateDraft({ draft, expectedCategory }) {
  const issues = [];
  if (draft.category !== expectedCategory) {
    issues.push(`category mismatch: expected ${expectedCategory}, got ${draft.category}`);
  }
  if (!draft.nameUk || draft.nameUk.length < 5) {
    issues.push("creative name is missing or too short");
  }
  if (hasProductNameStopWords(draft.nameUk)) {
    issues.push("creative name contains product/species/color stop words");
  }
  if (!draft.productTypeUk) {
    issues.push("missing productTypeUk");
  }
  if (needsImprovement(draft.descriptionUk, draft.category)) {
    issues.push("description failed copy-quality gate");
  }
  if (/доставка|гаранті/i.test(draft.seo?.descriptionUk || "")) {
    issues.push("SEO description may invent delivery/guarantee claims");
  }
  if (!draft.seo?.slug || /[^a-z0-9-]/.test(draft.seo.slug)) {
    issues.push("SEO slug is missing or unsafe");
  }

  return issues;
}

async function main() {
  const input = process.argv[2] || DEFAULT_INPUT;
  const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
  const config = readBotConfig();
  if (!config.openAiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const records = toRecords(parseDelimited(await fs.readFile(input, "utf8")));
  const samples = pickSamples(records);
  const client = new OpenAiContentClient({ apiKey: config.openAiApiKey, model: config.openAiModel });
  const results = [];

  for (const sample of samples) {
    const imageDataUrl = await imageUrlToDataUrl(sample.primary_image_url);
    const draft = await createProductDraft({
      text: `${sample.name_uk} ${sample.active_price_uah} грн`,
      photoFileId: `eval:${sample.source_id}`,
      imageDataUrl,
      sourceCategory: sample.salesbox_category,
      openAiClient: client
    });
    const issues = evaluateDraft({ draft, expectedCategory: sample.salesbox_category });
    results.push({
      sourceId: sample.source_id,
      sourceName: sample.name_uk,
      expectedCategory: sample.salesbox_category,
      draft: {
        nameUk: draft.nameUk,
        productTypeUk: draft.productTypeUk,
        category: draft.category,
        descriptionUk: draft.descriptionUk,
        seoSlug: draft.seo.slug
      },
      issues
    });
    console.log(`${issues.length ? "FAIL" : "PASS"} ${sample.salesbox_category}: ${draft.nameUk}`);
  }

  const report = {
    createdAt: new Date().toISOString(),
    input,
    totals: {
      samples: results.length,
      passed: results.filter((item) => item.issues.length === 0).length,
      failed: results.filter((item) => item.issues.length > 0).length
    },
    results
  };

  await fs.mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `eval-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ reportPath, totals: report.totals }, null, 2));
}

await main();
