/*
 * Internal lead intent scoring. Never shown to the visitor.
 * The score and band ride along with the lead record so a CRM can route on it.
 */

import { CONFIG } from './config.js';

function daysUntil(dateString, now = new Date()) {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export function scoreLead(lead, now = new Date()) {
  const r = CONFIG.scoring.rules;
  const reasons = [];
  let score = 0;

  const days = daysUntil(lead.eventDate, now);
  if (days !== null && days >= 0 && days <= CONFIG.scoring.eventWindowDays) {
    score += r.eventWithin90Days;
    reasons.push(`event within ${CONFIG.scoring.eventWindowDays} days (+${r.eventWithin90Days})`);
  }

  if (Number(lead.guestCount) >= CONFIG.scoring.largeGuestCount) {
    score += r.guests100Plus;
    reasons.push(`${CONFIG.scoring.largeGuestCount}+ guests (+${r.guests100Plus})`);
  }

  if (lead.eventType === 'wedding') {
    score += r.wedding;
    reasons.push(`wedding (+${r.wedding})`);
  } else if (lead.eventType === 'corporate') {
    score += r.corporate;
    reasons.push(`corporate event (+${r.corporate})`);
  }

  if (lead.requestedQuote) {
    score += r.requestedQuote;
    reasons.push(`requested a quote (+${r.requestedQuote})`);
  }

  if (lead.phone && String(lead.phone).trim().length >= 7) {
    score += r.providedPhone;
    reasons.push(`provided a phone number (+${r.providedPhone})`);
  }

  if (lead.requestedEmailPlan) {
    score += r.requestedEmailPlan;
    reasons.push(`requested the emailed plan (+${r.requestedEmailPlan})`);
  }

  return { score, band: bandFor(score), reasons, daysUntilEvent: days };
}

export function bandFor(score) {
  const b = CONFIG.scoring.bands;
  if (score >= b.high) return 'High Intent';
  if (score >= b.medium) return 'Medium Intent';
  return 'Low Intent';
}
