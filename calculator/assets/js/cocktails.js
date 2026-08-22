/*
 * Signature cocktail menu engine.
 *
 * Builds a short menu from the recipe library, then batches it: how many of
 * each drink to make for this event, and the shopping list that adds up to.
 * Drink volume comes from the shared bar plan engine, so this tool and the
 * bar calculator can never disagree about how much a crowd drinks.
 */

import { calculateBarPlan } from './calculator.js';
import { COCKTAIL_CONFIG, RECIPES, ZERO_PROOF, PROFILES, SEASONS, SPIRITS } from './cocktail-config.js';

const C = COCKTAIL_CONFIG;
const OZ_PER_ML = 29.5735;

export function normaliseMenuInput(input = {}) {
  const errors = [];
  const seasons = new Set(SEASONS.map(s => s.key));
  const profiles = new Set(PROFILES.map(p => p.key));
  const spirits = new Set(SPIRITS.map(s => s.key));

  if (!seasons.has(input.season)) errors.push('Choose when in the year the event takes place.');

  const chosenProfiles = (input.profiles || []).filter(p => profiles.has(p));
  if (!chosenProfiles.length) errors.push('Choose at least one flavour direction.');

  const chosenSpirits = (input.spirits || []).filter(s => spirits.has(s));
  if (!chosenSpirits.length) errors.push('Choose at least one spirit your crowd drinks.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { season: input.season, profiles: chosenProfiles, spirits: chosenSpirits } };
}

/* Base fit, before any diversity bonus. */
function baseScore(recipe, { season, profiles, spirits, eventType }) {
  const w = C.weights;
  let score = 0;
  score += w.profile * recipe.profiles.filter(p => profiles.includes(p)).length;
  if (recipe.seasons.includes(season)) score += w.season;
  if (spirits.includes(recipe.spirit)) score += w.spirit;
  if (recipe.eventFit && recipe.eventFit.includes(eventType)) score += w.eventFit;
  return score;
}

/*
 * Picks the menu by fit, but never puts the same base spirit on it twice while
 * an unused spirit is still available. A short menu of three gin drinks is a
 * worse menu than three good drinks that go different places, so spirit
 * variety is a hard rule and the sipper, sour and long balance is a tiebreak.
 */
function pickSignatures(prefs, howMany) {
  const scored = RECIPES.map(r => ({ recipe: r, base: baseScore(r, prefs) }))
    .filter(x => x.base > 0)
    .sort((a, b) => b.base - a.base || a.recipe.name.localeCompare(b.recipe.name));

  // Someone who says their crowd drinks vodka should not be handed gin. Only
  // reach outside the spirits they chose if there are not enough drinks in
  // the library to fill the menu from inside them.
  const preferred = scored.filter(x => prefs.spirits.includes(x.recipe.spirit));
  const rest = scored.filter(x => !prefs.spirits.includes(x.recipe.spirit));
  const pool = preferred.length >= howMany ? preferred : preferred.concat(rest);

  const chosen = [];
  const usedSpirits = new Set();
  const usedAbv = new Set();

  const take = candidates => {
    let bestIdx = -1;
    let bestScore = -Infinity;
    candidates.forEach(i => {
      const s = pool[i].base + (usedAbv.has(pool[i].recipe.abv) ? 0 : 1);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    if (bestIdx < 0) return null;
    const picked = pool.splice(bestIdx, 1)[0].recipe;
    chosen.push(picked);
    usedSpirits.add(picked.spirit);
    usedAbv.add(picked.abv);
    return picked;
  };

  while (chosen.length < howMany && pool.length) {
    const fresh = pool.map((x, i) => i).filter(i => !usedSpirits.has(pool[i].recipe.spirit));
    // Only allow a repeat spirit once every spirit in the pool is on the menu.
    const taken = take(fresh.length ? fresh : pool.map((x, i) => i));
    if (!taken) break;
  }
  return chosen;
}

/* Distinctive words in a drink name, used to stop the zero proof option from
 * being a near copy of something already on the menu. */
function nameTokens(name) {
  return new Set(String(name).toLowerCase().match(/[a-z]{5,}/g) || []);
}

function pickZeroProof(prefs, signatures) {
  const taken = new Set();
  signatures.forEach(s => nameTokens(s.name).forEach(t => taken.add(t)));

  const ranked = ZERO_PROOF
    .map(r => {
      const echoes = [...nameTokens(r.name)].some(t => taken.has(t));
      return {
        recipe: r,
        score: C.weights.profile * r.profiles.filter(p => prefs.profiles.includes(p)).length
          + (r.seasons.includes(prefs.season) ? C.weights.season : 0)
          // A zero proof Paloma next to a Paloma is one drink, not two.
          - (echoes ? 100 : 0)
      };
    })
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name));
  return ranked[0].recipe;
}

/* ------------------------------------------------------- shopping list */

const BUCKET = {
  spirit: 'Spirits and liqueurs',
  liqueur: 'Spirits and liqueurs',
  wine: 'Wine and sparkling',
  citrus: 'Fresh citrus',
  syrup: 'Syrups',
  mixer: 'Mixers',
  bitters: 'Bitters',
  fresh: 'Fresh and produce'
};

function fruitOzPer(fruit) {
  if (fruit === 'lemon') return C.conversions.ozPerLemonFruit;
  if (fruit === 'grapefruit') return C.conversions.ozPerGrapefruitFruit;
  return C.conversions.ozPerLimeFruit;
}

function buildShoppingList(items) {
  // items: [{ recipe, servings }]
  const totals = new Map();

  for (const { recipe, servings } of items) {
    for (const ing of recipe.build) {
      const key = `${ing.type}::${ing.name}`;
      const entry = totals.get(key) || { name: ing.name, type: ing.type, fruit: ing.fruit, unit: ing.unit, per: ing.per, oz: 0, count: 0, dashes: 0 };
      if (ing.oz) entry.oz += ing.oz * servings;
      if (ing.perServing) entry.count += ing.perServing * servings;
      if (ing.dashes) entry.dashes += ing.dashes * servings;
      totals.set(key, entry);
    }
  }

  const out = [];
  for (const e of totals.values()) {
    const line = { name: e.name, bucket: BUCKET[e.type] || 'Other', type: e.type };
    switch (e.type) {
      case 'spirit':
      case 'liqueur':
      case 'wine':
        line.bottles = Math.ceil(e.oz / C.conversions.ozPerBottle750);
        line.detail = `${line.bottles} ${line.bottles === 1 ? 'bottle' : 'bottles'} (750 ml)`;
        line.sortOz = e.oz;
        break;
      case 'citrus': {
        const per = fruitOzPer(e.fruit);
        const noun = e.fruit || 'lime';
        line.fruit = Math.ceil(e.oz / per);
        line.name = noun === 'grapefruit'
          ? 'Grapefruit'
          : noun.charAt(0).toUpperCase() + noun.slice(1) + 's';
        line.detail = `${line.fruit} whole, for about ${(e.oz / 33.814).toFixed(1)} L of fresh juice`;
        line.sortOz = e.oz;
        break;
      }
      case 'syrup': {
        const ml = Math.round((e.oz * OZ_PER_ML) / 50) * 50;
        line.detail = ml >= 1000 ? `${(ml / 1000).toFixed(1)} litres` : `${Math.max(50, ml)} ml`;
        line.sortOz = e.oz;
        break;
      }
      case 'mixer': {
        const litres = Math.ceil(e.oz / C.conversions.ozPerLitre);
        line.detail = `${litres} ${litres === 1 ? 'litre' : 'litres'}`;
        line.sortOz = e.oz;
        break;
      }
      case 'bitters':
        line.detail = `${Math.ceil(e.dashes)} dashes, one bottle covers it`;
        line.sortOz = 0;
        break;
      case 'fresh': {
        const n = Math.ceil(e.count);
        line.detail = `${n} ${e.unit || 'pieces'}`;
        if (e.per) {
          const whole = Math.ceil(n / e.per.count);
          const noun = whole === 1 ? e.per.of : (e.per.ofPlural || `${e.per.of}s`);
          line.detail += `, about ${whole} ${noun}`;
        }
        line.sortOz = 0;
        break;
      }
      default:
        line.detail = '';
        line.sortOz = 0;
    }
    out.push(line);
  }

  // Group into buckets, biggest volume first inside each.
  const order = ['Spirits and liqueurs', 'Wine and sparkling', 'Mixers', 'Fresh citrus', 'Syrups', 'Fresh and produce', 'Bitters', 'Other'];
  const grouped = order
    .map(b => ({ bucket: b, items: out.filter(l => l.bucket === b).sort((x, y) => y.sortOz - x.sortOz) }))
    .filter(g => g.items.length);
  return grouped;
}

/* ------------------------------------------------------------- entry point */

export function buildCocktailMenu(rawInput) {
  // The drink volume model does not care which cocktails are on the menu, so
  // the bar style is fixed at cocktail-focused here.
  const plan = calculateBarPlan({ ...rawInput, barStyle: 'cocktail', drinkingProfile: rawInput.drinkingProfile || 'average' });
  if (!plan.ok) return plan;

  const check = normaliseMenuInput(rawInput);
  if (!check.ok) return check;
  const prefs = { ...check.value, eventType: plan.input.eventType };

  const signatures = pickSignatures(prefs, C.howManySignatures);
  if (!signatures.length) {
    return { ok: false, errors: ['Nothing in our library matched that combination. Try another flavour direction.'] };
  }

  const signatureServings = Math.round(plan.totalDrinks * C.signatureShareOfDrinks);
  const perDrink = Math.max(1, Math.ceil(signatureServings / signatures.length));
  const zeroProof = pickZeroProof(prefs, signatures);
  const zeroProofServings = Math.max(1, Math.round(plan.input.guests * C.nonAlcoholicShareOfGuests));

  const menu = signatures.map(r => ({ recipe: r, servings: perDrink, alcoholic: true }));
  menu.push({ recipe: zeroProof, servings: zeroProofServings, alcoholic: false });

  return {
    ok: true,
    plan,
    prefs,
    menu,
    signatureServings: perDrink * signatures.length,
    zeroProofServings,
    shoppingList: buildShoppingList(menu),
    totalCocktails: perDrink * signatures.length + zeroProofServings
  };
}

/* Flattens a menu into the extra fields the lead record stores. */
export function menuToLeadFields(result) {
  if (!result || !result.ok) return {};
  return {
    season: result.prefs.season,
    flavourProfiles: result.prefs.profiles.join(', '),
    preferredSpirits: result.prefs.spirits.join(', '),
    cocktailMenu: result.menu.map(m => m.recipe.name).join(', '),
    cocktailServings: result.totalCocktails
  };
}
