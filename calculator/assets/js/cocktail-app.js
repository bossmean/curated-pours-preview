/*
 * Controller for the Signature Cocktail Menu Builder. Two of its questions
 * accept more than one answer, which is the main way it differs from the
 * other two tools.
 */

import { CONFIG, EVENT_TYPES, DRINKING_PCT_OPTIONS, DURATION_OPTIONS } from './config.js';
import { COCKTAIL_CONFIG, SEASONS, PROFILES, SPIRITS } from './cocktail-config.js';
import { buildCocktailMenu, menuToLeadFields } from './cocktails.js';
import { planToLeadFields } from './calculator.js';
import { track, trackOnce, EVENTS } from './analytics.js';
import { createLeadStore } from './lead-store.js';
import { wireLeadForms, recapHtml } from './lead-forms.js';
import {
  $, fmt, plural, prettyDate, escapeHtml, prefersReducedMotion, newSessionId,
  mountOptions, syncSelected, showError, clearError, createStepper,
  lockPastDates, POSTAL_RE, normalisePostal
} from './ui.js';

const TOTAL_STEPS = 6;
const STEP_NAMES = ['Event type', 'Guest count', 'Bar hours', 'Season', 'Taste', 'Date and place'];
const MAX_PROFILES = 2;
const leadStore = createLeadStore();

const state = {
  sessionId: newSessionId(),
  eventType: null, guests: 100, drinkingPct: 75, durationHours: null,
  season: null, profiles: [], spirits: [],
  eventDate: '', eventCity: '', postalCode: '',
  result: null, started: false
};

const eventTypeLabel = key => (EVENT_TYPES.find(t => t.key === key) || { label: 'Event' }).label;
const seasonLabel = key => (SEASONS.find(s => s.key === key) || { label: '' }).label;
const durationLabel = h => (h >= CONFIG.limits.durationMaxHours ? '7+ hours' : `${h} hours`);

function renderOptions() {
  mountOptions($('eventTypeOpts'), EVENT_TYPES.map(t => ({ value: t.key, label: t.label, group: 'eventType', center: true })));
  mountOptions($('drinkingPctOpts'), DRINKING_PCT_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'drinkingPct', center: true })));
  mountOptions($('durationOpts'), DURATION_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'durationHours', center: true })));
  mountOptions($('seasonOpts'), SEASONS.map(s => ({ value: s.key, label: s.label, blurb: s.blurb, group: 'season' })));
  mountOptions($('profileOpts'), PROFILES.map(p => ({ value: p.key, label: p.label, blurb: p.blurb, group: 'profiles' })));
  mountOptions($('spiritOpts'), SPIRITS.map(s => ({ value: s.key, label: s.label, group: 'spirits', center: true })));
}

/* Adds or removes a value from a multi answer question. */
function toggleMulti(group, value, max) {
  const list = state[group];
  const at = list.indexOf(value);
  if (at >= 0) {
    list.splice(at, 1);
  } else {
    // At the cap, the oldest choice drops off rather than the click doing nothing.
    if (max && list.length >= max) list.shift();
    list.push(value);
  }
  syncSelected(group, list);
}

function validate(step) {
  clearError(step);
  switch (step) {
    case 1: return state.eventType ? null : 'Choose the kind of event you are planning.';
    case 2: {
      const L = CONFIG.limits;
      const raw = $('guestCount').value.trim();
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n)) return 'Enter how many guests you are expecting.';
      if (!Number.isInteger(n)) return 'Enter a whole number of guests.';
      if (n < L.guestsMin) return `We plan bars for ${L.guestsMin} guests and up. Enter ${L.guestsMin} or more.`;
      if (n > L.guestsMax) return `For events over ${L.guestsMax} guests, email hello@curatedpours.com and we will plan it with you directly.`;
      state.guests = n;
      return null;
    }
    case 3: return state.durationHours ? null : 'Choose how long the bar will be open.';
    case 4: return state.season ? null : 'Choose when in the year the event takes place.';
    case 5:
      if (!state.profiles.length) return 'Choose at least one flavour direction.';
      if (!state.spirits.length) return 'Choose at least one spirit your crowd drinks.';
      return null;
    case 6: {
      const date = $('eventDate').value;
      const city = $('eventCity').value.trim();
      if (!date) return 'Add your event date so we can check availability.';
      if (Number.isNaN(new Date(`${date}T00:00:00`).getTime())) return 'That date does not look right. Please check it.';
      if (!city) return 'Add the city or town where your event is taking place.';
      const postal = $('postalCode').value.trim();
      if (postal && !POSTAL_RE.test(postal)) {
        return 'That postal code does not look right. Use a format like M5V 2T6, or leave it blank.';
      }
      state.eventDate = date;
      state.eventCity = city;
      state.postalCode = normalisePostal(postal);
      return null;
    }
    default: return null;
  }
}

function finish() {
  const result = buildCocktailMenu({
    eventType: state.eventType, guests: state.guests, drinkingPct: state.drinkingPct,
    durationHours: state.durationHours, season: state.season,
    profiles: state.profiles, spirits: state.spirits
  });
  if (!result.ok) {
    showError(TOTAL_STEPS, result.errors[0] || 'Something in the answers did not add up. Please check them and try again.');
    return;
  }
  state.result = result;
  track(EVENTS.CALCULATOR_COMPLETED, {
    tool: 'cocktail_menu', event_type: state.eventType, guests: state.guests,
    season: state.season, menu: result.menu.map(m => m.recipe.key).join(',')
  });

  renderResults(result);
  $('results').classList.add('is-shown');
  document.querySelector('.calc').style.display = 'none';
  document.body.classList.add('has-results');
  track(EVENTS.RESULTS_VIEWED, { tool: 'cocktail_menu' });

  const head = document.querySelector('.results__head h2');
  head.setAttribute('tabindex', '-1');
  window.scrollTo({ top: $('results').offsetTop - 20, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  head.focus({ preventScroll: true });
}

/* Formats 0.75 as 3/4 rather than a decimal, the way a recipe is written. */
const FRACTIONS = { 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' };
function ozLabel(oz) {
  const whole = Math.floor(oz);
  const part = Math.round((oz - whole) * 100) / 100;
  const frac = FRACTIONS[part];
  if (whole && frac) return `${whole} ${frac} oz`;
  if (frac) return `${frac} oz`;
  return `${whole} oz`;
}

function menuCard({ recipe, servings, alcoholic }) {
  const card = document.createElement('article');
  card.className = 'menu-card' + (alcoholic ? '' : ' menu-card--zero');

  const head = document.createElement('div');
  head.className = 'menu-card__head';
  head.innerHTML = `
    <p class="menu-card__tag">${alcoholic ? escapeHtml(recipe.spirit) : 'Zero proof'}</p>
    <h3 class="menu-card__name"></h3>
    <p class="menu-card__blurb"></p>`;
  head.querySelector('.menu-card__name').textContent = recipe.name;
  head.querySelector('.menu-card__blurb').textContent = recipe.blurb;
  card.appendChild(head);

  const batch = document.createElement('p');
  batch.className = 'menu-card__batch';
  batch.innerHTML = `<b>${fmt(servings)}</b> ${plural(servings, 'serving', 'servings')} to batch`;
  card.appendChild(batch);

  const list = document.createElement('ul');
  list.className = 'build-list';
  recipe.build.forEach(ing => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = ing.name;
    const qty = document.createElement('b');
    if (ing.type === 'bitters') qty.textContent = `${ing.dashes} dashes`;
    else if (ing.oz > 0) qty.textContent = ozLabel(ing.oz);
    else qty.textContent = `${ing.perServing} ${ing.unit}`;
    li.append(name, qty);
    list.appendChild(li);
  });
  card.appendChild(list);

  const foot = document.createElement('p');
  foot.className = 'menu-card__foot';
  foot.textContent = `${recipe.glass} · ${recipe.garnish}`;
  card.appendChild(foot);
  return card;
}

function renderResults(result) {
  const p = result.plan;
  $('sumEventType').textContent = eventTypeLabel(p.input.eventType);
  $('sumGuests').textContent = `${fmt(p.input.guests)} (${fmt(p.drinkingGuests)} drinking)`;
  $('sumDuration').textContent = durationLabel(p.input.durationHours);
  $('sumSeason').textContent = seasonLabel(result.prefs.season);
  $('sumServings').textContent = fmt(result.totalCocktails);

  const names = result.menu.filter(m => m.alcoholic).map(m => m.recipe.name);
  $('resultsNote').textContent =
    `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}, with a zero proof option beside them.`;

  const grid = $('menuGrid');
  grid.textContent = '';
  result.menu.forEach(m => grid.appendChild(menuCard(m)));

  const wrap = $('shoppingList');
  wrap.textContent = '';
  result.shoppingList.forEach(group => {
    const block = document.createElement('div');
    block.className = 'list-group';
    const h = document.createElement('h4');
    h.textContent = group.bucket;
    block.appendChild(h);
    const ul = document.createElement('ul');
    group.items.forEach(item => {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.textContent = item.name;
      const d = document.createElement('b');
      d.textContent = item.detail;
      li.append(n, d);
      ul.appendChild(li);
    });
    block.appendChild(ul);
    wrap.appendChild(block);
  });

  const recap = recapHtml(
    [escapeHtml(eventTypeLabel(p.input.eventType)), `${fmt(p.input.guests)} guests`,
     seasonLabel(result.prefs.season), `${result.menu.length} drinks`],
    [state.eventCity, prettyDate(state.eventDate)].filter(Boolean).map(escapeHtml).join(' &middot; ')
  );
  $('emailRecap').innerHTML = recap;
  $('quoteRecap').innerHTML = recap;
}

/* ---------------------------------------------------------------- wiring */

function updateDrinkingGuestsHint() {
  const guests = Number($('guestCount').value) || 0;
  const n = Math.round(guests * (state.drinkingPct / 100));
  $('drinkingGuestsHint').textContent = guests ? `That is about ${fmt(n)} drinking ${plural(n, 'guest', 'guests')}.` : '';
}

function setDrinkingPct(pct) {
  state.drinkingPct = Math.min(CONFIG.limits.drinkingPctMax, Math.max(CONFIG.limits.drinkingPctMin, Math.round(pct)));
  $('drinkingPctSlider').value = String(state.drinkingPct);
  $('drinkingPctValue').textContent = `${state.drinkingPct}%`;
  syncSelected('drinkingPct', state.drinkingPct);
  updateDrinkingGuestsHint();
}

function markStarted() {
  if (state.started) return;
  state.started = true;
  trackOnce(EVENTS.CALCULATOR_STARTED, { tool: 'cocktail_menu' });
}

function bumpGuests(by) {
  const L = CONFIG.limits;
  const current = Number($('guestCount').value) || L.guestsMin;
  const next = Math.min(L.guestsMax, Math.max(L.guestsMin, current + by));
  $('guestCount').value = String(next);
  state.guests = next;
  clearError(2);
  updateDrinkingGuestsHint();
}

const stepper = createStepper({
  totalSteps: TOTAL_STEPS, stepNames: STEP_NAMES, validate, onFinish: finish,
  finishLabel: 'Build My Menu'
});

function wire() {
  document.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    markStarted();
    const group = opt.dataset.group;
    const raw = opt.dataset.value;

    if (group === 'drinkingPct') {
      setDrinkingPct(Number(raw));
    } else if (group === 'profiles') {
      toggleMulti('profiles', raw, MAX_PROFILES);
    } else if (group === 'spirits') {
      toggleMulti('spirits', raw, null);
    } else if (group === 'durationHours') {
      state.durationHours = Number(raw);
      syncSelected(group, state.durationHours);
    } else {
      state[group] = raw;
      syncSelected(group, raw);
    }
    clearError(stepper.step);
    if (group === 'eventType') track(EVENTS.EVENT_TYPE_SELECTED, { tool: 'cocktail_menu', event_type: raw });

    // Multi answer questions must never advance on their own.
    if (['eventType', 'durationHours', 'season'].includes(group)) setTimeout(() => stepper.next(), 170);
  });

  const guestInput = $('guestCount');
  guestInput.addEventListener('input', () => { markStarted(); clearError(2); updateDrinkingGuestsHint(); });
  guestInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); stepper.next(); } });
  $('guestsMinus').addEventListener('click', () => bumpGuests(-10));
  $('guestsPlus').addEventListener('click', () => bumpGuests(10));
  $('drinkingPctSlider').addEventListener('input', e => { markStarted(); setDrinkingPct(Number(e.target.value)); });

  ['eventDate', 'eventCity', 'postalCode'].forEach(id => $(id).addEventListener('input', () => clearError(6)));
  $('eventCity').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); stepper.next(); } });

  $('restartBtn').addEventListener('click', () => {
    $('results').classList.remove('is-shown');
    document.body.classList.remove('has-results');
    document.querySelector('.calc').style.display = '';
    stepper.show(1);
    stepper.scrollToCard();
  });

  wireLeadForms({
    leadStore,
    funnelSource: { email: 'cocktail-menu-email', quote: 'cocktail-menu-quote' },
    copy: {
      emailSuccessTitle: 'Your menu is on the way.',
      emailSuccessBody: ({ firstName, email }) =>
        `Thanks ${firstName}. We will send the recipes, the batch quantities and the shopping list to ${email} shortly.`
    },
    getContext: () => {
      const r = state.result;
      if (!r || !r.ok) return { ready: false };
      return {
        ready: true,
        sessionId: state.sessionId,
        event: {
          eventType: state.eventType, eventTypeLabel: eventTypeLabel(state.eventType),
          eventDate: state.eventDate, eventCity: state.eventCity, postalCode: state.postalCode
        },
        planFields: planToLeadFields(r.plan),
        extraFields: menuToLeadFields(r)
      };
    }
  });
}

function init() {
  if (CONFIG.integration.previewMode) {
    const banner = $('previewBanner');
    if (banner) banner.hidden = false;
    document.body.classList.add('is-preview');
  }
  renderOptions();
  lockPastDates();
  setDrinkingPct(state.drinkingPct);
  stepper.wire();
  wire();
  leadStore.flushQueue();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
