/*
 * Storage adapter registry.
 *
 * Every adapter implements the same small interface, so swapping SQLite for a
 * CRM is a one line change in this file plus a new adapter module:
 *
 *   async save(lead)   -> { id, created }   upserts on lead.sessionId
 *   async list(opts)   -> [lead, ...]       newest first
 *   async get(id)      -> lead | null
 *   async close()      -> void
 *
 * A lead arriving twice in one session (the visitor asks for the emailed plan
 * and then requests a quote) updates the same row rather than creating a
 * duplicate. dateCreated always keeps the value from the first write.
 */

import { SqliteAdapter } from './sqlite-adapter.mjs';
export { LEAD_FIELDS } from './fields.mjs';

export function createStore(options = {}) {
  const driver = options.driver || process.env.LEAD_STORE || 'sqlite';
  switch (driver) {
    case 'sqlite':
      return new SqliteAdapter(options.file || process.env.LEAD_DB || 'leads.db');
    default:
      throw new Error(`Unknown LEAD_STORE driver: ${driver}`);
  }
}
