/*
 * Scenario tests for the bar plan engine and the lead scoring.
 *   node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBarPlan, resolveBarStyle, baseDrinksPerDrinker } from '../calculator/assets/js/calculator.js';
import { scoreLead, bandFor } from '../calculator/assets/js/scoring.js';
import { CONFIG } from '../calculator/assets/js/config.js';

const plan = (over = {}) => calculateBarPlan({
  eventType: 'wedding', guests: 100, drinkingPct: 75,
  durationHours: 5, barStyle: 'full-bar', drinkingProfile: 'average', ...over
});

/* ------------------------------------------------------- the worked example */

test('the specification worked example reproduces exactly', () => {
  const p = plan();
  assert.equal(p.ok, true);
  assert.equal(p.drinkingGuests, 75);
  assert.equal(p.perDrinker, 6);
  assert.equal(p.totalDrinks, 450);
  assert.equal(p.beverages.beer.units, 135);
  assert.equal(p.beverages.wine.units, 23);
  assert.equal(p.beverages.spirits.units, 13);
  assert.equal(p.ice.lbLow, 125);
  assert.equal(p.ice.lbHigh, 150);
  assert.equal(p.ice.kgLow, 57);
  assert.equal(p.ice.kgHigh, 68);
  assert.equal(p.bartenders.count, 2);
});

test('drinks per drinker follows two in the first hour then one per hour', () => {
  assert.equal(baseDrinksPerDrinker(2), 3);
  assert.equal(baseDrinksPerDrinker(5), 6);
  assert.equal(baseDrinksPerDrinker(7), 8);
});

/* ---------------------------------------------------- the required scenarios */

const SCENARIOS = [
  { name: '50 person birthday, beer and wine, light',
    input: { eventType: 'birthday', guests: 50, drinkingPct: 75, durationHours: 4, barStyle: 'beer-wine', drinkingProfile: 'light' } },
  { name: '100 person wedding, full bar, average',
    input: { eventType: 'wedding', guests: 100, drinkingPct: 90, durationHours: 5, barStyle: 'full-bar', drinkingProfile: 'average' } },
  { name: '200 person corporate event, mixed drinks, average',
    input: { eventType: 'corporate', guests: 200, drinkingPct: 50, durationHours: 3, barStyle: 'beer-wine-mixed', drinkingProfile: 'average' } },
  { name: 'cocktail focused, lively crowd',
    input: { eventType: 'engagement', guests: 120, drinkingPct: 100, durationHours: 6, barStyle: 'cocktail', drinkingProfile: 'lively' } },
  { name: 'smallest possible event',
    input: { eventType: 'private-party', guests: 10, drinkingPct: 25, durationHours: 2, barStyle: 'beer-wine', drinkingProfile: 'light' } },
  { name: 'largest possible event',
    input: { eventType: 'corporate', guests: 1000, drinkingPct: 100, durationHours: 7, barStyle: 'full-bar', drinkingProfile: 'lively' } },
  { name: 'not sure falls back to full bar',
    input: { eventType: 'other', guests: 80, drinkingPct: 75, durationHours: 4, barStyle: 'not-sure', drinkingProfile: 'average' } }
];

for (const s of SCENARIOS) {
  test(`${s.name}: produces a sane plan`, () => {
    const p = calculateBarPlan(s.input);
    assert.equal(p.ok, true, `expected ${s.name} to calculate`);

    // Nothing negative, nothing impossible.
    assert.ok(p.totalDrinks > 0, 'total drinks must be positive');
    assert.ok(p.drinkingGuests > 0 && p.drinkingGuests <= s.input.guests, 'drinking guests within the guest count');
    assert.ok(p.ice.lbLow > 0 && p.ice.lbHigh >= p.ice.lbLow, 'ice band must be positive and ordered');
    assert.ok(p.ice.kgLow > 0 && p.ice.kgHigh >= p.ice.kgLow, 'ice in kg must be positive and ordered');
    assert.ok(p.bartenders.count >= 1, 'at least one bartender');
    assert.ok(Number.isInteger(p.bartenders.count), 'bartender count is whole');

    for (const [key, cat] of Object.entries(p.beverages)) {
      if (!cat) continue;
      assert.ok(Number.isInteger(cat.units), `${key} units must be whole`);
      assert.ok(cat.units > 0, `${key} units must be positive when the category is shown`);
      assert.ok(cat.units >= Math.ceil(cat.servings / servingsPer(key)), `${key} must round up`);
    }

    if (p.mixers) {
      assert.ok(p.mixers.litresLow > 0, 'mixer low bound positive');
      assert.ok(p.mixers.litresHigh >= p.mixers.litresLow, 'mixer band ordered');
      p.mixers.breakdown.forEach(m => assert.ok(m.litres > 0, `${m.label} must be positive`));
    }
  });
}

function servingsPer(key) {
  if (key === 'beer') return CONFIG.servings.beerServingsPerUnit;
  if (key === 'wine') return CONFIG.servings.wineServingsPerBottle;
  return CONFIG.servings.spiritServingsPerBottle;
}

/* ------------------------------------------------------------- category mix */

test('beer and wine only never shows a spirits card and never loses drinks', () => {
  const p = plan({ barStyle: 'beer-wine' });
  assert.equal(p.beverages.spirits, null);
  assert.equal(p.mixers, null);
  assert.equal(p.beverages.beer.servings + p.beverages.wine.servings, p.totalDrinks);
});

test('every bar style splits the exact total across its categories', () => {
  for (const style of ['beer-wine', 'beer-wine-mixed', 'full-bar', 'cocktail']) {
    for (const guests of [10, 37, 63, 100, 249, 1000]) {
      const p = plan({ barStyle: style, guests });
      const sum = ['beer', 'wine', 'spirits']
        .map(k => (p.beverages[k] ? p.beverages[k].servings : 0))
        .reduce((a, b) => a + b, 0);
      assert.equal(sum, p.totalDrinks, `${style} at ${guests} guests lost or invented servings`);
    }
  }
});

test('bar style percentages in config always add to one', () => {
  for (const [key, style] of Object.entries(CONFIG.barStyles)) {
    if (!style.mix) continue;
    const total = style.mix.beer + style.mix.wine + style.mix.spirits;
    assert.ok(Math.abs(total - 1) < 1e-9, `${key} mix adds to ${total}`);
  }
});

test('mixer breakdown shares in config add to one', () => {
  const total = CONFIG.mixers.breakdown.reduce((a, b) => a + b.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `mixer shares add to ${total}`);
});

/* ------------------------------------------------------------- multipliers */

test('drinking profile scales the total in the right direction', () => {
  const light = plan({ drinkingProfile: 'light' }).totalDrinks;
  const average = plan({ drinkingProfile: 'average' }).totalDrinks;
  const lively = plan({ drinkingProfile: 'lively' }).totalDrinks;
  assert.ok(light < average && average < lively, `${light} < ${average} < ${lively}`);
  assert.equal(light, Math.round(average * CONFIG.drinks.profileMultipliers.light));
  assert.equal(lively, Math.round(average * CONFIG.drinks.profileMultipliers.lively));
});

test('a longer bar means more drinks and more ice', () => {
  const short = plan({ durationHours: 2 });
  const long = plan({ durationHours: 7 });
  assert.ok(long.totalDrinks > short.totalDrinks);
  assert.ok(long.ice.lbLow >= short.ice.lbLow);
});

test('short beer and wine events use the lower ice band, long ones do not', () => {
  const short = plan({ barStyle: 'beer-wine', durationHours: 3 });
  const long = plan({ barStyle: 'beer-wine', durationHours: 6 });
  assert.equal(short.ice.usedHighEnd, false);
  assert.equal(long.ice.usedHighEnd, true);
  assert.ok(long.ice.lbLow > short.ice.lbLow);
});

/* ------------------------------------------------------------- staffing */

test('bartender counts round up and follow the style ratio', () => {
  assert.equal(plan({ guests: 120, barStyle: 'full-bar' }).bartenders.count, 3);
  assert.equal(plan({ guests: 100, barStyle: 'full-bar' }).bartenders.count, 2);
  assert.equal(plan({ guests: 101, barStyle: 'full-bar' }).bartenders.count, 3);
  assert.equal(plan({ guests: 75, barStyle: 'beer-wine' }).bartenders.count, 1);
  assert.equal(plan({ guests: 76, barStyle: 'beer-wine' }).bartenders.count, 2);
});

test('the bartender reasoning reads as a full sentence', () => {
  const p = plan({ guests: 120, barStyle: 'full-bar' });
  assert.equal(
    p.bartenders.reasoning,
    'For a full bar serving 120 guests, three bartenders should keep service moving and reduce lineups.'
  );
});

/* ------------------------------------------------------------ not sure */

test('not sure resolves to full bar and is flagged as a recommendation', () => {
  const r = resolveBarStyle('not-sure');
  assert.equal(r.key, 'full-bar');
  assert.equal(r.selectedKey, 'not-sure');
  assert.equal(r.isRecommendation, true);
  const p = plan({ barStyle: 'not-sure' });
  assert.deepEqual(p.beverages.beer !== null, true);
  assert.equal(p.style.isRecommendation, true);
});

/* ------------------------------------------------------------ validation */

test('bad input is rejected rather than producing nonsense', () => {
  assert.equal(calculateBarPlan({}).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, guests: 0 }).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, guests: -50 }).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, guests: 5000 }).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, guests: 'abc' }).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, barStyle: 'nope' }).ok, false);
  assert.equal(calculateBarPlan({ ...plan().input, drinkingProfile: 'wild' }).ok, false);
});

test('out of range percentages and durations clamp instead of breaking', () => {
  const p = calculateBarPlan({ ...plan().input, drinkingPct: 400, durationHours: 99 });
  assert.equal(p.ok, true);
  assert.equal(p.input.drinkingPct, 100);
  assert.equal(p.input.durationHours, CONFIG.limits.durationMaxHours);
});

/* --------------------------------------------------------------- scoring */

const inDays = n => {
  const d = new Date('2026-08-22T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const NOW = new Date('2026-08-22T00:00:00');

test('lead score adds up the way the rules describe', () => {
  const hot = scoreLead({
    eventDate: inDays(30), eventType: 'wedding', guestCount: 180,
    phone: '416 555 0134', requestedQuote: true, requestedEmailPlan: false
  }, NOW);
  // 3 near date + 3 large + 2 wedding + 5 quote + 2 phone = 15
  assert.equal(hot.score, 15);
  assert.equal(hot.band, 'High Intent');

  const cold = scoreLead({
    eventDate: inDays(400), eventType: 'backyard', guestCount: 30,
    phone: '', requestedQuote: false, requestedEmailPlan: true
  }, NOW);
  assert.equal(cold.score, 1);
  assert.equal(cold.band, 'Low Intent');

  const warm = scoreLead({
    eventDate: inDays(45), eventType: 'corporate', guestCount: 60,
    phone: '', requestedQuote: false, requestedEmailPlan: true
  }, NOW);
  // 3 near date + 2 corporate + 1 emailed plan = 6
  assert.equal(warm.score, 6);
  assert.equal(warm.band, 'Medium Intent');
});

test('an event exactly on the ninety day edge still counts, past dates do not', () => {
  assert.equal(scoreLead({ eventDate: inDays(90), guestCount: 10 }, NOW).score, CONFIG.scoring.rules.eventWithin90Days);
  assert.equal(scoreLead({ eventDate: inDays(91), guestCount: 10 }, NOW).score, 0);
  assert.equal(scoreLead({ eventDate: inDays(-1), guestCount: 10 }, NOW).score, 0);
});

test('intent bands line up with the configured thresholds', () => {
  assert.equal(bandFor(CONFIG.scoring.bands.high), 'High Intent');
  assert.equal(bandFor(CONFIG.scoring.bands.high - 1), 'Medium Intent');
  assert.equal(bandFor(CONFIG.scoring.bands.medium), 'Medium Intent');
  assert.equal(bandFor(CONFIG.scoring.bands.medium - 1), 'Low Intent');
  assert.equal(bandFor(0), 'Low Intent');
});
