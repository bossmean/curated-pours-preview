/*
 * Tracking abstraction. Fires into whatever is already on the page
 * (dataLayer, gtag, Meta Pixel) and stays silent when nothing is installed.
 * Add a platform by pushing another sink into SINKS, nothing else changes.
 */

import { CONFIG } from './config.js';

export const EVENTS = {
  CALCULATOR_STARTED: 'calculator_started',
  EVENT_TYPE_SELECTED: 'event_type_selected',
  STEP_COMPLETED: 'step_completed',
  CALCULATOR_COMPLETED: 'calculator_completed',
  RESULTS_VIEWED: 'results_viewed',
  EMAIL_PLAN_REQUESTED: 'email_plan_requested',
  QUOTE_REQUESTED: 'quote_requested',
  LEAD_SAVE_FAILED: 'lead_save_failed'
};

const SINKS = [
  // Google Tag Manager
  (name, params) => {
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...params });
  },
  // Google Analytics 4
  (name, params) => {
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
  },
  // Meta Pixel. Standard events map through, everything else is custom.
  (name, params) => {
    if (typeof window.fbq !== 'function') return;
    if (name === EVENTS.QUOTE_REQUESTED) window.fbq('track', 'Lead', params);
    else if (name === EVENTS.EMAIL_PLAN_REQUESTED) window.fbq('track', 'CompleteRegistration', params);
    else window.fbq('trackCustom', name, params);
  }
];

const fired = new Set();

export function track(name, params = {}) {
  const payload = { ...params, tool: 'event_bar_calculator' };
  if (CONFIG.integration.debugAnalytics) console.info('[track]', name, payload);
  SINKS.forEach(sink => {
    try { sink(name, payload); } catch (_) { /* never let tracking break the page */ }
  });
}

/* For milestones that should only ever report once per session. */
export function trackOnce(name, params = {}) {
  if (fired.has(name)) return;
  fired.add(name);
  track(name, params);
}
