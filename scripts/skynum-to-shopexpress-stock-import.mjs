import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.export) {
  usage("Missing --export <ShopExpress export CSV>");
}

const token = process.env.SKYNUM_API_TOKEN;
if (!token) {
  usage("Missing SKYNUM_API_TOKEN environment variable");
}

const exportPath = args.export;
const outputPath =
  args.output ||
  join(
    dirname(exportPath),
    `${basename(exportPath, ".csv")}-skynum-stock-import.csv`
  );
const reportPath =
  args.report ||
  join(
    dirname(exportPath),
    `${basename(exportPath, ".csv")}-skynum-stock-import-report.json`
  );

const shopRows = parseCsv(readFileSync(exportPath, "utf8").replace(/^\uFEFF/, ""));
const header = shopRows[0] || [];
const rows = shopRows.slice(1).filter((row) => row.length > 1);

const col = {
  id: header.indexOf("ID"),
  sku: header.indexOf("Sku"),
  barcode: header.indexOf("Barcode"),
  name: header.indexOf("Name")
};

for (const [key, index] of Object.entries(col)) {
  if (index === -1) {
    throw new Error(`Missing required ShopExpress column: ${key}`);
  }
}

let remains;
try {
  remains = await fetchSkynumRemains({
    token,
    stockId: args.stockId,
    date: args.date
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const remainsByKey = indexRemains(remains);
const outputRows = [["ID", "InStock", "IsAvailable"]];
const report = {
  shopRows: rows.length,
  skynumRemainRows: remains.length,
  matched: 0,
  skippedNoKey: 0,
  skippedNoMatch: 0,
  examples: [],
  unmatchedExamples: []
};

for (const row of rows) {
  const id = value(row[col.id]);
  const sku = normalizeKey(value(row[col.sku]));
  const barcode = normalizeKey(value(row[col.barcode]));
  const name = value(row[col.name]);

  if (!id || (!sku && !barcode)) {
    report.skippedNoKey += 1;
    continue;
  }

  const match = (sku && remainsByKey.get(sku)) || (barcode && remainsByKey.get(barcode));
  if (!match) {
    report.skippedNoMatch += 1;
    if (report.unmatchedExamples.length < 20) {
      report.unmatchedExamples.push({ id, sku, barcode, name });
    }
    continue;
  }

  const quantity = Math.max(0, Number(match.quantity) || 0);
  outputRows.push([id, String(quantity), quantity > 0 ? "Так" : "Ні"]);
  report.matched += 1;

  if (report.examples.length < 20) {
    report.examples.push({
      id,
      name,
      sku,
      barcode,
      matchedBy: match.matchedBy,
      skynumProductId: match.product_id,
      skynumTitle: match.product_title,
      quantity
    });
  }
}

writeFileSync(outputPath, toCsv(outputRows), "utf8");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      outputPath,
      reportPath,
      report
    },
    null,
    2
  )
);

async function fetchSkynumRemains({ token, stockId, date }) {
  const url = new URL("https://api.skynum.com/v1/reports/remains");
  if (stockId) url.searchParams.set("stock_id", stockId);
  if (date) url.searchParams.set("date", date);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Skynum remains request failed: ${response.status} ${response.statusText} ${body.slice(0, 300)}`
    );
  }

  const json = await response.json();
  return Array.isArray(json.report) ? json.report : [];
}

function indexRemains(remains) {
  const map = new Map();

  for (const item of remains) {
    for (const [field, matchedBy] of [
      ["product_sku", "product_sku"],
      ["product_code", "product_code"],
      ["modification_code", "modification_code"]
    ]) {
      const key = normalizeKey(item[field]);
      if (!key) continue;

      const current = map.get(key);
      if (current) {
        current.quantity = (Number(current.quantity) || 0) + (Number(item.quantity) || 0);
      } else {
        map.set(key, { ...item, matchedBy });
      }
    }
  }

  return map;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage: SKYNUM_API_TOKEN=... node scripts/skynum-to-shopexpress-stock-import.mjs --export <export.csv> [--stock-id <id>] [--date YYYY-MM-DD] [--output file.csv]"
  );
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function csvCell(input) {
  return `"${String(input ?? "").replace(/"/g, "\"\"")}"`;
}

function value(input) {
  return String(input ?? "").trim();
}

function normalizeKey(input) {
  return value(input).toLowerCase();
}
