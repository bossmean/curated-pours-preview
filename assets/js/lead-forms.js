/*
 * The conversion half of every planning tool: the two panels, their
 * validation, the lead record and the success message.
 *
 * A tool supplies what only it knows (its plan fields and its wording) and
 * this handles the rest, so a fix to lead capture lands in all three tools at
 * once rather than in one of them.
 */

import { CONFIG } from './config.js';
import { scoreLead } from './scoring.js';
import { track, EVENTS } from './analytics.js';
import { buildLeadRecord } from './lead-store.js';
import { $, EMAIL_RE, digits, splitName, fail, prefersReducedMotion, prettyDate } from './ui.js';

export function wireLeadForms({ leadStore, getContext, funnelSource, copy }) {
  function openPanel(which) {
    const email = $('emailPanel');
    const quote = $('quotePanel');
    $('successBox').classList.remove('is-shown');
    email.classList.toggle('is-shown', which === 'email');
    quote.classList.toggle('is-shown', which === 'quote');
    const panel = which === 'email' ? email : quote;
    const first = panel.querySelector('input');
    if (first) {
      panel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      setTimeout(() => first.focus({ preventScroll: true }), prefersReducedMotion() ? 0 : 320);
    }
  }

  async function submit({ contact, extra = {}, intentFlags, source, successTitle, successBody, button, errorEl }) {
    const ctx = getContext();
    if (!ctx || !ctx.ready) return;

    const scored = scoreLead({
      eventDate: ctx.event.eventDate,
      eventType: ctx.event.eventType,
      guestCount: ctx.planFields.guestCount,
      phone: contact.phone,
      requestedQuote: intentFlags.requestedQuote,
      requestedEmailPlan: intentFlags.requestedEmailPlan
    });

    const record = buildLeadRecord({
      sessionId: ctx.sessionId,
      contact,
      event: { ...ctx.event, venue: extra.venue || '', notes: extra.notes || '' },
      plan: ctx.planFields,
      intent: { ...intentFlags, ...scored },
      funnelSource: source,
      leadStatus: 'New'
    });
    // Anything the tool tracks that is not part of the shared lead shape.
    Object.assign(record, ctx.extraFields || {});

    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending...';

    try {
      const result = await leadStore.save(record);
      if (result.deferred) {
        track(EVENTS.LEAD_SAVE_FAILED, { funnel_source: source, reason: 'endpoint unreachable' });
      }
      $('emailPanel').classList.remove('is-shown');
      $('quotePanel').classList.remove('is-shown');
      const box = $('successBox');
      $('successTitle').textContent = successTitle;
      $('successBody').textContent = successBody;
      box.classList.add('is-shown');
      box.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    } catch (error) {
      errorEl.textContent = 'We could not send that just now. Please try again, or email hello@curatedpours.com and we will pick it up from there.';
      errorEl.classList.add('is-shown');
      track(EVENTS.LEAD_SAVE_FAILED, { funnel_source: source, reason: String(error) });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  const preview = () => CONFIG.integration.previewMode;
  const notSent = 'This is a preview, so nothing was sent.';

  $('emailForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('err-email');
    err.classList.remove('is-shown');
    const firstName = $('ep_firstName').value.trim();
    const email = $('ep_email').value.trim();
    const phone = $('ep_phone').value.trim();

    if (!firstName) return fail(err, 'Please add your first name.', $('ep_firstName'));
    if (!EMAIL_RE.test(email)) return fail(err, 'Please check your email address.', $('ep_email'));
    if (phone && digits(phone).length < 10) {
      return fail(err, 'That phone number looks short. Use a 10 digit number or leave it blank.', $('ep_phone'));
    }

    const ctx = getContext();
    track(EVENTS.EMAIL_PLAN_REQUESTED, { event_type: ctx.event.eventType, guests: ctx.planFields.guestCount });
    await submit({
      contact: { firstName, email, phone },
      intentFlags: { requestedEmailPlan: true, requestedQuote: false },
      source: funnelSource.email,
      successTitle: preview() ? notSent : copy.emailSuccessTitle,
      successBody: preview()
        ? `Thanks ${firstName}. On the live site this would email everything to ${email}. This preview is not connected to an inbox, so your details were not sent anywhere.`
        : copy.emailSuccessBody({ firstName, email }),
      button: $('emailSubmit'),
      errorEl: err
    });
  });

  $('quoteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('err-quote');
    err.classList.remove('is-shown');
    const fullName = $('q_fullName').value.trim();
    const email = $('q_email').value.trim();
    const phone = $('q_phone').value.trim();

    if (!fullName) return fail(err, 'Please add your name.', $('q_fullName'));
    if (!EMAIL_RE.test(email)) return fail(err, 'Please check your email address.', $('q_email'));
    if (digits(phone).length < 10) return fail(err, 'Please add a phone number we can reach you on.', $('q_phone'));

    const { firstName, lastName } = splitName(fullName);
    const ctx = getContext();
    track(EVENTS.QUOTE_REQUESTED, {
      event_type: ctx.event.eventType,
      guests: ctx.planFields.guestCount,
      event_city: ctx.event.eventCity
    });
    await submit({
      contact: { firstName, lastName, email, phone },
      extra: { venue: $('q_venue').value.trim(), notes: $('q_notes').value.trim() },
      intentFlags: { requestedQuote: true, requestedEmailPlan: false },
      source: funnelSource.quote,
      successTitle: preview() ? notSent : 'Quote request received.',
      successBody: preview()
        ? `Thanks ${firstName}. On the live site this would reach Curated Pours with everything you just built. This preview is not connected to an inbox, so your details were not sent anywhere.`
        : `Thanks ${firstName}. We have your event details and everything you just built. We will come back to you with availability and pricing for ${prettyDate(ctx.event.eventDate) || 'your date'}.`,
      button: $('quoteSubmit'),
      errorEl: err
    });
  });

  $('emailPlanBtn').addEventListener('click', () => openPanel('email'));
  $('quoteBtn').addEventListener('click', () => openPanel('quote'));

  return { openPanel };
}

/* The line above each form that shows what is being carried forward. */
export function recapHtml(parts, where) {
  const bits = parts.filter(Boolean).map(p => `<b>${p}</b>`);
  return `Carrying forward: ${bits.join(' &middot; ')}${where ? `<br>${where}` : ''}`;
}
