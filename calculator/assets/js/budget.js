/*
 * Budget engine. A pricing layer on top of the bar plan, so the drink model
 * lives in exactly one place and the two tools can never disagree about how
 * many bottles an event needs.
 */

import { calculateBarPlan } from './calculator.js';
import { BUDGET_CONFIG } from './budget-config.js';

const round = n => Math.round(n);

/* Resolves the prices to use: the tier defaults, with any the visitor has
 * edited on the results screen taking precedence. */
export function resolvePrices(tierKey, overrides = {}) {
  const tier = BUDGET_CONFIG.tiers[tierKey];
  if (!tier) throw new Error(`Unknown quality tier: ${tierKey}`);
  const out = { ...tier.prices };
  for (const key of Object.keys(out)) {
    const v = Number(overrides[key]);
    const limits = BUDGET_CONFIG.priceLimits[key];
    if (Number.isFinite(v) && v >= limits[0] && v <= limits[1]) out[key] = v;
  }
  return out;
}

/*
 * Takes the same answers as the bar calculator plus a quality tier, and
 * returns the costed plan. Invalid input comes back as { ok: false, errors }.
 */
export function calculateBudget(rawInput) {
  const plan = calculateBarPlan(rawInput);
  if (!plan.ok) return plan;

  const tierKey = rawInput.qualityTier;
  if (!BUDGET_CONFIG.tiers[tierKey]) {
    return { ok: false, errors: ['Choose the quality of bottles you are planning for.'] };
  }

  const prices = resolvePrices(tierKey, rawInput.priceOverrides);
  const e = BUDGET_CONFIG.extras;
  const b = plan.beverages;

  const lines = [];
  const push = (key, label, qty, unitLabel, unitPrice, note) => {
    if (!qty) return;
    lines.push({ key, label, qty, unitLabel, unitPrice, cost: qty * unitPrice, note });
  };

  push('beer', 'Beer', b.beer ? b.beer.units : 0, 'bottles or cans', prices.beer);
  push('wine', 'Wine', b.wine ? b.wine.units : 0, 'bottles', prices.wine);
  push('spirits', 'Spirits', b.spirits ? b.spirits.units : 0, 'bottles', prices.spirits);

  // Mixers are costed at the midpoint of the recommended band.
  const mixerLitres = plan.mixers ? Math.round((plan.mixers.litresLow + plan.mixers.litresHigh) / 2) : 0;
  push('mixers', 'Mixers', mixerLitres, 'litres', e.mixerPerLitre);

  // Ice is costed at the midpoint of the recommended band.
  const iceLb = Math.round((plan.ice.lbLow + plan.ice.lbHigh) / 2);
  push('ice', 'Ice', iceLb, 'lb', e.icePerLb);

  push('garnish', 'Garnish', plan.drinkingGuests, 'drinking guests', e.garnishPerDrinkingGuest,
    'Citrus, herbs, olives and cherries.');
  push('supplies', 'Cups and napkins', plan.input.guests, 'guests', e.suppliesPerGuest,
    'Skip this if your venue supplies them.');

  const alcoholCost = lines.filter(l => ['beer', 'wine', 'spirits'].includes(l.key))
    .reduce((a, l) => a + l.cost, 0);
  const extrasCost = lines.filter(l => !['beer', 'wine', 'spirits'].includes(l.key))
    .reduce((a, l) => a + l.cost, 0);
  const subtotal = alcoholCost + extrasCost;

  const spread = BUDGET_CONFIG.rangeSpread;

  return {
    ok: true,
    plan,
    tier: { key: tierKey, ...BUDGET_CONFIG.tiers[tierKey] },
    prices,
    lines: lines.map(l => ({ ...l, cost: round(l.cost) })),
    alcoholCost: round(alcoholCost),
    extrasCost: round(extrasCost),
    subtotal: round(subtotal),
    low: round(subtotal * (1 - spread)),
    high: round(subtotal * (1 + spread)),
    perGuest: round((subtotal / plan.input.guests) * 100) / 100,
    perDrinkingGuest: round((subtotal / plan.drinkingGuests) * 100) / 100,
    // Bartending is deliberately not costed here. Service is quoted per event
    // and inventing a rate on a public page would be a made up number.
    bartendersNeeded: plan.bartenders.count
  };
}

/* Flattens a costed plan into the extra fields the lead record stores. */
export function budgetToLeadFields(budget) {
  if (!budget || !budget.ok) return {};
  return {
    qualityTier: budget.tier.key,
    qualityTierLabel: budget.tier.label,
    estimatedBudgetLow: budget.low,
    estimatedBudgetHigh: budget.high,
    estimatedPerGuest: budget.perGuest
  };
}
