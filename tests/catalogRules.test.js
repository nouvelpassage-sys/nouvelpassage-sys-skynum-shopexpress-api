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
