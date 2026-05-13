import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];
const matchBy = process.argv.includes("--sku") ? "Sku" : "ID";

if (!inputPath) {
  console.error("Usage: node scripts/create-safe-min-order-import-csv.js <export.csv> [--sku]");
  process.exit(1);
}

const rows = parseCsv(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
const header = rows[0] || [];
const dataRows = rows.slice(1).filter((row) => row.length > 1);
const matchIndex = header.indexOf(matchBy);
const nameIndex = header.indexOf("Name");

if (matchIndex === -1) {
  throw new Error(`Missing required column: ${matchBy}`);
}

const outputRows = [[matchBy === "Sku" ? "Артикул" : "ID", "Минимальный заказ", "Кратность"]];
const seen = new Set();
const report = {
  sourceRows: dataRows.length,
  matchBy,
  outputRows: 0,
  skippedRows: 0,
  duplicateRows: 0,
  examples: [],
  skipped: [],
  duplicates: []
};

for (const row of dataRows) {
  const matchValue = value(row[matchIndex]);
  const name = value(row[nameIndex]);

  if (!matchValue) {
    report.skippedRows += 1;
    if (report.skipped.length < 50) {
      report.skipped.push({ name, reason: `empty ${matchBy}` });
    }
    continue;
  }

  if (seen.has(matchValue)) {
    report.duplicateRows += 1;
    if (report.duplicates.length < 50) {
      report.duplicates.push({ [matchBy]: matchValue, name });
    }
    continue;
  }

  seen.add(matchValue);
  outputRows.push([matchValue, "1", "1"]);
  report.outputRows += 1;

  if (report.examples.length < 20) {
    report.examples.push({ [matchBy]: matchValue, name });
  }
}

const parsed = parseOutputPath(inputPath);
const suffix = matchBy === "Sku" ? "SAFE-min-order-step-1-by-sku" : "SAFE-min-order-step-1-by-id";
const outputPath = join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-${suffix}-report.json`);

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, report }, null, 2));

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
