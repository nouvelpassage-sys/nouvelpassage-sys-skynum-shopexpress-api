import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/create-safe-meta-description-import-csv.js <export.csv>");
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
  metaDescription: header.indexOf("MetaDescription"),
  shortDescription: header.indexOf("ShortDescription")
};

for (const [key, index] of Object.entries(col)) {
  if (index === -1) {
    throw new Error(`Missing required column: ${key}`);
  }
}

const outputRows = [["ID", "MetaDescription"]];
const report = {
  sourceRows: dataRows.length,
  updatedRows: 0,
  skippedGoodRows: 0,
  skippedNoIdRows: 0,
  updatedExamples: [],
  generatedByCategory: {}
};

for (const row of dataRows) {
  const product = {
    id: value(row[col.id]),
    name: cleanText(value(row[col.name])),
    nameDescription: cleanText(value(row[col.nameDescription])),
    categories: cleanText(value(row[col.categories])),
    currentMetaDescription: cleanText(value(row[col.metaDescription])),
    shortDescription: cleanText(value(row[col.shortDescription]))
  };

  if (!product.id) {
    report.skippedNoIdRows += 1;
    continue;
  }

  if (isGoodMetaDescription(product.currentMetaDescription)) {
    report.skippedGoodRows += 1;
    continue;
  }

  const category = classifyProduct(product);
  const metaDescription = generateMetaDescription(product, category);

  outputRows.push([product.id, metaDescription]);
  report.updatedRows += 1;
  report.generatedByCategory[category] = (report.generatedByCategory[category] || 0) + 1;

  if (report.updatedExamples.length < 40) {
    report.updatedExamples.push({
      id: product.id,
      name: product.name,
      categories: product.categories,
      oldLength: product.currentMetaDescription.length,
      category,
      metaDescription,
      newLength: metaDescription.length
    });
  }
}

const parsed = parseOutputPath(inputPath);
const outputPath = join(parsed.dir, `${parsed.name}-SAFE-meta-description-uk-only${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-SAFE-meta-description-uk-only-report.json`);

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, report }, null, 2));

function isGoodMetaDescription(text) {
  const length = cleanText(text).length;
  return length >= 70 && length <= 190;
}

function classifyProduct(product) {
  const text = normalize(`${product.name} ${product.nameDescription} ${product.categories}`);

  if (hasAny(text, ["кімнатн", "рослин", "антуріум", "фікус", "кактус", "калатея", "драцена"])) {
    return "plant";
  }

  if (hasAny(text, ["іграш", "ведмед", "зайчик", "панда", "котик", "stitch", "bunny"])) {
    return "toy";
  }

  if (hasAny(text, ["арома", "дифуз", "свіч", "лампа", "raffaello", "цукер", "листівка"])) {
    return "gift";
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
