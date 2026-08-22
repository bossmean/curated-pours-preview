/*
 * Controller for the Bar Budget Calculator. Knows about steps, money and the
 * DOM. All the arithmetic lives in budget.js, all the prices in
 * budget-config.js, and all the shared machinery in ui.js and lead-forms.js.
 */

import { CONFIG, EVENT_TYPES, DRINKING_PCT_OPTIONS, DURATION_OPTIONS, DRINKING_PROFILES, BAR_STYLE_ORDER } from './config.js';
import { BUDGET_CONFIG, TIER_ORDER } from './budget-config.js';
import { calculateBudget, budgetToLeadFields } from './budget.js';
import { planToLeadFields } from './calculator.js';
import { track, trackOnce, EVENTS } from './analytics.js';
import { createLeadStore } from './lead-store.js';
import { wireLeadForms, recapHtml } from './lead-forms.js';
import {
  $, fmt, money, money2, article, plural, prettyDate, escapeHtml, prefersReducedMotion,
  newSessionId, mountOptions, syncSelected, showError, clearError,
  createStepper, lockPastDates, POSTAL_RE, normalisePostal
} from './ui.js';

const TOTAL_STEPS = 6;
const STEP_NAMES = ['Event type', 'Guest count', 'Bar hours', 'Bar style', 'Crowd and bottles', 'Date and place'];
const leadStore = createLeadStore();

const state = {
  sessionId: newSessionId(),
  eventType: null, guests: 100, drinkingPct: 75, durationHours: null,
  barStyle: null, drinkingProfile: null, qualityTier: null,
  eventDate: '', eventCity: '', postalCode: '',
  priceOverrides: {}, budget: null, started: false
};

const eventTypeLabel = key => (EVENT_TYPES.find(t => t.key === key) || { label: 'Event' }).label;
const profileLabel = key => (DRINKING_PROFILES.find(p => p.key === key) || { label: '' }).label;
const durationLabel = h => (h >= CONFIG.limits.durationMaxHours ? '7+ hours' : `${h} hours`);

/* ------------------------------------------------------------- rendering */

function renderOptions() {
  mountOptions($('eventTypeOpts'), EVENT_TYPES.map(t => ({ value: t.key, label: t.label, group: 'eventType', center: true })));
  mountOptions($('drinkingPctOpts'), DRINKING_PCT_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'drinkingPct', center: true })));
  mountOptions($('durationOpts'), DURATION_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'durationHours', center: true })));
  mountOptions($('barStyleOpts'), BAR_STYLE_ORDER.map(k => ({ value: k, label: CONFIG.barStyles[k].label, blurb: CONFIG.barStyles[k].blurb, group: 'barStyle' })));
  mountOptions($('profileOpts'), DRINKING_PROFILES.map(p => ({ value: p.key, label: p.label, blurb: p.blurb, group: 'drinkingProfile' })));
  mountOptions($('tierOpts'), TIER_ORDER.map(k => ({ value: k, label: BUDGET_CONFIG.tiers[k].label, blurb: BUDGET_CONFIG.tiers[k].blurb, group: 'qualityTier' })));
}

function validate(step) {
  clearError(step);
  switch (step) {
    case 1:
      return state.eventType ? null : 'Choose the kind of event you are planning.';
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
    case 4: return state.barStyle ? null : 'Choose the kind of bar you are planning.';
    case 5:
      if (!state.drinkingProfile) return 'Choose the option that best describes your crowd.';
      if (!state.qualityTier) return 'Choose the quality of bottles you are planning for.';
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

function compute() {
  return calculateBudget({
    eventType: state.eventType, guests: state.guests, drinkingPct: state.drinkingPct,
    durationHours: state.durationHours, barStyle: state.barStyle,
    drinkingProfile: state.drinkingProfile, qualityTier: state.qualityTier,
    priceOverrides: state.priceOverrides
  });
}

function finish() {
  const budget = compute();
  if (!budget.ok) {
    showError(TOTAL_STEPS, budget.errors[0] || 'Something in the answers did not add up. Please check them and try again.');
    return;
  }
  state.budget = budget;
  track(EVENTS.CALCULATOR_COMPLETED, {
    tool: 'bar_budget', event_type: state.eventType, guests: state.guests,
    bar_style: state.barStyle, quality_tier: state.qualityTier, subtotal: budget.subtotal
  });

  renderResults(budget);
  $('results').classList.add('is-shown');
  document.querySelector('.calc').style.display = 'none';
  document.body.classList.add('has-results');
  track(EVENTS.RESULTS_VIEWED, { tool: 'bar_budget', subtotal: budget.subtotal });

  const head = document.querySelector('.results__head h2');
  head.setAttribute('tabindex', '-1');
  window.scrollTo({ top: $('results').offsetTop - 20, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  head.focus({ preventScroll: true });
}

function statCard(key, value, unit, note) {
  const el = document.createElement('div');
  el.className = 'rcard';
  el.innerHTML = '<p class="rcard__k"></p><p class="rcard__v"></p><p class="rcard__u"></p><p class="rcard__note"></p>';
  el.querySelector('.rcard__k').textContent = key;
  el.querySelector('.rcard__v').textContent = value;
  el.querySelector('.rcard__u').textContent = unit || '';
  const n = el.querySelector('.rcard__note');
  if (note) n.textContent = note; else n.remove();
  if (!unit) el.querySelector('.rcard__u').remove();
  return el;
}

function renderResults(budget) {
  const p = budget.plan;
  $('sumEventType').textContent = eventTypeLabel(p.input.eventType);
  $('sumGuests').textContent = `${fmt(p.input.guests)} (${fmt(p.drinkingGuests)} drinking)`;
  $('sumDuration').textContent = durationLabel(p.input.durationHours);
  $('sumStyle').textContent = p.style.isRecommendation ? `${p.style.label} (recommended)` : p.style.label;
  $('sumTier').textContent = budget.tier.label;

  $('resultsNote').textContent =
    `Built for ${article(profileLabel(p.input.drinkingProfile))} ${profileLabel(p.input.drinkingProfile).toLowerCase()} crowd on ${budget.tier.label.toLowerCase()} bottles.`;

  $('staffNeeded').textContent = `${budget.bartendersNeeded} ${plural(budget.bartendersNeeded, 'bartender', 'bartenders')}`;

  renderMoney(budget);
  renderPriceFields(budget);

  const recap = recapHtml(
    [escapeHtml(eventTypeLabel(p.input.eventType)), `${fmt(p.input.guests)} guests`,
     durationLabel(p.input.durationHours), escapeHtml(p.style.label), escapeHtml(budget.tier.label)],
    [state.eventCity, prettyDate(state.eventDate)].filter(Boolean).map(escapeHtml).join(' &middot; ')
  );
  $('emailRecap').innerHTML = recap;
  $('quoteRecap').innerHTML = recap;
}

/* The parts that change when a price is edited. */
function renderMoney(budget) {
  const p = budget.plan;
  $('budgetRange').textContent = `${money(budget.low)} to ${money(budget.high)}`;
  $('budgetSub').textContent =
    `About ${fmt(p.totalDrinks)} drinks for ${fmt(p.input.guests)} guests, before bartending.`;

  const grid = $('statGrid');
  grid.textContent = '';
  grid.appendChild(statCard('Per guest', money2(budget.perGuest), 'across everyone invited',
    `${money2(budget.perDrinkingGuest)} per guest who is actually drinking.`));
  grid.appendChild(statCard('Alcohol', money(budget.alcoholCost), 'beer, wine and spirits',
    `${Math.round((budget.alcoholCost / budget.subtotal) * 100)}% of the total.`));
  grid.appendChild(statCard('Everything else', money(budget.extrasCost), 'mixers, ice, garnish, supplies',
    `${Math.round((budget.extrasCost / budget.subtotal) * 100)}% of the total.`));

  const body = $('costBody');
  body.textContent = '';
  budget.lines.forEach(l => {
    const tr = document.createElement('tr');
    const cells = [
      l.note ? `${l.label}<span class="cost-table__note">${escapeHtml(l.note)}</span>` : escapeHtml(l.label),
      `${fmt(l.qty)} ${escapeHtml(l.unitLabel)}`,
      money(l.unitPrice) === '$0' ? `$${l.unitPrice.toFixed(2)}` : `$${l.unitPrice.toFixed(2)}`,
      money(l.cost)
    ];
    cells.forEach((c, i) => {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.setAttribute('scope', 'row');
      cell.innerHTML = c;
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
  $('costTotal').textContent = money(budget.subtotal);
}

const PRICE_LABEL = { beer: 'Beer, per bottle or can', wine: 'Wine, per 750 ml bottle', spirits: 'Spirits, per 750 ml bottle' };

function renderPriceFields(budget) {
  const wrap = $('priceFields');
  wrap.textContent = '';
  Object.keys(budget.prices)
    .filter(key => budget.lines.some(l => l.key === key))
    .forEach(key => {
      const limits = BUDGET_CONFIG.priceLimits[key];
      const field = document.createElement('div');
      field.className = 'field';
      field.style.marginTop = '0';
      field.innerHTML = `
        <label class="field__label" for="price-${key}">${PRICE_LABEL[key]}</label>
        <div class="price-input">
          <span aria-hidden="true">$</span>
          <input class="input" type="number" id="price-${key}" inputmode="decimal"
                 min="${limits[0]}" max="${limits[1]}" step="0.25" value="${budget.prices[key].toFixed(2)}">
        </div>`;
      const input = field.querySelector('input');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        if (Number.isFinite(v) && v >= limits[0] && v <= limits[1]) {
          state.priceOverrides[key] = v;
          input.removeAttribute('aria-invalid');
        } else {
          delete state.priceOverrides[key];
          input.setAttribute('aria-invalid', 'true');
        }
        const next = compute();
        if (next.ok) { state.budget = next; renderMoney(next); }
      });
      wrap.appendChild(field);
    });
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
  trackOnce(EVENTS.CALCULATOR_STARTED, { tool: 'bar_budget' });
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
  finishLabel: 'See My Budget'
});

function wire() {
  document.addEventListener('click', e => {
    const opt = e.target.closest('.opt');
    if (!opt) return;
    markStarted();
    const group = opt.dataset.group;
    const raw = opt.dataset.value;
    const value = (group === 'drinkingPct' || group === 'durationHours') ? Number(raw) : raw;

    if (group === 'drinkingPct') {
      setDrinkingPct(value);
    } else {
      state[group] = value;
      syncSelected(group, value);
    }
    clearError(stepper.step);
    if (group === 'eventType') track(EVENTS.EVENT_TYPE_SELECTED, { tool: 'bar_budget', event_type: value });

    // Steps that ask a single question advance on their own.
    if (['eventType', 'durationHours', 'barStyle'].includes(group)) setTimeout(() => stepper.next(), 170);
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
    funnelSource: { email: 'budget-email-list', quote: 'budget-quote-request' },
    copy: {
      emailSuccessTitle: 'Your costed list is on the way.',
      emailSuccessBody: ({ firstName, email }) =>
        `Thanks ${firstName}. We will send the full breakdown and shopping list to ${email} shortly.`
    },
    getContext: () => {
      const b = state.budget;
      if (!b || !b.ok) return { ready: false };
      return {
        ready: true,
        sessionId: state.sessionId,
        event: {
          eventType: state.eventType, eventTypeLabel: eventTypeLabel(state.eventType),
          eventDate: state.eventDate, eventCity: state.eventCity, postalCode: state.postalCode
        },
        planFields: planToLeadFields(b.plan),
        extraFields: budgetToLeadFields(b)
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
