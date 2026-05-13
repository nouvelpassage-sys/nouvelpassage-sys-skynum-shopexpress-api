import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/create-safe-availability-import-csv.js <export.csv>");
  process.exit(1);
}

const rows = parseCsv(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
const header = rows[0] || [];
const dataRows = rows.slice(1).filter((row) => row.length > 1);

const col = {
  id: header.indexOf("ID"),
  name: header.indexOf("Name"),
  categories: header.indexOf("Categories")
};

for (const [key, index] of Object.entries(col)) {
  if (index === -1) {
    throw new Error(`Missing required column: ${key}`);
  }
}

const outputRows = [["ID", "InStock", "IsAvailable"]];
const report = {
  sourceRows: dataRows.length,
  updatedRows: 0,
  skippedIndoorPlants: 0,
  skippedRows: 0,
  updatedExamples: []
};

for (const row of dataRows) {
  const product = {
    id: value(row[col.id]),
    name: value(row[col.name]),
    categories: value(row[col.categories])
  };

  if (!product.id) continue;

  if (isIndoorPlant(product)) {
    report.skippedIndoorPlants += 1;
    continue;
  }

  if (!isAlwaysAvailable(product)) {
    report.skippedRows += 1;
    continue;
  }

  outputRows.push([product.id, "999", "Available"]);
  report.updatedRows += 1;

  if (report.updatedExamples.length < 30) {
    report.updatedExamples.push(product);
  }
}

const parsed = parseOutputPath(inputPath);
const outputPath = join(parsed.dir, `${parsed.name}-SAFE-availability-only${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-SAFE-availability-only-report.json`);

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, report }, null, 2));

function isIndoorPlant(product) {
  const text = normalize(`${product.name} ${product.categories}`);
  return [
    "кімнатні рослини",
    "антуріум",
    "шефлера",
    "цикас",
    "хойя",
    "хедера",
    "циперус",
    "шлюмбергера",
    "тіландсія",
    "орхідея",
    "фікус",
    "рослина"
  ].some((needle) => text.includes(needle));
}

function isAlwaysAvailable(product) {
  const text = normalize(`${product.name} ${product.categories}`);
  return [
    "каталог букетів",
    "каталог квітів в коробках",
    "каталог квітів у коробках",
    "букет",
    "композиці",
    "коробк",
    "арома",
    "дифуз",
    "свічк",
    "іграш",
    "stitch",
    "сті",
    "кульк"
  ].some((needle) => text.includes(needle));
}

function normalize(input) {
  return String(input ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replaceAll("ґ", "г")
    .trim();
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
