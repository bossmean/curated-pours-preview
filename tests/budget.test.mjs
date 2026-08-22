import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget, resolvePrices, budgetToLeadFields } from '../calculator/assets/js/budget.js';
import { BUDGET_CONFIG, TIER_ORDER } from '../calculator/assets/js/budget-config.js';

const base = {
  eventType: 'wedding', guests: 100, drinkingPct: 75, durationHours: 5,
  barStyle: 'full-bar', drinkingProfile: 'average', qualityTier: 'mid'
};
const budget = (over = {}) => calculateBudget({ ...base, ...over });

test('a costed plan adds up to the sum of its lines', () => {
  const b = budget();
  assert.equal(b.ok, true);
  const summed = b.lines.reduce((a, l) => a + l.cost, 0);
  assert.ok(Math.abs(summed - b.subtotal) <= b.lines.length, 'lines must reconcile to the subtotal');
  assert.equal(b.alcoholCost + b.extrasCost, b.subtotal);
  assert.ok(b.low < b.subtotal && b.subtotal < b.high, 'the band must straddle the subtotal');
});

test('every quality tier produces a positive, ordered cost', () => {
  const costs = TIER_ORDER.map(t => budget({ qualityTier: t }).subtotal);
  assert.ok(costs.every(c => c > 0), 'no tier may cost nothing');
  for (let i = 1; i < costs.length; i++) {
    assert.ok(costs[i] > costs[i - 1], `${TIER_ORDER[i]} must cost more than ${TIER_ORDER[i - 1]}`);
  }
});

test('cost per guest is the subtotal divided by the guest count', () => {
  const b = budget({ guests: 200 });
  assert.ok(Math.abs(b.perGuest - b.subtotal / 200) < 0.01);
  assert.ok(b.perDrinkingGuest > b.perGuest, 'fewer drinkers means a higher cost each');
});

test('a beer and wine bar is never charged for spirits or mixers', () => {
  const b = budget({ barStyle: 'beer-wine' });
  assert.equal(b.lines.find(l => l.key === 'spirits'), undefined);
  assert.equal(b.lines.find(l => l.key === 'mixers'), undefined);
});

test('more guests always costs more, never less', () => {
  let last = 0;
  for (const guests of [10, 50, 100, 250, 500, 1000]) {
    const b = budget({ guests });
    assert.ok(b.subtotal > last, `${guests} guests should cost more than the step below`);
    last = b.subtotal;
  }
});

test('edited prices are used, and nonsense prices are ignored', () => {
  const normal = budget().subtotal;
  const dearer = budget({ priceOverrides: { spirits: 120 } }).subtotal;
  assert.ok(dearer > normal, 'a higher spirit price must raise the total');

  const limits = BUDGET_CONFIG.priceLimits.spirits;
  for (const bad of [-5, 0, limits[1] + 1, 'abc', null, undefined, NaN, Infinity]) {
    const p = resolvePrices('mid', { spirits: bad });
    assert.equal(p.spirits, BUDGET_CONFIG.tiers.mid.prices.spirits, `${bad} should fall back to the tier price`);
  }
});

test('bad input is rejected rather than costed', () => {
  assert.equal(calculateBudget({}).ok, false);
  assert.equal(calculateBudget({ ...base, qualityTier: 'platinum' }).ok, false);
  assert.equal(calculateBudget({ ...base, guests: 0 }).ok, false);
  assert.equal(calculateBudget({ ...base, guests: -100 }).ok, false);
});

test('bartending is counted but never priced, because service is quoted', () => {
  const b = budget();
  assert.ok(b.bartendersNeeded >= 1);
  assert.equal(b.lines.find(l => /bartend|staff|service/i.test(l.label)), undefined,
    'no invented service rate may appear in the cost lines');
});

test('the lead fields carry the numbers a follow up would need', () => {
  const f = budgetToLeadFields(budget());
  assert.equal(f.qualityTier, 'mid');
  assert.ok(f.estimatedBudgetLow > 0 && f.estimatedBudgetHigh > f.estimatedBudgetLow);
  assert.ok(f.estimatedPerGuest > 0);
});
