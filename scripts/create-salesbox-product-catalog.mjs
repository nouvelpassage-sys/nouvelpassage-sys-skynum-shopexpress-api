import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_INPUT =
  'C:\\Users\\milan\\OneDrive\\Desktop\\export-2026-05-10-17-24.csv';
const DEFAULT_OUTPUT_DIR =
  'C:\\Users\\milan\\OneDrive\\Desktop\\salesbox-product-load';

const input = process.argv[2] || DEFAULT_INPUT;
const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;

function parseDelimited(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function makeUniqueHeaders(headers) {
  const counts = new Map();
  return headers.map((header) => {
    const key = header.replace(/^\uFEFF/, '').trim();
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    return count === 0 ? key : `${key}_${count + 1}`;
  });
}

function toRecords(rows) {
  const headers = makeUniqueHeaders(rows[0] || []);
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || '';
    });
    return record;
  });
}

function normalizePrice(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const num = Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return '';
  return String(Math.round(num));
}

function splitList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function imageList(value) {
  return String(value || '')
    .split(/\s*[;,]\s*(?=https?:\/\/)/i)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function cleanName(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;!?])/g, '$1')
    .trim();
}

function slugUrl(alias) {
  const clean = String(alias || '').trim();
  return clean ? `https://www.nouvelamour.kiev.ua/shop/${clean}/` : '';
}

function firstCategory(categories) {
  return splitList(categories)[0] || '';
}

function salesboxCategory(record) {
  const haystack = `${record.Categories || ''} ${record.Name || ''}`.toLowerCase();

  if (/листів|листив|card|audiolist/.test(haystack)) return 'Листівки';
  if (/короб/.test(haystack)) return 'Квіти в коробках';
  if (/арома|свіч|свеч|дифуз|парфум|aroma/.test(haystack)) return 'Арома товари';
  if (/іграш|igrash|bunny|bear|toy/.test(haystack)) return 'Іграшки';
  if (/декор|аксесуар|аромаламп|подар/.test(haystack)) return 'Декор та подарунки';
  if (/кімнат|орх|рослин|калате|шлюмбер|plant|горщик/.test(haystack)) return 'Кімнатні рослини';
  if (/by lesnikov|авторськ/.test(haystack)) return 'Авторські роботи By Lesnikov';
  if (/гаряч|пропоз|hot/.test(haystack)) return 'Гарячі пропозиції';
  if (/додавай|доповн|цукер|raffaello|кульк|balloon/.test(haystack)) return 'Додавай до квітів';
  return 'Букети';
}

function availabilityPolicy(record) {
  const category = salesboxCategory(record);
  const stock = Number(String(record.InStock || '0').replace(',', '.')) || 0;

  if (category === 'Кімнатні рослини') {
    return stock > 0
      ? { status: 'В наявності', quantityType: 'За залишком', quantity: String(stock) }
      : { status: 'Очікується', quantityType: 'За залишком', quantity: '0' };
  }

  if (['Букети', 'Квіти в коробках', 'Авторські роботи By Lesnikov', 'Гарячі пропозиції'].includes(category)) {
    return { status: 'В наявності', quantityType: 'Необмежене', quantity: '' };
  }

  if (stock > 0) {
    return { status: 'В наявності', quantityType: 'За залишком', quantity: String(stock) };
  }

  return { status: 'В наявності', quantityType: 'Необмежене', quantity: '' };
}

function description(record, category) {
  const name = cleanName(record.Name);
  const price = normalizePrice(record.ActionPrice) || normalizePrice(record.Price);

  if (category === 'Квіти в коробках') {
    return `${name} - готова квіткова композиція у коробці від Nouvel Amour. Підійде для подарунка, романтичного привітання або важливої події. Доступна до замовлення з доставкою по Києву.`;
  }
  if (category === 'Арома товари') {
    return `${name} - ароматичний товар Nouvel Amour для дому, подарунка або доповнення до квітів. Додає атмосферу, стиль і завершеність композиції.`;
  }
  if (category === 'Кімнатні рослини') {
    return `${name} - кімнатна рослина для дому, офісу або подарунка. Перед відправкою рослина перевіряється флористами Nouvel Amour; наявність залежить від актуального залишку.`;
  }
  if (category === 'Іграшки') {
    return `${name} - м'який подарунок, який можна додати до букета або замовити окремо. Гарний варіант для теплих привітань і дитячих свят.`;
  }
  if (category === 'Листівки') {
    return `${name} - додаток до квітів або подарунка, щоб передати особисте привітання разом із замовленням.`;
  }
  if (category === 'Декор та подарунки') {
    return `${name} - декоративний або подарунковий товар Nouvel Amour, який можна замовити окремо чи додати до квіткової композиції.`;
  }

  return `${name} - авторська квіткова позиція Nouvel Amour з доставкою по Києву. Актуальна ціна${price ? `: ${price} грн` : ''}. Флористи зберігають загальний стиль і настрій композиції, враховуючи сезонність квітів.`;
}

function tagsFor(category, record) {
  const tags = ['Nouvel Amour'];
  if (category.includes('Букети') || category === 'Гарячі пропозиції') tags.push('букет', 'квіти', 'доставка Київ');
  if (category === 'Квіти в коробках') tags.push('квіти в коробці', 'композиція', 'подарунок');
  if (category === 'Арома товари') tags.push('арома', 'подарунок', 'для дому');
  if (category === 'Кімнатні рослини') tags.push('кімнатна рослина', 'рослина');
  if (category === 'Іграшки') tags.push('іграшка', 'подарунок');
  if (/lux|exclusive|премі/i.test(`${record.Name} ${record.Categories}`)) tags.push('premium');
  return [...new Set(tags)].join(', ');
}

function needsReview(record, category, images, price) {
  const reasons = [];
  if (!images.length) reasons.push('немає фото');
  if (!price) reasons.push('немає ціни');
  if (!record.Categories) reasons.push('немає категорії');
  if (/пропозоціїї|сезоні/i.test(record.Categories || '')) reasons.push('стара помилка в назві категорії');
  if (category === 'Кімнатні рослини' && Number(record.InStock || 0) <= 0) reasons.push('кімнатна рослина без залишку');
  return reasons;
}

function score(record, category, images, price, reviewReasons) {
  let value = 0;
  if (images.length) value += 3;
  if (price) value += 3;
  if (record.Categories) value += 2;
  if (!reviewReasons.length) value += 2;
  if (['Букети', 'Квіти в коробках', 'Арома товари', 'Іграшки', 'Декор та подарунки', 'Листівки'].includes(category)) value += 1;
  return value;
}

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\r\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeCsv(filePath, rows, headers) {
  const lines = [headers.join(';')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(';'));
  }
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

const sourceText = fs.readFileSync(input, 'utf8');
const records = toRecords(parseDelimited(sourceText));
const products = new Map();

for (const record of records) {
  const id = String(record.ID || record.Sku || record.Alias || '').trim();
  if (!id || id.startsWith('<')) continue;
  const current = products.get(id) || {};
  for (const [key, value] of Object.entries(record)) {
    if (!current[key] && value) current[key] = value;
    if (['Images', 'Categories', 'Name', 'Price', 'ActionPrice', 'MetaDescription', 'ShortDescription'].includes(key)) {
      if (value && String(value).length > String(current[key] || '').length) current[key] = value;
    }
  }
  products.set(id, current);
}

const prepared = [];
for (const record of products.values()) {
  const name = cleanName(record.Name);
  const images = imageList(record.Images);
  const regularPrice = normalizePrice(record.Price);
  const salePrice = normalizePrice(record.ActionPrice);
  const activePrice = salePrice || regularPrice;
  const category = salesboxCategory(record);
  const availability = availabilityPolicy(record);
  const reviewReasons = needsReview(record, category, images, activePrice);

  prepared.push({
    source_id: record.ID || '',
    external_id: record.ExternalID || record.ID || '',
    sku: record.Sku || '',
    name_uk: name,
    description_uk: description(record, category),
    regular_price_uah: regularPrice,
    sale_price_uah: salePrice,
    active_price_uah: activePrice,
    source_categories: record.Categories || '',
    salesbox_category: category,
    primary_image_url: images[0] || '',
    image_urls: images.join(', '),
    source_url: slugUrl(record.Alias),
    brand: record.Vendor || 'Nouvel Amour',
    status: availability.status,
    quantity_type: availability.quantityType,
    quantity: availability.quantity,
    unit: record.Unit || 'шт',
    tags: tagsFor(category, record),
    needs_review: reviewReasons.length ? 'yes' : 'no',
    review_reason: reviewReasons.join('; '),
    load_score: score(record, category, images, activePrice, reviewReasons),
  });
}

prepared.sort((a, b) => {
  const scoreDiff = Number(b.load_score) - Number(a.load_score);
  if (scoreDiff) return scoreDiff;
  return a.name_uk.localeCompare(b.name_uk, 'uk');
});

const ready = prepared.filter((item) => item.primary_image_url && item.active_price_uah && item.salesbox_category);
const testBatch = ready
  .filter((item) => item.needs_review === 'no')
  .filter((item) => !['Кімнатні рослини'].includes(item.salesbox_category) || Number(item.quantity || 0) > 0)
  .slice(0, 20);

fs.mkdirSync(outputDir, { recursive: true });

const headers = [
  'source_id',
  'external_id',
  'sku',
  'name_uk',
  'description_uk',
  'regular_price_uah',
  'sale_price_uah',
  'active_price_uah',
  'source_categories',
  'salesbox_category',
  'primary_image_url',
  'image_urls',
  'source_url',
  'brand',
  'status',
  'quantity_type',
  'quantity',
  'unit',
  'tags',
  'needs_review',
  'review_reason',
  'load_score',
];

writeCsv(path.join(outputDir, 'salesbox-products-all.csv'), prepared, headers);
writeCsv(path.join(outputDir, 'salesbox-products-ready.csv'), ready, headers);
writeCsv(path.join(outputDir, 'salesbox-products-test-batch-20.csv'), testBatch, headers);

const report = {
  input,
  outputDir,
  totals: {
    sourceRows: records.length,
    uniqueProducts: prepared.length,
    readyWithImagePriceCategory: ready.length,
    testBatch: testBatch.length,
    needsReview: prepared.filter((item) => item.needs_review === 'yes').length,
  },
  byCategory: prepared.reduce((acc, item) => {
    acc[item.salesbox_category] = (acc[item.salesbox_category] || 0) + 1;
    return acc;
  }, {}),
  reviewReasons: prepared.reduce((acc, item) => {
    for (const reason of item.review_reason.split('; ').filter(Boolean)) {
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {}),
  firstTestBatch: testBatch.map((item) => ({
    source_id: item.source_id,
    name_uk: item.name_uk,
    salesbox_category: item.salesbox_category,
    active_price_uah: item.active_price_uah,
    primary_image_url: item.primary_image_url,
  })),
};

fs.writeFileSync(path.join(outputDir, 'salesbox-products-report.json'), `\uFEFF${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
