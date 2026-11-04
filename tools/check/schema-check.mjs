// Checks the JSON-LD on built pages (or HTML files given on the command line): parses, lists types, and flags
// missing properties Google needs for rich results. Usage: node tools/check/schema-check.mjs [dir-or-files…]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/^(wp-content|wp-includes|opt|img|brands|_static|_crm-page)$/.test(f)) walk(p); } else if (f === 'index.html') files.push(p); } };
if (!args.length) walk('dist'); else for (const a of args) statSync(a).isDirectory() ? walk(a) : files.push(a);
const need = {
  Product: ['name', 'image', 'offers'], Offer: ['price', 'priceCurrency'], AggregateOffer: ['lowPrice', 'priceCurrency'],
  BreadcrumbList: ['itemListElement'], ListItem: ['position', 'name'], FAQPage: ['mainEntity'], Question: ['name', 'acceptedAnswer'],
  LocalBusiness: ['name', 'address', 'telephone'], Organization: ['name', 'url'], WebPage: ['name'], Article: ['headline'], BlogPosting: ['headline'],
  Service: ['name', 'provider'], ItemList: ['itemListElement'], ContactPage: ['name'], CollectionPage: ['name'], WebSite: ['name', 'url'],
};
const problems = []; const typeCount = {}; let pagesNoLd = 0, pagesBad = 0;
for (const f of files) {
  const h = readFileSync(f, 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/.test(h)) continue;
  const blocks = [...h.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const page = f.replace(/^dist/, '').replace(/index\.html$/, '');
  if (!blocks.length) { pagesNoLd++; problems.push(`${page}: no structured data`); continue; }
  const types = new Set(); let bad = false;
  const visit = (n, path) => {
    if (Array.isArray(n)) return n.forEach((x, i) => visit(x, path + '[' + i + ']'));
    if (!n || typeof n !== 'object') return;
    const t = [].concat(n['@type'] || []);
    for (const ty of t) {
      types.add(ty); typeCount[ty] = (typeCount[ty] || 0) + 1;
      const isRef = Object.keys(n).length <= 2 && n['@id'];
      if (!isRef) for (const k of need[ty] || []) if (n[k] == null || n[k] === '' || (Array.isArray(n[k]) && !n[k].length)) { problems.push(`${page}: ${ty} missing ${k}`); bad = true; }
      if (ty === 'Offer' && n.price != null && !(Number(n.price) > 0)) { problems.push(`${page}: Offer price is ${JSON.stringify(n.price)}`); bad = true; }
      if (ty === 'Product' && n.offers && !n.offers.price && !n.offers.lowPrice && ![].concat(n.offers).some((o) => o.price || o.lowPrice)) { problems.push(`${page}: Product offers without a price`); bad = true; }
    }
    for (const [k, v] of Object.entries(n)) if (k !== '@context') visit(v, path + '.' + k);
  };
  for (const b of blocks) {
    let j; try { j = JSON.parse(b); } catch (e) { problems.push(`${page}: JSON-LD does not parse (${e.message.slice(0, 60)})`); bad = true; continue; }
    visit(j, '');
  }
  if (!types.has('BreadcrumbList') && page !== '/') problems.push(`${page}: no BreadcrumbList`);
  if (bad) pagesBad++;
}
console.log(`${files.length} pages checked; ${pagesNoLd} without JSON-LD; ${pagesBad} with errors`);
console.log('Types:', Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', '));
const grouped = {};
for (const p of problems) { const k = p.replace(/^[^:]+: /, ''); (grouped[k] ||= []).push(p.split(':')[0]); }
for (const [k, v] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) console.log(`- ${k} (${v.length}): ${v.slice(0, 6).join(' ')}${v.length > 6 ? ' …' : ''}`);
