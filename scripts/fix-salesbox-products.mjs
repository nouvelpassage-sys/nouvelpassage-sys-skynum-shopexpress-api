import { mkdirSync, writeFileSync } from "node:fs";
import { readBotConfig } from "../src/productAssistant/env.js";
import { SalesBoxClient } from "../src/productAssistant/salesBoxClient.js";

const APPLY = process.argv.includes("--apply");
const RIBBON_ID = "57d45057-be87-4175-aaba-59e2afce4a04";
const TEST_ID = "0e3f844a-06b9-4f52-8b19-8d1268650000";
const CATEGORY_IDS = {
  plants: "bd061350-4f12-49d6-a2e2-8e0d99ee0b90",
  toys: "a5195c32-3c10-43e5-88d1-e382cf869da3"
};

const config = readBotConfig();
const client = new SalesBoxClient({ ...config.salesBox, writeEnabled: true });

const offers = await fetchAllOffers();
const detailedOffers = [];
const detailFailures = [];
for (const offer of offers) {
  try {
    detailedOffers.push((await getJsonWithRetry(`offers/${offer.id}?lang=uk`)).data);
  } catch (error) {
    detailFailures.push({ id: offer.id, name: offer.name, error: error.message });
    detailedOffers.push(offer);
  }
  await delay(350);
}

const plan = detailedOffers.map((offer) => {
  const offerPatch = {
    ...(stockPatch(offer) ?? {}),
    ...(categoryPatch(offer) ?? {}),
    ...(descriptionPatch(offer) ?? {})
  };
  return {
    id: offer.id,
    name: offer.name,
    category: categoryNames(offer).join(", "),
    offerPatch,
    seoFields: seoFields(offer)
  };
});

mkdirSync("reports", { recursive: true });
writeFileSync(
  "reports/salesbox-product-fix-plan.json",
  JSON.stringify({ createdAt: new Date().toISOString(), apply: APPLY, count: plan.length, detailFailures, plan }, null, 2),
  "utf8"
);

const result = {
  apply: APPLY,
  total: plan.length,
  offerPatchesPlanned: plan.filter((item) => Object.keys(item.offerPatch).length).length,
  seoPlanned: plan.length,
  offerPatchesUpdated: 0,
  seoUpdated: 0,
  detailFailures,
  failed: []
};

if (APPLY) {
  for (const item of plan) {
    try {
      if (Object.keys(item.offerPatch).length) {
        await putJsonWithRetry(`offers/${encodeURIComponent(item.id)}?lang=uk`, item.offerPatch);
        result.offerPatchesUpdated += 1;
      }
      await putJsonWithRetry(`offers/${encodeURIComponent(item.id)}/custom-fields?lang=uk`, {
        fields: item.seoFields
      });
      result.seoUpdated += 1;
      await delay(350);
    } catch (error) {
      result.failed.push({ id: item.id, name: item.name, error: error.message });
    }
  }
}

async function getJsonWithRetry(path, attempt = 0) {
  try {
    return await client.getJson(path);
  } catch (error) {
    if (attempt >= 5 || !isRateLimit(error)) {
      throw error;
    }
    await delay(1000 * (attempt + 1));
    return getJsonWithRetry(path, attempt + 1);
  }
}

async function putJsonWithRetry(path, payload, attempt = 0) {
  try {
    return await client.putJson(path, payload);
  } catch (error) {
    if (attempt >= 5 || !isRateLimit(error)) {
      throw error;
    }
    await delay(1000 * (attempt + 1));
    return putJsonWithRetry(path, payload, attempt + 1);
  }
}

function isRateLimit(error) {
  return String(error?.message ?? "").includes("429") || String(error?.message ?? "").includes("TO_MANY_REQUESTS");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

writeFileSync("reports/salesbox-product-fix-result.json", JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));

async function fetchAllOffers() {
  const result = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await client.getOffers({ page, pageSize: 100, lang: "uk" });
    const data = Array.isArray(response?.data) ? response.data : response?.data ? [response.data] : [];
    result.push(...data);
    if (data.length < 100) {
      break;
    }
  }
  return result;
}

function categoryNames(offer) {
  return (offer.categories ?? []).map((category) => category.name).filter(Boolean);
}

function categoryIds(offer) {
  return (offer.categories ?? []).map((category) => category.id).filter(Boolean);
}

function isPlant(offer) {
  return categoryIds(offer).includes(CATEGORY_IDS.plants) || offer.id === "d9378378-6dcd-43a9-8ba5-71a0bdbe3cd4";
}

function stockPatch(offer) {
  if (offer.id === TEST_ID) {
    return null;
  }

  if (isPlant(offer)) {
    return {
      minCount: 1,
      step: 1,
      available: true,
      availableStatus: "AVAILABLE",
      stockType: "limited",
      count: Math.max(1, Number(offer.count) || 1),
      allowNegativeStock: false
    };
  }

  return {
    minCount: 1,
    step: 1,
    available: true,
    availableStatus: "AVAILABLE",
    stockType: "endless",
    count: 0,
    allowNegativeStock: true
  };
}

function categoryPatch(offer) {
  if (offer.id === "d9378378-6dcd-43a9-8ba5-71a0bdbe3cd4") {
    return { categories: [CATEGORY_IDS.plants] };
  }
  if (offer.id === "41a5217e-c14b-4d31-a843-d52b60683bc3") {
    return { categories: [CATEGORY_IDS.toys] };
  }
  return null;
}

function descriptionPatch(offer) {
  if (offer.id !== RIBBON_ID) {
    return null;
  }

  return {
    descriptions: [
      {
        lang: "uk",
        description:
          "Персоналізована стрічка додається до букета або квіткової композиції. Після додавання в кошик напишіть текст для стрічки в коментарі до замовлення: до двох коротких речень, і ми нанесемо його перед відправкою."
      },
      {
        lang: "en",
        description:
          "A personalized ribbon can be added to a bouquet or floral arrangement. After adding it to the cart, write the ribbon text in the order comment: up to two short sentences, and we will print it before dispatch."
      }
    ]
  };
}

function seoFields(offer) {
  const description = publicDescription(offer);
  const category = categoryNames(offer).join(", ");
  return [
    { key: "thxsd2rona_seo_offertitle_hidden", value: truncate(`${offer.name} | Nouvel Amour`, 60) },
    { key: "thxsd2rona_seo_offerdescription_hidden", value: truncate(firstSentence(description) || description, 160) },
    {
      key: "thxsd2rona_seo_offerkeywords_hidden",
      value: truncate([offer.name, category, "Nouvel Amour", "квіти Київ", "подарунок"].filter(Boolean).join(", "), 255)
    },
    { key: "thxsd2rona_seo_offerslug_hidden", value: slugify(offer.name, `offer-${offer.id.slice(0, 8)}`) }
  ];
}

function publicDescription(offer) {
  if (offer.id === RIBBON_ID) {
    return descriptionPatch(offer).descriptions[0].description;
  }

  const existing =
    offer.descriptions?.find((description) => description.lang === "uk")?.description ??
    offer.descriptions?.[0]?.description ??
    "";
  if (existing) {
    return existing;
  }

  const categories = categoryNames(offer).join(", ");
  if (isPlant(offer)) {
    return `${offer.name} від Nouvel Amour додає простору живий зелений акцент і підходить для дому, офісу або уважного подарунка.`;
  }
  if (categories.includes("Іграшки")) {
    return `${offer.name} додає подарунку м'який, теплий акцент і добре поєднується з квітами або самостійним замовленням.`;
  }
  if (categories.includes("Арома") || categories.includes("свіч") || categories.includes("дифуз")) {
    return `${offer.name} створює затишну атмосферу і доречно доповнює квіти або самостійний подарунок.`;
  }
  return `${offer.name} від Nouvel Amour — уважно підібрана позиція для подарунка, букета або особливого замовлення.`;
}

function firstSentence(value) {
  return normalizeSpaces(value).split(/(?<=[.!?])\s+/)[0] || "";
}

function truncate(value, maxLength) {
  const normalized = normalizeSpaces(value);
  return normalized.length > maxLength ? normalized.slice(0, maxLength - 1).trim() : normalized;
}

function normalizeSpaces(value) {
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
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((character) => map[character.toLowerCase()] ?? character)
    .join("");
}
