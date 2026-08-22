/*
 * SQLite adapter built on node:sqlite, which ships with Node 22.5 and later.
 * No npm install, no build step, one file on disk you can copy or back up.
 */

import { DatabaseSync } from 'node:sqlite';
import { LEAD_FIELDS } from './fields.mjs';

const TEXT_FIELDS = new Set(LEAD_FIELDS.filter(([, t]) => t === 'TEXT').map(([n]) => n));
const INT_FIELDS = new Set(LEAD_FIELDS.filter(([, t]) => t === 'INTEGER').map(([n]) => n));

export class SqliteAdapter {
  constructor(file = 'leads.db') {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.#migrate();
  }

  #migrate() {
    const columns = LEAD_FIELDS.map(([name, type]) => `"${name}" ${type}`).join(',\n      ');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ${columns}
      );
    `);
    this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_session ON leads(sessionId);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(dateCreated DESC);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_leads_intent ON leads(leadIntent);');

    // Forward compatible: add any column the current build knows about but an
    // older database file does not.
    const existing = new Set(this.db.prepare('PRAGMA table_info(leads)').all().map(r => r.name));
    for (const [name, type] of LEAD_FIELDS) {
      if (!existing.has(name)) this.db.exec(`ALTER TABLE leads ADD COLUMN "${name}" ${type};`);
    }
  }

  #coerce(lead) {
    const out = {};
    for (const [name] of LEAD_FIELDS) {
      const v = lead[name];
      if (INT_FIELDS.has(name)) {
        if (typeof v === 'boolean') out[name] = v ? 1 : 0;
        else if (v === null || v === undefined || v === '') out[name] = null;
        else out[name] = Number.isFinite(Number(v)) ? Math.round(Number(v)) : null;
      } else if (TEXT_FIELDS.has(name)) {
        out[name] = v === null || v === undefined ? '' : String(v);
      }
    }
    return out;
  }

  async save(lead) {
    const now = new Date().toISOString();
    const row = this.#coerce({ ...lead, dateUpdated: now });
    if (!row.sessionId) throw new Error('sessionId is required');
    if (!row.dateCreated) row.dateCreated = now;

    const existing = this.db.prepare('SELECT id, dateCreated FROM leads WHERE sessionId = ?').get(row.sessionId);

    if (existing) {
      // Keep the original creation timestamp, and never blank out a value that
      // an earlier submission in the same session already supplied.
      row.dateCreated = existing.dateCreated;
      const names = LEAD_FIELDS.map(([n]) => n).filter(n => n !== 'sessionId' && n !== 'dateCreated');
      const sets = names.map(n => (TEXT_FIELDS.has(n)
        ? `"${n}" = CASE WHEN $${n} = '' THEN "${n}" ELSE $${n} END`
        : `"${n}" = COALESCE($${n}, "${n}")`)).join(', ');
      const params = {};
      names.forEach(n => { params[n] = row[n]; });
      params.sessionId = row.sessionId;
      this.db.prepare(`UPDATE leads SET ${sets} WHERE sessionId = $sessionId`).run(params);
      return { id: existing.id, created: false };
    }

    const names = LEAD_FIELDS.map(([n]) => n);
    const stmt = this.db.prepare(
      `INSERT INTO leads (${names.map(n => `"${n}"`).join(', ')}) VALUES (${names.map(n => `$${n}`).join(', ')})`
    );
    const params = {};
    names.forEach(n => { params[n] = row[n]; });
    const info = stmt.run(params);
    return { id: Number(info.lastInsertRowid), created: true };
  }

  async getBySession(sessionId) {
    return this.db.prepare('SELECT * FROM leads WHERE sessionId = ?').get(String(sessionId)) || null;
  }

  async list({ limit = 200, intent = null } = {}) {
    const cap = Math.min(1000, Math.max(1, Number(limit) || 200));
    if (intent) {
      return this.db.prepare('SELECT * FROM leads WHERE leadIntent = ? ORDER BY datetime(dateCreated) DESC LIMIT ?').all(intent, cap);
    }
    return this.db.prepare('SELECT * FROM leads ORDER BY datetime(dateCreated) DESC LIMIT ?').all(cap);
  }

  async get(id) {
    return this.db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(id)) || null;
  }

  async close() { this.db.close(); }
}
