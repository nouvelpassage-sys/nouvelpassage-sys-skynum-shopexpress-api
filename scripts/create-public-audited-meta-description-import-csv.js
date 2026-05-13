import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/create-public-audited-meta-description-import-csv.js <export.csv>");
  process.exit(1);
}

const rows = parseCsv(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
const header = rows[0] || [];
const dataRows = rows.slice(1).filter((row) => row.length > 1);

const col = {
  id: header.indexOf("ID"),
  name: header.indexOf("Name"),
  nameDescription: header.indexOf("NameDescription"),
  categories: header.indexOf("Categories"),
  alias: header.indexOf("Alias")
};

for (const [key, index] of Object.entries(col)) {
  if (index === -1) {
    throw new Error(`Missing required column: ${key}`);
  }
}

const aliasOverrides = new Map([
  ["10542812", "buket-tender-whisper"],
  ["10685914", "buket-lamour-sombre"],
  ["10929776", "jardin-rose"],
  ["10939420", "rose-poesie"],
  ["17605920", "kalateya-fyuzhn"]
]);

const products = new Map();

for (const row of dataRows) {
  const id = value(row[col.id]);
  if (!id) continue;

  const alias = aliasOverrides.get(id) || value(row[col.alias]);
  if (!alias) continue;

  products.set(normalizeAlias(alias), {
    id,
    alias,
    name: cleanText(value(row[col.name])),
    nameDescription: cleanText(value(row[col.nameDescription])),
    categories: cleanText(value(row[col.categories]))
  });
}

const sitemapUrls = await fetchSitemapUrls("https://www.nouvelamour.kiev.ua/productcatalogsitemap.xml");
const audited = await auditPublicProducts(sitemapUrls, products);

const outputRows = [["ID", "MetaDescription"]];
const report = {
  sourceRows: dataRows.length,
  sitemapUrls: sitemapUrls.length,
  matchedUrls: audited.length,
  updatedRows: 0,
  skippedGoodRows: 0,
  skippedUnmatchedUrls: sitemapUrls.length - audited.length,
  generatedByCategory: {},
  updatedExamples: [],
  unmatchedSamples: []
};

for (const item of audited) {
  if (isGoodMetaDescription(item.publicMetaDescription)) {
    report.skippedGoodRows += 1;
    continue;
  }

  const category = classifyProduct(item.product);
  const metaDescription = generateMetaDescription(item.product, category);

  outputRows.push([item.product.id, metaDescription]);
  report.updatedRows += 1;
  report.generatedByCategory[category] = (report.generatedByCategory[category] || 0) + 1;

  if (report.updatedExamples.length < 50) {
    report.updatedExamples.push({
      id: item.product.id,
      url: item.url,
      name: item.product.name,
      categories: item.product.categories,
      oldLength: item.publicMetaDescription.length,
      category,
      metaDescription,
      newLength: metaDescription.length
    });
  }
}

for (const url of sitemapUrls) {
  const alias = aliasFromUrl(url);
  if (!products.has(alias) && report.unmatchedSamples.length < 20) {
    report.unmatchedSamples.push(url);
  }
}

const parsed = parseOutputPath(inputPath);
const outputPath = join(parsed.dir, `${parsed.name}-SAFE-public-audited-meta-description-uk-only${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-SAFE-public-audited-meta-description-uk-only-report.json`);

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, report }, null, 2));

async function fetchSitemapUrls(url) {
  const xml = await fetchText(`${url}?audit=${Date.now()}`);
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
    .map((match) => match[1])
    .filter((loc) => loc.includes("/shop/"));
}

async function auditPublicProducts(urls, productByAlias) {
  const results = [];
  let cursor = 0;

  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;

      const alias = aliasFromUrl(url);
      const product = productByAlias.get(alias);
      if (!product) continue;

      try {
        const html = await fetchText(`${url}?metaaudit=${Date.now()}`);
        const publicMetaDescription = cleanText(
          match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
            match(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
        );

        results.push({ url, product, publicMetaDescription });
      } catch (error) {
        results.push({ url, product, publicMetaDescription: "", error: error.message });
      }
    }
  }

  await Promise.all(Array.from({ length: 8 }, worker));
  return results;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "cache-control": "no-cache" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function aliasFromUrl(url) {
  const pathname = new URL(url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  return normalizeAlias(parts.at(-1) || "");
}

function normalizeAlias(alias) {
  return decodeURIComponent(String(alias)).trim();
}

function match(text, regex) {
  const found = text.match(regex);
  return found ? found[1] : "";
}

function isGoodMetaDescription(text) {
  const length = cleanText(text).length;
  return length >= 70 && length <= 190;
}

function classifyProduct(product) {
  const nameText = normalize(`${product.name} ${product.nameDescription}`);
  const categoryText = normalize(product.categories);
  const text = `${nameText} ${categoryText}`;

  if (hasAny(text, ["арома", "дифуз", "свіч", "лампа", "raffaello", "цукер", "листівка", "вазон", "ваза", "кулька", "аудіолистівка"])) {
    return "gift";
  }

  if (
    hasAny(nameText, ["іграш", "ведмед", "зайчик", "панда", "котик", "stitch", "bunny"]) ||
    (categoryText.includes("іграш") && !hasAny(nameText, ["кімнатн", "рослин", "антуріум", "фікус", "кактус", "калатея", "драцена"]))
  ) {
    return "toy";
  }

  if (hasAny(text, ["кімнатн", "рослин", "антуріум", "фікус", "кактус", "калатея", "драцена"])) {
    return "plant";
  }

  if (hasAny(text, ["короб", "композиці", "кошик", "box", "panier"])) {
    return "composition";
  }

  return "bouquet";
}

function generateMetaDescription(product, category) {
  const name = tidyProductName(product.name);

  if (category === "plant") {
    return fitMeta(`${name} - кімнатна рослина для дому, офісу або подарунку. Замовляйте онлайн у Nouvel Amour Flowers з доставкою по Києву; кількість залежить від наявності.`);
  }

  if (category === "toy") {
    return fitMeta(`${name} - м'яка іграшка для подарунку, декору композиції або приємного сюрпризу. Доставка по Києву разом із квітами Nouvel Amour Flowers.`);
  }

  if (category === "gift") {
    return fitMeta(`${name} - стильний подарунок або доповнення до квітів. Замовляйте в Nouvel Amour Flowers з доставкою по Києву для особливого настрою.`);
  }

  if (category === "composition") {
    return fitMeta(`${name} - квіткова композиція від Nouvel Amour Flowers. Замовляйте преміальні квіти з доставкою по Києву для свята, побачення чи подарунку.`);
  }

  return fitMeta(`${name} - авторський букет від Nouvel Amour Flowers. Замовляйте свіжі квіти з доставкою по Києву для подарунку, побачення, свята або особливого моменту.`);
}

function fitMeta(text) {
  const cleaned = cleanText(text);
  if (cleaned.length <= 185) return cleaned;

  const shortened = cleaned
    .replace("Nouvel Amour Flowers", "Nouvel Amour")
    .replace("для подарунку, побачення, свята або особливого моменту", "для подарунку чи свята")
    .replace("для свята, побачення чи подарунку", "для свята чи подарунку")
    .replace("разом із квітами Nouvel Amour", "разом із квітами");

  if (shortened.length <= 185) return shortened;
  return `${shortened.slice(0, 182).trimEnd()}...`;
}

function tidyProductName(name) {
  return cleanText(name)
    .replace(/\s+кімнатна рослина$/i, "")
    .replace(/\s+-\s+$/i, "")
    .trim();
}

function cleanText(input) {
  return stripHtml(input)
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&laquo;", "«")
    .replaceAll("&raquo;", "»")
    .replaceAll("&#171;", "«")
    .replaceAll("&#187;", "»")
    .replaceAll("&#233;", "é")
    .replaceAll("&#201;", "É")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(input) {
  return String(input ?? "")
    .replace(/\{\{Default\}\}/g, "")
    .replace(/<[^>]*>/g, " ");
}

function normalize(input) {
  return cleanText(input).toLowerCase().replaceAll("ʼ", "'").trim();
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function parseCsv(text, delimiter = ";") {
  const parsedRows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      parsedRows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    parsedRows.push(row);
  }

  return parsedRows;
}

function toCsv(csvRows, delimiter = ";") {
  return csvRows.map((row) => row.map(escapeCsv).join(delimiter)).join("\r\n") + "\r\n";
}

function escapeCsv(field) {
  const text = String(field ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function value(input) {
  return String(input ?? "").trim();
}

function parseOutputPath(filePath) {
  const ext = extname(filePath);
  return {
    dir: dirname(filePath),
    ext,
    name: basename(filePath, ext)
  };
}
