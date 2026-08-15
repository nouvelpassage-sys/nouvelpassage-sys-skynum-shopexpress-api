import test from "node:test";
import assert from "node:assert/strict";
import { validateProductDraft } from "../src/productAssistant/productDraftQuality.js";

const baseDraft = {
  sourceText: "букет півоній 1899 грн",
  nameUk: "Lumiere Douce",
  nameEn: "Lumiere Douce",
  productTypeUk: "букет півоній",
  visibleSummaryUk: "букет півоній у м'якій рожевій палітрі",
  category: "Букети",
  descriptionUk:
    "Букет Lumiere Douce виглядає зібрано й дорого завдяки загальному настрою, формі та м'якій подачі. Така позиція доречна для привітання, побачення або особистого компліменту без технічного переліку складу. У разі відсутності окремих позицій можливе коригування складу: окремі квіти можуть бути замінені на аналогічні або дорожчі за наш рахунок із збереженням стилю, кольорової гами, форми та загального характеру букета.",
  seo: {
    descriptionUk: "Букет Lumiere Douce від Nouvel Amour.",
    slug: "lumiere-douce"
  }
};

test("passes a clean product draft", () => {
  assert.deepEqual(validateProductDraft(baseDraft), []);
});

test("rejects drafts with product words in creative name", () => {
  const issues = validateProductDraft({
    ...baseDraft,
    nameUk: "Pivoine Rose - букет рожевих півоній"
  });

  assert.ok(issues.some((issue) => issue.includes("Назва містить")));
});

test("rejects decor category when evidence points to flowers", () => {
  const issues = validateProductDraft({
    ...baseDraft,
    category: "Декор та подарунки"
  });

  assert.ok(issues.some((issue) => issue.includes("Ймовірно неправильна категорія")));
});

test("rejects decorative gift boilerplate before publishing", () => {
  const issues = validateProductDraft({
    ...baseDraft,
    category: "Декор та подарунки",
    productTypeUk: "декоративний подарунок",
    descriptionUk: "Декоративний подарунок створено з увагою і гармонією форми. Це гарний варіант, який завершує композицію."
  });

  assert.ok(issues.some((issue) => issue.includes("Тип товару")));
  assert.ok(issues.some((issue) => issue.includes("Опис")));
});
