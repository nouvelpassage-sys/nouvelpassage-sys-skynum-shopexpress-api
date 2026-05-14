import test from "node:test";
import assert from "node:assert/strict";
import {
  hasFlowerCompositionDetails,
  hasObviousPlantMorphology,
  improveShortDescription,
  needsImprovement
} from "../src/productAssistant/copyQuality.js";

test("detects dry bouquet inventory descriptions", () => {
  assert.equal(needsImprovement("Букет рожевих півоній та бузку", "Букети"), true);
});

test("turns a dry bouquet inventory into general premium copy without composition details", () => {
  const description = improveShortDescription({
    description: "Букет рожевих півоній та бузку",
    productType: "букет рожевих півоній та бузку",
    visibleSummary: "букет рожевих півоній та бузку у рожево-ліловій палітрі",
    category: "Букети"
  });

  assert.doesNotMatch(description, /півон|буз|rose|peony|eucalyptus/i);
  assert.match(description, /виглядає зібрано|загальному враженні|Nouvel Amour|Lumiere/i);
  assert.ok(description.length > 110);
});

test("rejects flower descriptions that list composition ingredients", () => {
  const description = "A soft bouquet with rose, peony, hydrangea and eucalyptus in a tender palette for a romantic greeting.";

  assert.equal(hasFlowerCompositionDetails(description), true);
  assert.equal(needsImprovement(description, "Букети"), true);
});

test("rejects vague AI filler phrases in flower descriptions", () => {
  const weak = "Ручний букет у ніжних рожево-лілових відтінках. Це елегантний та живий акцент для особливих моментів або свята душі.";

  assert.equal(needsImprovement(weak, "Букети"), true);
});

test("rejects generic non-flower filler phrases", () => {
  const weak = "М'яка іграшка доповнює замовлення без зайвої декоративності. Такий подарунок працює як невеликий, але помітний знак уваги.";

  assert.equal(needsImprovement(weak, "Іграшки"), true);
});

test("rejects decorative gift boilerplate", () => {
  const weak = "Декоративний подарунок створено з увагою і гармонією форми. Це гарний варіант, який завершує композицію і виглядає візуально цілісним.";

  assert.equal(needsImprovement(weak, "Декор та подарунки"), true);
});

test("rejects awkward duplicated composition openings", () => {
  assert.equal(needsImprovement("Букет Квіткова композиція з рожевих троянд виглядає зібрано.", "Квіти в коробках"), true);
});

test("rejects obvious indoor plant morphology descriptions", () => {
  const weak = "Спатифіліум з густим зеленим листям і білим покривалом цвіте білими квітами та виглядає свіжо.";

  assert.equal(hasObviousPlantMorphology(weak), true);
  assert.equal(needsImprovement(weak, "Кімнатні рослини"), true);
});

test("rewrites indoor plant copy without repeating what is visible in the photo", () => {
  const description = improveShortDescription({
    description: "Спатифіліум з густим зеленим листям і білим покривалом цвіте білими квітами та виглядає свіжо.",
    productType: "спатифіліум",
    category: "Кімнатні рослини"
  });

  assert.match(description, /зелений акцент|доглянутості|залишається поруч/);
  assert.doesNotMatch(description, /густ|лист|покривал|цвіте|білими квіт/i);
  assert.ok(description.length > 110);
});

test("rewrites weak toy copy into a more specific gift description", () => {
  const description = improveShortDescription({
    description: "М'яка іграшка доповнює замовлення без зайвої декоративності. Такий подарунок працює як невеликий, але помітний знак уваги.",
    productType: "м'яка іграшка ведмедик",
    category: "Іграшки"
  });

  assert.match(description, /додає подарунку тепла/);
  assert.doesNotMatch(description, /доповнює замовлення|знак уваги/);
});

test("rewrites weak decor copy without decorative gift boilerplate", () => {
  const description = improveShortDescription({
    description: "Декоративний подарунок створено з увагою і гармонією форми. Це гарний варіант, який завершує композицію.",
    productType: "декоративний подарунок",
    category: "Декор та подарунки"
  });

  assert.match(description, /аксесуар Nouvel Amour|акцент|поєднується з квітами/);
  assert.doesNotMatch(description, /декоративний подарунок|гармонією форми|гарний варіант|створено з увагою|опис має/i);
});

test("rejects editor advice accidentally used as product description", () => {
  const weak = "Варто описувати реальний предмет, матеріал, форму, розмір через використання. Так покупець відразу зрозуміє.";

  assert.equal(needsImprovement(weak, "Декор та подарунки"), true);

  const description = improveShortDescription({
    description: weak,
    productType: "аксесуар Nouvel Amour",
    category: "Декор та подарунки"
  });

  assert.match(description, /аксесуар Nouvel Amour|акцент|поєднується з квітами/);
  assert.doesNotMatch(description, /варто описувати|так покупець|опис має|важливо показати/i);
});
