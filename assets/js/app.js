/*
 * Controller for the Event Bar Calculator. Owns the steps and the results
 * screen. The arithmetic is in calculator.js, the assumptions in config.js,
 * and the shared machinery in ui.js and lead-forms.js.
 */

import {
  CONFIG, EVENT_TYPES, DRINKING_PCT_OPTIONS, DURATION_OPTIONS,
  DRINKING_PROFILES, BAR_STYLE_ORDER
} from './config.js';
import { calculateBarPlan, planToLeadFields } from './calculator.js';
import { track, trackOnce, EVENTS } from './analytics.js';
import { createLeadStore } from './lead-store.js';
import { wireLeadForms, recapHtml } from './lead-forms.js';
import {
  $, fmt, article, plural, prettyDate, escapeHtml, prefersReducedMotion, newSessionId,
  mountOptions, syncSelected, showError, clearError, createStepper,
  lockPastDates, POSTAL_RE, normalisePostal
} from './ui.js';

const TOTAL_STEPS = 6;
const STEP_NAMES = ['Event type', 'Guest count', 'Bar hours', 'Bar style', 'Your crowd', 'Date and place'];
const leadStore = createLeadStore();

const state = {
  sessionId: newSessionId(),
  eventType: null, guests: 100, drinkingPct: 75, durationHours: null,
  barStyle: null, drinkingProfile: null,
  eventDate: '', eventCity: '', postalCode: '',
  plan: null, started: false
};

const eventTypeLabel = key => (EVENT_TYPES.find(t => t.key === key) || { label: 'Event' }).label;
const profileLabel = key => (DRINKING_PROFILES.find(p => p.key === key) || { label: '' }).label;
const durationLabel = h => (h >= CONFIG.limits.durationMaxHours ? '7+ hours' : `${h} hours`);

function renderOptions() {
  mountOptions($('eventTypeOpts'), EVENT_TYPES.map(t => ({ value: t.key, label: t.label, group: 'eventType', center: true })));
  mountOptions($('drinkingPctOpts'), DRINKING_PCT_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'drinkingPct', center: true })));
  mountOptions($('durationOpts'), DURATION_OPTIONS.map(o => ({ value: o.value, label: o.label, group: 'durationHours', center: true })));
  mountOptions($('barStyleOpts'), BAR_STYLE_ORDER.map(k => ({ value: k, label: CONFIG.barStyles[k].label, blurb: CONFIG.barStyles[k].blurb, group: 'barStyle' })));
  mountOptions($('profileOpts'), DRINKING_PROFILES.map(p => ({ value: p.key, label: p.label, blurb: p.blurb, group: 'drinkingProfile' })));
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
    case 4: return state.barStyle ? null : 'Choose the kind of bar you are planning.';
    case 5: return state.drinkingProfile ? null : 'Choose the option that best describes your crowd.';
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
  const plan = calculateBarPlan({
    eventType: state.eventType, guests: state.guests, drinkingPct: state.drinkingPct,
    durationHours: state.durationHours, barStyle: state.barStyle, drinkingProfile: state.drinkingProfile
  });
  if (!plan.ok) {
    showError(TOTAL_STEPS, plan.errors[0] || 'Something in the answers did not add up. Please check them and try again.');
    return;
  }
  state.plan = plan;
  track(EVENTS.CALCULATOR_COMPLETED, {
    tool: 'bar_calculator', event_type: state.eventType, guests: state.guests,
    bar_style: plan.style.selectedKey, duration_hours: state.durationHours, total_drinks: plan.totalDrinks
  });

  renderResults(plan);
  $('results').classList.add('is-shown');
  document.querySelector('.calc').style.display = 'none';
  document.body.classList.add('has-results');
  track(EVENTS.RESULTS_VIEWED, { tool: 'bar_calculator', total_drinks: plan.totalDrinks });

  const head = document.querySelector('.results__head h2');
  head.setAttribute('tabindex', '-1');
  window.scrollTo({ top: $('results').offsetTop - 20, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  head.focus({ preventScroll: true });
}

function resultCard({ key, value, unit, note, wide }) {
  const el = document.createElement('div');
  el.className = 'rcard' + (wide ? ' rcard--wide' : '');
  el.innerHTML = '<p class="rcard__k"></p><p class="rcard__v"></p><p class="rcard__u"></p><p class="rcard__note"></p>';
  el.querySelector('.rcard__k').textContent = key;
  el.querySelector('.rcard__v').textContent = value;
  el.querySelector('.rcard__u').textContent = unit || '';
  const noteEl = el.querySelector('.rcard__note');
  if (note) noteEl.textContent = note; else noteEl.remove();
  if (!unit) el.querySelector('.rcard__u').remove();
  return el;
}

function renderResults(plan) {
  const b = plan.beverages;

  $('sumEventType').textContent = eventTypeLabel(plan.input.eventType);
  $('sumGuests').textContent = fmt(plan.input.guests);
  $('sumDrinkers').textContent = `${fmt(plan.drinkingGuests)} (${plan.input.drinkingPct}%)`;
  $('sumDuration').textContent = durationLabel(plan.input.durationHours);
  $('sumStyle').textContent = plan.style.isRecommendation ? `${plan.style.label} (recommended)` : plan.style.label;

  $('resultsNote').textContent = plan.style.isRecommendation
    ? 'You told us you were not sure, so this is our recommended starting point: a full bar.'
    : `Built for ${article(profileLabel(plan.input.drinkingProfile))} ${profileLabel(plan.input.drinkingProfile).toLowerCase()} crowd over ${durationLabel(plan.input.durationHours)} of service.`;

  $('totalDrinks').textContent = fmt(plan.totalDrinks);
  $('totalDrinksSub').textContent =
    `About ${plan.perDrinker} ${plural(plan.perDrinker, 'drink', 'drinks')} each for ${fmt(plan.drinkingGuests)} drinking ${plural(plan.drinkingGuests, 'guest', 'guests')} over ${durationLabel(plan.input.durationHours)}.`;

  const grid = $('resultGrid');
  grid.textContent = '';

  if (b.beer) {
    grid.appendChild(resultCard({
      key: 'Beer', value: fmt(b.beer.units), unit: plural(b.beer.units, 'bottle or can', 'bottles or cans'),
      note: `Covers about ${fmt(b.beer.servings)} beer ${plural(b.beer.servings, 'serving', 'servings')}.`
    }));
  }
  if (b.wine) {
    grid.appendChild(resultCard({
      key: 'Wine', value: fmt(b.wine.units), unit: plural(b.wine.units, 'bottle (750 ml)', 'bottles (750 ml)'),
      note: `About ${fmt(b.wine.servings)} ${plural(b.wine.servings, 'glass', 'glasses')} at ${CONFIG.servings.wineServingsPerBottle} per bottle.`
    }));
  }
  if (b.spirits) {
    grid.appendChild(resultCard({
      key: 'Spirits', value: fmt(b.spirits.units), unit: plural(b.spirits.units, 'bottle (750 ml)', 'bottles (750 ml)'),
      note: `About ${fmt(b.spirits.servings)} ${plural(b.spirits.servings, 'pour', 'pours')} at ${CONFIG.servings.spiritServingsPerBottle} per bottle.`
    }));
  }

  grid.appendChild(resultCard({
    key: 'Ice', value: `${fmt(plan.ice.lbLow)} to ${fmt(plan.ice.lbHigh)}`, unit: 'lb',
    note: `${fmt(plan.ice.kgLow)} to ${fmt(plan.ice.kgHigh)} kg. ${plan.ice.usedHighEnd
      ? 'Planned at the higher end for this bar style and length of service.'
      : 'Includes chilling and serving.'}`
  }));

  grid.appendChild(resultCard({
    key: 'Bartenders', value: fmt(plan.bartenders.count), unit: 'recommended',
    note: plan.bartenders.reasoning
  }));

  if (plan.mixers) {
    const card = resultCard({
      key: 'Mixers', value: `${fmt(plan.mixers.litresLow)} to ${fmt(plan.mixers.litresHigh)}`,
      unit: 'litres', wide: true,
      note: 'A suggested split across the usual categories. Swap in whatever suits your menu.'
    });
    const list = document.createElement('ul');
    list.className = 'mix-list';
    plan.mixers.breakdown.forEach(m => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = m.label;
      const val = document.createElement('b');
      val.textContent = `${m.litres} L`;
      li.append(name, val);
      list.appendChild(li);
    });
    card.appendChild(list);
    grid.appendChild(card);
  }

  const recap = recapHtml(
    [escapeHtml(eventTypeLabel(plan.input.eventType)), `${fmt(plan.input.guests)} guests`,
     `${durationLabel(plan.input.durationHours)} of service`, escapeHtml(plan.style.label)],
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
  trackOnce(EVENTS.CALCULATOR_STARTED, { tool: 'bar_calculator' });
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
  finishLabel: 'See My Bar Plan'
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
    if (group === 'eventType') track(EVENTS.EVENT_TYPE_SELECTED, { tool: 'bar_calculator', event_type: value });

    // Single answer steps advance on their own. Step 2 has two questions.
    if (['eventType', 'durationHours', 'barStyle', 'drinkingProfile'].includes(group)) {
      setTimeout(() => stepper.next(), 170);
    }
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
    funnelSource: { email: 'calculator-email-plan', quote: 'calculator-quote-request' },
    copy: {
      emailSuccessTitle: 'Your bar plan is on the way.',
      emailSuccessBody: ({ firstName, email }) =>
        `Thanks ${firstName}. We will email the full shopping list and setup notes to ${email} shortly. If you would rather talk it through, just reply to that email.`
    },
    getContext: () => {
      const plan = state.plan;
      if (!plan || !plan.ok) return { ready: false };
      return {
        ready: true,
        sessionId: state.sessionId,
        event: {
          eventType: state.eventType, eventTypeLabel: eventTypeLabel(state.eventType),
          eventDate: state.eventDate, eventCity: state.eventCity, postalCode: state.postalCode
        },
        planFields: planToLeadFields(plan)
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
