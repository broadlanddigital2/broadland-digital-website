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
// "included", "goodToKnow", "uses" ("Title: detail"), "install" (paragraphs), "specs" ([label, value]) and "faqs" ([{q, a}]). **bold** and [text](/link/) work. The rewrite workbook import fills these.
// Options: each becomes a dropdown (or a size box for "range"); add "add": {"Choice": 5} for add-on prices (ex VAT).
// Prices: add "price": 41 (ex VAT) to a product to show "From £41 + VAT" and add Product/Offer structured data.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { applyCrm } from './business-signs-crm.mjs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PHONE = '01603 407786';
const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PH_ICON = '<svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

export function buildBusinessSigns({ root, shell, write, esc, origin }) {
  const file = join(root, 'content/business-signs.json');
  if (!existsSync(file)) return { paths: [], live: false };
  const { data, from } = applyCrm(JSON.parse(readFileSync(file, 'utf8')), root);
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

  // "Preview your sign" banner (design pack): a scene picked from the category/product, live wording per product.
  const SCENES = {
    'reception-wall': 'on a reception wall', 'raised-letters': 'on a shop fascia', 'projecting-sign': 'outside your premises',
    'night-shopfront': 'lit up on a shopfront at night', 'pavement-a-board': 'out on the pavement', 'car-park-post': 'on a car park post',
    'shop-window': 'in a shop window', 'floor-graphic': 'on your floor', 'roller-banner': 'on a stand at an event',
  };
  const sceneFor = (p, c) => {
    const n = `${p.h1} ${p.slug || ''}`.toLowerCase();
    if (/a-board|pavement|swing|forecourt/.test(n)) return 'pavement-a-board';
    if (/\bposts?\b|totem/.test(n)) return 'car-park-post';
    if (/roller|pop.?up|display stand|exhibition/.test(n)) return 'roller-banner';
    if (/\bmats?\b|floor/.test(n)) return 'floor-graphic';
    if (/window|frosted|vinyl lettering for glass/.test(n)) return 'shop-window';
    if (/hanging|projecting/.test(n)) return 'projecting-sign';
    if (/letter/.test(n) && c.key !== 'window') return 'raised-letters';
    return ({ letters: 'raised-letters', illuminated: 'night-shopfront', lightbox: 'night-shopfront', hanging: 'projecting-sign',
      outdoor: 'projecting-sign', aluminium: 'projecting-sign', banners: 'projecting-sign', hoarding: 'projecting-sign', correx: 'projecting-sign',
      pavement: 'pavement-a-board', cafe: 'pavement-a-board', parking: 'car-park-post', noparking: 'car-park-post', window: 'shop-window',
      floor: 'floor-graphic', mats: 'floor-graphic', roller: 'roller-banner', displays: 'roller-banner' })[c.key] || 'reception-wall';
  };
  // product name in running text: lower case except words with digits or capitals inside (3D, LED, UV), plus a/an for singular names
  const runName = (h) => {
    const t = short(h).split(/\s+/).map((w) => (/\d|^[A-Z]{2,}|[a-z][A-Z]/.test(w) ? w : w.toLowerCase())).join(' ').replace(/\ba-board/g, 'A-board');
    const last = t.split(' ').pop().toLowerCase();
    const plural = /s$/.test(last) && !/(ss|us|glass|perspex|foamex|dibond)$/.test(last);
    return plural || /\b(art|carpet|wallpaper)$/.test(t) ? t : `${/^[aeiou]/i.test(t) && !/^(uv|u\b|eu)/i.test(t) ? 'an' : 'a'} ${t}`;
  };
  const placeFor = (p, sc) => {
    const n = p.h1.toLowerCase();
    if (/desk|trophy|award|plaque|freestanding/.test(n)) return 'in your reception';
    if (/totem/.test(n)) return 'outside your premises';
    return SCENES[sc];
  };
  const previewBanner = (p, c) => {
    const sc = sceneFor(p, c);
    return `<div class="bdp-sp"><button type="button" class="bdp-builder sign-preview-banner" data-builder="${esc(JSON.stringify(builderStyle(p, c)))}" aria-labelledby="sp-heading" aria-describedby="sp-desc"><img class="sign-preview-scene" src="/img/business-signs/scenes/${sc}.svg" width="120" height="84" alt="" loading="lazy" decoding="async"><span class="sign-preview-copy"><span class="sign-preview-tag">Free sign builder</span><span class="sign-preview-heading" id="sp-heading">Preview your sign</span><span class="sign-preview-description" id="sp-desc">Upload your logo and see it as ${esc(runName(p.h1))} ${placeFor(p, sc)}.</span></span><span class="sign-preview-arrow"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></span></button></div>`;
  };
  const money = (n) => `£${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  // copy fields are lists of paragraphs; **bold** and [text](/link/) are allowed
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  const paras = (list) => list.map((t) => `<p>${inline(t)}</p>`).join('');
  const vol = (n) => (n ? ` (${n.toLocaleString('en-GB')}/mo)` : '');

  // ----- shared pieces -----
  const crumbs = (list) => `<nav class="bds-crumbs" aria-label="Breadcrumb">${list.map(([name, url], i) => (i < list.length - 1 ? `<a href="${url}">${esc(name)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(name)}</span>`)).join('')}</nav>`;
  const crumbLd = (list) => ({ '@type': 'BreadcrumbList', itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + url })) });
  // Product photos: the main photo opens a full-size viewer (bd-business-signs.js; without script it opens the
  // photo itself), and every thumbnail shows that photo as the main one. Placeholders stay as they are.
  const srcOf = (img) => img && (img.src || photo(img.file));
  const gallery = (imgs) => {
    const real = imgs.filter(srcOf);
    if (!real.length) return `<div class="bds-gallery">${image(imgs[0], 'bds-main')}<div class="bds-thumbs">${imgs.slice(1).map((i) => image(i, 'bds-thumb')).join('')}</div></div>`;
    const main = `<a class="bds-zoom" href="${srcOf(real[0])}" data-zoom aria-label="Enlarge photo: ${esc(real[0].alt)}">${image(real[0], 'bds-main').replace('loading="lazy"', 'loading="eager" fetchpriority="high"')}<span class="bds-zoom-hint" aria-hidden="true">Click to enlarge</span></a>`;
    const thumbs = real.length > 1 ? `<div class="bds-thumbs">${real.map((i, n) => `<button type="button" class="bds-thumb-btn${n ? '' : ' is-on'}" data-src="${srcOf(i)}" data-alt="${esc(i.alt)}" aria-label="Show photo ${n + 1}: ${esc(i.alt)}"${n ? '' : ' aria-current="true"'}>${image(i, 'bds-thumb')}</button>`).join('')}</div>` : '';
    return `<div class="bds-gallery" data-gallery>${main}${thumbs}</div>`;
  };
  const image = (img, cls = '') => {
    const src = img && (img.src || photo(img.file));
    if (src) return `<img class="${cls}" src="${src}" alt="${esc(img.alt)}" loading="lazy" decoding="async" width="1600" height="1200">`;
    return `<span class="bds-ph ${cls}" role="img" aria-label="${esc(img ? img.alt : 'Photo coming soon')}">${PH_ICON}${staging && img ? `<small>${esc(img.file)}</small>` : ''}</span>`;
  };
  const priceText = (p) => (p.price ? `From ${money(p.price)} <small>+ VAT</small>` : staging ? '<span class="bds-todo">Price to be set</span>' : 'Price on request');
  const card = (p) => `<a class="bds-card" href="${p.url}">${image(p.images[0], 'bds-card-img')}<span class="bds-card-body"><span class="bds-card-title">${esc(p.h1)}</span><span class="bds-card-sum">${esc(p.lead)}</span><span class="bds-card-price">${priceText(p)}</span></span></a>`;
  const catCard = (c) => `<a class="bds-tile" href="${c.url}"><span class="bds-tile-title">${esc(c.name)}</span><span class="bds-tile-desc">${esc(c.metaDescription)}</span><span class="bds-tile-go">${(byCat.get(c.key) || []).length} products ${ARROW}</span></a>`;
  // closing band and FAQs: the main signage section's own components (.bdhub-band / .bdhub-faq in bd-pages.css)
  const band = `<div class="bdhub"><section class="bdhub-band"><div class="wrap"><div><h2>Not sure which sign you need?</h2><p>Tell us where it's going and what it needs to say, and we'll recommend the right material and size.</p></div>
<div class="bdhub-cta"><a class="bdhub-btn bdhub-btn--solid" href="/get-a-quote/?service=signage">Get a free quote</a><a class="bdhub-btn bdhub-btn--ghost" href="tel:${PHONE.replace(/\s/g, '')}">Call ${PHONE}</a></div></div></section></div>`;
  const faqBlock = (title, faqs, id = 'faqs') => `<div class="bdhub"><section class="bdhub-faq" id="${id}" aria-labelledby="${id}-h"><div class="wrap">
<div><h2 id="${id}-h">${title}</h2><p class="bds-faq-note">Can't see your question? Call <a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a> or send an enquiry.</p></div>
<div class="bdhub-faqs">${faqs.map((f, i) => `<details name="${id}"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${inline(f.a)}</p></details>`).join('')}</div>
</div></section></div>`;
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
${c.faqs?.length ? faqBlock(`${esc(c.name)} FAQs`, c.faqs, 'cat-faqs') : ''}
<section class="bds-section bds-section--alt"><div class="bds-wrap"><h2>Other sign types</h2><p class="bds-chips">${others.map((o) => `<a href="${o.url}">${esc(o.name)}</a>`).join('')}</p></div></section>
${panel([...seoRows(c), ['Products', String(list.length)], ['FAQs', c.faqs?.length ? String(c.faqs.length) : '<span class="bds-todo">none yet</span>'], ['Category copy', c.intro?.length ? `${c.intro.length} paragraphs` : '<span class="bds-todo">to be written: add "intro" (a list of paragraphs) to this category</span>']])}${band}`;
    paths.push(page({ url: c.url, title: c.metaTitle, desc: c.metaDescription, body,
      ld: [crumbLd(trail), { '@type': 'CollectionPage', name: c.h1, url: origin + c.url, description: c.metaDescription, inLanguage: 'en-GB',
        mainEntity: { '@type': 'ItemList', itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: origin + p.url, name: p.h1 })) } },
        ...(c.faqs?.length ? [{ '@type': 'FAQPage', mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : [])] }));
  }

  // ----- product pages: designed around the content -----
  const ICON = {
    check: '<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    proof: '<path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 14l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    make: '<path d="M4 20h16M6 20V9l6-5 6 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="2"/>',
    van: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="currentColor"/><circle cx="17" cy="17.5" r="1.8" fill="currentColor"/>',
    pin: '<path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/>',
    ruler: '<path d="M3 16L16 3l5 5L8 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    cart: '<path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H6.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20.2" r="1.3" fill="currentColor"/><circle cx="17.5" cy="20.2" r="1.3" fill="currentColor"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 7.5 12 12l9-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.6" fill="currentColor"/>',
  };
  const icon = (k, cls = 'bdp-ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const STEPS = [
    ['Choose your options', 'Pick the size, material and finish, then press "Enquire with these options". Not sure? Call us and we will recommend the right spec.'],
    ['Send your artwork', 'Send your logo or wording. No print-ready file? Our design studio can set it up or create a design for you.'],
    ['Approve your proof', 'We check your artwork and send a digital proof. Nothing is made until you are happy with it.'],
    ['Production & delivery', 'We make your sign to order, then deliver it or fit it for you across Norfolk and Suffolk.'],
  ];
  const TRUST = [['proof', 'Proof before production', 'Approve your design first'], ['make', 'Made to order', 'Built in our Norwich workshop'],
    ['pin', 'Fitted across Norfolk & Suffolk', 'Our own install team'], ['box', 'Supply only options', 'Delivered ready to fit']];
  const reveal = 'bdp-reveal';
  // "Where to use it" photos: <product slug>-use-<use title slug>.webp in site/public/img/business-signs/.
  const slugify = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');
  const useImage = (p, t) => { const slug = p.url.split('/').filter(Boolean).pop(), label = String(t).split(':')[0].trim(); return { file: `${slug}-use-${slugify(label)}.webp`, alt: `${short(p.h1)} for ${label.toLowerCase()}` }; };
  // Fitting & care guide (designed template): step icons from the design's line-icon set, matched to each step's title.
  const FC_ICONS = {"wall-check": "<path d=\"M3 20V4h18v8M3 9h18M3 14h10M9 4v5m5 0v5M8 14v6m6-3 2 2 5-5\"/>", "spirit-level": "<rect x=\"2\" y=\"8\" width=\"20\" height=\"8\" rx=\"2\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/><path d=\"M6 11v2m12-2v2\"/>", "drill-and-plug": "<path d=\"M2 5h10v7H2zM12 7h4v3h-4m4-1h5M5 12l-2 7h5l2-7m5 5h7m-7 3h7m-5-3v3m3-3v3\"/>", "stand-off": "<ellipse cx=\"12\" cy=\"6\" rx=\"6\" ry=\"3\"/><path d=\"M6 6v12c0 1.7 2.7 3 6 3s6-1.3 6-3V6M8 13h8\"/>", "tape": "<circle cx=\"9\" cy=\"9\" r=\"6\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"M15 9v5h6v5H9a6 6 0 0 1-6-6\"/>", "cloth-and-cleaning": "<path d=\"M3 8h11l4 5v7H3zM14 8v5h4M6 16h7M19 2v6m-3-3h6\"/>", "height-measure": "<path d=\"M6 4v16m-3-3 3 3 3-3M3 7l3-3 3 3m4 13V4h8v16zm0-12h3m-3 4h3m-3 4h3\"/>", "bracket": "<path d=\"M4 3h4v13h13v4H4zm4 11 8-8 3 3-7 7M6 7h.01M17 18h.01\"/>", "chain-hanging": "<path d=\"M10 7l3-3a4 4 0 0 1 6 6l-3 3m-2 4-3 3a4 4 0 0 1-6-6l3-3m0 5 8-8\"/>", "planning-document": "<path d=\"M4 3h11l4 4v14H4zM15 3v5h4M7 11h5m-5 4 2 2 4-4\"/>", "electrician": "<path d=\"M4 11h16M6 11V9a6 6 0 0 1 12 0v2M12 3v4m1 6-3 4h4l-3 4\"/>", "plug-and-switch": "<path d=\"M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zm6 9v4\"/>", "weather-rain": "<path d=\"M6 14a4 4 0 0 1 0-8 6 6 0 0 1 11 2 3 3 0 1 1 1 6H6zm2 3-1 3m6-3-1 3m6-3-1 3\"/>", "wind": "<path d=\"M3 8h12a2 2 0 1 0-2-2m-10 6h16a2 2 0 1 1-2 2M6 16h5a2 2 0 1 1-2 2\"/>", "chalk-marker": "<path d=\"M4 15 15 4l5 5L9 20H4zm8-8 5 5m-5 8h8\"/>", "post-and-spade": "<path d=\"M3 4h9v6H3zm4 6v11m9-17h4m-2 0v11m-3 0h6v2a3 3 0 0 1-6 0z\"/>", "banner-eyelet": "<path d=\"M3 21V3h18v18H3m0-6 6 6\"/><circle cx=\"14\" cy=\"10\" r=\"2\"/>", "cable-tie": "<path d=\"M11 6a7 7 0 1 0 7 7V9m-7-3h5v4h-5zm5 2 5-3m-5 3 5 1\"/>", "frame-build": "<path d=\"M3 3h18v18H3zm4 4h10v10H7zM3 3l4 4m10 10 4 4m-4-14 4-4M7 17l-4 4\"/>", "bag-pack-away": "<path d=\"M3 8h18v12H3zm5 0V4h8v4M3 13h18m-10 0v3h2v-3\"/>", "paint-roller": "<path d=\"M3 4h13v6H3zM16 7h4v6l-8 2v2m-2 0h4v4h-4z\"/>", "squeegee": "<path d=\"M3 5h18v4H3zm2 4 3 4h8l3-4m-9 4h4v8h-4z\"/>", "glass-and-spray": "<path d=\"M3 3h11v18H3zm3 8 5-5m-4 8 4-4m5 5h5v6h-5zm1-3h3v3\"/>", "timer-cure": "<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M9 2h6m-3 0v3m0 4v4l3 2m3-9 2-2\"/>", "floor-grip": "<path d=\"M3 17h18v4H3zm3-4 4-2 3-7 4 2v4l4 3v1H6zm3 4v4m6-4v4\"/>", "vacuum": "<path d=\"M6 15h7a4 4 0 0 1 4 4v1H4v-2a3 3 0 0 1 2-3zm3 0V8a4 4 0 0 1 8 0v3h4m-4 0v4\"/>", "mat": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M7 9h10M7 12h10M7 15h10\"/>", "wood-grain": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 3c4 5-4 9 0 18m9-18c-4 5 4 9 0 18\"/><ellipse cx=\"12\" cy=\"12\" rx=\"1\" ry=\"3\"/>", "screw": "<path d=\"M5 5l4-3 5 5-3 4zm6 6 7 7 3 1-1-3-7-7m2 3-2 2m5 1-2 2\"/>", "template-sheet": "<path d=\"M5 3h14v18H5zM8 7h2m4 0h2m-8 5h2m4 0h2m-8 5h2m4 0h2\"/>", "ruler": "<path d=\"M3 16 16 3l5 5L8 21zm4-4 2 2m1-5 2 2m1-5 2 2\"/>", "tick-check": "<path d=\"M5 12l4 4L19 6\"/>", "warning": "<path d=\"M12 3 2 20h20zm0 6v4m0 3h.01\"/>", "van-fitting": "<path d=\"M3 6h11v12H3zm11 4h4l3 4v4h-7m-7 0v2m10-2v2m-2-6h6\"/>", "phone": "<path d=\"M8 3H4a1 1 0 0 0-1 1 17 17 0 0 0 17 17 1 1 0 0 0 1-1v-4l-5-2-2 2a12 12 0 0 1-6-6l2-2z\"/>"};
  const fcIcon = (k) => `<svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FC_ICONS[k] || FC_ICONS['tick-check']}</svg>`;
  const STEP_ICONS = [[/tape/, 'tape'], [/template/, 'template-sheet'], [/stand-off/, 'stand-off'], [/electric/, 'electrician'], [/test/, 'plug-and-switch'], [/survey|consent|rules/, 'planning-document'],
    [/bracket/, 'bracket'], [/\bhang/, 'chain-hanging'], [/height/, 'height-measure'], [/weather/, 'weather-rain'], [/exposed/, 'wind'], [/taut/, 'cable-tie'], [/message/, 'chalk-marker'],
    [/spot/, 'post-and-spade'], [/plan the fixing|fix evenly/, 'banner-eyelet'], [/unpack|pack away|storage/, 'bag-pack-away'], [/frame|graphics/, 'frame-build'], [/paint/, 'paint-roller'],
    [/glass/, 'glass-and-spray'], [/\bcure\b|\bdry/, 'timer-cure'], [/grip/, 'floor-grip'], [/prepare the floor|deep clean/, 'vacuum'], [/placement/, 'mat'], [/outdoor wood/, 'wood-grain'],
    [/choose the fixing|fix securely/, 'screw'], [/apply/, 'squeegee'], [/remov/, 'tape'], [/wall|assess/, 'wall-check'], [/position|plan/, 'spirit-level'], [/fix/, 'drill-and-plug'],
    [/care|clean/, 'cloth-and-cleaning'], [/check|visible|stabil|finish/, 'tick-check']];
  const stepIcon = (t) => { const s = String(t).toLowerCase(); const m = STEP_ICONS.find(([re]) => re.test(s)); return m ? m[1] : 'tick-check'; };
  const productSections = (p, c) => {
    const nav = [], out = [];
    const has = (k) => Array.isArray(p[k]) && p[k].length;
    const head = (kicker, title, sub) => `<div class="bdp-head ${reveal}"><span class="bdp-kicker">${esc(kicker)}</span><h2>${title}</h2>${sub ? `<p class="bds-sub">${sub}</p>` : ''}</div>`;
    if (has('description') || has('included') || has('goodToKnow')) {
      nav.push(['overview', 'Overview']);
      // "See also …" cross-link paragraphs become link pills, styled as the signage hub's "Areas we cover" (.bdr-pills)
      const isSee = (x) => /^(see also|need [^?]+\? see|compare)\b/i.test(x) && (x.match(/\]\(/g) || []).length >= 2;
      const desc = (has('description') ? p.description : []).filter((x, i) => i === 0 || !isSee(x));
      const seeLinks = (has('description') ? p.description.slice(1) : []).filter(isSee).flatMap((x) => [...x.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => [m[1], m[2]]));
      const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      const seeAlso = seeLinks.length ? `<div class="bdr-group bds-see ${reveal}"><div class="bdr-group-head"><h3>See also</h3></div><ul class="bdr-pills">${seeLinks.map(([t, u]) => `<li><a href="${esc(u)}">${esc(cap(t))}</a></li>`).join('')}</ul></div>` : '';
      const shot = p.images.find((i) => /installed/.test(i.file) && srcOf(i)) || p.images.slice(1).find(srcOf);
      const glance = (p.specs || []).filter(([k]) => !/^use$/i.test(k)).slice(0, 4);
      out.push(`<section class="bdp-sec bdp-ov" id="overview"><div class="bds-wrap">
<div class="bdp-ov-top ${reveal}"><div><span class="bdp-kicker">Overview</span><h2>About the ${esc(short(p.h1).toLowerCase())}</h2></div>${desc[0] ? `<p class="bdp-ov-lead">${inline(desc[0])}</p>` : ''}</div>
${glance.length ? `<ul class="bdp-glance">${glance.map(([k, v], i) => `<li class="${reveal}" style="--d:${i}"><span>${esc(k)}</span><b>${inline(v)}</b></li>`).join('')}</ul>` : ''}
<div class="bdp-ov-body"><div><div class="bds-copy bdp-ov-copy ${reveal}">${paras(desc.slice(1))}</div>${seeAlso}</div>
<aside class="bdp-ov-side">${shot ? `<figure class="bdp-ov-photo ${reveal}"><img src="${srcOf(shot)}" alt="${esc(shot.alt)}" loading="lazy" width="1600" height="1200"><figcaption>${esc(shot.alt)}</figcaption></figure>` : ''}${has('included') ? `<div class="bdp-card ${reveal}"><h3>${icon('check')}What's included</h3><ul>${p.included.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>` : ''}${has('goodToKnow') ? `<div class="bdp-card bdp-card--soft ${reveal}"><h3>${icon('tag')}Good to know</h3><ul>${p.goodToKnow.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>` : ''}</aside></div>
</div></section>`);
    } else if (staging) out.push('<section class="bdp-sec"><div class="bds-wrap bds-copy"><h2>About this sign</h2><p class="bds-todo">Description to be written.</p></div></section>');
    if (has('specs')) {
      nav.push(['specifications', 'Specifications']);
      out.push(`<section class="bdp-sec bdp-sec--alt" id="specifications"><div class="bds-wrap bdp-split">${head('Specifications', 'The technical details', `Everything you need to know about the ${esc(short(p.h1).toLowerCase())}. Most specifications can be changed to order.`)}<table class="bdp-spec ${reveal}"><tbody>${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${inline(v)}</td></tr>`).join('')}</tbody></table></div></section>`);
    }
    if (has('uses')) {
      nav.push(['uses', 'Where to use it']);
      out.push(`<section class="bdp-sec" id="uses"><div class="bds-wrap"><div class="bdp-row-head">${head('Ideas', 'Where to use it')}<div class="bdp-arrows"><button type="button" class="bdp-arrow" data-scroll="-1" aria-label="Scroll left" aria-controls="uses-list">${ARROW}</button><button type="button" class="bdp-arrow" data-scroll="1" aria-label="Scroll right" aria-controls="uses-list">${ARROW}</button></div></div><ul class="bdp-uses bdp-scroll" id="uses-list" tabindex="0" aria-label="Where to use it">${p.uses.map((u, i) => { const [t, ...d] = u.split(': '); const img = useImage(p, t); const pic = (srcOf(img) || staging) ? image(img, 'bdp-use-img') : ''; return `<li class="${reveal}${pic ? ' has-img' : ''}" style="--d:${i % 6}">${pic}<div class="bdp-use-body"><span class="bdp-num">${String(i + 1).padStart(2, '0')}</span><b>${inline(t)}</b>${d.length ? `<span>${inline(d.join(': '))}</span>` : ''}</div></li>`; }).join('')}</ul></div></section>`);
    }
    nav.push(['ordering', has('install') ? 'Installation' : 'How ordering works']);
    out.push(`<section class="bdp-sec bdp-sec--ink" id="ordering"><div class="bds-wrap">${head('From order to installed', 'How ordering works')}<ol class="bdp-timeline">${STEPS.map(([t, d], i) => `<li class="${reveal}" style="--d:${i}"><span class="bdp-dot">${i + 1}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>${has('install') ? `<div class="bdp-install ${reveal}"><h3>${icon('ruler')}Installation & fixing</h3>${paras(p.install)}</div>` : ''}</div></section>`);
    const guide = data.guides?.[c.guide];
    if (guide) {
      nav.push(['guide', guide.title.replace(/ guide$/i, '')]);
      const steps = guide.steps.map((st, i) => `<li class="bfc-step ${reveal}" style="--d:${i}"><div class="bfc-card"><span class="bfc-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><span class="bfc-icon">${fcIcon(stepIcon(st.t))}</span><h3>${esc(st.t)}</h3><p>${inline(st.d)}</p></div></li>`).join('');
      const tools = guide.tools?.length ? `<aside class="bfc-box" aria-label="You'll need"><span class="bfc-box-icon">${fcIcon('ruler')}</span><div><h3>You'll need</h3><ul>${guide.tools.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></aside>` : '';
      const note = guide.note ? `<aside class="bfc-box bfc-safety" aria-label="Safety note"><span class="bfc-box-icon">${fcIcon('warning')}</span><div><h3>${esc(guide.noteTitle || 'Good to know')}</h3><p>${inline(guide.note)}</p></div></aside>` : '';
      out.push(`<section class="bfc" id="guide" aria-labelledby="guide-heading"><div class="bfc-inner">
<div class="bfc-heading ${reveal}"><p class="bfc-kicker">Step by step</p><h2 id="guide-heading">${esc(guide.title)}</h2>${guide.intro ? `<p class="bfc-intro">${esc(guide.intro)}</p>` : ''}</div>
<ol class="bfc-steps" role="list" data-count="${guide.steps.length}">${steps}</ol>
${tools || note ? `<div class="bfc-support ${reveal}">${tools}${note}</div>` : ''}
<div class="bfc-cta ${reveal}"><span class="bfc-cta-icon">${fcIcon('van-fitting')}</span><div class="bfc-cta-copy"><h3>Rather we fit it?</h3><p>We install across Norfolk and Suffolk.</p></div><div class="bfc-cta-actions"><a class="bfc-quote" href="/get-a-quote/?service=signage">Get a quote <span aria-hidden="true">↗</span></a><a class="bfc-tel" href="tel:+441603407786">${fcIcon('phone')} ${PHONE}</a></div></div>
</div></section>`);
    }
    if (data.artworkGuide) {
      nav.push(['artwork', 'Artwork']);
      const AW = {
        'best file types': ['AI · EPS · SVG · PDF', '<path d="M6 2h9l5 5v15H6zM15 2v5h5"/><path d="M9 13h6M9 17h4"/>'],
        resolution: ['150dpi minimum', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/>'],
        colours: ['CMYK · Pantone · RAL', '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.7-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>'],
        fonts: ['Outlined or embedded', '<path d="M4 19 9 5l5 14M5.8 14h6.4M15 19v-6a2.5 2.5 0 0 1 5 0v6M15 16h5"/>'],
        'bleed and margins': ['3–5mm bleed · 10mm safe area', '<rect x="2" y="2" width="20" height="20" rx="1" stroke-dasharray="3 3"/><rect x="6" y="6" width="12" height="12" rx="1"/>'],
        'cut-to-shape signs': ['Separate vector cut line', '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>'],
      };
      const items = data.artworkGuide.items.map((x) => { const m = x.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/); return m ? { t: m[1].replace(/:$/, ''), d: m[2] } : { t: '', d: x }; });
      const help = items.find((i) => /no artwork/i.test(i.t));
      const cards = items.filter((i) => i !== help).map((i, n) => { const k = AW[i.t.toLowerCase()] || ['', '<path d="M5 12.5l4.2 4.2L19 7"/>']; return `<li class="baw-card ${reveal}" style="--d:${n}"><span class="baw-icon"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${k[1]}</svg></span><h3>${esc(i.t)}</h3>${k[0] ? `<span class="baw-chip">${esc(k[0])}</span>` : ''}<p>${inline(i.d)}</p></li>`; }).join('');
      out.push(`<section class="bdp-sec baw" id="artwork"><div class="bds-wrap"><div class="bdp-head ${reveal}"><span class="bdp-kicker">Artwork</span><h2>${esc(data.artworkGuide.title)}</h2><p class="bds-sub">Getting your artwork right first time means a sharper sign and a faster turnaround. Here's what we need.</p></div>
<ol class="baw-grid" role="list">${cards}</ol>
${help ? `<div class="baw-help ${reveal}"><div class="baw-help-art" aria-hidden="true"><span>Aa</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 5.6L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.4z"/></svg></div><div class="baw-help-copy"><h3>${esc(help.t)}</h3><p>${inline(help.d)}</p></div><a class="bds-btn baw-help-btn" href="#enquire" data-enquire="${esc(p.h1)} (design help needed)">Ask our studio ${ARROW}</a></div>` : ''}
</div></section>`);
    }
    if (has('faqs')) {
      nav.push(['faqs', 'FAQs']);
      out.push(faqBlock(`${esc(short(p.h1))} FAQs`, p.faqs));
    }
    const bar = nav.length > 1 ? `<nav class="bdp-nav" aria-label="On this page" data-bdp-nav><div class="bds-wrap bdp-nav-in"><div class="bdp-nav-links">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('')}</div><div class="bdp-nav-buy"><span class="bdp-nav-name">${esc(short(p.h1))}</span>${p.price ? `<span class="bdp-nav-price" data-live-price>From ${money(p.price)}</span>` : ''}<a class="bds-btn bds-btn--sm" href="#configure">Configure</a></div></div><span class="bdp-progress" aria-hidden="true"></span></nav>` : '';
    return bar + out.join('\n');
  };


  // Sign builder: which material and scene the preview is drawn in, from the category and the product's name.
  const builderStyle = (p, c) => {
    const n = `${p.h1} ${p.slug || p.url}`.toLowerCase(), k = c.key;
    const has = (...w) => w.some((x) => n.includes(x));
    let material = 'white', scene = 'indoor', shape = 'panel';
    if (has('clear', 'glass', 'frosted')) material = 'clear';
    else if (has('black')) material = 'black';
    else if (has('brushed', 'aluminium', 'metal', 'brass', 'gold', 'dibond', 'steel')) material = has('gold', 'brass') ? 'gold' : 'metal';
    else if (has('wood', 'plywood', 'mdf', 'oak', 'timber')) material = 'wood';
    else if (has('slate')) material = 'slate';
    else if (has('glitter')) material = 'glitter';
    if (k === 'letters' || has('letters', '3d logo')) shape = 'letters';
    if (k === 'illuminated' || k === 'lightbox' || has('illuminated', 'light box', 'halo', 'led', 'edge-lit')) { shape = shape === 'letters' ? 'letters' : 'panel'; material = material === 'white' ? 'lit' : material; scene = 'night'; }
    if (k === 'hanging' || has('projecting', 'hanging')) { shape = 'hanging'; scene = 'brick'; }
    if (k === 'pavement' || k === 'cafe') { shape = has('chalk') ? 'aboard-chalk' : 'aboard'; scene = 'pavement'; }
    if (k === 'cafe') shape = 'barrier';
    if (k === 'banners' || k === 'hoarding' || has('banner', 'mesh', 'flag')) { shape = has('roller', 'display', 'pop up', 'stand') ? 'roller' : 'banner'; scene = shape === 'roller' ? 'indoor' : 'brick'; }
    if (k === 'roller' || k === 'displays') { shape = 'roller'; scene = 'indoor'; }
    if (k === 'parking' || k === 'noparking' || has('post', 'spike', 'totem')) { shape = has('totem') ? 'totem' : 'post'; scene = 'outdoor'; if (material === 'white') material = 'white'; }
    if (k === 'outdoor' || k === 'aluminium' || k === 'correx' || k === 'foamex') { if (scene === 'indoor') scene = 'brick'; }
    if (k === 'window') { shape = 'window'; scene = 'window'; }
    if (k === 'floor' || k === 'mats') { shape = 'floor'; scene = 'floor'; }
    if (k === 'wall') { shape = 'wall'; scene = 'indoor'; }
    if (k === 'reception' || k === 'office' || k === 'wayfinding' || k === 'acrylic') { if (!['letters'].includes(shape)) scene = scene === 'night' ? 'night' : 'indoor'; }
    return { product: p.h1, material, scene, shape };
  };
  // ----- products -----
  for (const p of prods) {
    const c = catOf.get(p.cat);
    const trail = [HOME, HUB, [c.name, c.url], [short(p.h1), p.url]];
    const related = (byCat.get(p.cat) || []).filter((x) => x !== p).slice(0, 4);
    const sizeOpts = p.options.filter((o) => o.range), choiceOpts = p.options.filter((o) => !o.range);
    const idx = (o) => p.options.indexOf(o);
    const field = (o) => {
      const i = idx(o);
      return o.range
        ? `<label class="bds-field"><span>${esc(o.label)}</span><input type="number" inputmode="numeric" name="o${i}" min="${o.range[0]}"${o.range[1] ? ` max="${o.range[1]}"` : ''} step="1" data-label="${esc(o.label.replace(/ \(mm\)$/, ''))}" data-dim="${/height/i.test(o.label) ? 'h' : /width/i.test(o.label) ? 'w' : ''}" placeholder="e.g. ${Math.round((o.range[0] + (o.range[1] ? Math.min(o.range[1], o.range[0] * 6) : o.range[0] * 6)) / 2 / 10) * 10}"><small class="bds-hint">${o.range[1] ? `${o.range[0]}mm to ${o.range[1]}mm` : `From ${o.range[0]}mm`}</small></label>`
        : `<label class="bds-field"><span>${esc(o.label)}</span><select name="o${i}" data-label="${esc(o.label)}"${o.add ? ` data-add="${esc(JSON.stringify(o.add))}"` : ''}>${o.choices.map((ch) => `<option value="${esc(ch)}">${esc(ch)}${o.add && o.add[ch] ? ` (+${money(o.add[ch])})` : ''}</option>`).join('')}</select></label>`;
    };
    const steps = [];
    if (sizeOpts.length) steps.push(['Size', `<div class="bds-fields">${sizeOpts.map(field).join('')}</div>`]);
    if (choiceOpts.length) steps.push([sizeOpts.length ? 'Material & finish' : 'Options', `<div class="bds-fields">${choiceOpts.map(field).join('')}</div>`]);
    steps.push(['Quantity', `<div class="bdp-qty"><button type="button" class="bdp-step" data-qty="-1" aria-label="One fewer">−</button><input type="number" inputmode="numeric" name="qty" min="1" value="1" data-label="Quantity" aria-label="Quantity"><button type="button" class="bdp-step" data-qty="1" aria-label="One more">+</button>${p.qtyBreaks?.length ? `<span class="bdp-save">${icon('tag')}Buy ${p.qtyBreaks[0][0]}+ and save ${Math.round(p.qtyBreaks[0][1])}%, up to ${Math.round(p.qtyBreaks[p.qtyBreaks.length - 1][1])}%</span>` : ''}</div>`]);
    const config = `<form class="bds-config bdp-config" id="configure" data-name="${esc(p.h1)}"${p.price ? ` data-price="${p.price}"` : ''}${p.size ? ` data-size="${esc(JSON.stringify(p.size))}"` : ''}${p.qtyBreaks?.length ? ` data-qty-breaks="${esc(JSON.stringify(p.qtyBreaks))}"` : ''} novalidate aria-label="Choose your options">
${steps.map(([t, h], i) => `<fieldset class="bdp-stepbox"><legend><span class="bdp-stepn">${i + 1}</span>${esc(t)}</legend>${h}</fieldset>`).join('')}
<div class="bdp-summary"${p.price ? '' : ' hidden'}><div class="bdp-sum-main"><span class="bdp-sum-label">Your price</span><b class="bdp-total" data-total>${p.price ? money(p.price) : ''}</b><small>+ VAT <span data-inc></span></small></div><div class="bdp-sum-side"><span data-each></span><span class="bdp-sum-save" data-save hidden></span><span class="bdp-sum-note" data-note>${p.size ? 'Enter your size for an exact price' : ''}</span></div></div>
${p.price || p.size ? `<p class="bds-actions bdp-buy-actions"><button type="button" class="bds-btn bds-btn--lg bdp-add" data-add-basket data-url="${esc(p.url)}" data-img="${esc(srcOf(p.images.find(srcOf)) || '')}">${icon('cart')}Add to basket</button><a class="bdp-enq" href="#enquire" data-enquire="${esc(p.h1)}">Enquire instead</a></p>
<div class="bdp-added" data-added role="status" aria-live="polite" hidden></div>
<p class="bdp-buy-note">${icon('proof')}Pay securely by card. We'll ask for your artwork and send a proof before anything is made.</p>` : `<p class="bds-actions"><a class="bds-btn bds-btn--lg" href="#enquire" data-enquire="${esc(p.h1)}">Enquire with these options ${ARROW}</a><a class="bdp-call" href="tel:${PHONE.replace(/\s/g, '')}">${icon('phone')}Call ${PHONE}</a></p>`}
</form>`;
    const imgs = p.images;
    const body = `<section class="bds-product bdp-hero"><div class="bds-wrap">${crumbs(trail)}<div class="bds-product-grid">
<div class="bdp-gallery-col">${gallery(imgs)}${previewBanner(p, c)}</div>
<div class="bds-buy"><span class="bds-eyebrow"><a href="${c.url}">${esc(c.name)}</a></span><h1>${esc(p.h1)}</h1><p class="bds-lead">${esc(p.lead)}</p>
<ul class="bdp-trust" aria-label="Why order from us">${TRUST.map(([k, t, d]) => `<li><span class="bdp-trust-ic">${icon(k)}</span><span><b>${esc(t)}</b><small>${esc(d)}</small></span></li>`).join('')}</ul>
<p class="bds-price bdp-price">${priceText(p)}${p.price ? ` <span class="bdp-inc">(${money(Math.round(p.price * 120) / 100)} inc VAT)</span>` : ''}</p>
${config}
${p.facts?.length ? `<div class="bdp-features"><h2 class="bdp-h3">Key features</h2><ul>${p.facts.map((f) => `<li>${icon('check')}<span>${inline(f)}</span></li>`).join('')}</ul></div>` : staging ? '<p class="bds-todo">Key features to be written</p>' : ''}</div>
</div></div></section>
${productSections(p, c)}
${related.length ? `<section class="bdp-sec bdp-sec--alt"><div class="bds-wrap"><div class="bdp-head ${reveal}"><span class="bdp-kicker">You might also like</span><h2>More ${esc(c.name.toLowerCase())}</h2></div><div class="bds-grid">${related.map(card).join('')}</div><p><a class="bds-textlink" href="${c.url}">All ${esc(c.name.toLowerCase())} ${ARROW}</a></p></div></section>` : ''}
${panel([...seoRows(p), ['Category', `<a href="${c.url}">${esc(c.name)}</a>`], ['Folded-in variants', p.variants.length ? esc(p.variants.join(' · ')) : 'none'],
    ['Option prices', p.options.some((o) => o.add) ? 'set' : '<span class="bds-todo">not set (in the CRM, add " | 5" after a choice for +£5)</span>'], ['Price', p.price ? money(p.price) + ' ex VAT' : '<span class="bds-todo">not set (add "Price from" in the CRM)</span>'],
    ['Size pricing', p.size ? esc(Object.entries(p.size.rows).map(([k, v]) => `${k === '*' ? 'All' : k}: £${v[0]} + £${v[1]}/m² + £${v[2]}/m edge, min £${v[3]}`).join(' · ')) : 'none'],
    ['Quantity discounts', p.qtyBreaks?.length ? esc(p.qtyBreaks.map(([n, pc]) => `${n}+: ${pc}%`).join(' · ')) : 'none']],
  `<table class="bds-imgplan"><thead><tr><th>#</th><th>File (site/public/img/business-signs/)</th><th>Alt text</th><th>Shot</th><th>Status</th></tr></thead><tbody>${imgs.map((i, n) => `<tr><td>${n + 1}</td><td><code>${esc(i.file)}</code></td><td>${esc(i.alt)} <span class="bds-len${i.alt.length > 125 ? ' bad' : ''}">${i.alt.length}</span></td><td>${esc(i.shot)}</td><td>${(i.src || photo(i.file)) ? 'uploaded' : '<span class="bds-todo">to shoot</span>'}</td></tr>`).join('')}</tbody></table>`)}${band}`;
    const firstPhoto = imgs.map((i) => photo(i.file)).filter(Boolean);
    const product = { '@type': 'Product', name: p.h1, description: p.metaDescription, url: origin + p.url, brand: { '@type': 'Brand', name: 'Broadland Digital' },
      ...(firstPhoto.length ? { image: firstPhoto.map((s) => origin + s) } : {}),
      ...(p.price ? { offers: { '@type': 'Offer', priceCurrency: 'GBP', price: String(p.price), availability: 'https://schema.org/InStock', url: origin + p.url,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.price), priceCurrency: 'GBP', valueAddedTaxIncluded: false } } } : {}) };
    const faqLd = p.faqs?.length ? [{ '@type': 'FAQPage', mainEntity: p.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '') } })) }] : [];
    paths.push(page({ url: p.url, title: p.metaTitle, desc: p.metaDescription, body, ld: [crumbLd(trail), ...(p.price ? [product] : []), ...faqLd] }));
  }

  // Basket catalogue for the worker (worker/sign-pricing.js): only what's needed to price an item on the server.
  const catalog = {};
  for (const p of prods) if (p.price || p.size) {
    const img = p.images.map(srcOf).find(Boolean) || '';
    catalog[p.url] = { name: p.h1, price: p.price || null, size: p.size || null, qtyBreaks: p.qtyBreaks || [], img,
      options: p.options.map((o) => (o.range ? { label: o.label, range: o.range } : { label: o.label, choices: o.choices, ...(o.add ? { add: o.add } : {}) })) };
  }
  writeFileSync(join(root, 'worker/business-signs-catalog.json'), JSON.stringify(catalog) + '\n');
  return { paths, live: !staging, from, count: { categories: listed.length, products: prods.length } };
}
