import test from "node:test";
import assert from "node:assert/strict";
import {
  createProductDraft,
  hasProductNameStopWords,
  parseProductMessage,
  slugify
} from "../src/productAssistant/contentGenerator.js";

test("parses price and product hint from a Telegram message", () => {
  const parsed = parseProductMessage("280 автопарфум Lost Cherry");

  assert.equal(parsed.price, 280);
  assert.equal(parsed.titleSeed, "автопарфум Lost Cherry");
});

test("parses public image URLs without mixing them into the product hint", () => {
  const parsed = parseProductMessage(
    "1900 букет ніжний https://www.nouvelamour.kiev.ua/Media/shop-29325/main%20page/b4.jpg"
  );

  assert.equal(parsed.price, 1900);
  assert.equal(parsed.titleSeed, "букет ніжний");
  assert.equal(parsed.imageUrl, "https://www.nouvelamour.kiev.ua/Media/shop-29325/main%20page/b4.jpg");
});

test("uses public image URL as the draft photo URL", async () => {
  const draft = await createProductDraft({
    text: "1900 букет ніжний https://www.nouvelamour.kiev.ua/Media/shop-29325/main%20page/b4.jpg",
    openAiClient: null
  });

  assert.equal(draft.price, 1900);
  assert.equal(draft.photoUrl, "https://www.nouvelamour.kiev.ua/Media/shop-29325/main%20page/b4.jpg");
  assert.equal(draft.previewUrl, "https://www.nouvelamour.kiev.ua/Media/shop-29325/main%20page/b4.jpg");
});

test("creates an aroma product draft with unlimited stock", async () => {
  const draft = await createProductDraft({
    text: "280 автопарфум Lost Cherry",
    photoFileId: "photo-id",
    openAiClient: null
  });

  assert.equal(draft.price, 280);
  assert.equal(draft.category, "Арома товари");
  assert.equal(draft.stockMode, "unlimited");
  assert.equal(draft.availability, "available");
  assert.equal(draft.photoFileId, "photo-id");
  assert.equal(draft.productTypeUk, "автопарфум");
  assert.match(draft.sku, /^AR-/);
  assert.equal(draft.nameUk, "Maison Ambree");
  assert.doesNotMatch(draft.descriptionUk, /товар .*категорії/i);
});

test("creates a boutique-style fallback name and description for bouquets", async () => {
  const draft = await createProductDraft({
    text: ",букет півоній 1899грн",
    photoFileId: "photo-id",
    openAiClient: null
  });

  assert.equal(draft.price, 1899);
  assert.equal(draft.nameUk, "Lumiere Douce");
  assert.equal(draft.productTypeUk, "букет півоній");
  assert.equal(hasProductNameStopWords(draft.nameUk), false);
  assert.doesNotMatch(draft.descriptionUk, /товар .*категорії/i);
  assert.match(draft.descriptionUk, /французьку подачу|Nouvel Amour/i);
});

test("creates counted stock drafts for indoor plants in decorative packaging", async () => {
  const draft = await createProductDraft({
    text: "декоративно-рослинна композиція в упаковці 950 грн",
    photoFileId: "photo-id",
    openAiClient: null
  });

  assert.equal(draft.category, "Кімнатні рослини");
  assert.equal(draft.stockMode, "counted");
  assert.equal(draft.availability, "available");
  assert.equal(hasProductNameStopWords(draft.nameUk), false);
  assert.match(draft.sku, /^PL-/);
});

test("passes attached image data to AI content generation", async () => {
  let capturedInput;
  const draft = await createProductDraft({
    text: "1250",
    photoFileId: "photo-id",
    imageDataUrl: "data:image/jpeg;base64,abc",
    openAiClient: {
      async generateProductContent(input) {
        capturedInput = input;
        return {
          nameUk: "Квіткова композиція в коробці",
          nameEn: "Flower Box Arrangement",
          descriptionUk: "Композиція у коробці з ніжними квітами для подарунка.",
          descriptionEn: "A flower box arrangement for a thoughtful gift.",
          seoTitleUk: "Квіткова композиція в коробці - Nouvel Amour",
          seoDescriptionUk: "Квіткова композиція в коробці від Nouvel Amour.",
          seoKeywordsUk: "квіти в коробці, композиція, Nouvel Amour",
          slug: "kvitkova-kompozytsiia-v-korobtsi",
          brand: "Nouvel Amour",
          category: "Квіти в коробках",
          productTypeUk: "квіткова композиція в коробці",
          productTypeEn: "flower box arrangement",
          visibleSummaryUk: "квіти в коробці"
        };
      }
    }
  });

  assert.equal(capturedInput.imageDataUrl, "data:image/jpeg;base64,abc");
  assert.equal(capturedInput.hasImage, true);
  assert.equal(draft.category, "Квіти в коробках");
  assert.equal(draft.productTypeUk, "квіткова композиція в коробці");
  assert.equal(draft.stockMode, "unlimited");
  assert.equal(draft.visionUsed, true);
  assert.match(draft.sku, /^BX-/);
  assert.equal(draft.nameUk, "Jardin Secret");
});

test("prompts AI to read labels before guessing plant identity", async () => {
  let capturedInput;
  const draft = await createProductDraft({
    text: "950",
    photoFileId: "photo-id",
    imageDataUrl: "data:image/jpeg;base64,plant",
    openAiClient: {
      async generateProductContent(input) {
        capturedInput = input;
        return {
          nameUk: "Maison Verte",
          nameEn: "Maison Verte",
          descriptionUk:
            "Кімнатна рослина Maison Verte додає простору живий зелений акцент і відчуття спокою. Це подарунок, який залишається поруч надовго і щодня нагадує про увагу.",
          descriptionEn:
            "Maison Verte is a living indoor plant with a calm, fresh presence for home or office.",
          seoTitleUk: "Maison Verte - кімнатна рослина Calathea",
          seoDescriptionUk: "Кімнатна рослина Calathea Maison Verte від Nouvel Amour.",
          seoKeywordsUk: "Calathea, кімнатна рослина, Nouvel Amour",
          slug: "maison-verte-calathea",
          brand: "Nouvel Amour Plants",
          category: "Кімнатні рослини",
          productTypeUk: "кімнатна рослина Calathea",
          productTypeEn: "Calathea indoor plant",
          visibleSummaryUk: "на етикетці видно Calathea"
        };
      }
    }
  });

  assert.equal(capturedInput.imageDataUrl, "data:image/jpeg;base64,plant");
  assert.equal(capturedInput.hasImage, true);
  assert.equal(draft.category, "Кімнатні рослини");
  assert.equal(draft.productTypeUk, "кімнатна рослина Calathea");
  assert.match(draft.visibleSummaryUk, /Calathea/);
});

test("passes revision instructions to AI content generation", async () => {
  let capturedInput;
  const draft = await createProductDraft({
    text: "280 test bouquet",
    photoFileId: "photo-id",
    imageDataUrl: "data:image/jpeg;base64,abc",
    revisionInstruction: "Rewrite the description in a more premium tone.",
    sourceDraftId: "draft-old",
    openAiClient: {
      async generateProductContent(input) {
        capturedInput = input;
        return {
          nameUk: "Maison Rose - test bouquet",
          nameEn: "Maison Rose - test bouquet",
          descriptionUk: "A soft pink bouquet with a polished boutique mood.",
          descriptionEn: "A soft pink bouquet with a polished boutique mood.",
          seoTitleUk: "Maison Rose - test bouquet",
          seoDescriptionUk: "Maison Rose test bouquet by Nouvel Amour.",
          seoKeywordsUk: "bouquet, Nouvel Amour",
          slug: "maison-rose-test-bouquet",
          brand: "Nouvel Amour",
          category: input.categoryHint,
          productTypeUk: "test bouquet",
          productTypeEn: "test bouquet",
          visibleSummaryUk: "pink bouquet"
        };
      }
    }
  });

  assert.equal(capturedInput.revisionInstruction, "Rewrite the description in a more premium tone.");
  assert.equal(draft.revisionInstruction, "Rewrite the description in a more premium tone.");
  assert.equal(draft.sourceDraftId, "draft-old");
  assert.equal(draft.nameUk, "Lumiere Douce");
});

test("removes product stop words from AI product names", async () => {
  const draft = await createProductDraft({
    text: "1899",
    photoFileId: "photo-id",
    imageDataUrl: "data:image/jpeg;base64,abc",
    openAiClient: {
      async generateProductContent() {
        return {
          nameUk: "Pivoine Elegante",
          nameEn: "Pivoine Elegante",
          descriptionUk: "Букет рожевих півоній у ніжній пастельній гамі.",
          descriptionEn: "A bouquet of pink peonies in a soft pastel palette.",
          seoTitleUk: "Pivoine Elegante - букет рожевих півоній",
          seoDescriptionUk: "Букет рожевих півоній Pivoine Elegante від Nouvel Amour.",
          seoKeywordsUk: "букет півоній, рожеві півонії, Nouvel Amour",
          slug: "pivoine-elegante-buket-rozhevykh-pivonii",
          brand: "Nouvel Amour",
          category: "Букети",
          productTypeUk: "букет рожевих півоній",
          productTypeEn: "bouquet of pink peonies",
          visibleSummaryUk: "рожеві півонії"
        };
      }
    }
  });

  assert.equal(draft.nameUk, "Lumiere Douce");
  assert.equal(hasProductNameStopWords(draft.nameUk), false);
  assert.equal(draft.productTypeUk, "букет рожевих півоній");
});

test("keeps a valid source category when importing catalog items", async () => {
  const draft = await createProductDraft({
    text: "Букет авторський 2500",
    photoFileId: "photo-id",
    imageDataUrl: "data:image/jpeg;base64,abc",
    sourceCategory: "Авторські роботи By Lesnikov",
    openAiClient: {
      async generateProductContent() {
        return {
          nameUk: "Signature Rose - авторський букет",
          nameEn: "Signature Rose - designer bouquet",
          descriptionUk: "Авторський букет у рожевій палітрі з виразною флористичною формою.",
          descriptionEn: "A designer bouquet in a pink palette.",
          seoTitleUk: "Signature Rose - авторський букет",
          seoDescriptionUk: "Авторський букет Signature Rose від Nouvel Amour.",
          seoKeywordsUk: "авторський букет, Nouvel Amour",
          slug: "signature-rose-avtorskyi-buket",
          brand: "Nouvel Amour",
          category: "Букети",
          productTypeUk: "авторський букет",
          productTypeEn: "designer bouquet",
          visibleSummaryUk: "авторський букет у рожевій палітрі"
        };
      }
    }
  });

  assert.equal(draft.category, "Авторські роботи By Lesnikov");
  assert.equal(draft.categoryWasCorrected, true);
  assert.match(draft.sku, /^LS-/);
});

test("slugifies Ukrainian product names", () => {
  assert.equal(slugify("Автопарфум Lost Cherry"), "avtoparfum-lost-cherry");
});

test("slugifies French accents and Ukrainian product type together", () => {
  assert.equal(slugify("Éclat de Rose - букет рожевих півоній"), "eclat-de-rose-buket-rozhevykh-pivoniy");
});
