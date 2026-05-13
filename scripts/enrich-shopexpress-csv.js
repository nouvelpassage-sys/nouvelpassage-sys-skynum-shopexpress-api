import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/enrich-shopexpress-csv.js <export.csv>");
  process.exit(1);
}

const input = readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(input);
const headers = rows[0];
const dataRows = rows.slice(1).filter((row) => row.length > 1);

const column = {
  name: 2,
  nameDescription: 3,
  categories: 8,
  vendor: 10,
  images: 11,
  attribute: 14,
  metaTitle: 25,
  metaDescription: 26,
  metaKeywords: 27,
  shortDescriptionUk: 28,
  shortDescriptionEn: 29
};

const stats = {
  rows: dataRows.length,
  metaTitleFilled: 0,
  metaDescriptionFilled: 0,
  metaKeywordsFilled: 0,
  shortDescriptionUkFilled: 0,
  shortDescriptionEnFilled: 0,
  shortDescriptionEnReplaced: 0,
  missingImages: 0
};

for (const row of dataRows) {
  ensureLength(row, headers.length);

  const product = readProduct(row);
  const content = buildContentUk(product);
  const englishContent = buildContentEn(product);

  if (!value(row[column.metaTitle])) {
    row[column.metaTitle] = content.metaTitle;
    stats.metaTitleFilled += 1;
  }

  if (!value(row[column.metaDescription])) {
    row[column.metaDescription] = content.metaDescription;
    stats.metaDescriptionFilled += 1;
  }

  if (!value(row[column.metaKeywords])) {
    row[column.metaKeywords] = content.metaKeywords;
    stats.metaKeywordsFilled += 1;
  }

  if (!value(row[column.shortDescriptionUk])) {
    row[column.shortDescriptionUk] = `{{Default}}${content.shortDescriptionHtml}`;
    stats.shortDescriptionUkFilled += 1;
  }

  if (!value(row[column.shortDescriptionEn])) {
    row[column.shortDescriptionEn] = `{{Default}}${englishContent.shortDescriptionHtml}`;
    stats.shortDescriptionEnFilled += 1;
  } else if (isMostlyCyrillic(stripHtml(value(row[column.shortDescriptionEn])))) {
    row[column.shortDescriptionEn] = `{{Default}}${englishContent.shortDescriptionHtml}`;
    stats.shortDescriptionEnReplaced += 1;
  }

  if (!value(row[column.images])) {
    stats.missingImages += 1;
  }
}

const parsed = parseOutputPath(inputPath);
const outputPath = join(parsed.dir, `${parsed.name}-seo-uk-en-filled${parsed.ext}`);
const reportPath = join(parsed.dir, `${parsed.name}-seo-uk-en-filled-report.json`);

writeFileSync(outputPath, toCsv([headers, ...dataRows]), "utf8");
writeFileSync(reportPath, JSON.stringify(stats, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, reportPath, stats }, null, 2));

function parseCsv(text, delimiter = ";") {
  const parsedRows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      parsedRows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    parsedRows.push(row);
  }

  return parsedRows;
}

function toCsv(csvRows, delimiter = ";") {
  return csvRows.map((row) => row.map(escapeCsv).join(delimiter)).join("\r\n") + "\r\n";
}

function escapeCsv(field) {
  const text = String(field ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function ensureLength(row, length) {
  while (row.length < length) {
    row.push("");
  }
}

function value(input) {
  return String(input ?? "").trim();
}

function parseOutputPath(filePath) {
  const ext = extname(filePath);
  return {
    dir: dirname(filePath),
    ext,
    name: basename(filePath, ext)
  };
}

function readProduct(row) {
  return {
    name: value(row[column.name]),
    subtitle: value(row[column.nameDescription]),
    categories: value(row[column.categories]),
    vendor: value(row[column.vendor]) || "Nouvel Amour Flowers",
    image: value(row[column.images]),
    attribute: value(row[column.attribute]),
    existingDescriptionUk: stripHtml(value(row[column.shortDescriptionUk])),
    existingDescriptionEn: stripHtml(value(row[column.shortDescriptionEn]))
  };
}

function stripHtml(inputText) {
  return inputText
    .replace(/\{\{Default\}\}/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildContentUk(product) {
  const kind = detectKind(product);
  const category = primaryCategory(product.categories);
  const cleanName = product.name.replace(/\s+/g, " ").trim();
  const titleSubject = `${cleanName}${kind.titleSuffix}`;
  const metaTitle = truncate(`${titleSubject} — купити з доставкою в Києві`, 68);
  const baseDescription = product.existingDescriptionUk || generatedDescriptionUk(product, kind, category);
  const metaDescription = truncate(
    `${cleanName}: ${kind.meta}. Замовляйте в Nouvel Amour Flowers з дбайливою доставкою по Києву.`,
    190
  );
  const metaKeywords = buildKeywords(cleanName, kind, category);
  const shortDescriptionHtml = `<p>${escapeHtml(baseDescription)}</p>`;

  return {
    metaTitle,
    metaDescription,
    metaKeywords,
    shortDescriptionHtml
  };
}

function buildContentEn(product) {
  const kind = detectKind(product);
  const category = primaryCategoryEn(product.categories);
  const cleanName = product.name.replace(/\s+/g, " ").trim();
  const englishName = transliterateProductName(cleanName);
  const metaTitle = truncate(`${englishName} — flower delivery in Kyiv`, 68);
  const baseDescription =
    !isMostlyCyrillic(product.existingDescriptionEn) && product.existingDescriptionEn
      ? product.existingDescriptionEn
      : generatedDescriptionEn(product, kind, category, englishName);
  const metaDescription = truncate(
    `${englishName}: ${kind.metaEn}. Order from Nouvel Amour Flowers with careful delivery across Kyiv.`,
    190
  );
  const metaKeywords = buildKeywordsEn(englishName, kind, category);
  const shortDescriptionHtml = `<p>${escapeHtml(baseDescription)}</p>`;

  return {
    metaTitle,
    metaDescription,
    metaKeywords,
    shortDescriptionHtml
  };
}

function detectKind(product) {
  const haystack = `${product.name} ${product.categories} ${product.attribute}`.toLowerCase();

  if (haystack.includes("кульк")) {
    return {
      titleSuffix: "",
      key: "balloon",
      meta: "святковий аксесуар для оформлення подарунка, фотозони або доставки-сюрпризу",
      metaEn: "a festive detail for a gift, photo zone, or surprise delivery",
      description:
        "Стильна святкова деталь, яка допоможе зробити подарунок яскравішим і створити потрібний настрій для особливої події."
    };
  }

  if (haystack.includes("вазон") || haystack.includes("рослин") || haystack.includes("цикас") || haystack.includes("хойя") || haystack.includes("хедера") || haystack.includes("шефлера")) {
    return {
      titleSuffix: " кімнатна рослина",
      key: "plant",
      meta: "жива кімнатна рослина для дому, офісу або подарунка",
      metaEn: "a live indoor plant for home, office, or a thoughtful gift",
      description:
        "Жива кімнатна рослина для затишного інтер’єру або турботливого подарунка. Перед доставкою ми перевіряємо стан рослини та пакуємо її так, щоб вона приїхала акуратно."
    };
  }

  if (haystack.includes("арома") || haystack.includes("дифузор") || haystack.includes("лампа")) {
    return {
      titleSuffix: "",
      key: "aroma",
      meta: "ароматний аксесуар для дому, подарунка або атмосферного декору",
      metaEn: "a scented home accessory for a gift or atmospheric decor",
      description:
        "Ароматний аксесуар для дому чи подарунка, який допомагає створити теплу атмосферу та красиво доповнює квіткову композицію."
    };
  }

  if (haystack.includes("листівка")) {
    return {
      titleSuffix: "",
      key: "card",
      meta: "додаток до букета для теплого персонального привітання",
      metaEn: "an add-on for a bouquet with a warm personal message",
      description:
        "Листівка допоможе додати до букета особисті слова й зробити подарунок більш зворушливим, уважним і завершеним."
    };
  }

  if (haystack.includes("коробка")) {
    return {
      titleSuffix: "",
      key: "box",
      meta: "квіткова композиція в коробці для ефектного подарунка",
      metaEn: "a flower arrangement in a box for an elegant gift",
      description:
        "Квіткова композиція в коробці виглядає елегантно та зручно дарується без додаткової вази. Підійде для романтичного жесту, привітання або особливої події."
    };
  }

  return {
    titleSuffix: "",
    key: "flowers",
    meta: "свіжа флористична композиція для подарунка, події або красивого жесту",
    metaEn: "a fresh floral arrangement for a gift, event, or beautiful gesture",
    description:
      "Свіжа флористична композиція від Nouvel Amour Flowers, створена для красивого подарунка, ніжного привітання або особливого моменту. Дбайливо збираємо та доставляємо по Києву."
  };
}

function primaryCategory(categories) {
  const first = categories.split(";").map((item) => item.trim()).find(Boolean) ?? "";
  return normalizeCategory(first.split("/").map((item) => item.trim()).filter(Boolean).at(-1) ?? "");
}

function primaryCategoryEn(categories) {
  const category = primaryCategory(categories);
  const dictionary = new Map([
    ["Гарячі пропозиції", "Hot offers"],
    ["Сезонні букети", "Seasonal bouquets"],
    ["Екзотичні букети", "Exotic bouquets"],
    ["Авторські букети", "Designer bouquets"],
    ["Кімнатні рослини", "Indoor plants"],
    ["Доповнення до товарів", "Gift add-ons"]
  ]);

  return dictionary.get(category) ?? transliterateProductName(category);
}

function generatedDescriptionUk(product, kind, category) {
  const details = [];

  if (category) {
    details.push(`Категорія: ${category}.`);
  }

  if (product.attribute) {
    details.push(`Особливість: ${product.attribute}.`);
  }

  return `${kind.description} ${details.join(" ")}`.replace(/\s+/g, " ").trim();
}

function generatedDescriptionEn(product, kind, category, englishName) {
  const details = [];

  if (category) {
    details.push(`Category: ${category}.`);
  }

  if (product.attribute) {
    details.push(`Feature: ${transliterateProductName(product.attribute)}.`);
  }

  const descriptions = {
    balloon:
      "A stylish festive detail that makes a gift brighter and helps create the right mood for a birthday, surprise, or special celebration.",
    plant:
      "A live indoor plant for a cozy interior or a thoughtful gift. Before delivery, we check the plant condition and pack it carefully.",
    aroma:
      "A scented accessory for the home or a gift, designed to create a warm atmosphere and beautifully complement a floral arrangement.",
    card:
      "A greeting card adds personal words to a bouquet and makes the gift feel warmer, more thoughtful, and complete.",
    box:
      "A flower arrangement in a box looks elegant and is easy to gift without an additional vase. A beautiful choice for a romantic gesture, greeting, or special occasion.",
    flowers:
      "A fresh floral arrangement by Nouvel Amour Flowers, created for a beautiful gift, a gentle greeting, or a special moment. We assemble it with care and deliver across Kyiv."
  };

  return `${englishName}. ${descriptions[kind.key] ?? descriptions.flowers} ${details.join(" ")}`
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywords(name, kind, category) {
  const base = [
    name,
    category,
    "купити квіти Київ",
    "доставка квітів Київ",
    "Nouvel Amour Flowers"
  ];

  if (kind.titleSuffix.includes("кімнатна")) {
    base.push("кімнатні рослини Київ");
  } else if (kind.meta.includes("флористична") || name.toLowerCase().includes("букет")) {
    base.push("букет Київ");
  }

  return [...new Set(base.filter(Boolean))].join(", ");
}

function buildKeywordsEn(name, kind, category) {
  const base = [
    name,
    category,
    "flower delivery Kyiv",
    "buy flowers Kyiv",
    "Nouvel Amour Flowers"
  ];

  if (kind.key === "plant") {
    base.push("indoor plants Kyiv");
  } else if (kind.key === "flowers" || name.toLowerCase().includes("bouquet")) {
    base.push("bouquet Kyiv");
  }

  return [...new Set(base.filter(Boolean))].join(", ");
}

function normalizeCategory(category) {
  return category
    .replace(/пропозоціїї/gi, "пропозиції")
    .replace(/сезоні/gi, "сезонні")
    .replace(/\s+/g, " ")
    .trim();
}

function isMostlyCyrillic(text) {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  if (letters.length < 8) {
    return false;
  }

  const cyrillic = letters.filter((letter) => /\p{Script=Cyrillic}/u.test(letter)).length;
  return cyrillic / letters.length > 0.35;
}

function transliterateProductName(text) {
  const dictionary = new Map([
    ["Букет", "Bouquet"],
    ["Квіти", "Flowers"],
    ["Квітів", "Flowers"],
    ["Квіткова", "Flower"],
    ["Композиція", "Arrangement"],
    ["Коробка", "Box"],
    ["Листівка", "Greeting card"],
    ["Кулька", "Balloon"],
    ["Кульки", "Balloons"],
    ["Аромадифузер", "Aroma diffuser"],
    ["Арома", "Aroma"],
    ["Лампа", "Lamp"],
    ["Керамічний", "Ceramic"],
    ["вазон", "pot"],
    ["Вазон", "Pot"],
    ["кімнатна", "indoor"],
    ["рослина", "plant"],
    ["рослини", "plants"],
    ["з", "with"],
    ["у", "in"],
    ["та", "and"],
    ["для", "for"]
  ]);

  return String(text ?? "")
    .split(/(\s+|-|—|,|")/)
    .map((part) => dictionary.get(part) ?? part)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  const clipped = text.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 40 ? lastSpace : clipped.length).trim()}…`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
