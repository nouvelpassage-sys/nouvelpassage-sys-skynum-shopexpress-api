import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readBotConfig } from "../src/productAssistant/env.js";
import { SalesBoxClient, SALESBOX_SEO_CUSTOM_FIELD_KEYS } from "../src/productAssistant/salesBoxClient.js";

const APPLY = process.argv.includes("--apply");
const SOURCE_CSV = "C:/Users/milan/OneDrive/Desktop/salesbox-product-load/salesbox-products-all.csv";
const PLANT_CATEGORY = "\u041a\u0456\u043c\u043d\u0430\u0442\u043d\u0456 \u0440\u043e\u0441\u043b\u0438\u043d\u0438";
const PLANT_CATEGORY_ID = "bd061350-4f12-49d6-a2e2-8e0d99ee0b90";
const CURRENCY = "UAH";

const config = readBotConfig();
const client = new SalesBoxClient({ ...config.salesBox, writeEnabled: true, requestTimeoutMs: 30000 });

const sourceRows = parseCsv(readFileSync(SOURCE_CSV, "utf8"));
const plantRows = sourceRows
  .filter((row) => row.salesbox_category === PLANT_CATEGORY)
  .filter((row) => positiveNumber(row.quantity) > 0)
  .filter((row) => positiveNumber(row.active_price_uah) > 0)
  .filter((row) => normalize(row.primary_image_url));

const existingOffers = await fetchAllOffers();
const existingExternalIds = new Set(existingOffers.map((offer) => String(offer.externalId ?? "").trim()).filter(Boolean));
const existingNames = new Set(existingOffers.map((offer) => normalize(offer.name).toLowerCase()).filter(Boolean));

const candidates = plantRows.map(toImportCandidate).filter((candidate) => {
  return !existingExternalIds.has(candidate.externalId) && !existingNames.has(normalize(candidate.nameUk).toLowerCase());
});

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/salesbox-plants-import-plan.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      apply: APPLY,
      sourceRows: sourceRows.length,
      plantRows: plantRows.length,
      existingOffers: existingOffers.length,
      candidates: candidates.length,
      skippedAsExisting: plantRows.length - candidates.length,
      preview: candidates.slice(0, 20)
    },
    null,
    2
  ),
  "utf8"
);

const result = {
  apply: APPLY,
  sourcePlantsWithStock: plantRows.length,
  candidates: candidates.length,
  created: 0,
  seoUpdated: 0,
  failed: []
};

if (APPLY) {
  for (const candidate of candidates) {
    try {
      const createResult = await createOffer(candidate);
      result.created += 1;
      const offerId = await resolveCreatedOfferId(candidate, createResult);
      if (offerId) {
        await putJsonWithRetry(`offers/${encodeURIComponent(offerId)}/custom-fields?lang=uk`, {
          fields: buildSeoFields(candidate)
        });
        result.seoUpdated += 1;
      }
      await delay(600);
    } catch (error) {
      result.failed.push({
        externalId: candidate.externalId,
        name: candidate.nameUk,
        error: error.message
      });
      await delay(1200);
    }
  }
}

writeFileSync("reports/salesbox-plants-import-result.json", JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));

function toImportCandidate(row) {
  const name = normalize(row.name_uk);
  const price = positiveNumber(row.active_price_uah);
  const count = positiveNumber(row.quantity);
  const description =
    normalize(row.description_uk) ||
    `${name} від Nouvel Amour додає простору живий зелений акцент і підходить для дому, офісу або уважного подарунка.`;
  return {
    sourceId: normalize(row.source_id),
    externalId: normalize(row.source_id || row.external_id),
    internalId: normalize(row.sku) || `PL-${normalize(row.source_id)}`,
    vendorCode: normalize(row.sku) || normalize(row.source_id),
    nameUk: name,
    nameEn: toEnglishPlantName(name),
    descriptionUk: description,
    descriptionEn:
      `${toEnglishPlantName(name)} adds a calm green accent to a home, office, or thoughtful gift. Nouvel Amour checks each plant before dispatch; availability follows the current stock.`,
    price,
    count,
    photoUrl: normalize(row.primary_image_url),
    sourceUrl: normalize(row.source_url),
    brand: normalize(row.brand) || "Nouvel Amour"
  };
}

async function createOffer(candidate) {
  return postJsonWithRetry("offers/createMany?lang=uk", {
    offers: [
      {
        internalId: candidate.internalId,
        externalId: candidate.externalId,
        vendor: candidate.brand,
        vendorCode: candidate.vendorCode,
        price: candidate.price,
        basePrice: candidate.price,
        baseCurrency: CURRENCY,
        names: [
          { lang: "uk", name: candidate.nameUk },
          { lang: "en", name: candidate.nameEn }
        ],
        descriptions: [
          { lang: "uk", description: candidate.descriptionUk },
          { lang: "en", description: candidate.descriptionEn }
        ],
        photos: [
          {
            url: candidate.photoUrl,
            previewURL: candidate.photoUrl,
            order: 0,
            type: "image",
            resourceType: "image"
          }
        ],
        available: true,
        availableStatus: "AVAILABLE",
        stockType: "limited",
        count: candidate.count,
        allowNegativeStock: false,
        units: "pc",
        minCount: 1,
        step: 1,
        isFixedStep: false,
        isService: false,
        categories: [{ id: PLANT_CATEGORY_ID }],
        url: candidate.sourceUrl || undefined
      }
    ]
  });
}

async function resolveCreatedOfferId(candidate, createResult) {
  const direct = normalizeOfferList(createResult).find((offer) => offer?.id)?.id;
  if (direct) {
    return direct;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await delay(attempt ? 1000 : 350);
    const search = await getJsonWithRetry(`offers/search?lang=uk&name=${encodeURIComponent(candidate.nameUk)}`);
    const found = normalizeOfferList(search).find((offer) => {
      return (
        offer.externalId === candidate.externalId ||
        offer.internalId === candidate.internalId ||
        normalize(offer.name).toLowerCase() === normalize(candidate.nameUk).toLowerCase()
      );
    });
    if (found?.id) {
      return found.id;
    }
  }
  return null;
}

function buildSeoFields(candidate) {
  return [
    {
      key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.title,
      value: truncate(`${candidate.nameUk} | Nouvel Amour`, 60)
    },
    {
      key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.description,
      value: truncate(firstSentence(candidate.descriptionUk), 160)
    },
    {
      key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.keywords,
      value: truncate([candidate.nameUk, PLANT_CATEGORY, "Nouvel Amour", "\u0440\u043e\u0441\u043b\u0438\u043d\u0430", "\u043f\u043e\u0434\u0430\u0440\u0443\u043d\u043e\u043a"].join(", "), 255)
    },
    {
      key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.slug,
      value: slugify(candidate.nameUk, `plant-${candidate.externalId}`)
    }
  ];
}

async function fetchAllOffers() {
  const result = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await client.getOffers({ page, pageSize: 100, lang: "uk" });
    const data = normalizeOfferList(response);
    result.push(...data);
    if (data.length < 100) {
      break;
    }
  }
  return result;
}

async function getJsonWithRetry(path, attempt = 0) {
  try {
    return await client.getJson(path);
  } catch (error) {
    if (attempt >= 6 || !isRetryable(error)) {
      throw error;
    }
    await delay(1200 * (attempt + 1));
    return getJsonWithRetry(path, attempt + 1);
  }
}

async function postJsonWithRetry(path, payload, attempt = 0) {
  try {
    const response = await fetch(new URL(path, client.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(client.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${client.apiToken}`,
        "content-type": "application/json",
        accept: "application/json",
        lang: "uk"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`SalesBox POST failed: ${response.status} ${text}`);
    }
    return body;
  } catch (error) {
    if (attempt >= 6 || !isRetryable(error)) {
      throw error;
    }
    await delay(1200 * (attempt + 1));
    return postJsonWithRetry(path, payload, attempt + 1);
  }
}

async function putJsonWithRetry(path, payload, attempt = 0) {
  try {
    return await client.putJson(path, payload);
  } catch (error) {
    if (attempt >= 6 || !isRetryable(error)) {
      throw error;
    }
    await delay(1200 * (attempt + 1));
    return putJsonWithRetry(path, payload, attempt + 1);
  }
}

function isRetryable(error) {
  const message = String(error?.message ?? "");
  return message.includes("429") || message.includes("TO_MANY_REQUESTS") || message.includes("fetch failed");
}

function normalizeOfferList(result) {
  if (Array.isArray(result?.data)) {
    return result.data;
  }
  if (result?.data) {
    return [result.data];
  }
  return [];
}

function parseCsv(text, delimiter = ";") {
  const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const char = cleanText[i];
    const next = cleanText[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
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

  const headers = rows.shift() ?? [];
  return rows
    .filter((item) => item.some(Boolean))
    .map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] ?? ""])));
}

function toEnglishPlantName(value) {
  return transliterate(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstSentence(value) {
  return normalize(value).split(/(?<=[.!?])\s+/)[0] || normalize(value);
}

function truncate(value, maxLength) {
  const text = normalize(value);
  return text.length > maxLength ? text.slice(0, maxLength - 1).trim() : text;
}

function positiveNumber(value) {
  const number = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value, fallback) {
  const slug = transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function transliterate(value) {
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "h",
    ґ: "g",
    д: "d",
    е: "e",
    є: "ie",
    ж: "zh",
    з: "z",
    и: "y",
    і: "i",
    ї: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ь: "",
    ю: "iu",
    я: "ia"
  };
  return normalize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((character) => map[character.toLowerCase()] ?? character)
    .join("");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
