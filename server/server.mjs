#!/usr/bin/env node
/*
 * Curated Pours lead API and static host. Zero npm dependencies.
 *
 *   node server/server.mjs
 *
 * Serves the calculator from ./calculator and accepts leads at POST /api/leads.
 * Storage goes through the adapter in ./storage, so pointing this at a CRM
 * later means writing one adapter, not touching this file.
 *
 * Environment:
 *   PORT        default 4173
 *   LEAD_DB     SQLite file, default ./leads.db
 *   ADMIN_TOKEN required to read leads back out. Reading is blocked without it.
 *   WEBHOOK_URL optional. Every saved lead is mirrored here as JSON, fire and
 *               forget, so Zapier, Make or a CRM inbox can pick it up today.
 */

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, LEAD_FIELDS } from './storage/index.mjs';
// Scoring is shared with the browser so the rules can never drift apart.
import { scoreLead } from '../calculator/assets/js/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'calculator');

const PORT = Number(process.env.PORT) || 4173;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const MAX_BODY = 64 * 1024;

const store = createStore();
const FIELD_NAMES = LEAD_FIELDS.map(([n]) => n);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

/* ----------------------------------------------------------------- helpers */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (_) { reject(Object.assign(new Error('Body must be valid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clampInt = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const trim = (v, max = 500) => String(v ?? '').trim().slice(0, max);

/*
 * Accepts only known fields, so a malformed or hostile payload cannot inject
 * columns, and re-scores server side rather than trusting the browser.
 *
 * `existing` is the row already stored for this session, if any. A visitor who
 * asks for the emailed plan and then requests a quote is one lead, not two, so
 * the funnel flags are sticky: once true they stay true, and the score is
 * calculated from the merged picture.
 */
function sanitiseLead(input, existing = null) {
  const errors = [];
  if (!trim(input.sessionId, 100)) errors.push('sessionId is required');
  if (!EMAIL_RE.test(trim(input.email, 200))) errors.push('A valid email is required');
  if (!trim(input.firstName, 100) && !trim(input.lastName, 100)) errors.push('A name is required');
  if (errors.length) return { ok: false, errors };

  const lead = {};
  for (const [name, type] of LEAD_FIELDS) {
    if (type === 'INTEGER') {
      const v = input[name];
      lead[name] = typeof v === 'boolean' ? (v ? 1 : 0) : clampInt(v, 0, 1000000);
    } else {
      lead[name] = trim(input[name], name === 'notes' ? 4000 : 500);
    }
  }

  lead.guestCount = clampInt(input.guestCount, 1, 100000);
  lead.drinkingPct = clampInt(input.drinkingPct, 0, 100);
  lead.durationHours = clampInt(input.durationHours, 0, 24);
  lead.requestedEmailPlan = (input.requestedEmailPlan || existing?.requestedEmailPlan) ? 1 : 0;
  lead.requestedQuote = (input.requestedQuote || existing?.requestedQuote) ? 1 : 0;
  lead.leadStatus = trim(input.leadStatus, 40) || 'New';
  lead.funnelSource = trim(input.funnelSource, 80) || 'event-bar-calculator';

  const scored = scoreLead({
    eventDate: lead.eventDate,
    eventType: lead.eventType,
    guestCount: lead.guestCount,
    phone: lead.phone,
    requestedQuote: Boolean(lead.requestedQuote),
    requestedEmailPlan: Boolean(lead.requestedEmailPlan)
  });
  lead.leadScore = scored.score;
  lead.leadIntent = scored.band;
  lead.scoreReasons = scored.reasons.join('; ');

  return { ok: true, lead };
}

function mirrorToWebhook(lead) {
  if (!WEBHOOK_URL) return;
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead)
  }).catch(err => console.warn('[webhook] mirror failed:', err.message));
}

function authorised(url, req) {
  if (!ADMIN_TOKEN) return false;
  const supplied = url.searchParams.get('token') || req.headers['x-admin-token'] || '';
  return supplied === ADMIN_TOKEN;
}

function toCsv(rows) {
  const esc = v => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['id', ...FIELD_NAMES];
  const lines = [header.join(',')];
  rows.forEach(r => lines.push(header.map(h => esc(r[h])).join(',')));
  return lines.join('\r\n');
}

/* -------------------------------------------------------------- static files */

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.join(PUBLIC_DIR, rel);
  // Never serve outside the public directory.
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    return json(res, 403, { error: 'Forbidden' });
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) return serveStatic(req, res, path.posix.join(pathname, 'index.html'));
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(target).pipe(res);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

/* ------------------------------------------------------------------ routes */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  try {
    if (pathname === '/api/health') {
      return json(res, 200, { ok: true, storage: 'sqlite', webhook: Boolean(WEBHOOK_URL) });
    }

    if (pathname === '/api/leads' && req.method === 'POST') {
      const body = await readBody(req);
      const existing = trim(body.sessionId, 100) ? await store.getBySession(trim(body.sessionId, 100)) : null;
      const check = sanitiseLead(body, existing);
      if (!check.ok) return json(res, 422, { error: 'Invalid lead', details: check.errors });

      const result = await store.save(check.lead);
      mirrorToWebhook({ ...check.lead, id: result.id });
      console.log(
        `[lead] ${result.created ? 'new' : 'updated'} #${result.id} ` +
        `${check.lead.email} ${check.lead.leadIntent} (${check.lead.leadScore}) ` +
        `via ${check.lead.funnelSource}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      return json(res, result.created ? 201 : 200, { ok: true, id: result.id, created: result.created });
    }

    if (pathname === '/api/leads' && req.method === 'GET') {
      if (!authorised(url, req)) return json(res, 401, { error: 'Set ADMIN_TOKEN and pass it as ?token= or X-Admin-Token' });
      const rows = await store.list({ limit: url.searchParams.get('limit'), intent: url.searchParams.get('intent') });
      return json(res, 200, { count: rows.length, leads: rows });
    }

    if (pathname === '/api/leads.csv' && req.method === 'GET') {
      if (!authorised(url, req)) return json(res, 401, { error: 'Set ADMIN_TOKEN and pass it as ?token= or X-Admin-Token' });
      const rows = await store.list({ limit: 1000 });
      const csv = toCsv(rows);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="curated-pours-leads.csv"',
        'Content-Length': Buffer.byteLength(csv)
      });
      return res.end(csv);
    }

    if (pathname === '/admin') {
      if (!authorised(url, req)) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<p style="font-family:sans-serif;padding:40px">Add <code>?token=YOUR_ADMIN_TOKEN</code> to this URL.</p>');
      }
      const rows = await store.list({ limit: 500 });
      const html = await adminPage(rows, url.searchParams.get('token'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown endpoint' });

    return serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[error]', error);
    return json(res, status, { error: error.message || 'Server error' });
  }
});

/* Minimal internal leads view so submissions can be checked without a client. */
async function adminPage(rows, token) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const badge = intent => {
    const colour = intent === 'High Intent' ? '#4C7A4E' : intent === 'Medium Intent' ? '#C08B2C' : '#6E6154';
    return `<span style="background:${colour};color:#fff;padding:2px 8px;border-radius:99px;font-size:11px;white-space:nowrap">${esc(intent)}</span>`;
  };
  const body = rows.map(r => `<tr>
    <td>${r.id}</td>
    <td>${esc((r.dateCreated || '').slice(0, 16).replace('T', ' '))}</td>
    <td><b>${esc([r.firstName, r.lastName].filter(Boolean).join(' '))}</b><br><span class="m">${esc(r.email)}</span>${r.phone ? `<br><span class="m">${esc(r.phone)}</span>` : ''}</td>
    <td>${esc(r.eventTypeLabel || r.eventType)}<br><span class="m">${esc(r.eventDate)} &middot; ${esc(r.eventCity)}</span></td>
    <td>${esc(r.guestCount)} guests<br><span class="m">${esc(r.barStyleLabel)}, ${esc(r.durationHours)} h</span></td>
    <td>${esc(r.estimatedTotalDrinks)} drinks<br><span class="m">${esc(r.beerUnits)} beer, ${esc(r.wineBottles)} wine, ${esc(r.spiritBottles)} spirits, ${esc(r.recommendedBartenders)} staff</span></td>
    <td>${badge(r.leadIntent)}<br><span class="m">score ${esc(r.leadScore)}</span></td>
    <td><span class="m">${esc(r.funnelSource)}</span></td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="en-CA"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Curated Pours leads</title>
<style>
body{margin:0;background:#17110D;color:#FAF6EF;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:28px}
h1{font-size:20px;margin:0 0 4px}.sub{color:rgba(250,246,239,.6);margin:0 0 22px;font-size:13px}
.scroll{overflow-x:auto;border:1px solid rgba(250,246,239,.13);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:940px}
th{text-align:left;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#C08B2C;padding:12px;border-bottom:1px solid rgba(250,246,239,.13);white-space:nowrap}
td{padding:12px;border-bottom:1px solid rgba(250,246,239,.07);vertical-align:top}
tr:last-child td{border-bottom:0}
.m{color:rgba(250,246,239,.55);font-size:12px}
a{color:#E0BC79}
.empty{padding:40px;text-align:center;color:rgba(250,246,239,.55)}
</style></head><body>
<h1>Event Bar Calculator leads</h1>
<p class="sub">${rows.length} record${rows.length === 1 ? '' : 's'} &middot; <a href="/api/leads.csv?token=${encodeURIComponent(token || '')}">Download CSV</a></p>
${rows.length ? `<div class="scroll"><table><thead><tr>
<th>#</th><th>Created</th><th>Contact</th><th>Event</th><th>Bar</th><th>Plan</th><th>Intent</th><th>Source</th>
</tr></thead><tbody>${body}</tbody></table></div>` : '<div class="empty">No leads yet. Complete the calculator and submit a form.</div>'}
</body></html>`;
}

server.listen(PORT, () => {
  console.log(`Curated Pours calculator running at http://localhost:${PORT}`);
  console.log(`  Leads database: ${process.env.LEAD_DB || 'leads.db'}`);
  console.log(ADMIN_TOKEN
    ? `  Admin view:     http://localhost:${PORT}/admin?token=${ADMIN_TOKEN}`
    : '  Admin view:     disabled. Set ADMIN_TOKEN to read leads back out.');
  if (WEBHOOK_URL) console.log(`  Mirroring leads to ${WEBHOOK_URL}`);
});

process.on('SIGINT', async () => { await store.close(); process.exit(0); });
process.on('SIGTERM', async () => { await store.close(); process.exit(0); });
