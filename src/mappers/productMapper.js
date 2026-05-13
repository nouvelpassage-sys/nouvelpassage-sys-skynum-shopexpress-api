function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeImages(product) {
  const images = firstDefined(product.images, product.photos, product.pictures, product.product_images, []);
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => {
      if (typeof image === "string") {
        return { url: image };
      }

      return {
        url: firstDefined(image.url, image.src, image.originalUrl, image.original_url, image.file_url),
        alt: firstDefined(image.alt, image.title, product.name)
      };
    })
    .filter((image) => image.url);
}

function buildSeoTitle(product) {
  const parts = [
    product.name,
    firstDefined(product.brand, product.manufacturer),
    firstDefined(product.sku, product.article)
  ].filter(Boolean);

  return parts.join(" | ").slice(0, 70);
}

function buildSeoDescription(product) {
  const name = product.name ?? "Товар";
  const brand = firstDefined(product.brand, product.manufacturer);
  const sku = firstDefined(product.sku, product.article);
  const stock = asNumber(firstDefined(product.stock, product.quantity, product.availableQuantity), 0);
  const availability = stock > 0 ? "в наявності" : "під замовлення";
  const details = [brand, sku ? `код ${sku}` : undefined].filter(Boolean).join(", ");

  return `${name}${details ? ` (${details})` : ""}: ${availability}. Актуальна ціна, опис і характеристики в інтернет-магазині.`
    .slice(0, 155);
}

export function normalizeSkynumProduct(product, options = {}) {
  const id = String(firstDefined(product.id, product.externalId, product.uuid));
  const name = firstDefined(product.name, product.title, product.productName, "Unnamed product");
  const sku = firstDefined(product.sku, product.article, product.vendorCode, product.code);
  const barcode = firstDefined(product.barcode, product.ean, product.gtin, product.code);
  const price = asNumber(firstDefined(product.price, product.salePrice, product.retailPrice, product.price_retail), 0);
  const stock = asNumber(
    firstDefined(product.stock, product.quantity, product.availableQuantity, product.remains_quantity, product.remains),
    0
  );
  const description =
    firstDefined(product.description, product.fullDescription, product.shortDescription, product.short_description) ?? "";
  const seoTitle = firstDefined(product.seoTitle, product.metaTitle);
  const seoDescription = firstDefined(product.seoDescription, product.metaDescription);

  return {
    externalId: id,
    name,
    sku,
    barcode,
    price,
    stock,
    currency: firstDefined(product.currency, "UAH"),
    category: firstDefined(product.category, product.categoryName, product.category_title, product.groupName),
    brand: firstDefined(product.brand, product.manufacturer, product.producer_title),
    description,
    images: normalizeImages({ ...product, name }),
    seo: {
      title: seoTitle ?? (options.autoFillSeo ? buildSeoTitle({ ...product, name, sku }) : undefined),
      description:
        seoDescription ?? (options.autoFillSeo ? buildSeoDescription({ ...product, name, sku, stock }) : undefined),
      slug: firstDefined(product.slug, product.alias)
    },
    raw: product
  };
}

export function toShopExpressProductPayload(product, matchKey = "sku") {
  return {
    externalId: product.externalId,
    matchKey,
    matchValue: product[matchKey] ?? product.externalId,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    price: product.price,
    currency: product.currency,
    stock: product.stock,
    category: product.category,
    brand: product.brand,
    description: product.description,
    seoTitle: product.seo.title,
    seoDescription: product.seo.description,
    slug: product.seo.slug,
    images: product.images
  };
}

export function buildContentTask(product) {
  const missing = [];

  if (!product.images.length) {
    missing.push("images");
  }

  if (!product.description || product.description.length < 40) {
    missing.push("description");
  }

  if (!product.seo.title) {
    missing.push("seoTitle");
  }

  if (!product.seo.description) {
    missing.push("seoDescription");
  }

  if (!missing.length) {
    return undefined;
  }

  return {
    externalId: product.externalId,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    missing,
    suggestedSeo: product.seo
  };
}
