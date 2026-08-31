import test from "node:test";
import assert from "node:assert/strict";
import { detectCategory, getAllowedCategories, resolveCategoryRule } from "../src/productAssistant/catalogRules.js";

test("uses the current SalesBox category whitelist", () => {
  assert.deepEqual(getAllowedCategories(), [
    "Арома товари",
    "Листівки",
    "Іграшки",
    "Квіти в коробках",
    "Кімнатні рослини",
    "Декор та подарунки",
    "Букети",
    "Авторські роботи By Lesnikov",
    "Гарячі пропозиції"
  ]);
});

test("corrects invented AI categories to an allowed category from evidence", () => {
  const rule = resolveCategoryRule({
    generatedCategory: "Півонії",
    fallbackCategory: "Декор та подарунки",
    evidence: "букет рожевих півоній на довгих стеблах"
  });

  assert.equal(rule.category, "Букети");
  assert.equal(rule.categoryWasCorrected, true);
});

test("classifies living decorative plants in packaging as indoor plants", () => {
  const directRule = detectCategory("декоративно-рослинна композиція в упаковці");

  assert.equal(directRule.category, "Кімнатні рослини");
  assert.equal(directRule.stockMode, "counted");

  const correctedRule = resolveCategoryRule({
    generatedCategory: "Декор та подарунки",
    fallbackCategory: "Декор та подарунки",
    evidence: "жива кімнатна рослина у декоративній упаковці та кашпо"
  });

  assert.equal(correctedRule.category, "Кімнатні рослини");
  assert.equal(correctedRule.categoryWasCorrected, true);
});

test("keeps flower boxes separate from indoor plants", () => {
  const rule = detectCategory("квіткова композиція у коробці з трояндами");

  assert.equal(rule.category, "Квіти в коробках");
  assert.equal(rule.stockMode, "unlimited");
});

test("treats a flower composition without a container as a bouquet", () => {
  assert.equal(detectCategory("квіткова композиція для привітання").category, "Букети");
});

test("uses the generic gift category when there is no physical category evidence", () => {
  assert.equal(detectCategory("нова позиція Nouvel Amour").category, "Декор та подарунки");
});

test("routes physical product categories before generic gift wording", () => {
  assert.equal(detectCategory("ароматичний подарунок, дифузор для дому").category, "Арома товари");
  assert.equal(detectCategory("подарунок: м'яка іграшка ведмедик").category, "Іграшки");
  assert.equal(detectCategory("квітковий подарунок у коробці").category, "Квіти в коробках");
  assert.equal(detectCategory("декоративний подарунок, спатифілум у кашпо").category, "Кімнатні рослини");
});

test("keeps each supported non-flower product in its physical category", () => {
  assert.equal(detectCategory("ароматична свічка для дому").category, "Арома товари");
  assert.equal(detectCategory("аудіолистівка з привітанням").category, "Листівки");
  assert.equal(detectCategory("м'яка іграшка зайчик").category, "Іграшки");
  assert.equal(detectCategory("керамічна ваза для інтер'єру").category, "Декор та подарунки");
  assert.equal(detectCategory("авторська робота By Lesnikov").category, "Авторські роботи By Lesnikov");
});
