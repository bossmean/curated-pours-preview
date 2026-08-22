/*
 * Pure calculation engine. No DOM, no side effects, no network.
 * Every rate it uses comes from CONFIG so the assumptions stay in one place.
 */

import { CONFIG } from './config.js';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* Resolves 'not-sure' to the style it falls back to. */
export function resolveBarStyle(styleKey) {
  const style = CONFIG.barStyles[styleKey];
  if (!style) throw new Error(`Unknown bar style: ${styleKey}`);
  if (style.fallsBackTo) {
    const target = CONFIG.barStyles[style.fallsBackTo];
    return {
      key: style.fallsBackTo,
      selectedKey: styleKey,
      label: target.label,
      selectedLabel: style.label,
      mix: target.mix,
      serviceNoun: target.serviceNoun,
      bartenderRatio: target.bartenderRatio,
      iceHighEnd: target.iceHighEnd,
      isRecommendation: true
    };
  }
  return {
    key: styleKey,
    selectedKey: styleKey,
    label: style.label,
    selectedLabel: style.label,
    mix: style.mix,
    serviceNoun: style.serviceNoun,
    bartenderRatio: style.bartenderRatio,
    iceHighEnd: style.iceHighEnd,
    isRecommendation: false
  };
}

/* Validates and normalises raw answers before any maths runs. */
export function normaliseInput(input = {}) {
  const L = CONFIG.limits;
  const errors = [];

  const guests = Math.round(Number(input.guests));
  if (!Number.isFinite(guests)) {
    errors.push('Enter the number of guests you are expecting.');
  } else if (guests < L.guestsMin || guests > L.guestsMax) {
    errors.push(`Guest count must be between ${L.guestsMin} and ${L.guestsMax}.`);
  }

  const drinkingPct = Math.round(Number(input.drinkingPct));
  if (!Number.isFinite(drinkingPct)) {
    errors.push('Choose roughly what share of guests will be drinking.');
  }

  const durationHours = Math.round(Number(input.durationHours));
  if (!Number.isFinite(durationHours)) {
    errors.push('Choose how long the bar will be open.');
  }

  if (!CONFIG.barStyles[input.barStyle]) errors.push('Choose a bar style.');
  if (!CONFIG.drinks.profileMultipliers[input.drinkingProfile]) errors.push('Choose a drinking profile.');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      eventType: input.eventType || 'other',
      guests: clamp(guests, L.guestsMin, L.guestsMax),
      drinkingPct: clamp(drinkingPct, L.drinkingPctMin, L.drinkingPctMax),
      durationHours: clamp(durationHours, L.durationMinHours, L.durationMaxHours),
      barStyle: input.barStyle,
      drinkingProfile: input.drinkingProfile
    }
  };
}

/* Drinks per drinking guest, before the profile multiplier. */
export function baseDrinksPerDrinker(durationHours) {
  const d = CONFIG.drinks;
  return d.firstHourPerDrinker + Math.max(0, durationHours - 1) * d.additionalHourPerDrinker;
}

function mixerEstimate(spiritServings) {
  const m = CONFIG.mixers;
  if (spiritServings <= 0) return null;
  const litresLow = Math.round((spiritServings * m.ozPerMixedDrinkLow) / m.ozPerLitre);
  const litresHigh = Math.round((spiritServings * m.ozPerMixedDrinkHigh) / m.ozPerLitre);
  const low = Math.max(1, litresLow);
  const high = Math.max(low, litresHigh);
  const midpoint = (low + high) / 2;
  return {
    litresLow: low,
    litresHigh: high,
    breakdown: m.breakdown.map(item => ({
      key: item.key,
      label: item.label,
      litres: Math.max(1, Math.round(midpoint * item.share))
    }))
  };
}

function iceEstimate(guests, style, durationHours) {
  const ice = CONFIG.ice;
  const highEnd = Boolean(style.iceHighEnd) || durationHours >= ice.longEventHours;
  const perGuestLow = highEnd ? ice.lbPerGuestLowBumped : ice.lbPerGuestLow;
  const lbLow = Math.round(guests * perGuestLow);
  const lbHigh = Math.round(guests * ice.lbPerGuestHigh);
  return {
    lbLow,
    lbHigh: Math.max(lbLow, lbHigh),
    kgLow: Math.round(lbLow / ice.lbPerKg),
    kgHigh: Math.round(Math.max(lbLow, lbHigh) / ice.lbPerKg),
    usedHighEnd: highEnd
  };
}

function bartenderEstimate(guests, style) {
  const s = CONFIG.staffing;
  const raw = Math.ceil(guests / style.bartenderRatio);
  const count = clamp(raw, s.minBartenders, s.maxBartenders);
  const plural = count === 1 ? 'bartender' : 'bartenders';
  const lead = count === 1
    ? 'one bartender should keep service moving'
    : `${numberWord(count)} ${plural} should keep service moving`;
  return {
    count,
    ratio: style.bartenderRatio,
    reasoning: `For a ${style.serviceNoun} serving ${guests} guests, ${lead} and reduce lineups.`
  };
}

/* Distributes a whole number across shares without losing or inventing units. */
function splitServings(total, mix) {
  const keys = ['beer', 'wine', 'spirits'];
  const out = {};
  let assigned = 0;
  keys.forEach(k => {
    out[k] = mix[k] > 0 ? Math.round(total * mix[k]) : 0;
    assigned += out[k];
  });
  const remainder = total - assigned;
  if (remainder !== 0) {
    const biggest = keys.filter(k => mix[k] > 0).sort((a, b) => mix[b] - mix[a])[0];
    if (biggest) out[biggest] = Math.max(0, out[biggest] + remainder);
  }
  return out;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function numberWord(n) {
  return WORDS[n] || String(n);
}

/*
 * Main entry point. Takes raw answers, returns the full bar plan.
 * Throws nothing: invalid input comes back as { ok: false, errors: [...] }.
 */
export function calculateBarPlan(rawInput) {
  const check = normaliseInput(rawInput);
  if (!check.ok) return check;
  const input = check.value;

  const style = resolveBarStyle(input.barStyle);
  const multiplier = CONFIG.drinks.profileMultipliers[input.drinkingProfile];

  const drinkingGuests = Math.max(1, Math.round(input.guests * (input.drinkingPct / 100)));
  const perDrinkerBase = baseDrinksPerDrinker(input.durationHours);
  const perDrinker = perDrinkerBase * multiplier;
  const totalDrinks = Math.max(1, Math.round(drinkingGuests * perDrinker));

  // Split the drink count across the beverage categories. The category with
  // the largest share absorbs the rounding remainder so the parts always add
  // back up to the total, and a category set to zero always stays at zero.
  const split = splitServings(totalDrinks, style.mix);
  const beerServings = split.beer;
  const wineServings = split.wine;
  const spiritServings = split.spirits;

  const sv = CONFIG.servings;
  const beverages = {
    beer: style.mix.beer > 0
      ? { servings: beerServings, units: Math.ceil(beerServings / sv.beerServingsPerUnit), unitLabel: 'bottles/cans' }
      : null,
    wine: style.mix.wine > 0
      ? { servings: wineServings, units: Math.ceil(wineServings / sv.wineServingsPerBottle), unitLabel: 'bottles' }
      : null,
    spirits: style.mix.spirits > 0
      ? { servings: spiritServings, units: Math.ceil(spiritServings / sv.spiritServingsPerBottle), unitLabel: 'bottles' }
      : null
  };

  return {
    ok: true,
    input,
    style,
    drinkingGuests,
    perDrinkerBase,
    perDrinker: Math.round(perDrinker * 10) / 10,
    multiplier,
    totalDrinks,
    beverages,
    mixers: style.mix.spirits > 0 ? mixerEstimate(spiritServings) : null,
    ice: iceEstimate(input.guests, style, input.durationHours),
    bartenders: bartenderEstimate(input.guests, style)
  };
}

/* Flattens a plan into the shape the lead record stores. */
export function planToLeadFields(plan) {
  if (!plan || !plan.ok) return {};
  const b = plan.beverages;
  return {
    guestCount: plan.input.guests,
    drinkingPct: plan.input.drinkingPct,
    estimatedDrinkingGuests: plan.drinkingGuests,
    durationHours: plan.input.durationHours,
    barStyle: plan.style.selectedKey,
    barStyleLabel: plan.style.selectedLabel,
    barStyleResolved: plan.style.key,
    drinkingProfile: plan.input.drinkingProfile,
    estimatedTotalDrinks: plan.totalDrinks,
    beerUnits: b.beer ? b.beer.units : 0,
    wineBottles: b.wine ? b.wine.units : 0,
    spiritBottles: b.spirits ? b.spirits.units : 0,
    mixerLitresLow: plan.mixers ? plan.mixers.litresLow : 0,
    mixerLitresHigh: plan.mixers ? plan.mixers.litresHigh : 0,
    iceLbLow: plan.ice.lbLow,
    iceLbHigh: plan.ice.lbHigh,
    recommendedBartenders: plan.bartenders.count
  };
}
