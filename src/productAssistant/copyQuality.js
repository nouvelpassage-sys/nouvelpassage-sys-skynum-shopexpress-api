import { transliterateForPolicy } from "./productCardPolicy.js";

const DRY_COMPOSITION_PATTERNS = [
  /^букет\s+[\p{L}\s,'"-]+$/iu,
  /^композиція\s+[\p{L}\s,'"-]+$/iu
];

const BANNED_COPY_PHRASES = [
  "свято душі",
  "особливі моменти",
  "особливих момент",
  "особливий момент",
  "незабутні моменти",
  "елегантний та живий акцент",
  "не просто квіти, а настрій",
  "продуманий жест",
  "доповнює замовлення",
  "знак уваги",
  "декоративний подарунок",
  "декоративного подарунка",
  "гарний букет",
  "гарний варіант",
  "створений з увагою",
  "створена з увагою",
  "створено з увагою",
  "з увагою і гармонією",
  "гармонія форми",
  "гармонією форми",
  "красивий жест",
  "маленького свята",
  "додає замовленню характеру",
  "завершує композицію",
  "візуально цілісним",
  "шикарний",
  "найкращий",
  "вау",
  "ідеальний",
  "ідеальна",
  "ідеальні",
  "ідеально",
  "будь-який привід",
  "густим листям",
  "густе листя",
  "зеленим листям",
  "білим покривалом",
  "білими покривалами",
  "білими квітами",
  "цвіте білими",
  "цвіте білим",
  "варто описувати",
  "так покупець",
  "опис має",
  "важливо показати",
  "мають бути очевидними"
];

const PLANT_OBVIOUS_PHRASES = [
  "густим листям",
  "густе листя",
  "зеленим листям",
  "білим покривалом",
  "білими покривалами",
  "білими квітами",
  "цвіте білими",
  "цвіте білим",
  "листям і білими",
  "листя і білі"
];

export function improveShortDescription({ description, name, productType, category, visibleSummary, sourceText }) {
  const text = String(description ?? "").trim();
  if (!needsImprovement(text, category)) {
    return ensureMainFlowerDetails(text, { productType, visibleSummary, sourceText });
  }

  if (isFlowerCategory(category)) {
    return ensureMainFlowerDetails(buildFlowerDescription({ name, productType, visibleSummary, sourceText }), {
      productType,
      visibleSummary,
      sourceText
    });
  }

  let type = String(productType || name || "позиція Nouvel Amour").trim();
  if (hasBannedCopyPhrase(type)) {
    type = isPlantCategory(category) ? "кімнатна рослина Nouvel Amour" : "аксесуар Nouvel Amour";
  }

  if (isPlantCategory(category)) {
    return buildPlantDescription(type);
  }

  if (String(category).includes("Іграшки")) {
    return `${capitalize(type)} додає подарунку тепла без надмірної дитячості: виглядає охайно, м'яко і доречно поруч із квітами. Це хороший вибір для ніжного привітання, коли хочеться залишити щось на пам'ять після букета.`;
  }
  if (String(category).includes("Авторські роботи")) {
    return `${capitalize(type)} має вигляд завершеної флористичної роботи, а не випадкового набору квітів. У ній важливі форма, ритм і поєднання фактур, тому така позиція підходить для подарунка, який має виглядати індивідуально.`;
  }
  if (String(category).includes("Гарячі пропозиції")) {
    return `${capitalize(type)} зберігає відчуття преміальної флористики, але подається як спеціальна пропозиція. Це не компроміс у стилі, а готовий варіант для швидкого вибору красивого подарунка.`;
  }

  if (String(category).includes("Декор та подарунки")) {
    return `${capitalize(type)} працює як окрема деталь у замовленні: додає фактуру, колір або практичний акцент без зайвого пафосу. Такий аксесуар легко поєднується з квітами й робить вручення більш особистим, охайним і завершеним.`;
  }

  return `${capitalize(type)} виглядає охайно, доречно і легко поєднується з квітами або іншим подарунком. Це невелика деталь, яка робить вручення більш особистим і завершеним.`;
}

export function needsImprovement(description, category = "") {
  const text = String(description ?? "").trim();
  if (text.length < 110) {
    return true;
  }

  if (isFlowerCategory(category) && DRY_COMPOSITION_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (/букет\s+ручний\s+букет/i.test(text) || /букет\s+великий\s+букет/i.test(text)) {
    return true;
  }
  if (/букет\s+квіткова\s+композиція/i.test(text)) {
    return true;
  }
  if (isFlowerCategory(category) && hasFlowerCompositionDetails(text)) {
    return true;
  }
  if (isPlantCategory(category) && hasObviousPlantMorphology(text)) {
    return true;
  }

  return hasBannedCopyPhrase(text);
}

export function hasBannedCopyPhrase(value) {
  const lower = String(value ?? "").toLowerCase();
  return BANNED_COPY_PHRASES.some((phrase) => lower.includes(phrase));
}

export function hasFlowerCompositionDetails(value) {
  const latin = transliterateForPolicy(stripLatinAccents(value)).toLowerCase();
  const matches = FLOWER_COMPOSITION_DETAIL_STEMS.filter((stem) => latin.includes(stem));
  return matches.length >= 4;
}

export function ensureMainFlowerDetails(description, { productType, visibleSummary, sourceText } = {}) {
  const flowers = extractMainFlowers([productType, visibleSummary, sourceText].filter(Boolean).join(" "));
  if (!flowers.length) {
    return String(description ?? "").trim();
  }

  const normalized = String(description ?? "").trim();
  const missing = flowers.filter((flower) => !normalized.toLocaleLowerCase("uk-UA").includes(flower.toLocaleLowerCase("uk-UA")));
  if (!missing.length) {
    return normalized;
  }

  return `Основу букета формують ${missing.join(" та ")}; вони задають його впізнаваний настрій і фактуру. ${normalized}`;
}

export function hasObviousPlantMorphology(value) {
  const lower = String(value ?? "").toLowerCase();
  return PLANT_OBVIOUS_PHRASES.some((phrase) => lower.includes(phrase));
}

function buildFlowerDescription({ name, productType, visibleSummary, sourceText }) {
  const safeName = cleanSentence(name) || "Nouvel Amour";
  const flowers = extractMainFlowers([productType, visibleSummary, sourceText, name].filter(Boolean).join(" "));
  const flowerLead = flowers.length ? `${flowers.join(" та ")} у` : "флористична композиція у";
  return `${capitalize(flowerLead)} ${safeName} звучить витончено завдяки продуманому силуету, фактурі та делікатній палітрі Nouvel Amour. Це букет із французькою подачею для привітання, побачення або особистого компліменту, коли важливі не гучні слова, а точне відчуття моменту.`;
}

function extractMainFlowers(value) {
  const source = String(value ?? "");
  const terms = [
    ["троянд", "троянди"], ["півон", "півонії"], ["піон", "півонії"], ["гортенз", "гортензії"],
    ["лілі", "лілії"], ["еустом", "еустома"], ["ранункул", "ранункулюси"], ["орхіде", "орхідеї"],
    ["тюльпан", "тюльпани"], ["хризантем", "хризантеми"], ["бузк", "бузок"], ["гвоздик", "гвоздики"],
    ["rose", "троянди"], ["peon", "півонії"], ["hydrangea", "гортензії"], ["orchid", "орхідеї"],
    ["lily", "лілії"], ["tulip", "тюльпани"]
  ];
  return terms.filter(([stem]) => new RegExp(stem, "iu").test(source)).map(([, label]) => label).slice(0, 3);
}

function buildPlantDescription(type) {
  return `${capitalize(type)} працює як спокійний зелений акцент для дому, офісу або подарунка без зайвої урочистості. Це жива позиція, яка залишається поруч надовго й додає простору відчуття доглянутості.`;
}

const FLOWER_COMPOSITION_DETAIL_STEMS = [
  "troian",
  "troyan",
  "pion",
  "pivon",
  "hortenz",
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
  "buz",
  "buzk",
  "gvazd",
  "matthiol",
  "matiol",
  "evkalipt",
  "rose",
  "peony",
  "pivoine",
  "hydrangea",
  "orchid",
  "lily",
  "tulip",
  "carnation",
  "eucalyptus",
  "lisianthus"
];

function cleanSentence(value) {
  return String(value ?? "")
    .replace(/[.․]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isFlowerCategory(category = "") {
  return String(category).includes("Букети") || String(category).includes("Квіти");
}

function isPlantCategory(category = "") {
  return String(category).includes("Кімнатні рослини");
}

function capitalize(value) {
  const text = String(value ?? "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function stripLatinAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
