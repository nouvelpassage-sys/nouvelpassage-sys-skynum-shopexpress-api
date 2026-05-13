import test from "node:test";
import assert from "node:assert/strict";
import { getAllowedCategories } from "../src/productAssistant/catalogRules.js";
import { hasProductNameStopWords } from "../src/productAssistant/contentGenerator.js";
import { CATEGORY_STYLE_EXAMPLES, getStyleExamplesForPrompt } from "../src/productAssistant/styleExamples.js";

test("has one style example for every allowed category", () => {
  const allowed = getAllowedCategories();
  const exampleCategories = CATEGORY_STYLE_EXAMPLES.map((example) => example.category);

  assert.deepEqual([...exampleCategories].sort(), [...allowed].sort());
});

test("style examples contain usable product card fields", () => {
  for (const example of getStyleExamplesForPrompt()) {
    assert.ok(example.productTypeUk, `${example.category} needs productTypeUk`);
    assert.ok(example.nameUk.length >= 5, `${example.category} needs a creative display name`);
    assert.equal(hasProductNameStopWords(example.nameUk), false, `${example.category} name has product stop words`);
    assert.ok(example.descriptionUk.length > 80, `${example.category} description is too short`);
    assert.doesNotMatch(example.descriptionUk, /товар у категорії/i);
  }
});
