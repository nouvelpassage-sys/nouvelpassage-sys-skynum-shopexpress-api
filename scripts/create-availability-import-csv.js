import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/create-availability-import-csv.js <export.csv>");
  process.exit(1);
}

const rows = parseCsv(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
const sourceRows = rows.slice(1).filter((row) => row.length > 1);
const outputRows = [["ID", "Name", "Categories", "InStock", "IsAvailable"]];
const report = {
  sourceRows: sourceRows.length,
  alwaysAvailableRows: 0,
  skippedIndoorPlants: 0,
  skippedOtherRows: 0,
  examples: []
};

for (const row of sourceRows) {
  const product = {
    id: value(row[0]),
    name: value(row[2]),
    categories: value(row[8]),
    stock: value(row[19]),
    availability: value(row[22])
  };

  if (isIndoorPlant(product)) {
    report.skippedIndoorPlants += 1;
    continue;
  }

  if (!isAlwaysAvailable(product)) {
    report.skippedOtherRows += 1;
    continue;
  }

  outputRows.push([product.id, product.name, product.categories, "999", "Available"]);
  report.alwaysAvailableRows += 1;

  if (report.examples.length < 20) {
    report.examples.push(product);
  }
}

const parsed = parseOutputPath(inputPath);
const outputPath = join(parsed.dir, `${parsed.name}-availability-always-in-stock${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-availability-always-in-stock-report.json`);

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, report }, null, 2));

function isIndoorPlant(product) {
  const haystack = `${product.name} ${product.categories}`.toLowerCase();
  return [
    "кімнатні рослини",
    "антуріум",
    "шефлера",
    "цикас",
    "хойя",
    "хедера",
    "циперус",
    "шлюмбергера",
    "тиландсія",
    "орхіде",
    "орхїде",
    "фікус",
    "рослина"
  ].some((needle) => haystack.includes(needle));
}

function isAlwaysAvailable(product) {
  const haystack = `${product.name} ${product.categories}`.toLowerCase();
  return [
    "каталог букетів",
    "каталог квітів в коробках",
    "букет",
    "композиці",
    "коробка",
    "stich",
    "stitch",
    "кульк",
    "іграш",
    "арома",
    "дифуз",
    "свічк",
    "лампа",
    "листівк",
    "декор та подарунки"
  ].some((needle) => haystack.includes(needle));
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
