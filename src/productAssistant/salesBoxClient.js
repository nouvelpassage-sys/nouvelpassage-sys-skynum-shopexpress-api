export class SalesBoxClient {
  constructor({
    baseUrl,
    apiToken,
    companyId,
    writeEnabled,
    requestTimeoutMs = 20000,
    seoRetryCount = 12,
    seoRetryDelayMs = 1500
  }) {
    this.baseUrl = ensureTrailingSlash(baseUrl ?? "https://prod.salesbox.me/openapi/");
    this.apiToken = apiToken;
    this.companyId = companyId;
    this.writeEnabled = writeEnabled;
    this.requestTimeoutMs = requestTimeoutMs;
    this.seoRetryCount = seoRetryCount;
    this.seoRetryDelayMs = seoRetryDelayMs;
  }

  canWrite() {
    return Boolean(this.apiToken && this.writeEnabled);
  }

  async createOfferFromDraft(draft) {
    const payload = this.toCreateManyPayload(draft);
    const seoFields = buildSalesBoxSeoCustomFields(draft);
    const missingRequiredFields = [...getMissingCreateManyFields(payload.offers[0]), ...getMissingSeoFields(seoFields)];
    const endpoint = "offers/createMany?lang=uk";

    if (!this.canWrite()) {
      return {
        dryRun: true,
        reason: "SalesBox write is disabled or credentials are incomplete.",
        endpoint,
        seoEndpoint: "offers/{offerId}/custom-fields?lang=uk",
        missingRequiredFields,
        seoFields,
        payload
      };
    }

    if (missingRequiredFields.length) {
      throw new Error(`SalesBox create offer is missing required fields: ${missingRequiredFields.join(", ")}`);
    }

    const response = await fetch(new URL(endpoint, this.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
        accept: "application/json",
        lang: "uk"
      },
      body: JSON.stringify(payload)
    });

    const { text, body } = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`SalesBox create offer failed: ${response.status} ${text}`);
    }

    const result = {
      dryRun: false,
      body,
      seoResult: await this.updateSeoFieldsForDraft(draft).catch((error) => ({
        updated: false,
        error: error.message
      }))
    };

    return result;
  }

  async getCategories({ lang = "uk" } = {}) {
    return this.getJson(`categories?lang=${encodeURIComponent(lang)}`);
  }

  async getOffers({ lang = "uk", page = 1, pageSize = 20 } = {}) {
    const params = new URLSearchParams({
      lang,
      page: String(page),
      pageSize: String(pageSize)
    });
    return this.getJson(`offers/filter?${params.toString()}`);
  }

  async getJson(path) {
    if (!this.apiToken) {
      throw new Error("SalesBox API token is missing.");
    }

    const response = await fetch(new URL(path, this.baseUrl), {
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        accept: "application/json",
        lang: "uk"
      }
    });
    const { text, body } = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`SalesBox request failed: ${response.status} ${text}`);
    }
    return body;
  }

  async putJson(path, payload) {
    if (!this.apiToken) {
      throw new Error("SalesBox API token is missing.");
    }

    const response = await fetch(new URL(path, this.baseUrl), {
      method: "PUT",
      signal: AbortSignal.timeout(this.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
        accept: "application/json",
        lang: "uk"
      },
      body: JSON.stringify(payload)
    });
    const { text, body } = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(`SalesBox request failed: ${response.status} ${text}`);
    }
    return body;
  }

  async updateSeoFieldsForDraft(draft) {
    const fields = buildSalesBoxSeoCustomFields(draft);
    const missingFields = getMissingSeoFields(fields);
    if (missingFields.length) {
      throw new Error(`SalesBox SEO fields are missing: ${missingFields.join(", ")}`);
    }

    const offer = await this.waitForOfferForDraft(draft);
    if (!offer?.id) {
      throw new Error("SalesBox offer was created, but I could not find it again to write SEO fields.");
    }

    await this.putJson(`offers/${encodeURIComponent(offer.id)}/custom-fields?lang=uk`, { fields });
    return {
      updated: true,
      offerId: offer.id,
      fields: fields.map(({ key }) => key)
    };
  }

  async waitForOfferForDraft(draft) {
    let lastError = null;
    for (let attempt = 0; attempt < this.seoRetryCount; attempt += 1) {
      if (attempt > 0) {
        await delay(this.seoRetryDelayMs);
      }

      try {
        const offer = await this.findOfferForDraft(draft);
        if (offer) {
          return offer;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  async findOfferForDraft(draft) {
    const candidates = [];
    const names = [draft.nameUk, draft.nameEn].filter(Boolean);

    for (const name of names) {
      const result = await this.getJson(`offers/search?lang=uk&name=${encodeURIComponent(name)}`);
      candidates.push(...normalizeOfferList(result));
      const exact = findDraftOffer(candidates, draft);
      if (exact) {
        return exact;
      }
    }

    const result = await this.getJson("offers/filter?lang=uk&page=1&pageSize=200");
    candidates.push(...normalizeOfferList(result));
    return findDraftOffer(candidates, draft);
  }

  toCreateManyPayload(draft) {
    return {
      offers: [this.toOfferPayload(draft)]
    };
  }

  createOfferPreview(draft) {
    const payload = this.toCreateManyPayload(draft);
    const seoFields = buildSalesBoxSeoCustomFields(draft);
    return {
      dryRun: !this.canWrite(),
      writeEnabled: this.canWrite(),
      endpoint: "offers/createMany?lang=uk",
      seoEndpoint: "offers/{offerId}/custom-fields?lang=uk",
      missingRequiredFields: [...getMissingCreateManyFields(payload.offers[0]), ...getMissingSeoFields(seoFields)],
      seoFields,
      payload
    };
  }

  toOfferPayload(draft) {
    const categoryId = getSalesBoxCategoryId(draft.category);
    const photos = getDraftPhotos(draft);
    const stockType = draft.stockMode === "counted" ? "limited" : "endless";
    const count = stockType === "limited" ? getPositiveCount(draft) : 0;

    return {
      internalId: draft.sku || draft.id,
      externalId: draft.id,
      price: draft.price == null ? undefined : Number(draft.price),
      basePrice: draft.price == null ? undefined : Number(draft.price),
      baseCurrency: draft.currency ?? "UAH",
      names: compactLocalizations([
        { lang: "uk", name: draft.nameUk },
        { lang: "en", name: draft.nameEn }
      ]),
      descriptions: compactLocalizations([
        { lang: "uk", description: draft.descriptionUk },
        { lang: "en", description: draft.descriptionEn }
      ]),
      photos,
      available: draft.availability !== "unavailable",
      availableStatus: draft.availability === "unavailable" ? "UNAVAILABLE" : "AVAILABLE",
      stockType,
      count,
      allowNegativeStock: stockType === "endless",
      units: "pc",
      minCount: 1,
      step: 1,
      isFixedStep: false,
      isService: false,
      categories: categoryId ? [{ id: categoryId }] : [],
      barcode: draft.barcode,
      url: draft.url
    };
  }
}

export const SALESBOX_CATEGORY_IDS = {
  "Арома товари": "0db4dca3-fa8d-49e4-9d86-0ea6e0ca99b7",
  "Листівки": "4f1bc2b5-32a6-4923-9574-d8bb5afe9142",
  "Іграшки": "a5195c32-3c10-43e5-88d1-e382cf869da3",
  "Квіти в коробках": "ac6ada44-7269-4e06-a23f-b5a613c832c7",
  "Кімнатні рослини": "bd061350-4f12-49d6-a2e2-8e0d99ee0b90",
  "Декор та подарунки": "4e3b9be0-2552-498d-b7ab-76a160c1eae7",
  "Букети": "710e87ac-5c0a-470b-a02e-e366179fef57",
  "Авторські роботи By Lesnikov": "5a89d2c5-f25f-4934-b720-1172d986ced5",
  "Гарячі пропозиції": "edfe5f4b-2097-41ae-9d9b-0da8bd35e41e"
};

function ensureTrailingSlash(value) {
  return String(value).endsWith("/") ? String(value) : `${value}/`;
}

function getSalesBoxCategoryId(category) {
  return SALESBOX_CATEGORY_IDS[category] ?? null;
}

function compactLocalizations(items) {
  return items.filter((item) =>
    Object.entries(item).every(([, value]) => value !== undefined && value !== null && String(value).trim())
  );
}

function getDraftPhotos(draft) {
  if (Array.isArray(draft.photos) && draft.photos.length) {
    return draft.photos.map((photo, index) => toSalesBoxPhoto(photo, index)).filter(Boolean);
  }

  const originalUrl = draft.photoUrl ?? draft.originalURL ?? draft.originalUrl ?? draft.imageUrl;
  const previewUrl = draft.previewURL ?? draft.previewUrl ?? originalUrl;
  if (!originalUrl || !previewUrl) {
    return [];
  }

  return [
    {
      url: originalUrl,
      previewURL: previewUrl,
      order: 0,
      type: "image",
      resourceType: "image"
    }
  ];
}

function toSalesBoxPhoto(photo, index) {
  const originalUrl = photo.url ?? photo.originalURL ?? photo.originalUrl ?? photo.imageUrl;
  const previewUrl = photo.previewURL ?? photo.previewUrl ?? originalUrl;
  if (!originalUrl || !previewUrl) {
    return null;
  }

  return {
    url: originalUrl,
    previewURL: previewUrl,
    order: Number.isInteger(photo.order) ? photo.order : index,
    type: photo.type ?? "image",
    resourceType: photo.resourceType ?? "image"
  };
}

function getPositiveCount(draft) {
  const count = Number(draft.count ?? draft.stockCount ?? draft.quantity ?? 1);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function getMissingCreateManyFields(offer) {
  const missing = [];
  if (!Number.isFinite(offer.price)) {
    missing.push("offers.*.price");
  }
  if (!offer.names.length) {
    missing.push("offers.*.names");
  }
  if (!offer.descriptions.length) {
    missing.push("offers.*.descriptions");
  }
  if (!offer.photos.length) {
    missing.push("offers.*.photos");
  }
  return missing;
}

export const SALESBOX_SEO_CUSTOM_FIELD_KEYS = {
  title: "thxsd2rona_seo_offertitle_hidden",
  description: "thxsd2rona_seo_offerdescription_hidden",
  keywords: "thxsd2rona_seo_offerkeywords_hidden",
  slug: "thxsd2rona_seo_offerslug_hidden"
};

export function buildSalesBoxSeoCustomFields(draft) {
  const title = draft.seo?.titleUk ?? draft.nameUk;
  const description = draft.seo?.descriptionUk ?? draft.visibleSummaryUk ?? draft.descriptionUk;
  const keywords =
    draft.seo?.keywordsUk ??
    [draft.productTypeUk, draft.category, draft.brand ?? "Nouvel Amour"].filter(Boolean).join(", ");
  const slug = draft.seo?.slug ?? slugify(draft.nameUk ?? draft.sku ?? draft.id);

  return [
    { key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.title, value: normalizeSeoValue(title, 60) },
    { key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.description, value: normalizeSeoValue(description, 160) },
    { key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.keywords, value: normalizeSeoValue(keywords, 255) },
    { key: SALESBOX_SEO_CUSTOM_FIELD_KEYS.slug, value: normalizeSeoSlug(slug) }
  ];
}

function getMissingSeoFields(fields) {
  return fields
    .filter((field) => !field.value)
    .map((field) => `offers.*.seo.${field.key}`);
}

function normalizeSeoValue(value, maxLength) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function normalizeSeoSlug(value) {
  return slugify(value).slice(0, 255);
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOfferList(result) {
  if (Array.isArray(result?.data)) {
    return result.data;
  }
  if (result?.data) {
    return [result.data];
  }
  return [];
}

function findDraftOffer(candidates, draft) {
  const seen = new Set();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (!candidate?.id || seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });

  return (
    uniqueCandidates.find((candidate) => candidate.externalId === draft.id) ??
    uniqueCandidates.find((candidate) => draft.sku && candidate.internalId === draft.sku) ??
    uniqueCandidates.find((candidate) => candidate.internalId === draft.id) ??
    null
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return { text, body: null };
  }

  try {
    return { text, body: JSON.parse(text) };
  } catch {
    return { text: text.slice(0, 500), body: null };
  }
}
