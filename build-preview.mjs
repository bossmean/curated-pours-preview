#!/usr/bin/env node
/*
 * Bundles the calculator into one self-contained .html file.
 *
 *   node build-preview.mjs [outfile] [--live]
 *
 * Everything is inlined: the stylesheet, the fonts as data URIs and all six
 * ES modules concatenated in dependency order. The result runs from a file://
 * path, an email attachment or any host that blocks external requests.
 *
 * By default the bundle is built in preview mode, which shows a notice at the
 * top of the page and tells anyone who submits a form that their details were
 * not sent anywhere. Pass --live to build a connected bundle instead, and set
 * the endpoint with LEAD_ENDPOINT.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'calculator');

const args = process.argv.slice(2);
const live = args.includes('--live');
const outFile = path.resolve(args.find(a => !a.startsWith('--')) || path.join(ROOT, 'curated-pours-calculator-preview.html'));
const endpoint = process.env.LEAD_ENDPOINT || null;
// A standalone file is named by whoever opens it, not found by search, so the
// long SEO title is the wrong one. Override it with --title="...".
const titleArg = args.find(a => a.startsWith('--title='));
const title = titleArg ? titleArg.slice('--title='.length) : null;

/* Dependency order. A module may only use what is defined above it. */
const MODULES = ['config.js', 'calculator.js', 'scoring.js', 'analytics.js', 'lead-store.js', 'app.js'];

const read = rel => readFile(path.join(SRC, rel), 'utf8');

/* Every top level binding a module introduces, so collisions fail the build
 * rather than producing a page that breaks in one specific code path. */
function declarationsIn(code) {
  const names = [];
  const re = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) names.push(m[1]);
  return names;
}

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[^;]*?;\s*$/gm, '')          // import ... from '...';
    .replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '')   // export { a, b };
    .replace(/^(\s*)export\s+(?=(?:const|let|var|function|class|async)\b)/gm, '$1');
}

async function inlineFonts(css) {
  const urls = [...css.matchAll(/url\('(\.\.\/fonts\/[^']+)'\)/g)];
  let out = css;
  for (const [full, rel] of urls) {
    const file = path.join(SRC, 'assets', 'css', rel);
    const b64 = (await readFile(file)).toString('base64');
    out = out.replace(full, `url('data:font/woff2;base64,${b64}')`);
  }
  return out;
}

const css = await inlineFonts(await read('assets/css/calculator.css'));

const seen = new Map();
const clashes = [];
const chunks = [];
for (const name of MODULES) {
  const code = await read(`assets/js/${name}`);
  for (const decl of declarationsIn(code)) {
    if (seen.has(decl)) clashes.push(`${decl} declared in both ${seen.get(decl)} and ${name}`);
    else seen.set(decl, name);
  }
  chunks.push(`/* ===== ${name} ===== */\n${stripModuleSyntax(code).trim()}`);
}
if (clashes.length) {
  console.error('Cannot bundle, these names collide at the top level:');
  clashes.forEach(c => console.error('  ' + c));
  process.exit(1);
}

const runtimeConfig = live
  ? `window.CURATED_POURS_CONFIG = { leadEndpoint: ${JSON.stringify(endpoint)} };`
  : 'window.CURATED_POURS_CONFIG = { leadEndpoint: null, previewMode: true };';

let html = await read('index.html');

// Swap the external references for the inlined versions.
html = html
  .replace(/\s*<link rel="preload" href="assets\/fonts\/[^>]*>/g, '')
  .replace('<link rel="stylesheet" href="assets/css/calculator.css">',
    `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="assets/js/app.js"></script>',
    `<script>\n${runtimeConfig}\n</script>\n<script type="module">\n${chunks.join('\n\n')}\n</script>`);

if (title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

// The favicon is a local file, so inline it too.
const favicon = await read('assets/img/favicon.svg');
html = html.replace('<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">',
  `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}" type="image/svg+xml">`);

if (/href="assets\/|src="assets\//.test(html)) {
  console.error('Cannot bundle, an asset reference survived:',
    html.match(/(?:href|src)="assets\/[^"]*"/g));
  process.exit(1);
}

await writeFile(outFile, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Built ${outFile} (${kb} KB, ${live ? 'live' : 'preview'} mode)`);
console.log(`  ${MODULES.length} modules and ${seen.size} top level names bundled with no collisions`);
