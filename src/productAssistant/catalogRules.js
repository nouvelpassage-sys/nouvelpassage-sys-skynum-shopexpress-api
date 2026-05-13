export const CATEGORY_RULES = [
  {
    category: "Арома товари",
    match: ["арома", "автопарфум", "дифузор", "свіч", "саше", "аромаламп", "парфум", "aroma", "diffuser", "candle"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Aroma",
    description: "Свічки, аромадифузори, автопарфуми, аромалампи та інша ароматична продукція."
  },
  {
    category: "Листівки",
    match: ["листів", "листив", "card", "audiolist", "аудіолист"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "Листівки, аудіолистівки та невеликі додатки з персональним привітанням."
  },
  {
    category: "Іграшки",
    match: ["іграш", "ведмед", "зайчик", "котик", "м'яка", "bunny", "bear", "toy", "stitch"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "М'які іграшки та подарункові персонажі."
  },
  {
    category: "Квіти в коробках",
    match: ["короб", "box", "hatbox", "композиці", "кошик", "basket", "flower box"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour",
    description: "Квіткові композиції у коробках, кошиках або інших готових формах."
  },
  {
    category: "Кімнатні рослини",
    match: ["рослин", "вазон", "plant", "potted", "монстер", "орхіде", "фікус", "калате", "шлюмбер", "горщик", "кашпо"],
    stockMode: "counted",
    defaultBrand: "Nouvel Amour Plants",
    description: "Живі кімнатні рослини у горщиках, кашпо або декоративній упаковці; для них важливий реальний залишок. Упаковка не переносить живу рослину в декор."
  },
  {
    category: "Декор та подарунки",
    match: ["декор", "кераміч", "аксесуар", "подар", "gift", "decor"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "Неживий декор, аксесуари, подарункові товари та позиції, які не належать до інших категорій. Живі рослини навіть в упаковці належать до кімнатних рослин."
  },
  {
    category: "Букети",
    match: ["букет", "bouquet", "троянд", "півон", "квіти", "ранункул", "гортенз", "лілі", "еустом"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Flowers",
    description: "Ручні букети та зрізані квіти, оформлені як букет."
  },
  {
    category: "Авторські роботи By Lesnikov",
    match: ["by lesnikov", "лесников", "lesnikov", "авторськ"],
    stockMode: "unlimited",
    defaultBrand: "By Lesnikov",
    description: "Авторські флористичні роботи та дизайнерські позиції By Lesnikov."
  },
  {
    category: "Гарячі пропозиції",
    match: ["гаряч", "пропоз", "hot", "sale", "акці"],
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour",
    description: "Акційні або гарячі пропозиції, якщо позиція справді належить до цієї категорії."
  }
];

export function getAllowedCategories() {
  return CATEGORY_RULES.map((rule) => rule.category);
}

export function getCategoryPromptList() {
  return CATEGORY_RULES.map((rule) => ({
    name: rule.category,
    stockMode: rule.stockMode,
    description: rule.description
  }));
}

export function detectCategory(input) {
  const normalized = normalize(input);
  const plantRule = getCategoryRule("Кімнатні рослини");
  if (plantRule?.match.some((word) => normalized.includes(normalize(word)))) {
    return plantRule;
  }

  const rule = CATEGORY_RULES.find((candidate) =>
    candidate.match.some((word) => normalized.includes(normalize(word)))
  );

  return rule ?? getDefaultCategoryRule();
}

export function getCategoryRule(category) {
  const normalized = normalize(category);
  return CATEGORY_RULES.find((candidate) => normalize(candidate.category) === normalized) ?? null;
}

export function resolveCategoryRule({ generatedCategory, fallbackCategory, evidence }) {
  const exactGenerated = getCategoryRule(generatedCategory);
  const detectedFromEvidence = detectCategory(evidence);
  const defaultCategory = getDefaultCategoryRule().category;

  if (exactGenerated?.category === defaultCategory && detectedFromEvidence.category !== defaultCategory) {
    return { ...detectedFromEvidence, categoryWasCorrected: true };
  }

  if (exactGenerated) {
    return { ...exactGenerated, categoryWasCorrected: false };
  }

  if (detectedFromEvidence.category !== defaultCategory) {
    return { ...detectedFromEvidence, categoryWasCorrected: true };
  }

  const fallback = getCategoryRule(fallbackCategory) ?? getDefaultCategoryRule();
  return { ...fallback, categoryWasCorrected: Boolean(generatedCategory && generatedCategory !== fallback.category) };
}

function getDefaultCategoryRule() {
  return {
    category: "Декор та подарунки",
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "Декор, аксесуари, подарункові товари та позиції, які не належать до інших категорій."
  };
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replaceAll("’", "'")
    .replace(/\s+/g, " ")
    .trim();
}
