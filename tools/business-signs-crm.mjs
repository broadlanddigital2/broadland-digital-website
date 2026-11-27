// Business signs pages are edited in the CRM (Marketing → SEO pages → Broadland Digital, templates "Business sign
// product" and "Business sign category"). tools/fetch-crm.mjs saves what's published there to
// crm-data/business-signs.json; this applies it on top of content/business-signs.json before the pages are built.
//
// What comes from the CRM: headings, meta titles and descriptions, keywords (first = primary), summaries, prices,
// photos, all the copy (description, key features, specs, uses, installation, included, good to know, FAQs) and the
// dropdown options with their add-on prices. A page published in the CRM under /business-signs/<category>/ that isn't in
// the JSON becomes a new product; a page unpublished in the CRM is removed from the site. What stays in the JSON: the
// staging switch, the shared how-to guides and artwork checklist, the copy briefs and the photo plans.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STORAGE = 'https://dipjypzrfigkzuarlsov.supabase.co/storage/v1/object/public/seo-images/ae4393de-99e2-4a0f-be28-2866e44443bd';
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const norm = (p) => (String(p || '').replace(/\/+$/, '') || '/') + '/';

// "/img/business-signs/x.webp" → the site's own photo; "/media/…" → the CRM's image store; full addresses as they are.
function images(v) {
  return (Array.isArray(v) ? v : []).filter((i) => str(i?.image)).map((i) => {
    const s = str(i.image), alt = str(i.alt), shot = str(i.shot);
    if (s.startsWith('/img/business-signs/')) return { file: s.slice('/img/business-signs/'.length), alt, shot };
    const src = s.startsWith('/media/') ? STORAGE + s.slice('/media'.length) : s;
    return { file: s.split('/').pop(), src, alt, shot };
  });
}

// One option per row: a label, its choices one per line ("Matt black | 5" adds £5), or a number box from min to max.
function options(v) {
  return (Array.isArray(v) ? v : []).filter((o) => str(o?.label)).map((o) => {
    const label = str(o.label);
    const min = Number(str(o.min)), max = Number(str(o.max));
    const lines = String(o.choices || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (!lines.length && Number.isFinite(min) && str(o.min)) return { label, range: [min, Number.isFinite(max) ? max : 0] };
    const add = {}, choices = lines.map((l) => {
      const [name, price] = l.split('|').map((x) => x.trim());
      if (price && Number(price) > 0) add[name] = Number(price);
      return name;
    });
    return Object.keys(add).length ? { label, choices, add } : { label, choices };
  }).filter((o) => o.range || o.choices.length);
}

export function applyCrm(data, root) {
  const file = join(root, 'crm-data/business-signs.json');
  if (!existsSync(file)) return { data, from: 'json' };
  const crm = JSON.parse(readFileSync(file, 'utf8'));
  const pages = (crm.pages || []).filter((p) => p && p.path && p.data && typeof p.data === 'object');
  if (!pages.length) return { data, from: 'json' };
  const byUrl = new Map(pages.map((p) => [norm(p.path), p]));
  const head = (o, p) => {
    if (str(p.h1)) o.h1 = str(p.h1);
    if (str(p.metaTitle)) o.metaTitle = str(p.metaTitle);
    if (str(p.metaDescription)) o.metaDescription = str(p.metaDescription);
    const kw = list(p.keywords);
    if (kw.length) { o.primary = kw[0]; o.secondary = kw.slice(1); }
  };

  const categories = data.categories.filter((c) => c.key === 'hub' || byUrl.has(c.url)).map((c) => {
    const p = byUrl.get(c.url);
    if (!p) return c;
    const o = { ...c }, d = p.data;
    head(o, p);
    if (str(d.name)) o.name = str(d.name);
    if (list(d.intro).length) o.intro = list(d.intro);
    if (Array.isArray(d.faqs)) o.faqs = d.faqs.filter((f) => str(f?.q) && str(f?.a)).map((f) => ({ q: str(f.q), a: str(f.a) }));
    return o;
  });
  const catByUrl = new Map(categories.map((c) => [c.url, c]));

  const product = (base, p) => {
    const o = { ...base }, d = p.data;
    head(o, p);
    if (str(d.lead)) o.lead = str(d.lead);
    const price = Number(str(d.price).replace(/[£,\s]/g, ''));
    if (price > 0) o.price = price; else delete o.price;
    if (Array.isArray(d.images)) o.images = images(d.images);
    for (const k of ['description', 'facts', 'uses', 'install', 'included', 'goodToKnow']) if (Array.isArray(d[k])) o[k] = list(d[k]);
    if (Array.isArray(d.specs)) o.specs = d.specs.filter((s) => str(s?.label)).map((s) => [str(s.label), str(s.value)]);
    if (Array.isArray(d.faqs)) o.faqs = d.faqs.filter((f) => str(f?.q) && str(f?.a)).map((f) => ({ q: str(f.q), a: str(f.a) }));
    if (Array.isArray(d.options)) o.options = options(d.options);
    // Size pricing: one row per choice of the "priced by" dropdown (or one row for all): fixed charge + £ per m² +
    // £ per metre of edge (perimeter), never below the minimum. Quantity discounts: % off each from that quantity.
    const num = (v) => { const n = Number(str(v).replace(/[£,%\s]/g, '')); return Number.isFinite(n) ? n : 0; };
    if (Array.isArray(d.sizePricing)) {
      const rows = {};
      for (const r of d.sizePricing) if (str(r?.fixed) || str(r?.perM2)) rows[str(r.option) || '*'] = [num(r.fixed), num(r.perM2), num(r.perMetreEdge), num(r.minimum)];
      if (Object.keys(rows).length) o.size = { by: str(d.sizeBy) || null, rows }; else delete o.size;
    }
    if (Array.isArray(d.qtyDiscounts)) {
      const q = d.qtyDiscounts.map((r) => [num(r.qty), num(r.percent)]).filter(([n, pc]) => n > 1 && pc > 0).sort((a, b) => a[0] - b[0]);
      if (q.length) o.qtyBreaks = q; else delete o.qtyBreaks;
    }
    return o;
  };
  const known = new Set(data.products.map((p) => p.url));
  const products = data.products.filter((p) => byUrl.has(p.url)).map((p) => product(p, byUrl.get(p.url)));
  // New products added in the CRM under an existing category.
  for (const p of pages) {
    const url = norm(p.path);
    if (known.has(url) || catByUrl.has(url)) continue;
    const cat = catByUrl.get(url.replace(/[^/]+\/$/, ''));
    if (!cat || cat.key === 'hub') continue;
    products.push(product({ ref: 'CRM', cat: cat.key, url, h1: str(p.h1) || str(p.title), primary: '', primaryVolume: null, secondary: [], metaTitle: '', metaDescription: '',
      lead: '', variants: [], options: [], images: [], brief: '', description: [], facts: [], included: [], goodToKnow: [], specs: [], uses: [], install: [], faqs: [] }, p));
  }
  return { data: { ...data, categories, products }, from: 'crm' };
}
