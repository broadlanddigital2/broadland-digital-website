// Builds the static Broadland Digital site into dist/ from content/wordpress.json (the old WordPress site's pages,
// products and posts) and site/ (styles and script). No dependencies: `node tools/build.mjs`.
//
// The CRM's own pages (Marketing → SEO pages: locations, guides, comparisons, sectors, services) and blog posts are NOT
// built here: the worker serves them live from the CRM's feeds inside dist/_crm-page (see worker/crm-pages.js), so a
// page goes live on its release date without a rebuild.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist');
const ORIGIN = 'https://broadlanddigital.co.uk';
const SITE = 'Broadland Digital';
const PHONE = '01603 407786';
const EMAIL = 'enquiries@broadlanddigital.co.uk';
const ADDRESS = ['Vulcan House', 'Vulcan Road North', 'Norwich', 'Norfolk', 'NR6 6AQ'];
const wp = JSON.parse(readFileSync(join(ROOT, 'content/wordpress.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n - 1)) + '…' : s);
const money = (n) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

// ---------- Pages, addresses and redirects ----------
const pages = wp.pages.filter((p) => !extra.dropPages.includes(p.path));
const pageByPath = new Map(pages.map((p) => [p.path, p]));
const products = wp.products;
const productByPath = new Map(products.map((p) => [p.path, p]));
const exists = (path) => pageByPath.has(path) || productByPath.has(path) || extra.extraPaths.includes(path) || extra.crmPaths.includes(path);
const redirects = { ...extra.redirects };
const broken = new Set();

// Old links to "/x" where WordPress gave the page the address "/x-2" (and the like) point at the real page.
function fixHref(href) {
  if (!href || !href.startsWith('/') || href.startsWith('/wp-content/') || href.startsWith('//')) return href;
  const [pathPart, hashPart] = href.split('#');
  let path = pathPart.replace(/\/+$/, '') || '/';
  if (redirects[path]) path = redirects[path];
  if (path.includes('https://')) path = path.slice(path.indexOf('https://')).replace(/^https?:\/\/(www\.)?broadlanddigital\.co\.uk/, '').replace(/\/+$/, '') || '/';
  if (!exists(path)) {
    // Same last part of the address (WordPress moved pages under a parent), else the "-2" copy WordPress made.
    const last = path.split('/').pop();
    const bySlug = [...pageByPath.keys()].filter((k) => k.split('/').pop() === last || k.split('/').pop() === last + '-2');
    const alt = [path + '-2', path.replace(/-2$/, '')].find(exists) || (bySlug.length === 1 ? bySlug[0] : null);
    if (alt) { redirects[path] = alt; path = alt; } else broken.add(path);
  }
  return path + (hashPart ? '#' + hashPart : '');
}
const fixLinks = (html) => html.replace(/href="([^"]*)"/g, (_m, h) => `href="${esc(fixHref(h.replace(/&amp;/g, '&')))}"`);

// WordPress stored some pages as plain text with blank lines (wpautop): make paragraphs.
function autop(html) {
  if (/<(p|h[1-6]|ul|ol|table|div|figure)[\s>]/i.test(html)) return html;
  return html.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${t.replace(/\n/g, '<br>')}</p>`).join('\n');
}
// Old copy said "over 2 decades" / "for over 30 years" in places; text is kept as written (edit it in content/wordpress.json).
const body = (html) => fixLinks(autop(html || ''));

function img(a, { cls = '', sizes = '', eager = false, alt } = {}) {
  if (!a?.src) return '';
  const w = a.w ? ` width="${a.w}" height="${a.h}"` : '';
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(a.src)}" alt="${esc(alt ?? a.alt ?? '')}"${w}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${sizes ? ` sizes="${sizes}"` : ''}>`;
}

// Breadcrumb chain: WordPress parent pages, else the hub a page is listed on.
const listedOn = new Map();
for (const p of pages) for (const s of p.sections) if (s.kind === 'cards' && /-home$/.test(p.path)) for (const it of s.items) {
  const h = fixHref(it.href); if (h && !listedOn.has(h)) listedOn.set(h, p.path);
}
function trail(path) {
  const out = [];
  let cur = pageByPath.get(path);
  const seen = new Set();
  while (cur && !seen.has(cur.path)) {
    seen.add(cur.path);
    const parent = cur.parent || listedOn.get(cur.path);
    if (!parent || parent === cur.path || !pageByPath.has(parent)) break;
    cur = pageByPath.get(parent);
    out.unshift({ path: cur.path, name: navName(cur) });
  }
  return out;
}
const navName = (p) => extra.names[p.path] || p.title.replace(/\s*-\s*Broadland Digital$/i, '');

// ---------- Layout ----------
const css = readFileSync(join(ROOT, 'site/styles.css'), 'utf8');
const js = readFileSync(join(ROOT, 'site/site.js'), 'utf8');
const V = hash(css + js);

function header(current) {
  const links = extra.nav.map((n) => `<a href="${n.href}"${current && (current === n.href || current.startsWith(n.href + '/')) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap">
<a class="logo" href="/"><img src="${extra.logo}" alt="${SITE}" width="160" height="58"></a>
<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
<nav class="nav" id="site-nav" aria-label="Main">${links}<a class="btn btn-ghost" href="/get-a-quote">Get a quote</a></nav>
</div></header>`;
}

function enquiryForm({ kind = 'contact', service = '', next = '', button = 'Send', compact = false } = {}) {
  const services = extra.services.map((s) => `<option${s === service ? ' selected' : ''}>${esc(s)}</option>`).join('');
  const consent = kind === 'guide'
    ? `<label class="check wide"><input type="checkbox" name="marketing" value="yes"> Keep me up to date on news and offers</label>`
    : `<label class="check wide"><input type="checkbox" name="consent" value="yes" required> I agree to the <a href="/privacy-policy">privacy policy</a> and to being contacted about my enquiry.</label>`;
  if (compact) {
    return `<form class="form" data-enquiry novalidate${next ? ` data-next="${next}"` : ''}>
<input type="hidden" name="form" value="${kind}"><input type="hidden" name="service" value="${esc(service)}">
<label><span class="sr">Name</span><input name="name" autocomplete="name" placeholder="Name" required></label>
<label><span class="sr">Phone</span><input name="phone" type="tel" autocomplete="tel" placeholder="Phone" required></label>
<label><span class="sr">Email</span><input name="email" type="email" autocomplete="email" placeholder="Email" required></label>
<label class="wide"><span class="sr">Message</span><textarea name="message" placeholder="Message" rows="2"></textarea></label>
<label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
${consent}
<button class="btn" type="submit">${esc(button)}</button>
<p class="form-status" role="status" aria-live="polite"></p>
</form>`;
  }
  return `<form class="form" data-enquiry${next ? ` data-next="${next}"` : ''}>
<input type="hidden" name="form" value="${kind}">
<label>Name<input name="name" autocomplete="name" required></label>
<label>Email<input name="email" type="email" autocomplete="email" required></label>
<label>Phone<input name="phone" type="tel" autocomplete="tel" required></label>
${kind === 'guide' ? '<input type="hidden" name="service" value="Vehicle graphics guide">' : `<label>What is it for?<select name="service"><option value="">Choose a service</option>${services}</select></label>`}
${kind === 'guide' ? '' : `<label class="wide">Tell us about your project<textarea name="message" placeholder="Sizes, quantities, where it's going, when you need it…"></textarea></label>`}
<label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
${consent}
<div class="wide"><button class="btn btn-purple" type="submit">${esc(button)}</button></div>
<p class="form-status" role="status" aria-live="polite"></p>
</form>`;
}

function footer() {
  const col = (title, links) => `<div><h3>${esc(title)}</h3><ul>${links.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`;
  return `<footer class="site-footer"><div class="wrap">
<div class="footer-form"><h2>Discuss a project.</h2>${enquiryForm({ compact: true, button: 'Send' })}</div>
<div class="footer-cols">
<div><h3>${SITE}</h3><address>${ADDRESS.join('<br>')}</address><p style="margin-top:14px"><a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a><br><a href="mailto:${EMAIL}">${EMAIL}</a></p></div>
${extra.footer.map((c) => col(c.title, c.links)).join('\n')}
</div>
<div class="footer-bottom"><span>© ${new Date().getFullYear()} Broadland Digital Limited. Signage, print and design in Norwich, Norfolk.</span><span><a href="/privacy-policy">Privacy policy</a> · <a href="/returns">Returns</a> · <a href="/sitemap.xml">Sitemap</a></span></div>
</div></footer>`;
}

const businessLd = {
  '@type': 'LocalBusiness', '@id': ORIGIN + '/#business', name: SITE, url: ORIGIN + '/', telephone: '+44 1603 407786', email: EMAIL,
  image: ORIGIN + extra.logo, logo: ORIGIN + extra.logo,
  address: { '@type': 'PostalAddress', streetAddress: 'Vulcan House, Vulcan Road North', addressLocality: 'Norwich', addressRegion: 'Norfolk', postalCode: 'NR6 6AQ', addressCountry: 'GB' },
  areaServed: ['Norwich', 'Norfolk', 'Suffolk'],
};

function layout({ path, title, description, image, content, ld = [], noindex = false, crumbs = null, shell = false }) {
  const url = ORIGIN + (path === '/' ? '/' : path);
  const graph = [...ld];
  if (crumbs) graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ name: 'Home', path: '/' }, ...crumbs].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: ORIGIN + (c.path === '/' ? '/' : c.path) })) });
  const og = image?.src ? (image.src.startsWith('http') ? image.src : ORIGIN + image.src) : ORIGIN + extra.shareImage;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#713fff">
<link rel="icon" href="${extra.favicon}">
<link rel="preconnect" href="https://use.typekit.net" crossorigin>
<link rel="stylesheet" href="https://use.typekit.net/qbw1hzk.css">
<link rel="stylesheet" href="/_static/styles.css?v=${V}">
${shell ? '<!--crm:head-->\n' : ''}${graph.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body>
${header(path)}
<main id="main">
${crumbs ? `<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap"><a href="/">Home</a>${crumbs.map((c, i) => ` / ${i === crumbs.length - 1 ? `<span aria-current="page">${esc(c.name)}</span>` : `<a href="${c.path}">${esc(c.name)}</a>`}`).join('')}</div></nav>\n` : ''}${content}
</main>
${footer()}
<script src="/_static/site.js?v=${V}" defer></script>
</body>
</html>
`;
}

// ---------- Sections ----------
function hero({ title, lead, image, eyebrow = '', actions = true, cls = '' }) {
  return `<section class="hero${image ? '' : ' no-image'}${cls ? ' ' + cls : ''}"><div class="wrap">
<div>${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}<h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
${actions ? `<div class="actions"><a class="btn btn-white" href="/get-a-quote">Get a quote</a><a class="btn btn-ghost" href="tel:${PHONE.replace(/\s/g, '')}">Call ${PHONE}</a></div>` : ''}</div>
${image ? `<figure>${img(image, { eager: true })}</figure>` : ''}
</div></section>`;
}

function cardsHtml(items) {
  return `<div class="cards">${items.map((it) => {
    const href = fixHref(it.href);
    const inner = `${it.image ? img(it.image, { alt: it.image.alt || it.title }) : '<div class="noimg"></div>'}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(clip(it.text, 160))}</p>` : ''}<span class="more">Find out more →</span>`;
    return href ? `<a class="card" href="${esc(href)}">${inner}</a>` : `<div class="card">${inner}</div>`;
  }).join('')}</div>`;
}

function section(s, page) {
  switch (s.kind) {
    case 'cards':
      if (!s.items.length) return '';
      return `<section class="section tint"><div class="wrap"><div class="section-head"><h2>${esc(s.title || 'Our services')}</h2></div>${cardsHtml(s.items)}</div></section>`;
    case 'gallery':
      return `<section class="section" id="gallery"><div class="wrap"><div class="section-head"><h2>${esc(s.title.replace(/\.$/, ''))}</h2><p>Recent work from our Norwich studio and workshop.</p></div>
<div class="gallery">${s.items.map((g) => `<a href="${esc(g.src)}">${img(g, { alt: g.alt || `${navName(page)} by Broadland Digital` })}</a>`).join('')}</div></div></section>`;
    case 'packages':
      return `<section class="section tint" id="packages"><div class="wrap"><div class="section-head"><h2>${esc(s.title || 'Packages')}</h2></div>
<div class="packages">${s.items.map((x) => `<div class="package">${img(x.image)}<h3>${esc(x.title)}</h3><div class="price">${x.price ? `<small>from</small> ${money(Number(x.price))}` : 'Quote on request'}</div><p>${esc(x.text)}</p><a class="btn btn-purple" href="/get-a-quote">Ask about this</a></div>`).join('')}</div></div></section>`;
    case 'products': {
      const list = s.items.map((p) => productByPath.get(p)).filter(Boolean);
      return list.length ? `<section class="section"><div class="wrap"><div class="section-head"><h2>${esc(s.title)}</h2>${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}</div>${productGrid(list)}</div></section>` : '';
    }
    case 'list':
      return `<section class="section"><div class="wrap prose">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>`;
    default:
      return '';
  }
}

const productsFor = (page) => {
  const rule = extra.productLinks[page.path];
  if (!rule) return [];
  return products.filter((p) => rule.every((c) => p.categories.includes(c)));
};
function productGrid(list) {
  return `<div class="product-grid">${list.map((p) => `<a class="product-card" href="${p.path}">${p.image ? img(p.image, { alt: p.image.alt || p.title }) : ''}<h3>${esc(p.title)}</h3><span class="price">${p.price ? money(p.price) : 'Quote on request'}</span></a>`).join('')}</div>`;
}

function asideCard(page) {
  return `<aside class="aside-card"><h3>Talk to us</h3><p>Tell us what you need and we'll come back with ideas and a price. Prefer to talk? Call the studio.</p>
<a class="tel" href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a><p style="font-size:14px;color:var(--muted)">Vulcan House, Vulcan Road North, Norwich</p>
<a class="btn btn-purple" href="/get-a-quote?service=${encodeURIComponent(navName(page))}">Get a quote</a>
${extra.brochurePaths.includes(page.path) || page.path.startsWith('/signage-home') ? `<a class="btn" href="/signage-home/signage-brochure" style="color:var(--purple)">View our brochure</a>` : ''}</aside>`;
}

// ---------- Page templates ----------
function seo(page, fallbackTitle) {
  const t = (extra.titles[page.path] || page.seoTitle || '').trim();
  const title = t ? (/broadland digital/i.test(t) ? t : `${t} | ${SITE}`) : `${fallbackTitle} | ${SITE}`;
  const description = page.seoDescription || clip(strip(page.html) || page.subtitle || `${fallbackTitle} from ${SITE}, Norwich.`, 155);
  return { title, description };
}

function renderHome(page) {
  const { title, description } = seo(page, 'Signage, print and design in Norwich');
  const tiles = page.sections.find((s) => s.kind === 'tiles');
  const content = `${hero({ title: page.heading || 'Creative solutions. Real results.', lead: page.subtitle, image: null, cls: 'home-hero', eyebrow: 'Norwich · Norfolk · Suffolk' })}
<section aria-label="What we do"><div class="tiles">${tiles.items.map((t) => `<a class="tile" href="${esc(fixHref(t.href))}">${img(t.image, { alt: '' })}<span>${esc(t.title.replace(/\.$/, ''))}</span></a>`).join('')}</div></section>
<section class="section"><div class="wrap split"><div class="prose"><h2>About Broadland Digital</h2>${body(page.html.replace(/<h2>Broadland Digital<\/h2>/, ''))}</div>${asideCard(page)}</div></section>
<section class="section tint"><div class="wrap"><div class="section-head"><h2>Signage advice and local pages</h2><p>Guides, comparisons and local information written by our signage team.</p></div>
<div class="linkpills">${extra.signageHubs.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</div></div></section>`;
  return layout({ path: '/', title, description, content, ld: [{ ...businessLd, description }, { '@type': 'WebSite', name: SITE, url: ORIGIN + '/' }] });
}

function renderStandard(page) {
  const name = navName(page);
  const { title, description } = seo(page, name);
  const crumbs = [...trail(page.path), { path: page.path, name }];
  const isHub = page.template === 'page-cat-home';
  const lead = extra.subtitles[page.path] || page.subtitle || (isHub ? '' : clip(strip(page.html), 180));
  const html = body(page.html);
  const pl = productsFor(page);
  const hubExtra = extra.hubLinks[page.path];
  const content = `${hero({ title: page.heading || name, lead, image: page.image, eyebrow: crumbs.length > 1 ? crumbs[crumbs.length - 2].name : 'Broadland Digital' })}
${html ? `<section class="section"><div class="wrap split"><div class="prose">${html}</div>${asideCard(page)}</div></section>` : ''}
${page.sections.map((s) => section(s, page)).join('\n')}
${pl.length ? `<section class="section tint" id="shop"><div class="wrap"><div class="section-head"><h2>${esc(extra.productHeadings[page.path] || 'Packages')}</h2><p>Prices shown are for the package as described. Ask us if your vehicle or job is different.</p></div>${productGrid(pl)}</div></section>` : ''}
${hubExtra ? `<section class="section"><div class="wrap"><div class="section-head"><h2>${esc(hubExtra.title)}</h2>${hubExtra.text ? `<p>${esc(hubExtra.text)}</p>` : ''}</div><div class="linkpills">${hubExtra.links.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('')}</div></div></section>` : ''}
${page.path === '/signage-home/signage-brochure' ? brochureSection() : ''}`;
  const ld = [{ '@type': isHub ? 'CollectionPage' : 'Service', name, description, url: ORIGIN + page.path, provider: { '@id': ORIGIN + '/#business' }, ...(isHub ? {} : { areaServed: 'Norfolk' }) }, businessLd];
  return layout({ path: page.path, title, description, image: page.image, content, crumbs, ld, noindex: page.noindex });
}

function brochureSection() {
  return `<section class="section tint"><div class="wrap"><div class="section-head"><h2>Download the brochure</h2><p>Our signs and graphics brochure, as a PDF.</p></div>
<div class="linkpills">${wp.brochures.map((b) => `<a href="${esc(b.pdf)}" target="_blank" rel="noopener">${esc(b.title)} (PDF)</a>`).join('')}</div></div></section>`;
}

function renderForm(page) {
  const name = navName(page);
  const { title, description } = seo(page, name);
  const f = page.sections.find((s) => s.kind === 'form') || { form: 'contact' };
  const kind = page.path === '/get-a-guide' ? 'guide' : page.path === '/contact-us' ? 'contact' : 'quote';
  const next = kind === 'guide' ? '/download-guide-thank-you' : kind === 'quote' ? '/request-quote-thank-you' : '';
  const details = page.sections.find((s) => s.kind === 'list');
  const heading = kind === 'contact' ? 'Contact us' : kind === 'guide' ? 'Get our vehicle graphics guide' : 'Get a free quote';
  const lead = kind === 'contact' ? 'Call, email or visit the studio in Norwich, or send us a message below.'
    : kind === 'guide' ? 'Leave your details and we will email you a link to download our how-to guide.'
    : 'Tell us a little about your project and we will contact you to discuss it, usually the same working day.';
  const contact = `<dl><dt>Phone</dt><dd><a href="tel:${PHONE.replace(/\s/g, '')}">${PHONE}</a></dd><dt>Email</dt><dd><a href="mailto:${EMAIL}">${EMAIL}</a></dd>
<dt>Studio and workshop</dt><dd>${ADDRESS.join(', ')}</dd>${extra.hours ? `<dt>Opening hours</dt><dd>${esc(extra.hours)}</dd>` : ''}</dl>
<iframe class="map" title="Map showing Broadland Digital, Vulcan House, Norwich" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent('Broadland Digital, Vulcan Road North, Norwich NR6 6AQ')}&output=embed"></iframe>`;
  const highlight = f.subtitle ? `<p class="form-highlight">${esc(f.subtitle)}</p>${f.subtext ? `<p>${esc(f.subtext)}</p>` : ''}` : '';
  const content = `${hero({ title: heading, lead, image: null, actions: false, eyebrow: SITE })}
<section class="section"><div class="wrap contact-grid">
<div>${kind === 'contact' ? contact : `${f.title ? `<h2>${esc(f.title)}</h2>` : ''}${f.text ? `<p class="form-lead">${esc(f.text)}</p>` : ''}${highlight}${details ? `<ul>${details.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${contact}`}</div>
<div class="form-panel"><h2>${kind === 'contact' ? 'Discuss a project' : kind === 'guide' ? 'Download the guide' : 'Free consultation and quote'}</h2>${enquiryForm({ kind, next, button: kind === 'guide' ? 'Register now' : kind === 'quote' ? 'Request my quote' : 'Send message' })}</div>
</div></section>`;
  return layout({ path: page.path, title, description, content, crumbs: [{ path: page.path, name: heading }], ld: [businessLd] });
}

function renderThanks(page) {
  const name = navName(page);
  const content = `${hero({ title: page.title, lead: '', image: null, actions: false })}
<section class="section"><div class="wrap prose">${body(page.html)}<div class="actions"><a class="btn btn-purple" href="/">Back to the home page</a><a class="btn" href="/signage-home">Browse signage</a></div></div></section>`;
  return layout({ path: page.path, title: `${name} | ${SITE}`, description: `${name}.`, content, noindex: true });
}

function renderLegal(page) {
  const name = navName(page);
  const content = `${hero({ title: name, lead: '', image: null, actions: false })}<section class="section"><div class="wrap prose">${body(page.html)}</div></section>`;
  return layout({ path: page.path, title: `${name} | ${SITE}`, description: `${name} for ${SITE} Limited, Norwich.`, content, crumbs: [{ path: page.path, name }] });
}

function renderProduct(p) {
  const desc = p.seoDescription || clip(strip(p.summary || p.html), 155);
  const title = p.seoTitle || `${p.title} | ${SITE}`;
  const cat = extra.productCategoryPages.find((c) => c.categories.every((x) => p.categories.includes(x)));
  const crumbs = [{ path: '/shop', name: 'Shop' }, ...(cat ? [{ path: cat.path, name: cat.name }] : []), { path: p.path, name: p.title }];
  const service = cat ? cat.name : 'Vehicle graphics';
  const content = `<section class="section"><div class="wrap product">
<div>${p.image ? img(p.image, { cls: 'main-image', eager: true, alt: p.image.alt || p.title }) : ''}${p.gallery.length ? `<div class="thumbs gallery">${p.gallery.map((g) => `<a href="${esc(g.src)}">${img(g, { alt: g.alt || p.title })}</a>`).join('')}</div>` : ''}</div>
<div><span class="eyebrow" style="color:var(--purple)">${esc(service)}</span><h1>${esc(p.title)}</h1>
<p class="price">${p.price ? money(p.price) : 'Quote on request'}</p>
<ul class="tags">${p.categories.filter((c) => !['Shop', 'Signage'].includes(c)).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
${p.summary ? `<div class="prose"><p><strong>${strip(p.summary)}</strong></p></div>` : ''}
<div class="prose">${body(p.html)}</div>
<div class="form-panel" style="margin-top:30px"><h3>Order or ask about this</h3><p>Send us your details and we'll confirm the price, artwork and fitting date.</p>
${enquiryForm({ kind: 'order', next: '/request-quote-thank-you', button: 'Send enquiry' }).replace('<input type="hidden" name="form" value="order">', `<input type="hidden" name="form" value="order"><input type="hidden" name="product" value="${esc(p.title)}${p.price ? ' (' + money(p.price) + ')' : ''}">`)}</div>
</div></div></section>`;
  const ld = [{ '@type': 'Product', name: p.title, description: desc, url: ORIGIN + p.path, image: p.image ? ORIGIN + p.image.src : undefined, brand: { '@type': 'Brand', name: SITE },
    ...(p.price ? { offers: { '@type': 'Offer', price: p.price.toFixed(2), priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: ORIGIN + p.path, seller: { '@id': ORIGIN + '/#business' } } } : {}) }, businessLd];
  return layout({ path: p.path, title, description: desc, image: p.image, content, crumbs, ld });
}

function renderShop() {
  const groups = extra.productCategoryPages.map((c) => ({ ...c, list: products.filter((p) => c.categories.every((x) => p.categories.includes(x))) })).filter((g) => g.list.length);
  const content = `${hero({ title: 'Shop', lead: 'Vehicle graphics packages and liquid wrapping kits from our Norwich workshop. Choose a package to see what is included and to order.', image: null })}
<section class="section"><div class="wrap">${groups.map((g) => `<div class="shop-group"><h2>${esc(g.name)}</h2>${productGrid(g.list)}</div>`).join('')}</div></section>`;
  return layout({ path: '/shop', title: `Shop | ${SITE}`, description: 'Vehicle graphics packages and liquid wrapping from Broadland Digital, Norwich. Prices, what is included and how to order.', content, crumbs: [{ path: '/shop', name: 'Shop' }] });
}

function render404() {
  const content = `${hero({ title: 'Page not found', lead: 'The page you were looking for has moved or no longer exists.', image: null, actions: false })}
<section class="section"><div class="wrap"><div class="linkpills">${extra.nav.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}<a href="/contact-us">Contact us</a></div></div></section>`;
  return layout({ path: '/404', title: `Page not found | ${SITE}`, description: 'Page not found.', content, noindex: true });
}

// Shell for the pages the worker serves live from the CRM (SEO pages and the blog): header and footer around a slot.
function renderShell() {
  return layout({ path: '/_crm-page', title: SITE, description: '', content: '<div class="crm-main" data-crm-blog="slot"></div>', shell: true, ld: [businessLd] });
}

// ---------- Write ----------
rmSync(OUT, { recursive: true, force: true });
const files = new Map();
const put = (path, html) => files.set(path === '/' ? '/index.html' : `${path}/index.html`, html);
for (const page of pages) {
  if (page.path === '/') put('/', renderHome(page));
  else if (['page-form', 'contact-page', 'get-a-quote'].includes(page.template)) put(page.path, renderForm(page));
  else if (page.template === 'page-form-submitted') put(page.path, renderThanks(page));
  else if (['default', 'page-privacy-policy'].includes(page.template)) put(page.path, renderLegal(page));
  else put(page.path, renderStandard(page));
}
for (const p of products) put(p.path, renderProduct(p));
put('/shop', renderShop());
files.set('/404.html', render404());
files.set('/_crm-page/index.html', renderShell());

for (const [f, html] of files) {
  const full = join(OUT, f);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
}
mkdirSync(join(OUT, '_static'), { recursive: true });
writeFileSync(join(OUT, '_static/styles.css'), css);
writeFileSync(join(OUT, '_static/site.js'), js);

// Files kept in the repo (uploads copied from the old site, favicon and so on) go in as they are.
function copyDir(from, to) {
  if (!existsSync(from)) return 0;
  let n = 0;
  for (const e of readdirSync(from)) {
    const a = join(from, e), b = join(to, e);
    if (statSync(a).isDirectory()) n += copyDir(a, b);
    else { mkdirSync(to, { recursive: true }); copyFileSync(a, b); n++; }
  }
  return n;
}
const copied = copyDir(join(ROOT, 'site/public'), OUT);

// Sitemap of the static pages (the worker adds the CRM's pages and blog posts to it).
const indexable = [...pages.filter((p) => !p.noindex && p.template !== 'page-form-submitted').map((p) => [p.path, p.modified]), ...products.map((p) => [p.path, p.modified]), ['/shop', null]];
writeFileSync(join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(([p, m]) => `<url><loc>${ORIGIN}${p === '/' ? '/' : p}</loc>${m ? `<lastmod>${m.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_crm-page\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
writeFileSync(join(ROOT, 'worker/redirects.json'), JSON.stringify(redirects, null, 1) + '\n');
writeFileSync(join(ROOT, 'worker/static-paths.json'), JSON.stringify([...files.keys()].map((f) => f.replace(/\/index\.html$/, '') || '/').filter((p) => !p.endsWith('.html')).sort()) + '\n');

console.log(`Built ${files.size} pages (${pages.length} WordPress pages, ${products.length} products), ${copied} files from site/public, ${Object.keys(redirects).length} redirects.`);
if (broken.size) console.log(`Links to addresses the site doesn't have (left as they are): ${[...broken].sort().join(', ')}`);
