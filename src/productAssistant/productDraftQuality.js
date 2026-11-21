import { detectCategory, getCategoryRule } from "./catalogRules.js";
import { hasBannedCopyPhrase, needsImprovement } from "./copyQuality.js";
import { hasProductNameStopWords } from "./productCardPolicy.js";

export function validateProductDraft(draft) {
  const issues = [...(draft.editorialIssues ?? [])];

  if (!draft.nameUk || String(draft.nameUk).trim().length < 5) {
    issues.push("Назва відсутня або занадто коротка.");
  } else if (hasProductNameStopWords(draft.nameUk)) {
    issues.push("Назва містить тип товару, квіти, колір або інші заборонені технічні слова.");
  }

  if (draft.nameEn && hasProductNameStopWords(draft.nameEn)) {
    issues.push("Англійська назва містить заборонені технічні слова.");
  }

  if (!draft.productTypeUk || hasBannedCopyPhrase(draft.productTypeUk)) {
    issues.push("Тип товару відсутній або занадто загальний.");
  }

  if (!draft.category || !getCategoryRule(draft.category)) {
    issues.push("Категорія відсутня або не входить у дозволений список.");
  }

  if (draft.editorialVersion === 2
    ? (!draft.descriptionUk || draft.descriptionUk.length < 100 || hasBannedCopyPhrase(draft.descriptionUk))
    : needsImprovement(draft.descriptionUk, draft.category)) {
    issues.push("Опис не проходить редакційний фільтр якості.");
  }

  if (hasBannedCopyPhrase(draft.seo?.descriptionUk)) {
    issues.push("SEO опис містить заборонені шаблонні фрази.");
  }

  if (draft.editorialVersion === 2) {
    for (const field of ["titleUk", "descriptionUk", "keywordsUk", "slug"]) {
      if (!String(draft.seo?.[field] ?? "").trim()) issues.push(`Не заповнено SEO: ${field}.`);
    }
    if (!draft.descriptionEn || !draft.productTypeEn || !draft.nameEn) issues.push("Не заповнено англійську версію картки.");
  }

  const evidence = [
    draft.sourceText,
    draft.productTypeUk,
    draft.visibleSummaryUk,
    draft.descriptionUk
  ].filter(Boolean).join(" ");
  const detected = detectCategory(evidence);
  if (
    draft.category === "Декор та подарунки" &&
    detected.category !== "Декор та подарунки"
  ) {
    issues.push(`Ймовірно неправильна категорія: схоже на "${detected.category}", а не "Декор та подарунки".`);
  }

  return issues;
}

export function formatQualityIssues(issues) {
  return issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n");
}
