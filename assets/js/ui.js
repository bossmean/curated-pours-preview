/*
 * Shared UI machinery for the Curated Pours planning tools.
 *
 * Everything here is tool agnostic: formatting, option buttons, the six step
 * state machine and form validation helpers. Anything that knows about drinks,
 * money or cocktails belongs in that tool's own config and engine.
 */

export const $ = id => document.getElementById(id);

/* ------------------------------------------------------------- formatting */

export const fmt = n => Number(n).toLocaleString('en-CA');

export const money = n => Number(n).toLocaleString('en-CA', {
  style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0
});

/* Cents matter on a per guest figure, where the difference between $18 and
 * $18.35 is real money once it is multiplied by the guest count. */
export const money2 = n => Number(n).toLocaleString('en-CA', {
  style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2
});

export const article = word => (/^[aeiou]/i.test(String(word)) ? 'an' : 'a');

/* "1 bottle (750 ml)" rather than "1 bottles (750 ml)". */
export const plural = (n, one, many) => (Number(n) === 1 ? one : many);

/* Turns 2026-09-05 into "Saturday, 5 September 2026" for anything a visitor reads. */
export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function newSessionId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'cp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* -------------------------------------------------------- option buttons */

export function optionButton({ value, label, blurb, group, center }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'opt' + (blurb ? ' opt--rich' : '') + (center ? ' opt--center' : '');
  btn.dataset.group = group;
  btn.dataset.value = String(value);
  btn.setAttribute('aria-pressed', 'false');
  const l = document.createElement('span');
  l.className = 'opt__label';
  l.textContent = label;
  btn.appendChild(l);
  if (blurb) {
    const b = document.createElement('span');
    b.className = 'opt__blurb';
    b.textContent = blurb;
    btn.appendChild(b);
  }
  return btn;
}

export function mountOptions(el, items) {
  if (!el) return;
  el.textContent = '';
  items.forEach(i => el.appendChild(optionButton(i)));
}

/* Reflects the current answer onto its group of buttons. Pass an array for a
 * group where more than one answer can be on at once. */
export function syncSelected(group, value) {
  const on = Array.isArray(value) ? value.map(String) : [String(value)];
  document.querySelectorAll(`.opt[data-group="${group}"]`).forEach(btn => {
    btn.setAttribute('aria-pressed', on.includes(btn.dataset.value) ? 'true' : 'false');
  });
}

/* -------------------------------------------------------------- errors */

export function showError(step, message) {
  const el = $(`err-${step}`);
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-shown');
}

export function clearError(step) {
  const el = $(`err-${step}`);
  if (el) { el.textContent = ''; el.classList.remove('is-shown'); }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const digits = s => String(s || '').replace(/\D/g, '');

export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
}

/* Shows a form level error and sends focus to the field that caused it. */
export function fail(errorEl, message, field) {
  errorEl.textContent = message;
  errorEl.classList.add('is-shown');
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    field.addEventListener('input', () => field.removeAttribute('aria-invalid'), { once: true });
  }
}

/* --------------------------------------------------------- step machine */

/*
 * Drives the numbered steps, the progress bar and the Back and Continue
 * buttons. The caller supplies validate(step), which returns an error string
 * or null, and onFinish(), called once the last step validates.
 */
export function createStepper({ totalSteps, stepNames, validate, onFinish, onStepChange, cardId = 'calcCard', finishLabel = 'See My Results' }) {
  let step = 1;

  function scrollToCard() {
    const card = $(cardId);
    if (!card) return;
    const top = card.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function show(n, { focus = true } = {}) {
    step = Math.min(totalSteps, Math.max(1, n));
    document.querySelectorAll('.step').forEach(el => {
      el.classList.toggle('is-active', Number(el.dataset.step) === step);
    });

    $('progressLabel').textContent = `Step ${step} of ${totalSteps}`;
    $('progressHint').textContent = stepNames[step - 1];
    $('progressFill').style.width = `${(step / totalSteps) * 100}%`;
    const track = document.querySelector('.progress-track');
    if (track) track.setAttribute('aria-valuenow', String(step));

    $('backBtn').hidden = step === 1;
    $('nextBtn').textContent = step === totalSteps ? finishLabel : 'Continue';
    clearError(step);

    if (focus) {
      const heading = document.querySelector(`#step-${step} h2`);
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    }
    if (onStepChange) onStepChange(step);
  }

  function next() {
    const problem = validate(step);
    if (problem) {
      showError(step, problem);
      return;
    }
    if (step === totalSteps) {
      onFinish();
      return;
    }
    show(step + 1);
    scrollToCard();
  }

  function back() {
    show(step - 1);
    scrollToCard();
  }

  return {
    get step() { return step; },
    show, next, back, scrollToCard,
    wire() {
      $('nextBtn').addEventListener('click', next);
      $('backBtn').addEventListener('click', back);
      show(1, { focus: false });
    }
  };
}

/* Sets the event date field so a past date cannot be picked. */
export function lockPastDates(id = 'eventDate') {
  const el = $(id);
  if (el) el.min = new Date().toISOString().slice(0, 10);
}

/* Canadian postal code, loose enough to accept a space or a hyphen. */
export const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
export const normalisePostal = v =>
  String(v || '').trim().toUpperCase().replace(/[ -]/g, '').replace(/^(.{3})(.{3})$/, '$1 $2');
