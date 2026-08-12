export const CATEGORY_RULES = [
  {
    category: "Арома товари",
    match: ["арома", "автопарфум", "дифузор", "свіч", "саше", "аромаламп", "парфум", "aroma", "diffuser", "candle"],
    aliases: ["арома", "ароматика", "ароматичні товари", "ароматична продукція"],
    strongMatch: ["автопарфум", "дифузор", "свіч", "саше", "аромаламп", "парфум", "diffuser", "candle"],
    priority: 100,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Aroma",
    description: "Свічки, аромадифузори, автопарфуми, аромалампи та інша ароматична продукція."
  },
  {
    category: "Листівки",
    match: ["листів", "листив", "card", "audiolist", "аудіолист"],
    aliases: ["листівки", "листівка", "аудіолистівки"],
    strongMatch: ["листів", "листив", "card", "audiolist", "аудіолист"],
    priority: 80,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "Листівки, аудіолистівки та невеликі додатки з персональним привітанням."
  },
  {
    category: "Іграшки",
    match: ["іграш", "ведмед", "зайчик", "котик", "м'яка", "bunny", "bear", "toy", "stitch"],
    aliases: ["іграшки", "іграшка", "м'які іграшки"],
    strongMatch: ["іграш", "ведмед", "зайчик", "котик", "bunny", "bear", "toy", "stitch"],
    priority: 95,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "М'які іграшки та подарункові персонажі."
  },
  {
    category: "Квіти в коробках",
    match: ["короб", "box", "hatbox", "композиці", "кошик", "basket", "flower box"],
    aliases: ["квіти в коробках", "квіти в коробці", "композиції в коробках", "коробки"],
    strongMatch: ["короб", "box", "hatbox", "кошик", "basket", "flower box"],
    priority: 110,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour",
    description: "Квіткові композиції у коробках, кошиках або інших готових формах."
  },
  {
    category: "Кімнатні рослини",
    match: ["рослин", "вазон", "plant", "potted", "монстер", "орхіде", "фікус", "калате", "шлюмбер", "горщик", "кашпо"],
    aliases: ["кімнатні рослини", "кімнатна рослина", "вазони", "рослини"],
    strongMatch: ["рослин", "вазон", "plant", "potted", "монстер", "орхіде", "фікус", "калате", "шлюмбер", "горщик", "кашпо"],
    priority: 120,
    stockMode: "counted",
    defaultBrand: "Nouvel Amour Plants",
    description: "Живі кімнатні рослини у горщиках, кашпо або декоративній упаковці; для них важливий реальний залишок. Упаковка не переносить живу рослину в декор."
  },
  {
    category: "Декор та подарунки",
    match: ["декор", "кераміч", "аксесуар", "подар", "gift", "decor"],
    aliases: ["декор та подарунки", "декор", "подарунки", "аксесуари"],
    strongMatch: ["декор", "кераміч", "аксесуар", "gift", "decor"],
    priority: 20,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Gifts",
    description: "Неживий декор, аксесуари, подарункові товари та позиції, які не належать до інших категорій. Живі рослини навіть в упаковці належать до кімнатних рослин."
  },
  {
    category: "Букети",
    match: ["букет", "bouquet", "троянд", "півон", "квіти", "ранункул", "гортенз", "лілі", "еустом"],
    aliases: ["букети", "букет", "зрізані квіти", "квіткові букети"],
    strongMatch: ["букет", "bouquet", "троянд", "півон", "квіти", "ранункул", "гортенз", "лілі", "еустом"],
    priority: 90,
    stockMode: "unlimited",
    defaultBrand: "Nouvel Amour Flowers",
    description: "Ручні букети та зрізані квіти, оформлені як букет."
  },
  {
    category: "Авторські роботи By Lesnikov",
    match: ["by lesnikov", "лесников", "lesnikov", "авторськ"],
    aliases: ["авторські роботи", "by lesnikov", "lesnikov"],
    strongMatch: ["by lesnikov", "лесников", "lesnikov", "авторськ"],
    priority: 115,
    stockMode: "unlimited",
    defaultBrand: "By Lesnikov",
    description: "Авторські флористичні роботи та дизайнерські позиції By Lesnikov."
  },
  {
    category: "Гарячі пропозиції",
    match: ["гаряч", "пропоз", "hot", "sale", "акці"],
    aliases: ["гарячі пропозиції", "гаряча вітрина", "акції", "знижки"],
    strongMatch: ["гаряч", "hot", "sale", "акці"],
    priority: 105,
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
    aliases: rule.aliases ?? [],
    stockMode: rule.stockMode,
    description: rule.description
  }));
}

export function detectCategory(input) {
  const normalized = normalize(input);
  const ranked = CATEGORY_RULES
    .map((rule) => {
      const matches = rule.match.filter((word) => normalized.includes(normalize(word)));
      const strongMatches = (rule.strongMatch ?? rule.match).filter((word) => normalized.includes(normalize(word)));
      return {
        rule,
        score: strongMatches.length * 100 + matches.length * 10 + (rule.priority ?? 0)
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.rule ?? getDefaultCategoryRule();
}

export function getCategoryAliases(category) {
  const rule = getCategoryRule(category);
  return rule ? [rule.category, ...(rule.aliases ?? [])] : [];
}

export function getCategoryRule(category) {
  const normalized = normalize(category);
  return CATEGORY_RULES.find((candidate) => [candidate.category, ...(candidate.aliases ?? [])]
    .some((value) => normalize(value) === normalized)) ?? null;
}

export function resolveCategoryRule({ generatedCategory, fallbackCategory, evidence }) {
  const exactGenerated = getCategoryRule(generatedCategory);
  const detectedFromEvidence = detectCategory(evidence);
  const defaultCategory = getDefaultCategoryRule().category;

  if (detectedFromEvidence.category !== defaultCategory && exactGenerated?.category !== detectedFromEvidence.category) {
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
