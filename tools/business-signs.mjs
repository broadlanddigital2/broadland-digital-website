// Business signs section: hub, category and product pages from content/business-signs.json, built into
// dist/business-signs/ inside the site's header and footer (the CRM page shell).
//
// While "staging" is true in the JSON:
//   - the worker serves these pages only on the *.workers.dev preview and localhost (404 on broadlanddigital.co.uk),
//   - every page is noindex and left out of the sitemap,
//   - each page shows an "SEO panel" (keywords, title/description lengths, image plan) and placeholders.
// Set "staging": false and rebuild to go live.
//
// Product photos: put the planned file (see each product's "images" list, e.g. clear-acrylic-sign-front.webp) in
// site/public/img/business-signs/ and it replaces the placeholder on the next build.
// Copy: categories take "intro" (paragraphs) and "faqs" ([{q, a}]); products take "description" (paragraphs), "facts",
// "included" and "goodToKnow" (lists). **bold** and [text](/link/) work. The rewrite workbook import fills these.
// Options: each becomes a dropdown (or a size box for "range"); add "add": {"Choice": 5} for add-on prices (ex VAT).
// Prices: add "price": 41 (ex VAT) to a product to show "From £41 + VAT" and add Product/Offer structured data.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PHONE = '01603 407786';
const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PH_ICON = '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

export function buildBusinessSigns({ root, shell, write, esc, origin }) {
  const file = join(root, 'content/business-signs.json');
  if (!existsSync(file)) return { paths: [], live: false };
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const staging = data.staging !== false;
  const css = readFileSync(join(root, 'site/bd-business-signs.css'));
  const cssV = createHash('sha1').update(css).digest('hex').slice(0, 10);
  write('_static/bd-business-signs.css', css);
  const js = readFileSync(join(root, 'site/bd-business-signs.js'));
  const jsV = createHash('sha1').update(js).digest('hex').slice(0, 10);
  write('_static/bd-business-signs.js', js);

  const cats = data.categories;
  const hub = cats.find((c) => c.key === 'hub');
  const catOf = new Map(cats.map((c) => [c.key, c]));
  const prods = data.products;
  const byCat = new Map();
  for (const p of prods) { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); }
  const imgDir = join(root, 'site/public/img/business-signs');
  const photo = (f) => (existsSync(join(imgDir, f)) ? `/img/business-signs/${f}` : null);
  const short = (s) => s.replace(/\s*\([^)]*\)/g, '');
  const money = (n) => `£${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  // copy fields are lists of paragraphs; **bold** and [text](/link/) are allowed
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  const paras = (list) => list.map((t) => `<p>${inline(t)}</p>`).join('');
  const vol = (n) => (n ? ` (${n.toLocaleString('en-GB')}/mo)` : '');

  // ----- shared pieces -----
  const crumbs = (list) => `<nav class="bds-crumbs" aria-label="Breadcrumb">${list.map(([name, url], i) => (i < list.length - 1 ? `<a href="${url}">${esc(name)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(name)}</span>`)).join('')}</nav>`;
  const crumbLd = (list) => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + url })) });
  const image = (img, cls = '') => {
    const src = img && photo(img.file);
    if (src) return `<img class="${cls}" src="${src}" alt="${esc(img.alt)}" loading="lazy" decoding="async" width="1600" height="1200">`;
    return `<span class="bds-ph ${cls}" role="img" aria-label="${esc(img ? img.alt : 'Photo coming soon')}">${PH_ICON}${staging && img ? `<small>${esc(img.file)}</small>` : ''}</span>`;
  };
  const priceText = (p) => (p.price ? `From ${money(p.price)} <small>+ VAT</small>` : staging ? '<span class="bds-todo">Price to be set</span>' : 'Price on request');
  const card = (p) => `<a class="bds-card" href="${p.url}">${image(p.images[0], 'bds-card-img')}<span class="bds-card-body"><span class="bds-card-title">${esc(p.h1)}</span><span class="bds-card-sum">${esc(p.lead)}</span><span class="bds-card-price">${priceText(p)}</span></span></a>`;
  const catCard = (c) => `<a class="bds-tile" href="${c.url}"><span class="bds-tile-title">${esc(c.name)}</span><span class="bds-tile-desc">${esc(c.metaDescription)}</span><span class="bds-tile-go">${(byCat.get(c.key) || []).length} products ${ARROW}</span></a>`;
  const band = `<section class="bds-band"><div class="bds-wrap"><div><h2>Not sure which sign you need?</h2><p>Tell us where it's going and what it needs to say, and we'll recommend the right material and size.</p></div><p class="bds-actions"><a class="bds-btn" href="/get-a-quote/">Get a quote</a><a class="bds-btn bds-btn--ghost" href="tel:${PHONE.replace(/\s/g, '')}">Call ${PHONE}</a></p></div></section>`;
  const panel = (rows, extra = '') => (!staging ? '' : `<aside class="bds-dev" aria-label="SEO panel (test site only)"><div class="bds-wrap"><p class="bds-dev-head"><b>Test page: not live.</b> Only shown on the preview address; noindex, not in the sitemap.</p><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>${extra}</div></aside>`);
  const lenFlag = (s, max) => `${esc(s)} <span class="bds-len${s.length > max ? ' bad' : ''}">${s.length}/${max}</span>`;
  const seoRows = (x) => [['Primary keyword', esc(x.primary) + vol(x.primaryVolume)], ['Secondary keywords', esc((x.secondary || []).join(', '))],
    ['Meta title', lenFlag(x.metaTitle, 60)], ['Meta description', lenFlag(x.metaDescription, 155)], ['URL', esc(x.url)], ...(x.brief ? [['Copy brief', esc(x.brief)]] : [])];

  const page = ({ url, title, desc, body, ld }) => {
    const graph = { '@context': 'https://schema.org', '@graph': ld };
    let h = shell
      .replace('<title>Broadland Digital</title>', `<title>${esc(title)}</title>`)
      .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${origin}${url}">`)
      .replace('<!--crm:head-->', [
        `<meta name="description" content="${esc(desc)}">`,
        staging ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">',
        `<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${origin}${url}">`,
        `<link rel="stylesheet" href="/_static/bd-business-signs.css?v=${cssV}">`,
        `<script src="/_static/bd-business-signs.js?v=${jsV}" defer></script>`,
        `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`,
      ].join('\n'))
      .replace('<div class="crm-main" data-crm-blog="slot"></div>', `<div class="bds">${body}</div>`);
    write(`${url.slice(1)}index.html`, h);
    return url.replace(/\/$/, '');
  };

  const paths = [];
  const HOME = ['Home', '/'];
  const HUB = [hub.name, hub.url];
  const listed = cats.filter((c) => c.key !== 'hub').sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  // ----- hub -----
  {
    const trail = [HOME, HUB];
    const body = `<section class="bds-hero"><div class="bds-wrap">${crumbs(trail)}<span class="bds-eyebrow">Business signs</span><h1>${esc(hub.h1)}</h1><p class="bds-lead">${esc(hub.metaDescription)}</p><p class="bds-actions"><a class="bds-btn" href="#types">Browse sign types</a><a class="bds-btn bds-btn--ghost" href="/get-a-quote/">Get a quote</a></p></div></section>
<section class="bds-section" id="types"><div class="bds-wrap"><h2>Shop by sign type</h2><div class="bds-tiles">${listed.map(catCard).join('')}</div></div></section>
${panel([...seoRows(hub), ['Pages', `${listed.length} categories, ${prods.length} products`]])}${band}`;
    paths.push(page({ url: hub.url, title: hub.metaTitle, desc: hub.metaDescription, body,
      ld: [crumbLd(trail), { '@type': 'CollectionPage', name: hub.h1, url: origin + hub.url, description: hub.metaDescription, inLanguage: 'en-GB',
        hasPart: listed.map((c) => ({ '@type': 'CollectionPage', name: c.name, url: origin + c.url })) }] }));
  }

  // ----- categories -----
  for (const c of listed) {
    const list = byCat.get(c.key) || [];
    const trail = [HOME, HUB, [c.name, c.url]];
    const others = listed.filter((o) => o.key !== c.key);
    const body = `<section class="bds-hero bds-hero--slim"><div class="bds-wrap">${crumbs(trail)}<h1>${esc(c.h1)}</h1><p class="bds-lead">${esc(c.metaDescription)}</p></div></section>
<section class="bds-section"><div class="bds-wrap"><div class="bds-grid">${list.map(card).join('')}</div></div></section>
${c.intro?.length ? `<section class="bds-section bds-section--alt"><div class="bds-wrap bds-copy"><h2>About ${esc(c.name.toLowerCase())}</h2>${paras(c.intro)}</div></section>` : ''}
${c.faqs?.length ? `<section class="bds-section"><div class="bds-wrap bds-copy"><h2>${esc(c.name)} FAQs</h2><div class="bds-faqs">${c.faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${inline(f.a)}</p></details>`).join('')}</div></div></section>` : ''}
<section class="bds-section bds-section--alt"><div class="bds-wrap"><h2>Other sign types</h2><p class="bds-chips">${others.map((o) => `<a href="${o.url}">${esc(o.name)}</a>`).join('')}</p></div></section>
${panel([...seoRows(c), ['Products', String(list.length)], ['FAQs', c.faqs?.length ? String(c.faqs.length) : '<span class="bds-todo">none yet</span>'], ['Category copy', c.intro?.length ? `${c.intro.length} paragraphs` : '<span class="bds-todo">to be written: add "intro" (a list of paragraphs) to this category</span>']])}${band}`;
    paths.push(page({ url: c.url, title: c.metaTitle, desc: c.metaDescription, body,
      ld: [crumbLd(trail), { '@type': 'CollectionPage', name: c.h1, url: origin + c.url, description: c.metaDescription, inLanguage: 'en-GB',
        mainEntity: { '@type': 'ItemList', itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + p.url, name: p.h1 })) } },
        ...(c.faqs?.length ? [{ '@type': 'FAQPage', mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [])] }));
  }

  // ----- products -----
  for (const p of prods) {
    const c = catOf.get(p.cat);
    const trail = [HOME, HUB, [c.name, c.url], [short(p.h1), p.url]];
    const related = (byCat.get(p.cat) || []).filter((x) => x !== p).slice(0, 4);
    const field = (o, i) => o.range
      ? `<label class="bds-field"><span>${esc(o.label)}</span><input type="number" inputmode="numeric" name="o${i}" min="${o.range[0]}" max="${o.range[1]}" step="1" data-label="${esc(o.label.replace(/ \(mm\)$/, ''))}" placeholder="e.g. ${Math.round((o.range[0] + Math.min(o.range[1], o.range[0] * 6)) / 2 / 10) * 10}"><small class="bds-hint">${o.range[0]}mm to ${o.range[1]}mm</small></label>`
      : `<label class="bds-field"><span>${esc(o.label)}</span><select name="o${i}" data-label="${esc(o.label)}"${o.add ? ` data-add="${esc(JSON.stringify(o.add))}"` : ''}>${o.choices.map((c) => `<option value="${esc(c)}">${esc(c)}${o.add && o.add[c] ? ` (+${money(o.add[c])})` : ''}</option>`).join('')}</select></label>`;
    const config = `<form class="bds-config" data-name="${esc(p.h1)}"${p.price ? ` data-price="${p.price}"` : ''} novalidate aria-label="Choose your options">
${p.options.length ? `<div class="bds-fields">${p.options.map(field).join('')}</div>` : ''}
<div class="bds-fields bds-fields--qty"><label class="bds-field"><span>Quantity</span><input type="number" inputmode="numeric" name="qty" min="1" value="1" data-label="Quantity"></label></div>
<p class="bds-total" hidden>Total: <b></b> <small>+ VAT</small></p>
<p class="bds-actions"><a class="bds-btn" href="#enquire" data-enquire="${esc(p.h1)}">Enquire with these options</a><a class="bds-btn bds-btn--ghost" href="tel:${PHONE.replace(/\s/g, '')}">Call ${PHONE}</a></p>
</form>`;
    const imgs = p.images;
    const body = `<section class="bds-product"><div class="bds-wrap">${crumbs(trail)}<div class="bds-product-grid">
<div class="bds-gallery">${image(imgs[0], 'bds-main')}<div class="bds-thumbs">${imgs.slice(1).map((i) => image(i, 'bds-thumb')).join('')}</div></div>
<div class="bds-buy"><span class="bds-eyebrow"><a href="${c.url}">${esc(c.name)}</a></span><h1>${esc(p.h1)}</h1><p class="bds-lead">${esc(p.lead)}</p><p class="bds-price">${priceText(p)}</p>
${config}
${p.facts?.length ? `<ul class="bds-points">${p.facts.map((f) => `<li>${inline(f)}</li>`).join('')}</ul>` : staging ? '<p class="bds-todo">Key features to be written</p>' : ''}</div>
</div></div></section>
${p.description?.length || p.included?.length || p.goodToKnow?.length ? `<section class="bds-section bds-section--alt"><div class="bds-wrap bds-about">${p.description?.length ? `<div class="bds-copy"><h2>About this sign</h2>${paras(p.description)}</div>` : ''}${p.included?.length || p.goodToKnow?.length ? `<div class="bds-side">${p.included?.length ? `<h3>What's included</h3><ul>${p.included.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}${p.goodToKnow?.length ? `<h3>Good to know</h3><ul>${p.goodToKnow.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}</div></section>` : staging ? '<section class="bds-section bds-section--alt"><div class="bds-wrap bds-copy"><h2>About this sign</h2><p class="bds-todo">Description, what\'s included and good-to-know to be written (rewrite workbook → import).</p></div></section>' : ''}
${related.length ? `<section class="bds-section"><div class="bds-wrap"><h2>More ${esc(c.name.toLowerCase())}</h2><div class="bds-grid">${related.map(card).join('')}</div><p><a class="bds-textlink" href="${c.url}">All ${esc(c.name.toLowerCase())} ${ARROW}</a></p></div></section>` : ''}
${panel([...seoRows(p), ['Category', `<a href="${c.url}">${esc(c.name)}</a>`], ['Folded-in variants', p.variants.length ? esc(p.variants.join(' · ')) : 'none'],
    ['Option prices', p.options.some((o) => o.add) ? 'set' : '<span class="bds-todo">not set (add "add": {"Choice": 5} to an option)</span>'], ['Price', p.price ? money(p.price) + ' ex VAT' : '<span class="bds-todo">not set (add "price" in content/business-signs.json)</span>']],
  `<table class="bds-imgplan"><thead><tr><th>#</th><th>File (site/public/img/business-signs/)</th><th>Alt text</th><th>Shot</th><th>Status</th></tr></thead><tbody>${imgs.map((i, n) => `<tr><td>${n + 1}</td><td><code>${esc(i.file)}</code></td><td>${esc(i.alt)} <span class="bds-len${i.alt.length > 125 ? ' bad' : ''}">${i.alt.length}</span></td><td>${esc(i.shot)}</td><td>${photo(i.file) ? 'uploaded' : '<span class="bds-todo">to shoot</span>'}</td></tr>`).join('')}</tbody></table>`)}${band}`;
    const firstPhoto = imgs.map((i) => photo(i.file)).filter(Boolean);
    const product = { '@type': 'Product', name: p.h1, description: p.metaDescription, url: origin + p.url, brand: { '@type': 'Brand', name: 'Broadland Digital' },
      ...(firstPhoto.length ? { image: firstPhoto.map((s) => origin + s) } : {}),
      ...(p.price ? { offers: { '@type': 'Offer', priceCurrency: 'GBP', price: String(p.price), availability: 'https://schema.org/InStock', url: origin + p.url,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: 'GBP', valueAddedTaxIncluded: false } } } : {}) };
    paths.push(page({ url: p.url, title: p.metaTitle, desc: p.metaDescription, body, ld: [crumbLd(trail), ...(p.price ? [product] : [])] }));
  }

  return { paths, live: !staging, count: { categories: listed.length, products: prods.length } };
}
