import { ensureMainFlowerDetails, improveShortDescription } from "./copyQuality.js";
import { detectCategory, getAllowedCategories, getCategoryAliases, getCategoryRule, resolveCategoryRule } from "./catalogRules.js";
import { buildMerchandisingProfile } from "./merchandisingRules.js";
import { validateProductDraft } from "./productDraftQuality.js";
import { hasProductNameStopWords as policyHasProductNameStopWords } from "./productCardPolicy.js";

const PRICE_PATTERN = /(?:^|\s)(\d{2,6})(?:\s*(?:\u0433\u0440\u043d|uah|\u20b4|\u0420\u0456\u0421\u0402\u0420\u0405|\u0432\u201a\u0491))?/iu;
const BOUQUET_AVAILABILITY_NOTE =
  "У разі відсутності окремих квітів вони можуть бути замінені на аналогічні або дорожчі за наш рахунок, зі збереженням стилю, кольорової гами, форми та загального характеру букета.";

export function parseProductMessage(text) {
  const raw = String(text ?? "").trim();
  const imageUrl = extractFirstImageUrl(raw);
  const textWithoutUrl = imageUrl ? raw.replace(imageUrl, " ") : raw;
  const categoryPrefix = extractCategoryPrefix(textWithoutUrl);
  const textWithoutCategory = categoryPrefix
    ? textWithoutUrl.slice(categoryPrefix.consumedLength).replace(/^[\s,.;:!?\-|/]+/g, " ")
    : textWithoutUrl;
  const priceMatch = textWithoutCategory.match(PRICE_PATTERN);
  const price = priceMatch ? Number(priceMatch[1]) : null;
  const titleSeed = cleanProductHint(
    textWithoutCategory
      .replace(PRICE_PATTERN, " ")
      .replace(/\s+/g, " ")
  );

  return {
    raw,
    price,
    titleSeed,
    imageUrl,
    categoryHint: categoryPrefix?.category ?? null
  };
}

export async function createProductDraft({
  text,
  photoFileId,
  photoFileIds,
  imageDataUrls,
  imageDataUrl,
  openAiClient,
  usedNames = [],
  sourceCategory,
  revisionInstruction,
  sourceDraftId
}) {
  const parsed = parseProductMessage(text);
  const normalizedImageDataUrls = [
    ...(Array.isArray(imageDataUrls) ? imageDataUrls : []),
    imageDataUrl
  ].filter(Boolean);
  const baseName = parsed.titleSeed || "Новий товар Nouvel Amour";
  const sourceCategoryRule = getCategoryRule(sourceCategory) ?? getCategoryRule(parsed.categoryHint);
  const categoryRule = sourceCategoryRule ?? detectCategory(baseName);
  const fallbackNameUk = buildCreativeName(baseName, categoryRule.category, parsed.raw);

  if (openAiClient) {
    const generated = await openAiClient.generateProductContent({
      nameHint: baseName,
      price: parsed.price,
      categoryHint: categoryRule.category,
      sourceCategoryHint: sourceCategoryRule?.category,
      stockModeHint: categoryRule.stockMode,
      hasImage: Boolean(normalizedImageDataUrls.length || parsed.imageUrl),
      imageDataUrl: normalizedImageDataUrls[0] ?? null,
      imageDataUrls: normalizedImageDataUrls,
      imageUrl: parsed.imageUrl,
      existingNames: usedNames,
      revisionInstruction
    });
    const generatedCategoryRule = sourceCategoryRule
      ? { ...sourceCategoryRule, categoryWasCorrected: generated.category !== sourceCategoryRule.category }
      : resolveCategoryRule({
          generatedCategory: generated.category,
          fallbackCategory: categoryRule.category,
          evidence: [
            baseName,
            generated.nameUk,
            generated.productTypeUk,
            generated.visibleSummaryUk,
            generated.descriptionUk
          ].filter(Boolean).join(" ")
        });
    const productTypeUk = cleanProductHint(generated.productTypeUk || generated.productType || inferProductTypeUk(generated.nameUk || baseName, generatedCategoryRule.category));
    const creativeSeed = [
      parsed.raw,
      generated.visibleSummaryUk,
      generated.productTypeUk,
      generated.nameUk
    ].filter(Boolean).join(" | ");
    const nameUk = ensureUniqueCreativeName(generated.nameUk, generatedCategoryRule.category, creativeSeed, usedNames);
    const nameEn = sanitizeCreativeProductName(
      generated.nameEn || buildFallbackNameEn(nameUk),
      generatedCategoryRule.category,
      `${creativeSeed} | en`,
      [...usedNames, nameUk]
    );

    return normalizeDraft({
      ...generated,
      nameUk,
      nameEn,
      productTypeUk,
      productTypeEn: generated.productTypeEn || buildFallbackNameEn(productTypeUk),
      visibleSummaryUk: generated.visibleSummaryUk,
      sku: createSku(generatedCategoryRule.category),
      price: parsed.price,
      sourceText: parsed.raw,
      category: generatedCategoryRule.category,
      categoryWasCorrected: generatedCategoryRule.categoryWasCorrected,
      stockMode: generatedCategoryRule.stockMode,
      brand: generated.brand || generatedCategoryRule.defaultBrand,
      photoUrl: parsed.imageUrl,
      previewUrl: parsed.imageUrl,
      photoFileId,
      photoFileIds: photoFileIds ?? (photoFileId ? [photoFileId] : []),
      visionUsed: Boolean(normalizedImageDataUrls.length),
      revisionInstruction,
      sourceDraftId
    });
  }

  return normalizeDraft({
    nameUk: fallbackNameUk,
    nameEn: buildFallbackNameEn(fallbackNameUk),
    productTypeUk: inferProductTypeUk(baseName, categoryRule.category),
    productTypeEn: buildFallbackNameEn(inferProductTypeUk(baseName, categoryRule.category)),
    visibleSummaryUk: titleCase(baseName),
    descriptionUk: buildUkDescription(fallbackNameUk, baseName, categoryRule.category),
    descriptionEn: buildEnDescription(fallbackNameUk, baseName, categoryRule.category),
    seoTitleUk: `${fallbackNameUk} - Nouvel Amour`,
    seoDescriptionUk: `${fallbackNameUk} від Nouvel Amour${parsed.price ? ` за ${parsed.price} грн` : ""}: стильна композиція з французьким настроєм для особливого приводу.`,
    seoKeywordsUk: [fallbackNameUk, baseName, categoryRule.category, "Nouvel Amour", "квіти Київ", "подарунок"].join(", "),
    slug: slugify(fallbackNameUk),
    sku: createSku(categoryRule.category),
    price: parsed.price,
    sourceText: parsed.raw,
    category: categoryRule.category,
    stockMode: categoryRule.stockMode,
    brand: categoryRule.defaultBrand,
    photoUrl: parsed.imageUrl,
    previewUrl: parsed.imageUrl,
    photoFileId,
    photoFileIds: photoFileIds ?? (photoFileId ? [photoFileId] : []),
    visionUsed: false,
    revisionInstruction,
    sourceDraftId
  });
}

function normalizeDraft(draft) {
  const descriptionUk = appendBouquetAvailabilityNote(
    ensureMainFlowerDetails(improveShortDescription({
      description: draft.descriptionUk,
      name: draft.nameUk,
      productType: draft.productTypeUk,
      visibleSummary: draft.visibleSummaryUk,
      category: draft.category
    }), {
      productType: draft.productTypeUk,
      visibleSummary: draft.visibleSummaryUk
    }),
    draft.category,
    draft.productTypeUk
  );
  const normalized = {
    id: createDraftId(),
    status: "draft",
    createdAt: new Date().toISOString(),
    sourceText: draft.sourceText,
    sourceDraftId: draft.sourceDraftId,
    revisionInstruction: draft.revisionInstruction,
    photoFileId: draft.photoFileId,
    photoFileIds: draft.photoFileIds ?? (draft.photoFileId ? [draft.photoFileId] : []),
    visionUsed: draft.visionUsed,
    sku: draft.sku,
    price: draft.price,
    currency: "UAH",
    category: draft.category,
    categoryWasCorrected: Boolean(draft.categoryWasCorrected),
    stockMode: draft.stockMode,
    availability: "available",
    brand: draft.brand,
    photoUrl: draft.photoUrl,
    previewUrl: draft.previewUrl,
    photos: Array.isArray(draft.photos) && draft.photos.length
      ? draft.photos
      : undefined,
    productTypeUk: draft.productTypeUk,
    productTypeEn: draft.productTypeEn,
    visibleSummaryUk: draft.visibleSummaryUk,
    nameUk: draft.nameUk,
    nameEn: draft.nameEn,
    merchandising: draft.merchandising ?? buildMerchandisingProfile(draft),
    descriptionUk,
    descriptionEn: draft.descriptionEn,
    seo: {
      titleUk: draft.seoTitleUk,
      descriptionUk: draft.seoDescriptionUk,
      keywordsUk: draft.seoKeywordsUk,
      slug: slugify(draft.nameUk || draft.slug)
    }
  };
  return {
    ...normalized,
    qualityIssues: validateProductDraft(normalized)
  };
}

function extractCategoryPrefix(value) {
  const raw = String(value ?? "");
  const candidates = getAllowedCategories()
    .flatMap((category) => getCategoryAliases(category).map((alias) => ({ category, alias })))
    .sort((left, right) => right.alias.length - left.alias.length);

  for (const { category, alias } of candidates) {
    const match = raw.match(new RegExp(String.raw`^\s*${escapeRegExp(alias)}(?=$|[\s,.;:!?\-|/])`, "iu"));
    if (match) {
      return { category, consumedLength: match[0].length };
    }
  }

  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFirstImageUrl(value) {
  const match = String(value ?? "").match(/https?:\/\/[^\s<>"']+\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>"']*)?/i);
  return match?.[0] ?? null;
}

export function hasProductNameStopWords(name) {
  return policyHasProductNameStopWords(name);
}

function appendBouquetAvailabilityNote(description, category, productType) {
  if (!isBouquetDraft(category, productType)) {
    return description;
  }

  const normalized = String(description ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return BOUQUET_AVAILABILITY_NOTE;
  }
  if (normalized.includes(BOUQUET_AVAILABILITY_NOTE)) {
    return normalized;
  }

  const separator = /[.!?…]$/u.test(normalized) ? " " : ". ";
  return `${normalized}${separator}${BOUQUET_AVAILABILITY_NOTE}`;
}

function isBouquetDraft(category, productType) {
  return String(category ?? "").includes("Букети") || /\b(букет|bouquet)\b/iu.test(String(productType ?? ""));
}

function sanitizeCreativeProductName(name, category, seed = "", usedNames = []) {
  const cleanName = cleanProductHint(name).replace(/\s+[-–—:|]\s+.*$/u, "");
  const isDuplicate = usedNames.some((usedName) => areCreativeNamesTooSimilar(usedName, cleanName));
  if (!cleanName || cleanName.length < 3 || cleanName.split(/\s+/).length < 2 || hasProductNameStopWords(cleanName) || isOverusedCreativeName(cleanName) || isDuplicate) {
    return buildCategoryCreativeName(category, `${seed} | ${usedNames.join(" | ")}`);
  }

  return cleanName;
}

function ensureUniqueCreativeName(name, category, seed, usedNames) {
  let candidate = sanitizeCreativeProductName(name, category, seed, usedNames);
  for (let attempt = 0; attempt < 12 && usedNames.some((usedName) => areCreativeNamesTooSimilar(usedName, candidate)); attempt += 1) {
    candidate = buildCategoryCreativeName(category, `${seed} | variant-${attempt + 1}`);
  }
  return candidate;
}

function areCreativeNamesTooSimilar(left, right) {
  const leftWords = normalizeCreativeName(left).split(/\s+/).filter(Boolean);
  const rightWords = normalizeCreativeName(right).split(/\s+/).filter(Boolean);
  if (!leftWords.length || !rightWords.length) {
    return false;
  }
  if (leftWords.join(" ") === rightWords.join(" ")) {
    return true;
  }
  const sharedWords = leftWords.filter((word) => rightWords.includes(word)).length;
  return sharedWords >= 2 || (leftWords.length === 2 && rightWords.length === 2 && sharedWords >= 1);
}

const OVERUSED_CREATIVE_NAMES = [
  "atelier lesnikov",
  "atelier lumiere",
  "belle histoire",
  "fete jolie",
  "jardin secret",
  "lumiere douce",
  "maison ambree",
  "maison verte",
  "maison vivante",
  "mot doux",
  "offre jolie",
  "petit ami",
  "velours secret"
];

const PRODUCT_NAME_STOP_WORDS = [
  /\b(букет|букети|квіт\p{L}*|композиці\p{L}*|короб\p{L}*|подарунок|подарунков\p{L}*|листівк\p{L}*|іграшк\p{L}*|рослин\p{L}*|горщик\p{L}*)\b/iu,
  /\b(троян\p{L}*|піон\p{L}*|півон\p{L}*|гортенз\p{L}*|лілі\p{L}*|еустом\p{L}*|орхіде\p{L}*|ранункул\p{L}*|тюльпан\p{L}*|хризантем\p{L}*|ромаш\p{L}*|альстромер\p{L}*|гіпсофіл\p{L}*)\b/iu,
  /\b(червон\p{L}*|рожев\p{L}*|білий|біла|білі|біле|кремов\p{L}*|жовт\p{L}*|син\p{L}*|блакит\p{L}*|фіолет\p{L}*|лілов\p{L}*|зелен\p{L}*|помаранч\p{L}*|персиков\p{L}*|бордов\p{L}*)\b/iu,
  /\b(bouquet|flower\p{L}*|arrangement|box|gift|card|toy|plant|potted|rose\p{L}*|peon\p{L}*|pivoine|hydrangea|orchid|lily|tulip|white|pink|red|cream|yellow|blue|violet|purple|green|orange)\b/iu
];

const PRODUCT_NAME_STOP_WORD_STEMS = [
  "buket",
  "kvit",
  "kompozyts",
  "korob",
  "podar",
  "lystiv",
  "igrash",
  "roslyn",
  "horsch",
  "gorshch",
  "troian",
  "troyan",
  "pion",
  "pivon",
  "horten",
  "lili",
  "eustom",
  "orkhid",
  "ranunk",
  "tiul",
  "tyul",
  "khryzant",
  "romash",
  "alstromer",
  "hipsofil",
  "chervon",
  "rozhev",
  "bil",
  "krem",
  "zhovt",
  "syn",
  "blakyt",
  "fiolet",
  "lilov",
  "zelen",
  "pomaran",
  "persyk",
  "bordov",
  "bouquet",
  "flower",
  "arrangement",
  "gift",
  "card",
  "toy",
  "plant",
  "rose",
  "peon",
  "pivoine",
  "hydrangea",
  "orchid",
  "lily",
  "tulip",
  "white",
  "blanc",
  "pink",
  "cream",
  "green"
];

function inferProductTypeUk(baseName, category) {
  const normalized = String(baseName ?? "").toLowerCase();
  const clearName = cleanProductHint(baseName);

  if (category.includes("Букети")) {
    if (normalized.includes("півон")) {
      return "букет півоній";
    }
    if (normalized.includes("троян")) {
      return "букет троянд";
    }
    return clearName && !normalized.includes("букет") ? `букет ${clearName}` : clearName || "букет";
  }
  if (category.includes("Квіти в коробках")) {
    return clearName && !normalized.includes("короб") ? `квіти в коробці ${clearName}` : clearName || "квіти в коробці";
  }
  if (category.includes("Арома")) {
    if (normalized.includes("автопарфум")) {
      return "автопарфум";
    }
    if (normalized.includes("свіч")) {
      return "ароматична свічка";
    }
    if (normalized.includes("дифуз")) {
      return "аромадифузор";
    }
    return clearName || "ароматичний товар";
  }
  if (category.includes("Кімнатні рослини")) {
    return clearName || "кімнатна рослина";
  }
  if (category.includes("Іграшки")) {
    return clearName || "іграшка";
  }
  if (category.includes("Кульки")) {
    return clearName || "повітряні кульки";
  }

  return clearName || "аксесуар Nouvel Amour";
}

function cleanProductHint(value) {
  return String(value ?? "")
    .replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CREATIVE_NAME_FIRST = [
  "Aveline",
  "Bastide",
  "Brume",
  "Celestine",
  "Clairmont",
  "Elysee",
  "Marais",
  "Monceau",
  "Nocturne",
  "Ondine",
  "Opaline",
  "Rivage",
  "Satin",
  "Serenade",
  "Solene",
  "Vendome"
];

const CREATIVE_NAME_SECOND = [
  "Aube",
  "Belle Nuit",
  "Clair",
  "de Lune",
  "de Minuit",
  "de Soie",
  "du Matin",
  "en Reve",
  "Opale",
  "Rive Gauche",
  "Serein",
  "Tendre"
];

function buildCreativeName(baseName, category, seed = "") {
  return buildCategoryCreativeName(category, `${baseName} | ${seed}`);
}

function buildCategoryCreativeName(category, seed = "") {
  const hash = hashString(`${category ?? ""} | ${seed}`);
  const first = CREATIVE_NAME_FIRST[hash % CREATIVE_NAME_FIRST.length];
  const second = CREATIVE_NAME_SECOND[Math.floor(hash / CREATIVE_NAME_FIRST.length) % CREATIVE_NAME_SECOND.length];
  const candidate = `${first} ${second}`;

  if (hasProductNameStopWords(candidate) || isOverusedCreativeName(candidate)) {
    return `Solene ${CREATIVE_NAME_SECOND[hash % CREATIVE_NAME_SECOND.length]}`;
  }

  return candidate;
}

function isOverusedCreativeName(name) {
  const normalized = normalizeCreativeName(name);
  return OVERUSED_CREATIVE_NAMES.some((overused) => {
    if (normalized === overused) {
      return true;
    }
    const normalizedWords = new Set(normalized.split(/\s+/).filter(Boolean));
    const overusedWords = overused.split(/\s+/).filter(Boolean);
    const shared = overusedWords.filter((word) => normalizedWords.has(word)).length;
    return overusedWords.length > 1 && shared === overusedWords.length;
  });
}

function normalizeCreativeName(name) {
  return stripLatinAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value ?? "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildFallbackNameEn(name) {
  return titleCase(transliterate(name))
    .replaceAll("Pivoine De Paris", "Pivoine de Paris")
    .replaceAll("Rose Amour", "Rose Amour")
    .replaceAll("Parfum De Route", "Parfum de Route")
    .replaceAll("Jardin Secret", "Jardin Secret")
    .replaceAll("Mon Amour", "Mon Amour");
}

function buildUkDescription(name, baseName, category) {
  if (category.includes("Букети") || category.includes("Квіти")) {
    return `${name} має м'яку французьку подачу і тримається на конкретній формі, відтінках та фактурі композиції. ${titleCase(baseName)} доречно виглядає для привітання, побачення або особистого компліменту без зайвої урочистості.`;
  }
  if (category.includes("Арома")) {
    return `${name} додає простору делікатний ароматний акцент і відчуття доглянутої атмосфери. Це маленька деталь з настроєм Nouvel Amour: красиво, ненав'язливо і з легким французьким шармом.`;
  }
  if (category.includes("Кімнатні рослини")) {
    return `${name} приносить у простір живий зелений акцент і спокійний настрій. Рослина залишається поруч надовго, тому важливо показувати її реальну наявність і стан.`;
  }
  if (category.includes("Кульки")) {
    return `${name} додає святу легкості, руху і яскравого настрою. Гарний варіант для сюрпризу, фотозони або доповнення до квітів у стилі Nouvel Amour.`;
  }

  return `${name} додає замовленню зрозумілий предметний акцент: виглядає охайно, доречно і легко поєднується з квітами або іншим подарунком. Така деталь робить вручення більш особистим без зайвого пафосу й залишається приємною частиною спогаду.`;
}

function buildEnDescription(name, baseName, category) {
  if (category.includes("Букети") || category.includes("Квіти")) {
    return `${buildFallbackNameEn(name)} is a French-inspired floral composition made for moments that deserve more than an ordinary gift. ${titleCase(transliterate(baseName))} feels tender, elegant and memorable.`;
  }
  return `${buildFallbackNameEn(name)} by Nouvel Amour is a thoughtful gift with a soft boutique mood and a refined French touch.`;
}

function createSku(category) {
  const prefixes = {
    "Арома товари": "AR",
    "Листівки": "CR",
    "Іграшки": "TY",
    "Квіти в коробках": "BX",
    "Декор та подарунки": "DC",
    "Букети": "BQ",
    "Кімнатні рослини": "PL",
    "Авторські роботи By Lesnikov": "LS",
    "Гарячі пропозиції": "HP"
  };
  const prefix = prefixes[category] ?? "NA";
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${random}`;
}

function createDraftId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `draft-${stamp}-${random}`;
}

function titleCase(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function slugify(value) {
  return transliterate(stripLatinAccents(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripLatinAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function transliterate(value) {
  const map = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z",
    и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ю: "yu", я: "ya", ь: "", "'": ""
  };

  return String(value)
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const converted = map[lower] ?? char;
      return char === lower ? converted : converted.charAt(0).toUpperCase() + converted.slice(1);
    })
    .join("");
}
