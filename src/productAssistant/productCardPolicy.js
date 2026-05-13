export const PRODUCT_CARD_PLAYBOOK = {
  role: "Nouvel Amour senior ecommerce editor",
  coreContract: [
    "Classify the real physical product first. A bouquet, flower box, or living plant must never become decor just because it is gift-ready.",
    "OCR first: read visible labels, stickers, tags, packaging, and plant pot text before guessing from the image.",
    "If a plant label or product label is readable, use it as the strongest factual evidence for productType and visibleSummary.",
    "nameUk/nameEn are only creative collection names. They must not contain product type, flower species, colors, packaging, or category words.",
    "productTypeUk/productTypeEn carry factual clarity: bouquet, flower box, plant, aroma diffuser, toy, postcard, accessory.",
    "descriptionUk must start from visible facts: product type, form, color palette, packaging, texture, material, or function.",
    "Flower descriptions must not list bouquet or composition ingredients. Do not name flower species or greenery in the public description.",
    "Indoor plant descriptions must not narrate obvious leaves, flowers, or white spathes from the photo. Use the label name for product type and write the public description around mood, placement, and lasting gift value.",
    "Never use generic premium filler. If a sentence could fit any product, rewrite it.",
    "SEO must be factual and restrained: no invented delivery, guarantees, exact counts, materials, size, or varieties."
  ],
  goodPattern:
    "Creative name: 'Lumiere Douce'. Product type: 'букет півоній'. Description: factual visible composition first, then one restrained boutique sentence.",
  badPatterns: [
    "Декоративний подарунок створено з увагою і гармонією форми.",
    "Гарний букет для особливого моменту.",
    "Товар у категорії ...",
    "Підійде для подарунка, доповнення до квітів або самостійного замовлення."
  ]
};

const NAME_STOP_WORD_PATTERNS = [
  /\b(букет|букети|квіт\p{L}*|композиці\p{L}*|короб\p{L}*|подарунок|подарунков\p{L}*|листівк\p{L}*|іграшк\p{L}*|рослин\p{L}*|горщик\p{L}*)\b/iu,
  /\b(троян\p{L}*|піон\p{L}*|півон\p{L}*|гортенз\p{L}*|лілі\p{L}*|еустом\p{L}*|орхіде\p{L}*|ранункул\p{L}*|тюльпан\p{L}*|хризантем\p{L}*|ромаш\p{L}*|альстромер\p{L}*|гіпсофіл\p{L}*)\b/iu,
  /\b(червон\p{L}*|рожев\p{L}*|білий|біла|білі|біле|кремов\p{L}*|жовт\p{L}*|син\p{L}*|блакит\p{L}*|фіолет\p{L}*|лілов\p{L}*|зелен\p{L}*|помаранч\p{L}*|персиков\p{L}*|бордов\p{L}*)\b/iu,
  /\b(bouquet|flower\p{L}*|arrangement|box|gift|card|toy|plant|potted|rose\p{L}*|peon\p{L}*|pivoine|hydrangea|orchid|lily|tulip|white|pink|red|cream|yellow|blue|violet|purple|green|orange)\b/iu
];

const NAME_STOP_WORD_STEMS = [
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

export function hasProductNameStopWords(name) {
  const text = String(name ?? "");
  const latin = transliterateForPolicy(stripLatinAccents(text)).toLowerCase();
  return NAME_STOP_WORD_PATTERNS.some((pattern) => pattern.test(text)) ||
    NAME_STOP_WORD_STEMS.some((stem) => latin.includes(stem));
}

export function transliterateForPolicy(value) {
  const map = {
    а: "a",
    б: "b",
    в: "v",
    г: "h",
    ґ: "g",
    д: "d",
    е: "e",
    є: "ye",
    ж: "zh",
    з: "z",
    и: "y",
    і: "i",
    ї: "yi",
    й: "y",
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
    ю: "yu",
    я: "ya",
    ь: "",
    "'": ""
  };

  return String(value ?? "")
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const converted = map[lower] ?? char;
      return char === lower ? converted : converted.charAt(0).toUpperCase() + converted.slice(1);
    })
    .join("");
}

function stripLatinAccents(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
