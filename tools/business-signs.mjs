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
import { readFileSync, existsSync } from 'node:fs';
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

  // ----- product pages: designed around the content -----
  const ICON = {
    check: '<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    proof: '<path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 14l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    make: '<path d="M4 20h16M6 20V9l6-5 6 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="2"/>',
    van: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="currentColor"/><circle cx="17" cy="17.5" r="1.8" fill="currentColor"/>',
    pin: '<path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/>',
    ruler: '<path d="M3 16L16 3l5 5L8 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="7.5" cy="8.5" r="1.6" fill="currentColor"/>',
  };
  const icon = (k, cls = 'bdp-ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const STEPS = [
    ['Choose your options', 'Pick the size, material and finish, then press "Enquire with these options". Not sure? Call us and we will recommend the right spec.'],
    ['Send your artwork', 'Send your logo or wording. No print-ready file? Our design studio can set it up or create a design for you.'],
    ['Approve your proof', 'We check your artwork and send a digital proof. Nothing is made until you are happy with it.'],
    ['Production & delivery', 'We make your sign to order, then deliver it or fit it for you across Norfolk and Suffolk.'],
  ];
  const TRUST = [['proof', 'Proof before production'], ['make', 'Made to order'], ['pin', 'Fitted across Norfolk & Suffolk']];
  const reveal = 'bdp-reveal';
  // "Where to use it" photos: <product slug>-use-<use title slug>.webp in site/public/img/business-signs/.
  const slugify = (t) => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');
  const useImage = (p, t) => { const slug = p.url.split('/').filter(Boolean).pop(); return { file: `${slug}-use-${slugify(t)}.webp`, alt: `${short(p.h1)} for ${String(t).toLowerCase()}` }; };
  const productSections = (p, c) => {
    const nav = [], out = [];
    const has = (k) => Array.isArray(p[k]) && p[k].length;
    const head = (kicker, title, sub) => `<div class="bdp-head ${reveal}"><span class="bdp-kicker">${esc(kicker)}</span><h2>${title}</h2>${sub ? `<p class="bds-sub">${sub}</p>` : ''}</div>`;
    if (has('description') || has('included') || has('goodToKnow')) {
      nav.push(['overview', 'Overview']);
      const desc = has('description') ? p.description : [];
      const shot = p.images.find((i) => /installed/.test(i.file) && srcOf(i)) || p.images.slice(1).find(srcOf);
      const glance = (p.specs || []).filter(([k]) => !/^use$/i.test(k)).slice(0, 4);
      out.push(`<section class="bdp-sec bdp-ov" id="overview"><div class="bds-wrap">
<div class="bdp-ov-top ${reveal}"><div><span class="bdp-kicker">Overview</span><h2>About the ${esc(short(p.h1).toLowerCase())}</h2></div>${desc[0] ? `<p class="bdp-ov-lead">${inline(desc[0])}</p>` : ''}</div>
${glance.length ? `<ul class="bdp-glance">${glance.map(([k, v], i) => `<li class="${reveal}" style="--d:${i}"><span>${esc(k)}</span><b>${inline(v)}</b></li>`).join('')}</ul>` : ''}
<div class="bdp-ov-body"><div class="bds-copy bdp-ov-copy ${reveal}">${paras(desc.slice(1))}</div>
<aside class="bdp-ov-side">${shot ? `<figure class="bdp-ov-photo ${reveal}"><img src="${srcOf(shot)}" alt="${esc(shot.alt)}" loading="lazy" width="1600" height="1200"><figcaption>${esc(shot.alt)}</figcaption></figure>` : ''}${has('included') ? `<div class="bdp-card ${reveal}"><h3>${icon('check')}What's included</h3><ul>${p.included.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>` : ''}${has('goodToKnow') ? `<div class="bdp-card bdp-card--soft ${reveal}"><h3>${icon('tag')}Good to know</h3><ul>${p.goodToKnow.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>` : ''}</aside></div>
</div></section>`);
    } else if (staging) out.push('<section class="bdp-sec"><div class="bds-wrap bds-copy"><h2>About this sign</h2><p class="bds-todo">Description to be written.</p></div></section>');
    if (has('specs')) {
      nav.push(['specifications', 'Specifications']);
      out.push(`<section class="bdp-sec bdp-sec--alt" id="specifications"><div class="bds-wrap bdp-split">${head('Specifications', 'The technical details', `Everything you need to know about the ${esc(short(p.h1).toLowerCase())}. Most specifications can be changed to order.`)}<table class="bdp-spec ${reveal}"><tbody>${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${inline(v)}</td></tr>`).join('')}</tbody></table></div></section>`);
    }
    if (has('uses')) {
      nav.push(['uses', 'Where to use it']);
      out.push(`<section class="bdp-sec" id="uses"><div class="bds-wrap">${head('Ideas', 'Where to use it')}<ul class="bdp-uses">${p.uses.map((u, i) => { const [t, ...d] = u.split(': '); const img = useImage(p, t); const pic = (srcOf(img) || staging) ? image(img, 'bdp-use-img') : ''; return `<li class="${reveal}${pic ? ' has-img' : ''}" style="--d:${i % 6}">${pic}<div class="bdp-use-body"><span class="bdp-num">${String(i + 1).padStart(2, '0')}</span><b>${inline(t)}</b>${d.length ? `<span>${inline(d.join(': '))}</span>` : ''}</div></li>`; }).join('')}</ul></div></section>`);
    }
    nav.push(['ordering', has('install') ? 'Installation' : 'How ordering works']);
    out.push(`<section class="bdp-sec bdp-sec--ink" id="ordering"><div class="bds-wrap">${head('From order to installed', 'How ordering works')}<ol class="bdp-timeline">${STEPS.map(([t, d], i) => `<li class="${reveal}" style="--d:${i}"><span class="bdp-dot">${i + 1}</span><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>${has('install') ? `<div class="bdp-install ${reveal}"><h3>${icon('ruler')}Installation & fixing</h3>${paras(p.install)}</div>` : ''}</div></section>`);
    const guide = data.guides?.[c.guide];
    if (guide) {
      nav.push(['guide', guide.title.replace(/ guide$/i, '')]);
      out.push(`<section class="bdp-sec" id="guide"><div class="bds-wrap">${head('Step by step', esc(guide.title))}<ol class="bdp-guide">${guide.steps.map((st, i) => `<li class="${reveal}" style="--d:${i % 6}"><span class="bdp-num">${String(i + 1).padStart(2, '0')}</span><b>${esc(st.t)}</b><span>${inline(st.d)}</span></li>`).join('')}</ol></div></section>`);
    }
    if (data.artworkGuide) {
      nav.push(['artwork', 'Artwork']);
      out.push(`<section class="bdp-sec bdp-sec--alt" id="artwork"><div class="bds-wrap bdp-split">${head('Artwork', esc(data.artworkGuide.title), 'Getting your artwork right first time means a sharper sign and a faster turnaround. No file? Our studio can help.')}<ul class="bdp-checklist ${reveal}">${data.artworkGuide.items.map((x) => `<li>${icon('check')}<span>${inline(x)}</span></li>`).join('')}</ul></div></section>`);
    }
    if (has('faqs')) {
      nav.push(['faqs', 'FAQs']);
      out.push(`<section class="bdp-sec" id="faqs"><div class="bds-wrap bdp-split">${head('Questions', `${esc(short(p.h1))} FAQs`, `Can't see your question? Call <a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a> or send an enquiry.`)}<div class="bdp-faqs ${reveal}">${p.faqs.map((f) => `<details><summary>${esc(f.q)}<span class="bdp-plus" aria-hidden="true"></span></summary><div class="bdp-ans"><p>${inline(f.a)}</p></div></details>`).join('')}</div></div></section>`);
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
<p class="bds-actions"><a class="bds-btn bds-btn--lg" href="#enquire" data-enquire="${esc(p.h1)}">Enquire with these options ${ARROW}</a><a class="bdp-call" href="tel:${PHONE.replace(/\s/g, '')}">${icon('phone')}Call ${PHONE}</a></p>
</form>`;
    const imgs = p.images;
    const body = `<section class="bds-product bdp-hero"><div class="bds-wrap">${crumbs(trail)}<div class="bds-product-grid">
<div class="bdp-gallery-col">${gallery(imgs)}<button type="button" class="bdp-builder" data-builder="${esc(JSON.stringify(builderStyle(p, c)))}"><span class="bdp-builder-art" aria-hidden="true"><span class="bdp-builder-frame"><span class="bdp-builder-logo">Your logo</span></span></span><span class="bdp-builder-copy"><span class="bdp-builder-tag">Free sign builder</span><b>Preview your sign</b><small>Upload your logo and see it as a ${esc(short(p.h1).toLowerCase())} on a wall or building.</small></span><span class="bdp-builder-go" aria-hidden="true">${ARROW}</span></button></div>
<div class="bds-buy"><span class="bds-eyebrow"><a href="${c.url}">${esc(c.name)}</a></span><h1>${esc(p.h1)}</h1><p class="bds-lead">${esc(p.lead)}</p>
<ul class="bdp-trust">${TRUST.map(([k, t]) => `<li>${icon(k)}${esc(t)}</li>`).join('')}</ul>
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

  return { paths, live: !staging, from, count: { categories: listed.length, products: prods.length } };
}
