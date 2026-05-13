import { SALESBOX_CATEGORY_IDS } from "./salesBoxClient.js";

export function buildSalesBoxYmlFeed(drafts, { now = new Date(), shopName = "Nouvel Amour" } = {}) {
  const exportableDrafts = getSalesBoxYmlExportReport(drafts).ready.map((item) => item.draft);
  const categories = getUsedCategories(exportableDrafts);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<yml_catalog date="${escapeXml(formatYmlDate(now))}">`,
    "  <shop>",
    `    <name>${escapeXml(shopName)}</name>`,
    `    <company>${escapeXml(shopName)}</company>`,
    "    <currencies>",
    '      <currency id="UAH" rate="1"/>',
    "    </currencies>",
    "    <categories>",
    ...categories.map(
      ([categoryName, categoryId]) => `      <category id="${escapeXml(categoryId)}">${escapeXml(categoryName)}</category>`
    ),
    "    </categories>",
    "    <offers>",
    ...exportableDrafts.map((draft) => renderOffer(draft)).flat(),
    "    </offers>",
    "  </shop>",
    "</yml_catalog>",
    ""
  ].join("\n");
}

export function getSalesBoxYmlExportStats(drafts) {
  const report = getSalesBoxYmlExportReport(drafts);
  return {
    total: drafts.length,
    exportable: report.ready.length,
    skipped: report.skipped.length
  };
}

export function getSalesBoxYmlExportReport(drafts) {
  const ready = [];
  const skipped = [];

  for (const draft of drafts) {
    const reasons = getExportBlockers(draft);
    if (reasons.length) {
      skipped.push({
        id: draft?.id ?? null,
        nameUk: draft?.nameUk ?? null,
        category: draft?.category ?? null,
        updatedAt: draft?.updatedAt ?? draft?.createdAt ?? null,
        reasons
      });
    } else {
      ready.push({
        id: draft.id,
        nameUk: draft.nameUk,
        category: draft.category,
        price: draft.price,
        photoUrl: draft.photoUrl ?? draft.previewUrl,
        updatedAt: draft.updatedAt ?? draft.createdAt ?? null,
        draft
      });
    }
  }

  return {
    total: drafts.length,
    ready,
    skipped,
    stats: {
      total: drafts.length,
      exportable: ready.length,
      skipped: skipped.length
    }
  };
}

function renderOffer(draft) {
  const categoryId = getCategoryId(draft.category);
  const photoUrl = draft.photoUrl ?? draft.previewUrl;
  const offerId = draft.sku || draft.id;
  const stockQuantity = draft.stockMode === "counted" ? getPositiveCount(draft) : 999;

  return [
    `      <offer id="${escapeXml(offerId)}" available="${draft.availability === "unavailable" ? "false" : "true"}">`,
    `        <name>${escapeXml(draft.nameUk)}</name>`,
    draft.nameEn ? `        <name_en>${escapeXml(draft.nameEn)}</name_en>` : null,
    `        <vendor>${escapeXml(draft.brand ?? "Nouvel Amour")}</vendor>`,
    `        <price>${escapeXml(formatPrice(draft.price))}</price>`,
    `        <currencyId>${escapeXml(draft.currency ?? "UAH")}</currencyId>`,
    `        <categoryId>${escapeXml(categoryId)}</categoryId>`,
    draft.productTypeUk ? `        <param name="type">${escapeXml(draft.productTypeUk)}</param>` : null,
    `        <param name="stock_type">${escapeXml(draft.stockMode === "counted" ? "limited" : "endless")}</param>`,
    `        <param name="stock_quantity">${stockQuantity}</param>`,
    photoUrl ? `        <picture>${escapeXml(photoUrl)}</picture>` : null,
    `        <description><![CDATA[${escapeCdata(draft.descriptionUk)}]]></description>`,
    draft.descriptionEn ? `        <description_en><![CDATA[${escapeCdata(draft.descriptionEn)}]]></description_en>` : null,
    draft.seo?.slug ? `        <param name="seo_slug">${escapeXml(draft.seo.slug)}</param>` : null,
    draft.seo?.descriptionUk ? `        <param name="seo_description_uk">${escapeXml(draft.seo.descriptionUk)}</param>` : null,
    "      </offer>"
  ].filter(Boolean);
}

function getExportBlockers(draft) {
  const reasons = [];
  if (!draft) {
    return ["Draft is empty."];
  }
  if (draft.qualityIssues?.length) {
    reasons.push(`QA issues: ${draft.qualityIssues.length}`);
  }
  if (!draft.nameUk) {
    reasons.push("Missing Ukrainian name.");
  }
  if (!draft.descriptionUk) {
    reasons.push("Missing Ukrainian description.");
  }
  if (!Number.isFinite(Number(draft.price))) {
    reasons.push("Missing price.");
  }
  if (!draft.photoUrl && !draft.previewUrl) {
    reasons.push("Missing public photo URL.");
  }
  if (!getCategoryId(draft.category)) {
    reasons.push("Category is not mapped to SalesBox.");
  }
  return reasons;
}

function getUsedCategories(drafts) {
  const categories = new Map();
  for (const draft of drafts) {
    categories.set(draft.category, getCategoryId(draft.category));
  }
  return [...categories.entries()];
}

function getCategoryId(category) {
  return SALESBOX_CATEGORY_IDS[category] ?? null;
}

function getPositiveCount(draft) {
  const count = Number(draft.count ?? draft.stockCount ?? draft.quantity ?? 1);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price.toFixed(2) : "";
}

function formatYmlDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes())
  ].join("");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeCdata(value) {
  return String(value ?? "").replaceAll("]]>", "]]]]><![CDATA[>");
}
