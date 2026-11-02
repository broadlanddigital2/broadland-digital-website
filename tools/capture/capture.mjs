// Copies the live WordPress site's pages, exactly as WordPress serves them, into source/wordpress/<address>/index.html,
// with every theme and plugin file they use (CSS, scripts, fonts, theme images) in source/wordpress-assets/ and every
// upload (images, PDFs) in site/public/wp-content/uploads. tools/build.mjs turns these into the static site, so the new
// site looks exactly like the old one. Run by .github/workflows/capture-wordpress.yml (the old site must be online).
//
//   node tools/capture/capture.mjs [origin]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ORIGIN = (process.argv[2] || 'https://broadlanddigital.co.uk').replace(/\/$/, '');
const ROOT = new URL('../..', import.meta.url).pathname;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const wp = JSON.parse(readFileSync(join(ROOT, 'content/wordpress.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'tools/capture/extra-pages.json'), 'utf8'));
const get = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (r.ok) return r;
      if (r.status === 404) return null;
    } catch {}
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
  return null;
};
const save = (file, data) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); };
const local = (u) => { try { const x = new URL(u, ORIGIN + '/'); return /(^|\.)broadlanddigital\.co\.uk$/.test(x.host) || x.origin === ORIGIN ? x : null; } catch { return null; } };

// Every address in the live sitemaps (pages, products, shop and blog categories, posts), plus the export's pages.
const SKIP = new Set(['/cart', '/checkout', '/my-account', '/sample-page', '/product/ttest']);
async function sitemapPaths() {
  const out = [];
  const idx = await get(ORIGIN + '/sitemap_index.xml');
  if (!idx) return out;
  for (const sm of [...(await idx.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    const r = await get(sm);
    if (!r) continue;
    for (const m of (await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const u = local(m[1]);
      if (u && !u.pathname.startsWith('/wp-content/') && !/\.(kml|xml)$/.test(u.pathname)) out.push(u.pathname.replace(/\/+$/, '') || '/');
    }
  }
  return out;
}
const fromSitemaps = await sitemapPaths();
console.log(`${fromSitemaps.length} addresses in the live sitemaps`);
const paths = [...new Set([...wp.pages.map((p) => p.path), ...wp.products.map((p) => p.path), ...extra, ...fromSitemaps])].filter((p) => !SKIP.has(p));

// Files at the top of the site that search engines read (Rank Math's local SEO file).
for (const f of ['/locations.kml']) {
  const r = await get(ORIGIN + f);
  if (r) save(join(ROOT, 'site/public', f), Buffer.from(await r.arrayBuffer()));
}


// 1. Pages
const pages = {};
const missing = [];
// Category pages run onto /page/2, /page/3…: those are found from the links on each page as it is saved.
const queue = [...paths];
const queued = new Set(queue);
while (queue.length) {
  const p = queue.shift();
  const r = await get(ORIGIN + (p === '/' ? '/' : p + '/'));
  if (!r) { missing.push(p); continue; }
  const html = await r.text();
  pages[p] = html;
  for (const m of html.matchAll(/href=["'](?:https?:\/\/(?:www\.)?broadlanddigital\.co\.uk)?(\/(?:category|posts|shop)\/[^"'#?]*?\/page\/\d+)\/?["']/g)) {
    const next = m[1].replace(/\/+$/, '');
    if (!queued.has(next)) { queued.add(next); queue.push(next); }
  }
  save(join(ROOT, 'source/wordpress', p === '/' ? '' : p, 'index.html'), html);
}
console.log(`${Object.keys(pages).length} pages saved${missing.length ? '; not found: ' + missing.join(' ') : ''}`);

// 2. Theme/plugin files and uploads the pages use
const assets = new Set(), uploads = new Set();
const note = (u) => {
  const x = local(String(u).trim().replace(/&#0?38;|&amp;/g, '&'));
  if (!x) return;
  if (x.pathname.startsWith('/wp-content/uploads/')) uploads.add(decodeURIComponent(x.pathname));
  else if (/^\/(wp-content\/(themes|plugins|cache\/min)|wp-includes)\//.test(x.pathname) && /\.(css|js|svg|png|jpe?g|gif|webp|woff2?|ttf|otf|eot|ico)$/i.test(x.pathname)) assets.add(x.origin + x.pathname + x.search);
};
for (const html of Object.values(pages)) {
  for (const m of html.matchAll(/\b(?:href|src|data-src|data-lazy-src|poster|content)=["']([^"']+)["']/g)) note(m[1]);
  for (const m of html.matchAll(/srcset=["']([^"']+)["']/g)) for (const part of m[1].split(',')) note(part.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) note(m[1]);
  for (const m of html.matchAll(/"pdf_source":"([^"]+)"/g)) note(m[1].replace(/\\\//g, '/'));
}
const done = new Set();
let saved = 0;
while (assets.size > done.size) {
  for (const a of [...assets]) {
    if (done.has(a)) continue;
    done.add(a);
    const u = new URL(a);
    const file = join(ROOT, 'source/wordpress-assets', decodeURIComponent(u.pathname));
    let body;
    if (existsSync(file)) body = readFileSync(file);
    else { const r = await get(a); if (!r) { console.log('missing asset', a); continue; } body = Buffer.from(await r.arrayBuffer()); save(file, body); saved++; }
    if (u.pathname.endsWith('.css')) for (const m of body.toString('utf8').matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      if (m[1].startsWith('data:')) continue;
      const x = local(new URL(m[1], a).toString());
      if (x) note(x.toString());
    }
  }
}
console.log(`${done.size} theme/plugin files (${saved} new)`);
let up = 0, upMissing = [];
for (const p of uploads) {
  const file = join(ROOT, 'site/public', p);
  if (existsSync(file)) continue;
  const r = await get(ORIGIN + encodeURI(p));
  if (!r) { upMissing.push(p); continue; }
  save(file, Buffer.from(await r.arrayBuffer())); up++;
}
console.log(`${uploads.size} uploads used (${up} new)${upMissing.length ? '; not found: ' + upMissing.join(' ') : ''}`);
