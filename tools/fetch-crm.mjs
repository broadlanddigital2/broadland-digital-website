// Copies the CRM's published SEO pages and blog posts into the site, the way the Race Car Graphics site does, so
// visitors never reach the CRM (Supabase). Run hourly by .github/workflows/publish-from-crm.yml, which commits and
// pushes any change (Cloudflare then deploys it).
//
//   crm-data/index.json          the page list: paths, headings, summaries, pictures, page CSS (no page HTML)
//   crm-data/pages/<key>.json    one file per page with its HTML and schema (key: the path, "/" → "~")
//   crm-data/blog.json           published blog posts
//   crm-data/shop-products.json  the shop products (CRM → Products), built into the /product/ pages
//
// tools/build.mjs copies crm-data/ to dist/_crm/ (the worker reads it through env.ASSETS; the public can't).
// If the CRM can't be reached nothing is changed, so the site keeps the last good copy.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'c9a2ffbc-820c-45d0-a212-14f0f33a2f54'; // seo_sites.feed_key for Broadland Digital (public, read-only)
const FN = 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1';
const DATA = join(ROOT, 'crm-data');

export const pageKey = (path) => (String(path).replace(/\/+$/, '') || '/').replace(/^\//, '').replace(/\//g, '~') || 'home';

const get = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url.split('?')[0]} → ${r.status}`);
  return r.json();
};
const save = (file, obj) => {
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(obj);
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return false;
  writeFileSync(file, text);
  return true;
};

let feed, blog, shop;
try {
  [feed, blog, shop] = await Promise.all([get(`${FN}/seo-feed?key=${KEY}`), get(`${FN}/seo-blog?key=${KEY}`), get(`${FN}/seo-feed?key=${KEY}&products=1`)]);
  if (!Array.isArray(feed.pages) || !Array.isArray(blog.posts) || !Array.isArray(shop.products)) throw new Error('unexpected feed shape');
} catch (e) {
  console.log(`CRM not reachable (${e.message}): keeping the last copy.`);
  process.exit(0);
}

// Business signs pages (templates business_sign_*) are built by tools/business-signs.mjs from their data, not served
// as CRM HTML, so they're kept apart: crm-data/business-signs.json, left out of the page list and the sitemap feed.
const isSign = (p) => String(p.template || '').startsWith('business_sign');
const signs = feed.pages.filter(isSign).map(({ html, schema, ...rest }) => rest);
feed.pages = feed.pages.filter((p) => !isSign(p));

let changed = 0;
if (save(join(DATA, 'business-signs.json'), { pages: signs })) { changed++; console.log('Business signs changed in the CRM: rebuild needed.'); writeFileSync(join(ROOT, '.business-signs-changed'), '1'); }
// Shop products (CRM → Products): the product pages are built from them by tools/build.mjs, so a change needs a rebuild.
// An empty list is ignored (keeps the last copy) so a CRM hiccup can't empty the shop.
if (shop.products.length && save(join(DATA, 'shop-products.json'), { products: shop.products.map(({ updated_at, ...p }) => p) })) {
  changed++; console.log('Shop products changed in the CRM: rebuild needed.'); writeFileSync(join(ROOT, '.shop-products-changed'), '1');
}
const keep = new Set();
for (const p of feed.pages) {
  const k = pageKey(p.path);
  keep.add(k + '.json');
  if (save(join(DATA, 'pages', k + '.json'), { page: p })) changed++;
}
const pagesDir = join(DATA, 'pages');
for (const f of readdirSync(pagesDir)) if (!keep.has(f) && f !== '.keep') { rmSync(join(pagesDir, f)); changed++; }

// Sector pages keep their links (for the "Popular with" strip on signage pages); no other page HTML in the list.
const list = feed.pages.map(({ html, schema, ...rest }) =>
  rest.pageType === 'sector' ? { ...rest, links: [...new Set([...String(html || '').matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]))] } : rest);
if (save(join(DATA, 'index.json'), { site: feed.site, llms: feed.llms, css: feed.css, vars: feed.vars, pages: list })) changed++;
if (save(join(DATA, 'blog.json'), { posts: blog.posts, business: blog.business || null })) changed++;

// Keep dist/ in step without a full rebuild.
if (existsSync(join(ROOT, 'dist'))) {
  rmSync(join(ROOT, 'dist', '_crm'), { recursive: true, force: true });
  cpSync(DATA, join(ROOT, 'dist', '_crm'), { recursive: true });
}
console.log(`CRM: ${feed.pages.length} pages, ${signs.length} business signs pages, ${shop.products.length} shop products, ${blog.posts.length} posts, ${changed} file(s) changed.`);
