import { randomInt } from "node:crypto";
import { hasProductNameStopWords, transliterateForPolicy } from "./productCardPolicy.js";

const signatures = [
  "À demain peut-être", "L’heure des hirondelles", "On prend le large", "Les yeux fermés",
  "En attendant Camille", "Au revers du billet", "La chambre aux fenêtres ouvertes", "Un air de famille",
  "Quand tu souris", "La mer entre nous", "À pas de loup", "Le goût du dimanche",
  "Sous les platanes", "Le piano du voisin", "Rue des funambules", "Encore cinq minutes",
  "Les poches pleines de soleil", "Le rire de Manon", "Porté par le vent", "Au bout du quai",
  "Trois mots pour toi", "Le bal des lucioles", "Un secret bien gardé", "La clé des champs",
  "Comme au cinéma", "Entre deux trains", "Le temps suspendu", "Tout près de toi",
  "Après la dernière danse", "La maison sur la dune", "Un détour imprévu", "Le jour se lève",
  "Les carnets de Colette", "Rendez-vous sous la verrière", "Le générique de fin", "Le silence des toits",
  "Écoute la pluie", "Si tu savais", "La fenêtre entrouverte", "Un instant encore",
  "Les marches du théâtre", "Sous le même ciel", "Le monde à pied", "Par la porte du fond",
  "Avant que tu partes", "Le marché aux puces", "Le chant des voiliers", "D’une rive à l’autre"
];

const places = ["Arles", "Honfleur", "Sète", "Menton", "Rouen", "Dijon", "Lyon", "Tours", "Grasse",
  "Vannes", "Cassis", "Nîmes", "Colmar", "Nantes", "Albi", "Rennes", "Saumur", "Dinard", "Chinon",
  "Senlis", "Granville", "Bandol", "Poitiers", "Limoges", "Nancy", "Vienne", "Trouville", "Sancerre",
  "Avignon", "Orange", "Annecy", "Biarritz", "Beaune", "Beauvais", "Étretat", "Cahors", "Toulon"];
const destinations = ["la jetée", "la passerelle", "la bibliothèque", "la terrasse", "la fontaine",
  "la gare", "la crique", "la péniche", "la maison du lac", "la place du village", "la cour", "la fête",
  "la criée", "la serre", "la plage", "la cascade", "la source", "la rivière", "la grange", "la dune"];
const occasions = ["le bal", "la première", "la pluie", "l’orage", "le concert", "le vernissage",
  "la récolte", "la traversée", "le carnaval", "le marché", "la répétition", "le spectacle",
  "la fête", "le dîner", "le défilé", "la séance", "la promenade", "le voyage"];
const mementos = ["Un billet", "La chanson", "Quelques lignes", "Le carnet", "Une valse", "Un souvenir",
  "Un croquis", "La dernière lettre", "Un refrain", "Une esquisse", "Les nouvelles", "Une pensée",
  "Des nouvelles", "Une dépêche", "Mon premier été", "Un baiser", "Deux places", "Une nuit"];
const times = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const rendezvous = ["à l’aube", "après minuit", "au réveil", "au crépuscule", "à midi", "avant le jour",
  "au petit matin", "à la veillée", "au coucher du soleil", "entre chien et loup"];
const people = ["Agathe", "Louise", "Margot", "Sacha", "Colette", "Martin", "Gabriel", "Ninon",
  "Marcel", "Camille", "Anaïs", "Hugo", "Iris", "Lou", "Simone", "Alice"];
const firstUpper = (s) => s[0].toUpperCase() + s.slice(1);

const combine = (left, right, format) => left.flatMap((a) => right.map((b) => format(a, b)));
const collections = [
  signatures,
  combine(mementos, places, (a, b) => `${a} à ${b}`),
  combine(people, destinations, (a, b) => `${a} à ${b}`),
  combine(places, rendezvous, (a, b) => `${a} ${b}`),
  combine(people, occasions, (a, b) => `${a} après ${b}`),
  combine(times, destinations, (a, b) => `${firstUpper(a)} à ${b}`),
  combine(times, occasions, (a, b) => `${firstUpper(a)} avant ${b}`)
].map((group) => group.filter((name) => !hasProductNameStopWords(name)));

const particles = new Set("a au aux d de des du en et l la le les un une sous sur".split(" "));

export function nameWords(name) {
  // Fold Latin accents after transliteration so Ukrainian й and ї keep their sound.
  return transliterateForPolicy(String(name ?? "").normalize("NFKC").toLowerCase())
    .normalize("NFKD").replace(/\p{M}/gu, "").replaceAll("œ", "oe").replaceAll("æ", "ae")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function nameKey(name) {
  return nameWords(name).join("");
}

export function catalogNameVariants(name) {
  const raw = String(name ?? "").trim();
  const variants = [raw, raw.match(/[«“"]([^»”"]+)[»”"]/u)?.[1],
    raw.replace(/^(?:букет(?:\s+квітів)?|квіти\s+в\s+коробці|bouquet)\s+[-–—:]?\s*/iu, ""),
    raw.split(/\s+[-–—|]\s+/u)[0]];
  return [...new Set(variants.filter(Boolean))];
}

function features(name) {
  const words = nameWords(name);
  return { key: words.join(""), terms: new Set(words.filter((w) => !particles.has(w))), first: words.find((w) => !particles.has(w)) };
}

function similar(a, b) {
  if (a.key === b.key) return true;
  const common = [...a.terms].filter((term) => b.terms.has(term)).length;
  if (a.terms.size === 2 && b.terms.size === 2 && common > 0) return true;
  return common >= 2 && common >= Math.max(a.terms.size, b.terms.size) - 1;
}

function* shuffled(items) {
  const remaining = items.slice();
  while (remaining.length) {
    const index = randomInt(remaining.length);
    const value = remaining[index];
    remaining[index] = remaining.at(-1);
    remaining.pop();
    yield value;
  }
}

export function randomNamingDirection() {
  const directions = [
    "a note one person might leave for another", "a fleeting scene on a journey",
    "a moment before the curtain rises", "a line overheard in a café",
    "an unexpected keepsake", "a memory told in a few words", "a small detail in a seaside town"
  ];
  return directions[randomInt(directions.length)];
}

export async function chooseBouquetName({ suggestion, usedNames, reserve, isBanned }) {
  const history = usedNames.map(features);
  const recentOpenings = new Set(history.slice(-8).map((item) => item.first));
  async function accept(candidate) {
    if (!candidate || !/\p{L}/u.test(candidate) || /\p{N}/u.test(candidate) || candidate.length < 5 ||
        candidate.length > 76 || candidate.split(/\s+/u).length < 2 || hasProductNameStopWords(candidate) || isBanned(candidate)) return false;
    const item = features(candidate);
    return !recentOpenings.has(item.first) && !history.some((old) => similar(item, old)) && await reserve(candidate);
  }

  if (await accept(suggestion)) return suggestion;
  if (randomInt(2) === 0) {
    for (const name of shuffled(signatures)) {
      if (await accept(name)) return name;
    }
  }
  // Interleave collections so a busy registry doesn't force a run of the same sentence pattern.
  const groups = [...shuffled(collections)].map((group) => shuffled(group));
  while (groups.length) {
    for (let i = groups.length - 1; i >= 0; i--) {
      const next = groups[i].next();
      if (next.done) groups.splice(i, 1);
      else if (await accept(next.value)) return next.value;
    }
  }
  // Extra scenes have three independent details for catalogs that outgrow shorter titles.
  for (const person of shuffled(people)) {
    for (const place of shuffled(places)) {
      for (const when of shuffled(rendezvous)) {
        const scene = `${person} à ${place} ${when}`;
        if (await accept(scene)) return scene;
      }
    }
  }
  throw new Error("Не знайшлося вільної назви букета. Картку з повтором не створено.");
}
