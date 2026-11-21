// Editorial checks reject weak output; they never manufacture replacement copy.
export function normalizedCopy(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function overlap(left, right) {
  const a = new Set(normalizedCopy(left).split(' ').filter(Boolean));
  const b = new Set(normalizedCopy(right).split(' ').filter(Boolean));
  return a.size && b.size ? [...a].filter(x => b.has(x)).length / Math.max(a.size, b.size) : 0;
}
export function reviewEditorialContent(generated, existing = []) {
  const names = existing.flatMap(x => [x.nameUk, x.nameEn, x.name]).filter(Boolean);
  const candidates = [generated.nameUk, ...(generated.nameCandidates ?? [])].filter(x => typeof x === 'string' && x.trim().length >= 5);
  const selected = candidates.find(name => !names.some(old => normalizedCopy(old) === normalizedCopy(name) || overlap(old, name) >= 0.8));
  const issues = [];
  if (!selected) issues.push('Назва повторює каталог або немає придатного варіанта.');
  const description = String(generated.descriptionUk ?? '').trim();
  if (description.length < 100 || description.length > 1200) issues.push('Потрібен змістовний стислий опис конкретної роботи.');
  const body = description.replace(/Можлива заміна[^.]*\./giu, '').trim();
  if (existing.some(x => {
    const old = String(x.descriptionUk ?? x.description ?? '').replace(/Можлива заміна[^.]*\./giu, '').trim();
    return old.length > 80 && overlap(body, old) >= 0.8;
  })) issues.push('Опис надто схожий на іншу картку.');
  const facts = generated.visualEvidence;
  if (!facts || !Array.isArray(facts.flowers) || !Array.isArray(facts.colors) || !Array.isArray(facts.uncertain) || !facts.productForm) issues.push('Немає структурованого розпізнавання фото.');
  if (facts?.flowers?.some(x => !x.nameUk || !['high', 'uncertain'].includes(x.confidence))) issues.push('Не визначено впевненість розпізнавання квітів.');
  const seoTitleUk = selected && selected !== generated.nameUk ? `${selected} — Nouvel Amour`.slice(0, 60) : generated.seoTitleUk;
  return {...generated, seoTitleUk, nameUk: selected ?? generated.nameUk, nameEn: selected ?? generated.nameEn,
    editorialVersion: 2, editorialIssues: issues};
}
