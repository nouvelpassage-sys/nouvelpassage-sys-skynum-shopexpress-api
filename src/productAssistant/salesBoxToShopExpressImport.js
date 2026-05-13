export const SHOP_EXPRESS_FROM_SALESBOX_HEADERS = [
  "ExternalID",
  "Name",
  "NameDescription",
  "Price",
  "Sku",
  "Currency",
  "Categories",
  "Images",
  "Unit",
  "InStock",
  "IsAvailable",
  "Alias",
  "MetaTitle",
  "MetaDescription",
  "MetaKeywords",
  "ShortDescription",
  "Минимальный заказ",
  "Кратность"
];

export function salesBoxOfferToShopExpressRow(offer) {
  const name = getLocalizedValue(offer.names, "name", "uk") ?? offer.name;
  const description = getLocalizedValue(offer.descriptions, "description", "uk") ?? offer.description ?? "";
  const imageUrl = offer.originalURL ?? offer.previewURL ?? offer.pictures?.[0]?.url ?? offer.pictures?.[0]?.previewURL;
  const category = offer.categories?.[0]?.name ?? "";
  const stockType = offer.stockType ?? (offer.allowNegativeStock ? "endless" : "limited");
  const count = stockType === "limited" ? getPositiveNumber(offer.count ?? offer.stocksCount, 1) : 999;
  const externalId = offer.externalId || `salesbox-${offer.id}`;
  const sku = offer.internalId || offer.vendorCode || externalId;
  const alias = offer.url || slugify(name || externalId);

  return [
    externalId,
    name,
    description,
    offer.price ?? offer.basePrice ?? "",
    sku,
    offer.baseCurrency ?? "UAH",
    category,
    imageUrl ?? "",
    normalizeUnit(offer.units),
    count,
    offer.available === false || offer.availableStatus === "UNAVAILABLE" ? "Unavailable" : "Available",
    alias,
    name,
    buildMetaDescription(name, description),
    "",
    buildShortDescription(description),
    1,
    1
  ];
}

export function buildShopExpressImportFromSalesBoxOffers(offers) {
  return toCsv([
    SHOP_EXPRESS_FROM_SALESBOX_HEADERS,
    ...offers.map(salesBoxOfferToShopExpressRow).filter((row) => row[0] && row[1] && row[3] !== "" && row[7])
  ]);
}

export function getShopExpressImportStats(offers) {
  const rows = offers.map(salesBoxOfferToShopExpressRow);
  const ready = rows.filter((row) => row[0] && row[1] && row[3] !== "" && row[7]);
  const skipped = rows
    .map((row, index) => ({ offer: offers[index], row, reasons: getSkipReasons(row) }))
    .filter((item) => item.reasons.length);

  return {
    total: offers.length,
    ready: ready.length,
    skipped: skipped.length,
    skippedPreview: skipped.slice(0, 30).map((item) => ({
      id: item.offer?.id,
      name: item.offer?.name ?? item.row[1],
      reasons: item.reasons
    }))
  };
}

function getSkipReasons(row) {
  const reasons = [];
  if (!row[0]) reasons.push("missing ExternalID");
  if (!row[1]) reasons.push("missing Name");
  if (row[3] === "") reasons.push("missing Price");
  if (!row[7]) reasons.push("missing Images");
  return reasons;
}

function getLocalizedValue(items, field, preferredLang) {
  if (!Array.isArray(items)) {
    return null;
  }
  return items.find((item) => item.lang === preferredLang)?.[field] ?? items.find((item) => item[field])?.[field] ?? null;
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeUnit(unit) {
  if (!unit || unit === "pc") {
    return "шт";
  }
  return unit;
}

function buildMetaDescription(name, description) {
  const text = `${name ? `${name}. ` : ""}${description ?? ""}`.replace(/\s+/g, " ").trim();
  return text.slice(0, 155);
}

function buildShortDescription(description) {
  return String(description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toCsv(csvRows, delimiter = ";") {
  return `\uFEFF${csvRows.map((row) => row.map(escapeCsv).join(delimiter)).join("\r\n")}\r\n`;
}

function escapeCsv(field) {
  const text = String(field ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
