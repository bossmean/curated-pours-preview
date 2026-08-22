import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCocktailMenu, normaliseMenuInput, menuToLeadFields } from '../calculator/assets/js/cocktails.js';
import { RECIPES, ZERO_PROOF, PROFILES, SEASONS, SPIRITS, COCKTAIL_CONFIG } from '../calculator/assets/js/cocktail-config.js';

const base = {
  eventType: 'wedding', guests: 120, drinkingPct: 90, durationHours: 5,
  season: 'summer', profiles: ['bright'], spirits: ['gin', 'rum', 'tequila']
};
const menu = (over = {}) => buildCocktailMenu({ ...base, ...over });

test('every recipe in the library is well formed', () => {
  const types = new Set(['spirit', 'liqueur', 'wine', 'citrus', 'syrup', 'mixer', 'bitters', 'fresh']);
  const profileKeys = new Set(PROFILES.map(p => p.key));
  const seasonKeys = new Set(SEASONS.map(s => s.key));
  for (const r of [...RECIPES, ...ZERO_PROOF]) {
    assert.ok(r.name && r.key && r.blurb, `${r.key} needs a name, key and blurb`);
    assert.ok(r.build.length >= 2, `${r.name} needs a real build`);
    r.profiles.forEach(p => assert.ok(profileKeys.has(p), `${r.name} has unknown profile ${p}`));
    r.seasons.forEach(s => assert.ok(seasonKeys.has(s), `${r.name} has unknown season ${s}`));
    r.build.forEach(b => {
      assert.ok(types.has(b.type), `${r.name} has unknown ingredient type ${b.type}`);
      assert.ok(b.oz > 0 || b.perServing > 0 || b.dashes > 0, `${r.name}: ${b.name} has no quantity`);
    });
  }
});

test('recipe keys are unique', () => {
  const keys = [...RECIPES, ...ZERO_PROOF].map(r => r.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('a menu is three signatures plus one zero proof option', () => {
  const r = menu();
  assert.equal(r.ok, true);
  assert.equal(r.menu.filter(m => m.alcoholic).length, COCKTAIL_CONFIG.howManySignatures);
  assert.equal(r.menu.filter(m => !m.alcoholic).length, 1);
  r.menu.forEach(m => assert.ok(m.servings > 0, `${m.recipe.name} must have servings`));
});

test('the menu never repeats a base spirit while another is available', () => {
  const r = menu({ spirits: ['gin', 'vodka', 'whisky', 'rum', 'tequila'] });
  const spirits = r.menu.filter(m => m.alcoholic).map(m => m.recipe.spirit);
  assert.equal(new Set(spirits).size, spirits.length, `repeated a spirit: ${spirits.join(', ')}`);
});

test('a crowd that only drinks one spirit is not handed another', () => {
  // Vodka has enough recipes to fill a menu on its own.
  const r = menu({ spirits: ['vodka'] });
  r.menu.filter(m => m.alcoholic).forEach(m => {
    assert.equal(m.recipe.spirit, 'vodka', `${m.recipe.name} is not vodka`);
  });
});

test('the zero proof option never echoes a signature on the same menu', () => {
  for (const season of SEASONS.map(s => s.key)) {
    for (const p of PROFILES.map(x => x.key)) {
      const r = menu({ season, profiles: [p], spirits: SPIRITS.map(s => s.key) });
      const words = n => new Set(String(n).toLowerCase().match(/[a-z]{5,}/g) || []);
      const taken = new Set();
      r.menu.filter(m => m.alcoholic).forEach(m => words(m.recipe.name).forEach(w => taken.add(w)));
      const zero = r.menu.find(m => !m.alcoholic).recipe;
      const echo = [...words(zero.name)].filter(w => taken.has(w));
      assert.equal(echo.length, 0, `${season}/${p}: ${zero.name} echoes a signature on ${echo.join(', ')}`);
    }
  }
});

test('every combination of season, profile and spirit produces a full menu', () => {
  let built = 0;
  for (const season of SEASONS.map(s => s.key)) {
    for (const p of PROFILES.map(x => x.key)) {
      for (const sp of SPIRITS.map(x => x.key)) {
        const r = menu({ season, profiles: [p], spirits: [sp] });
        assert.equal(r.ok, true, `${season}/${p}/${sp} failed to build`);
        assert.equal(r.menu.length, COCKTAIL_CONFIG.howManySignatures + 1,
          `${season}/${p}/${sp} produced a short menu`);
        built++;
      }
    }
  }
  assert.ok(built === 4 * 5 * 6, `expected 120 combinations, ran ${built}`);
});

test('the shopping list is positive and covers every ingredient on the menu', () => {
  const r = menu();
  const listed = new Set(r.shoppingList.flatMap(g => g.items.map(i => i.name.toLowerCase())));
  assert.ok(r.shoppingList.length, 'the list must not be empty');
  r.shoppingList.forEach(g => g.items.forEach(i => {
    assert.ok(i.detail && !/^0\b/.test(i.detail), `${i.name} has an empty quantity: ${i.detail}`);
    if (i.bottles !== undefined) assert.ok(i.bottles >= 1, `${i.name} must round up to a whole bottle`);
    if (i.fruit !== undefined) assert.ok(i.fruit >= 1, `${i.name} must round up to a whole fruit`);
  }));
  // Every spirit on the menu has to appear somewhere in the list.
  r.menu.forEach(m => m.recipe.build
    .filter(b => b.type === 'spirit')
    .forEach(b => assert.ok(listed.has(b.name.toLowerCase()), `${b.name} is missing from the shopping list`)));
});

test('bottle counts scale with the guest count', () => {
  const small = menu({ guests: 30 });
  const large = menu({ guests: 400 });
  const bottles = r => r.shoppingList
    .filter(g => g.bucket === 'Spirits and liqueurs')
    .flatMap(g => g.items).reduce((a, i) => a + (i.bottles || 0), 0);
  assert.ok(bottles(large) > bottles(small));
});

test('incomplete taste answers are rejected', () => {
  assert.equal(normaliseMenuInput({}).ok, false);
  assert.equal(normaliseMenuInput({ season: 'summer', profiles: [], spirits: ['gin'] }).ok, false);
  assert.equal(normaliseMenuInput({ season: 'summer', profiles: ['bright'], spirits: [] }).ok, false);
  assert.equal(normaliseMenuInput({ season: 'monsoon', profiles: ['bright'], spirits: ['gin'] }).ok, false);
  assert.equal(menu({ guests: 0 }).ok, false);
});

test('unknown profiles and spirits are dropped rather than crashing', () => {
  const r = menu({ profiles: ['bright', 'nonsense'], spirits: ['gin', 'moonshine'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.prefs.profiles, ['bright']);
  assert.deepEqual(r.prefs.spirits, ['gin']);
});

test('the lead fields describe the menu that was built', () => {
  const r = menu();
  const f = menuToLeadFields(r);
  assert.equal(f.season, 'summer');
  assert.ok(f.cocktailMenu.split(', ').length === 4);
  assert.ok(f.cocktailServings > 0);
});
