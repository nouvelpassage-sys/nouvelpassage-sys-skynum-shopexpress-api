export const DEFAULT_MAIN_PAGE_ORDER = 1;

export const PUSH_NOTIFICATION_SCHEDULE = [
  {
    key: "morning",
    time: "10:30",
    audience: "all_clients",
    topic: "new_products"
  },
  {
    key: "evening",
    time: "18:30",
    audience: "all_clients",
    topic: "new_flowers_and_discounts"
  }
];

export function buildMerchandisingProfile(draft) {
  return {
    showOnMainPage: true,
    order: DEFAULT_MAIN_PAGE_ORDER,
    hashtags: buildSalesBoxHashtags(draft)
  };
}

export function buildSalesBoxHashtags(draft) {
  const values = [
    "novynka",
    "haryacha-vitrine",
    getPriceBucketTag(draft.price),
    ...getOccasionTags(draft),
    getCategoryTag(draft.category)
  ].filter(Boolean);

  return [...new Set(values)].map((value) => ({
    value,
    showToClient: true,
    availableForSearch: true
  }));
}

function getPriceBucketTag(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 1000) {
    return "tsina-do-1000";
  }
  if (value < 2000) {
    return "tsina-1000-2000";
  }
  if (value < 3500) {
    return "tsina-2000-3500";
  }
  return "tsina-3500-plus";
}

function getOccasionTags(draft) {
  const source = [
    draft.sourceText,
    draft.productTypeUk,
    draft.visibleSummaryUk,
    draft.descriptionUk,
    draft.category
  ].filter(Boolean).join(" ").toLowerCase();

  const tags = [];
  if (/\b(love|romantic|wedding|bride|anniversary)\b|кохан|романт|весіл|нареч|річниц/i.test(source)) {
    tags.push("podija-romantyka");
  }
  if (/\b(birthday|bday)\b|день народ|народжен/i.test(source)) {
    tags.push("podija-den-narodzhennia");
  }
  if (/\b(corporate|office|business)\b|корпорат|офіс|бізнес/i.test(source)) {
    tags.push("podija-biznes");
  }
  if (/\b(home|interior|plant)\b|дім|дому|інтер.?єр|рослин|вазон/i.test(source)) {
    tags.push("podija-dlia-domu");
  }
  if (/зниж|акц|sale|discount|hot/i.test(source)) {
    tags.push("novi-znizhky");
  }

  return tags.length ? tags : ["podija-podarunok"];
}

function getCategoryTag(category) {
  const normalized = String(category ?? "").toLowerCase();
  if (/aroma|арома/i.test(normalized)) return "typ-aroma";
  if (/plant|рослин|вазон/i.test(normalized)) return "typ-roslyny";
  if (/box|короб/i.test(normalized)) return "typ-korobky";
  if (/toy|іграш/i.test(normalized)) return "typ-ihrashky";
  if (/card|лист/i.test(normalized)) return "typ-lystivky";
  if (/bouquet|букет/i.test(normalized)) return "typ-bukety";
  return "typ-nouvel";
}
