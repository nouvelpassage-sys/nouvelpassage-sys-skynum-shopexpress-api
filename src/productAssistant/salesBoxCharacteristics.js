// Resolve only supported, evidenced characteristics against the live dictionary.
// Never create dictionary values or invent sizes, occasions or paid variants.
export function selectSalesBoxCharacteristics(draft, definitions) {
  if (!Array.isArray(definitions)) throw new Error('Invalid SalesBox characteristics dictionary');
  const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/[–—−]/g, '-').toLocaleLowerCase('uk').trim();
  const evidence = draft.visualEvidence ?? {};
  const colors = new Set((evidence.colors ?? []).map(normalize));
  const flowers = new Set((evidence.flowers ?? []).filter((item) => item.confidence === 'high').map((item) => normalize(item.nameUk)));
  const aliases = { 'троянда': 'троянди', 'півонія': 'півонії', 'тюльпан': 'тюльпани', 'соняшник': 'соняшники' };
  for (const value of [...flowers]) if (aliases[value]) flowers.add(aliases[value]);
  const desired = new Map([['Колір', colors], ['Тип квітів', flowers]]);
  const price = Number(draft.price);
  const budget = price > 0 && price < 1000 ? 'до 1000' : price > 1000 && price < 2000 ? '1000–2000' : price > 2000 && price < 3000 ? '2000–3000' : price > 3000 && price < 5000 ? '3000–5000' : price > 5000 ? '5000+' : null;
  if (budget) desired.set('Бюджет', new Set([normalize(budget)]));
  if (draft.category === 'Букети') desired.set('Формат', new Set(['букет']));
  if (draft.category === 'Кімнатні рослини') desired.set('Формат', new Set(['рослина']));
  const result = [];
  for (const [name, values] of desired) {
    const matches = definitions.filter((item) => item.name === name);
    if (matches.length !== 1) continue;
    const parameter = matches[0];
    if (!parameter.id || !Array.isArray(parameter.values)) throw new Error('Incomplete SalesBox characteristic');
    for (const value of parameter.values) {
      if (!value.id || !values.has(normalize(value.value))) continue;
      if (parameter.values.filter((item) => normalize(item.value) === normalize(value.value)).length !== 1) continue;
      result.push({ paramId: parameter.id, valueId: value.id, name, value: value.value, isModifier: true });
    }
  }
  return result;
}
