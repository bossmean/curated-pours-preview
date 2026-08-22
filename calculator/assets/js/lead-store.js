/*
 * Lead storage abstraction.
 *
 * The app only ever calls leadStore.save(lead). Which adapter that lands in is
 * a deployment decision, not an application one:
 *
 *   HttpAdapter   POSTs to CONFIG.integration.leadEndpoint. That endpoint is
 *                 the bundled Node API by default, but any CRM webhook, Zapier
 *                 catch hook, Supabase function or HubSpot proxy that accepts
 *                 JSON will work without a code change.
 *   LocalAdapter  Keeps leads in localStorage. Used as the fallback whenever
 *                 the endpoint is missing or unreachable, so a lead is never
 *                 silently lost while the backend is down.
 *
 * To add a CRM, write an object with a save(lead) method that resolves, and
 * pass it to createLeadStore. Nothing else in the codebase needs to know.
 */

import { CONFIG } from './config.js';

const LOCAL_KEY = 'curated-pours:leads';
const QUEUE_KEY = 'curated-pours:lead-queue';

function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export class LocalAdapter {
  constructor(key = LOCAL_KEY) { this.key = key; }

  async save(lead) {
    const all = readJSON(this.key, []);
    const idx = all.findIndex(l => l.sessionId === lead.sessionId);
    if (idx >= 0) all[idx] = { ...all[idx], ...lead, dateCreated: all[idx].dateCreated };
    else all.push(lead);
    writeJSON(this.key, all);
    return { id: lead.sessionId, storage: 'local' };
  }

  async list() { return readJSON(this.key, []); }
}

export class HttpAdapter {
  constructor(endpoint, { timeoutMs = 8000 } = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
  }

  async save(lead) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Lead endpoint returned ${res.status}`);
      const body = await res.json().catch(() => ({}));
      return { id: body.id || lead.sessionId, storage: 'remote' };
    } finally {
      clearTimeout(timer);
    }
  }
}

class LeadStore {
  constructor({ primary, fallback }) {
    this.primary = primary;
    this.fallback = fallback;
  }

  /*
   * Always resolves. A lead that cannot reach the primary adapter is written
   * to the fallback and queued, so nothing is lost and the visitor never sees
   * a failure that is not theirs to fix.
   */
  async save(lead) {
    const record = { ...lead, dateCreated: lead.dateCreated || new Date().toISOString() };

    if (this.primary) {
      try {
        const result = await this.primary.save(record);
        await this.fallback.save({ ...record, syncState: 'synced' });
        this.flushQueue();
        return { ok: true, ...result };
      } catch (error) {
        this.enqueue(record);
        await this.fallback.save({ ...record, syncState: 'queued' });
        return { ok: true, id: record.sessionId, storage: 'local', deferred: true, error: String(error) };
      }
    }

    await this.fallback.save({ ...record, syncState: 'local-only' });
    return { ok: true, id: record.sessionId, storage: 'local' };
  }

  enqueue(record) {
    const queue = readJSON(QUEUE_KEY, []);
    const idx = queue.findIndex(l => l.sessionId === record.sessionId);
    if (idx >= 0) queue[idx] = record; else queue.push(record);
    writeJSON(QUEUE_KEY, queue.slice(-50));
  }

  /* Retries anything that failed earlier. Safe to call often, never throws. */
  async flushQueue() {
    if (!this.primary) return;
    const queue = readJSON(QUEUE_KEY, []);
    if (!queue.length) return;
    const remaining = [];
    for (const record of queue) {
      try { await this.primary.save(record); } catch (_) { remaining.push(record); }
    }
    writeJSON(QUEUE_KEY, remaining);
  }

  async listLocal() { return this.fallback.list(); }
}

export function createLeadStore(primaryAdapter) {
  const endpoint = CONFIG.integration.leadEndpoint;
  const primary = primaryAdapter !== undefined
    ? primaryAdapter
    : (endpoint ? new HttpAdapter(endpoint) : null);
  return new LeadStore({ primary, fallback: new LocalAdapter() });
}

/* The full lead record shape, kept in one place so the API, the CSV export
 * and any future CRM mapping all read from the same list of fields. */
export function buildLeadRecord({ sessionId, contact = {}, event = {}, plan = {}, intent = {}, funnelSource, leadStatus }) {
  return {
    sessionId,
    dateCreated: new Date().toISOString(),

    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    email: contact.email || '',
    phone: contact.phone || '',

    eventType: event.eventType || '',
    eventTypeLabel: event.eventTypeLabel || '',
    eventDate: event.eventDate || '',
    eventCity: event.eventCity || '',
    postalCode: event.postalCode || '',
    venue: event.venue || '',
    notes: event.notes || '',

    guestCount: plan.guestCount ?? null,
    drinkingPct: plan.drinkingPct ?? null,
    estimatedDrinkingGuests: plan.estimatedDrinkingGuests ?? null,
    durationHours: plan.durationHours ?? null,
    barStyle: plan.barStyle || '',
    barStyleLabel: plan.barStyleLabel || '',
    drinkingProfile: plan.drinkingProfile || '',
    estimatedTotalDrinks: plan.estimatedTotalDrinks ?? null,
    beerUnits: plan.beerUnits ?? 0,
    wineBottles: plan.wineBottles ?? 0,
    spiritBottles: plan.spiritBottles ?? 0,
    mixerLitresLow: plan.mixerLitresLow ?? 0,
    mixerLitresHigh: plan.mixerLitresHigh ?? 0,
    iceLbLow: plan.iceLbLow ?? 0,
    iceLbHigh: plan.iceLbHigh ?? 0,
    recommendedBartenders: plan.recommendedBartenders ?? 0,

    requestedEmailPlan: Boolean(intent.requestedEmailPlan),
    requestedQuote: Boolean(intent.requestedQuote),
    leadScore: intent.score ?? 0,
    leadIntent: intent.band || 'Low Intent',
    scoreReasons: (intent.reasons || []).join('; '),

    funnelSource: funnelSource || 'event-bar-calculator',
    leadStatus: leadStatus || 'New',
    pageUrl: typeof location !== 'undefined' ? location.href : '',
    referrer: typeof document !== 'undefined' ? document.referrer : ''
  };
}
