#!/usr/bin/env node
/*
 * Builds the static site that goes on GitHub Pages.
 *
 *   node deploy-pages.mjs [outdir] [--live]
 *
 * Copies calculator/ and injects the deploy time configuration into every
 * page. A Pages host has no backend, so the default build runs in preview
 * mode: the tools work in full, and anyone who submits a form is told plainly
 * that nothing was sent. Pass --live with LEAD_ENDPOINT set to point the forms
 * at a real endpoint instead.
 */

import { cp, readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'calculator');

const args = process.argv.slice(2);
const live = args.includes('--live');
const outDir = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'dist'));
const endpoint = process.env.LEAD_ENDPOINT || null;

const runtimeConfig = live
  ? `window.CURATED_POURS_CONFIG = { leadEndpoint: ${JSON.stringify(endpoint)} };`
  : 'window.CURATED_POURS_CONFIG = { leadEndpoint: null, previewMode: true };';

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(SRC, outDir, { recursive: true });

// Pages runs Jekyll unless told not to, which is slower and serves no purpose here.
await writeFile(path.join(outDir, '.nojekyll'), '');

const pages = (await readdir(outDir)).filter(f => f.endsWith('.html'));
for (const file of pages) {
  const full = path.join(outDir, file);
  let html = await readFile(full, 'utf8');
  const tag = html.match(/<script type="module" src="[^"]+"><\/script>/);
  if (!tag) throw new Error(`${file} has no module script to configure`);
  html = html.replace(tag[0], `<script>${runtimeConfig}</script>\n${tag[0]}`);
  await writeFile(full, html);
}

console.log(`Built ${outDir} in ${live ? 'live' : 'preview'} mode`);
console.log(`  ${pages.length} pages configured: ${pages.join(', ')}`);
if (live && !endpoint) console.warn('  WARNING: --live with no LEAD_ENDPOINT set, forms will fall back to the browser only');
