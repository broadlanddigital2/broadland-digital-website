// Builds dist/ from the captured WordPress site, so the new site looks exactly like broadlanddigital.co.uk did.
// No dependencies: `node tools/build.mjs`.
//
//   source/wordpress/<address>/index.html   each page as WordPress served it (tools/capture/capture.mjs)
//   source/wordpress-assets/                the theme's and plugins' CSS, scripts, fonts and images
//   site/public/                            uploads (wp-content/uploads) and anything else copied as it is
//   site/bd-forms.js                        sends the theme's forms to the CRM (replaces Contact Form 7)
//
// Each page is cleaned up: WordPress, WooCommerce, Stripe, reCAPTCHA, Contact Form 7 and WP Rocket scripts are taken
// out; the theme's own scripts, the cookie banner, Google Analytics, the chat bot and the reviews widget stay; links
// become local; "Add to basket" becomes "Enquire now" (orders arrive in the CRM as leads); forms post to /api/forms.
//
// Pages the CRM manages (Marketing → SEO pages) and the blog are not built here: the worker serves them live inside
// dist/_crm-page, a copy of a WordPress page with its content taken out (see worker/crm-pages.js).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'source/wordpress');
const ASSETS = join(ROOT, 'source/wordpress-assets');
const OUT = join(ROOT, 'dist');
const ORIGIN = 'https://broadlanddigital.co.uk';
const wp = JSON.parse(readFileSync(join(ROOT, 'content/wordpress.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const productTitle = new Map(wp.products.map((p) => [p.path, p.title]));
const lastmod = new Map([...wp.pages, ...wp.products].map((p) => [p.path, p.modified]));

const walk = (dir) => readdirSync(dir).flatMap((e) => { const f = join(dir, e); return statSync(f).isDirectory() ? walk(f) : [f]; });
const hash = (b) => createHash('sha1').update(b).digest('hex').slice(0, 10);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Captured pages ----------
const captured = new Map();
for (const f of walk(SRC).filter((f) => f.endsWith('index.html'))) {
  const p = '/' + relative(SRC, dirname(f)).split('\\').join('/');
  captured.set(p === '/.' || p === '/' ? '/' : p.replace(/\/$/, ''), readFileSync(f, 'utf8'));
}
// A page the CRM plugin drew is a CRM page: the worker serves those live. One of them becomes the shell.
const crmPages = [...captured].filter(([, h]) => h.includes('crmseo-main')).map(([p]) => p);
// The blog (/blog, and the old /guides/<post> addresses) is served live from the CRM by the worker.
const staticPaths = new Set([...captured.keys()].filter((p) => !crmPages.includes(p) && p !== '/blog' && !p.startsWith('/guides/')));

// ---------- Assets ----------
const assetVersion = new Map();
function assetUrl(pathname) {
  // WP Rocket's minified copies (/wp-content/cache/min/1/...) and plain theme/plugin files are served from where they were.
  const file = join(ASSETS, decodeURIComponent(pathname));
  if (!existsSync(file)) return null;
  if (!assetVersion.has(pathname)) assetVersion.set(pathname, hash(readFileSync(file)));
  return `${pathname}?v=${assetVersion.get(pathname)}`;
}

// ---------- Scripts kept / removed ----------
const KEEP = /jquery-core-js|jquery-migrate-js|jquery(\.min)?\.js|jquery-migrate(\.min)?\.js|header(-js|\.js)|more_information|woo_block|swiper|ultimate_blocks|ultimate-blocks|dflip|dFlip|enquirybot|google_gtagjs|googletagmanager|gtag\(|linkbot|pagemapId|local-marketing-reports|application\/ld\+json/;
const DROP = /woocommerce|wc-|wc_|sourcebuster|order-attribution|stripe|WCPAY|recaptcha|contact-form-7|wpcf7|swv-js|swv\/|wp-polyfill|wp-hooks|wp-i18n|hooks\.min|i18n\.min|cf7rl|redirect_method|rocket|wpr-beacon|speculationrules|omnisend|soundest|ga4w|klarna|cart-fragments|wp-(url|undo|redux|private|priority|keycodes|is-shallow|html-entities|escape|element|dom|deprecated|data|compose|api-fetch)|react|lodash|js\.cookie|blockUI|add-to-cart|single-product|country-select|checkout|address-i18n/;

// Scripts that set non-essential cookies wait for consent (site/bd-consent.js switches them on).
const ANALYTICS = /googletagmanager|gtag\(|dataLayer|linkbot|pagemapId/;
const FUNCTIONAL = /enquirybot|local-marketing-reports/;
const gate = (m, attrs, cat) => m.replace(/^<script\b[^>]*>/i, `<script type="text/plain" data-bd-consent="${cat}"${attrs.replace(/\stype=["'][^"']*["']/i, '')}>`);

function cleanScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    const sig = attrs + ' ' + body.slice(0, 600);
    if (/cloudflare-static\/rocket-loader/.test(attrs)) return '';
    if (/cookieyes|client_data\//i.test(sig)) return ''; // CookieYes is replaced by our own banner
    if (/application\/ld\+json/.test(attrs)) return m;
    if (DROP.test(sig) && !KEEP.test(sig)) return '';
    if (/woocommerce-google-analytics|wc-order|ga4w|wc_add_to_cart|wpcf7/.test(sig)) return '';
    if (ANALYTICS.test(sig)) return gate(m, attrs, 'analytics');
    if (FUNCTIONAL.test(sig)) return gate(m, attrs, 'functional');
    if (KEEP.test(sig) && !/woocommerce-google-analytics|wc-order|ga4w|wc_add_to_cart|wpcf7/.test(sig)) return m;
    if (DROP.test(sig)) return '';
    return m;
  });
}

// ---------- One page ----------
const CF7 = { 21: 'contact', 704: 'quote', 593: 'guide', 9258: 'contact' };
const THANKS = { 704: '/request-quote-thank-you', 593: '/download-guide-thank-you' };
const brokenLinks = new Set();

function localPath(href) {
  // Page links: no trailing slash (the worker redirects "/x/" to "/x"); assets keep their file names.
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const [base, frag] = href.split('#');
  const [path, query] = base.split('?');
  if (/^\/(wp-content|wp-includes|_static|cdn-cgi)\//.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) {
    if (/^\/(wp-content\/(themes|plugins|cache)|wp-includes)\//.test(path)) return (assetUrl(path) || base) + (frag ? '#' + frag : '');
    return href;
  }
  // Page links keep WordPress's trailing slash (the site's addresses end in "/", as they always have).
  const slash = path.endsWith('/');
  let p = path.replace(/\/+$/, '') || '/';
  if (p !== '/' && !staticPaths.has(p) && !crmPages.includes(p) && !extra.crmPaths.includes(p) && !extra.extraPaths.includes(p) && !/^\/(blog|api)(\/|$)/.test(p)) brokenLinks.add(p);
  return (p === '/' ? '/' : p + (slash || !/^\/(blog|api)(\/|$)/.test(p) ? '/' : '')) + (query ? '?' + query : '') + (frag ? '#' + frag : '');
}

function transform(html, path) {
  let h = html;
  // Cloudflare Rocket Loader renamed every script type; WP Rocket added markers.
  h = h.replace(/\stype=["'][0-9a-f]{16,}-text\/javascript["']/g, '').replace(/\sdata-rocket-[a-z-]+(=("[^"]*"|'[^']*'))?/g, '')
    .replace(/\sdata-minify="1"/g, '').replace(/\sdata-cfasync="false"/g, '');
  h = h.replace(/<!--\s*Start cookieyes banner\s*-->[\s\S]*?<!--\s*End cookieyes banner\s*-->/gi, '');
  // Google Analytics: WP Rocket served gtag.js from the site itself; load it from Google.
  h = h.replace(/src="https?:\/\/broadlanddigital\.co\.uk\/\?local_ga_js=[^"]*"/g, 'src="https://www.googletagmanager.com/gtag/js?id=GT-PJ7PZL8"');
  h = cleanScripts(h);
  // Head clutter
  h = h.replace(/<link[^>]+(oembed|wp-json|EditURI|xmlrpc|rel=['"]shortlink|rel=['"]dns-prefetch|rel=['"]https:\/\/api\.w\.org)[^>]*>\s*/gi, '')
    .replace(/<link[^>]+woocommerce-gateway-stripe[^>]*>\s*/gi, '')
    .replace(/<meta name="generator"[^>]*>\s*/gi, '');
  // Local addresses everywhere except the canonical, social and schema tags (they stay absolute).
  h = h.replace(/<(?!meta\b|link\b[^>]*rel=["'](canonical|alternate)["'])([a-z]+\b[^>]*)>/gi, (tag) =>
    tag.replace(/\b(href|src|action|data-src|data-href|poster)=(["'])(https?:)?\/\/(www\.)?broadlanddigital\.co\.uk(\/[^"']*)?\2/gi, (_m, a, q, _s, _w, p) => `${a}=${q}${p || '/'}${q}`)
      .replace(/\bsrcset=(["'])([^"']*)\1/gi, (_m, q, v) => `srcset=${q}${v.replace(/https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, '')}${q}`)
      .replace(/url\((['"]?)https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, 'url($1'));
  h = h.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (s) => s.replace(/url\((['"]?)https?:\/\/(www\.)?broadlanddigital\.co\.uk/g, 'url($1'));
  // Asset versions and page links
  h = h.replace(/\b(href|src|action)=(["'])(\/[^"']*)\2/g, (_m, a, q, v) => `${a}=${q}${localPath(v.replace(/&#0?38;|&amp;/g, '&'))}${q}`);
  // Forms (Contact Form 7 markup kept for its styling; bd-forms.js sends them to the CRM)
  h = h.replace(/<form\b[^>]*class="wpcf7-form[^"]*"[^>]*>/g, (tag) => {
    const id = (tag.match(/wpcf7-f(\d+)-/) || [])[1] || '21';
    return `<form class="wpcf7-form init" novalidate data-bd-form="${CF7[id] || 'contact'}"${THANKS[id] ? ` data-next="${THANKS[id]}"` : ''}>`;
  }).replace(/<fieldset class="hidden-fields-container">[\s\S]*?<\/fieldset>/g, '')
    .replace(/<input[^>]+name="_wpcf7[^"]*"[^>]*>/g, '');
  // Shop: orders become enquiries (lead in the CRM) instead of WooCommerce checkout.
  const title = productTitle.get(path) || '';
  h = h.replace(/<a href="\/cart\?add-to-cart=\d+[^"]*">\s*<button class="([^"]*)">\s*ADD TO BASKET\s*<\/button>\s*<\/a>/gi, (_m, cls) => {
    const price = (h.match(/class="price[^"]*">\s*£<b>([\d.,]+)<\/b>/) || [])[1];
    return `<a href="#wpcf7-f21-o1" data-enquire="${esc(title + (price ? ` (£${price})` : ''))}"><button type="button" class="${cls}">ENQUIRE NOW</button></a>`;
  });
  h = h.replace(/href="\/cart\?add-to-cart=\d+[^"]*"/g, `href="${path}"`).replace(/href="\/cart"/g, 'href="/shop"').replace(/href="\/(checkout|my-account)"/g, 'href="/contact-us"');
  h = h.replace(/<div[^>]*class="klarna-container"[^>]*>[\s\S]*?<\/div>/g, '');
  // Cookie consent first in <head>; "Cookie settings" in the footer's bottom line
  h = h.replace(/<head>/i, `<head>\n<script src="/_static/bd-consent.js?v=${CONSENT_V}"></script>`);
  // Browser-tab icon: the logo on the header's charcoal (site/public/favicon.*)
  h = h.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\s*|<link[^>]+apple-touch-icon[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n</head>');
  h = h.replace(/(<section class="footer-bottom">[\s\S]*?)(<\/section>)/, '$1 | <a class="text-white" href="#cookie-settings" data-bd-cookie-settings>Cookie settings</a>$2');
  // Menu: the theme's checkbox menu is replaced (content/menu.json)
  if (/<div class="navbar">/.test(h)) {
    const m = megaMenu(path);
    h = h.replace(/<div class="navbar">[\s\S]*?(<\/nav><!-- #site-navigation -->)/, () => m.button + '\n</nav><!-- #site-navigation -->')
      .replace(/<\/header>(<!-- #masthead -->)?/, (x) => x + '\n' + m.panel);
  }
  h = sectionHeader(h, path);
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-menu.css?v=${MENU_V}">\n</head>`);
  h = h.replace(/<\/body>/i, `<script src="/_static/bd-menu.js?v=${MENU_V}" defer></script>\n</body>`);
  // Our form script, after the theme's scripts
  h = h.replace(/<\/body>/i, `<script src="/_static/bd-forms.js?v=${FORMS_V}" defer></script>\n</body>`);
  return h;
}

const formsJs = readFileSync(join(ROOT, 'site/bd-forms.js'));
const FORMS_V = hash(formsJs);
const consentJs = readFileSync(join(ROOT, 'site/bd-consent.js'));
const menuCss = readFileSync(join(ROOT, 'site/bd-menu.css'));
const menuJs = readFileSync(join(ROOT, 'site/bd-menu.js'));
const MENU_V = hash(Buffer.concat([menuCss, menuJs]));
const menu = JSON.parse(readFileSync(join(ROOT, 'content/menu.json'), 'utf8'));

// The full-screen menu (content/menu.json), in place of the theme's checkbox menu. The current page and its section
// are marked; header.js still looks for the old checkbox, so an inert one stays.
// Header: the main sections as plain links (the full menu has every page), the current section marked; then the
// phone number and a Get a quote button where the theme had a basket icon (there's no basket: orders are enquiries).
const SECTION_OF_HEADER = { signage: 'signage', print: 'print', design: 'design', 'web-dev': 'web', 'liquid-wrapping': 'liquid-wrapping' };
const HEADER_ORDER = ['design', 'print', 'web', 'signage', 'liquid-wrapping'];
function headerNav(path, currentClass) {
  const here = path === '/' ? '/' : path + '/';
  const items = HEADER_ORDER.map((c) => menu.sections.find((x) => x.class === c)).filter(Boolean).map((sec) => {
    const inSec = currentClass === sec.class || here === sec.href || sec.links.some(([, h]) => h === here);
    return `<li><a href="${sec.href}"${inSec ? ' aria-current="true"' : ''}>${esc(sec.title)}</a></li>`;
  }).join('');
  return `<ul id="menu-main" class="menu bdh-links">${items}</ul>`;
}
const PHONE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
function headerActions() {
  return `<div class="bdh-actions"><a class="bdh-phone" href="tel:${menu.phone.replace(/\s/g, '')}" aria-label="Call ${esc(menu.phone)}">${PHONE_ICON}<span>${esc(menu.phone)}</span></a>`
    + `<a class="bdh-quote" href="/get-a-quote/"><span class="bdh-long">Get a quote</span><span class="bdh-short">Quote</span></a></div>`;
}
function sectionHeader(h, path) {
  const cls = (h.match(/id="masthead" class="site-header ([a-z-]+)"/) || [])[1] || '';
  return h.replace(/<ul id="menu-[a-z-]+" class="menu">[\s\S]*?<\/ul>/, () => headerNav(path, SECTION_OF_HEADER[cls]))
    .replace(/<a href="[^"]*">\s*<img class="ms-4" src="[^"]*cart-shopping-light\.svg[^"]*"[^>]*>\s*<\/a>/, headerActions);
}

function megaMenu(path) {
  const here = path === '/' ? '/' : path + '/';
  const inSection = (sec) => here === sec.href || here.startsWith(sec.href) || sec.links.some(([, h]) => h === here);
  const cur = (h) => (h === here ? ' aria-current="page"' : '');
  const cols = menu.sections.map((sec) => `<details class="bdm-col ${sec.class}"${inSection(sec) ? ' data-current' : ''} open>
<summary><a class="bdm-title" href="${sec.href}"${cur(sec.href)}>${esc(sec.title)}.</a></summary>
<ul>${sec.links.map(([l, h]) => `<li><a class="bdm-link" href="${h}"${cur(h)}>${esc(l)}</a></li>`).join('')}</ul>
</details>`).join('\n');
  return { button: `<button class="bdm-btn" type="button" aria-expanded="false" aria-controls="bdm" aria-label="Open menu"><span></span><span></span><span></span></button>
<span class="nav-container" hidden><input type="checkbox" tabindex="-1" aria-hidden="true"></span>`,
  // The panel sits outside the header: the sticky header would otherwise clip a fixed panel inside it.
  panel: `<div class="bdm" id="bdm" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true" inert>
<div class="bdm-inner"><div class="bdm-grid">
${cols}
</div>
<div class="bdm-foot"><nav class="bdm-more" aria-label="More">${menu.more.map(([l, h]) => `<a href="${h}"${cur(h)}>${esc(l)}</a>`).join('')}</nav>
<p class="bdm-contact"><a href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a> · <a href="mailto:${menu.email}">${esc(menu.email)}</a><br>${esc(menu.address)}</p></div>
</div></div>` };
}
const CONSENT_V = hash(consentJs);

// ---------- Shell for CRM pages and the blog ----------
function shell() {
  const src = captured.get(crmPages.includes('/signage-home/signage-norwich') ? '/signage-home/signage-norwich' : crmPages[0]) || captured.get('/privacy-policy');
  let h = transform(src, '/_crm-page');
  const start = h.search(/<main\b[^>]*>/i);
  const end = h.lastIndexOf('</main>');
  const open = h.slice(start).match(/<main\b[^>]*>/i)[0];
  h = h.slice(0, start) + open + '<div class="crm-main" data-crm-blog="slot"></div>' + h.slice(end);
  h = h.replace(/<style[^>]*id=["']crm-seo-pages-inline-css["'][^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta (name|property)="(description|og:[a-z:_]+|twitter:[a-z:_]+|article:[a-z:_]+)"[^>]*>\s*/gi, '')
    .replace(/<meta name="robots"[^>]*>/i, '')
    .replace(/<title>[\s\S]*?<\/title>/i, '<title>Broadland Digital</title>')
    .replace(/<\/head>/i, '<!--crm:head-->\n</head>');
  if (!/rel="canonical"/.test(h)) h = h.replace('<!--crm:head-->', `<link rel="canonical" href="${ORIGIN}/">\n<!--crm:head-->`);
  return h;
}

function page404(sh) {
  return sh.replace('<!--crm:head-->', '<meta name="robots" content="noindex">')
    .replace('<title>Broadland Digital</title>', '<title>Page not found - Broadland Digital</title>')
    .replace('<div class="crm-main" data-crm-blog="slot"></div>', `<section class="container standard-padding" style="padding-top:120px;padding-bottom:120px"><h1 class="site-font">Page not found.</h1><p>The page you were looking for has moved or no longer exists.</p><p><a href="/">Home</a> · <a href="/signage-home">Signage</a> · <a href="/print-home">Print</a> · <a href="/design-home">Design</a> · <a href="/web-dev-home">Web Dev</a> · <a href="/contact-us">Contact us</a></p></section>`);
}

// ---------- Write ----------
rmSync(OUT, { recursive: true, force: true });
const write = (rel, data) => { const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); };
for (const p of staticPaths) write(p === '/' ? 'index.html' : `${p.slice(1)}/index.html`, transform(captured.get(p), p));
const sh = shell();
write('_crm-page/index.html', sh);
write('404.html', page404(sh));
write('_static/bd-forms.js', formsJs);
write('_static/bd-consent.js', consentJs);
write('_static/bd-menu.css', menuCss);
write('_static/bd-menu.js', menuJs);

let assetsCopied = 0;
for (const f of walk(ASSETS)) { const rel = relative(ASSETS, f); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); copyFileSync(f, join(OUT, rel)); assetsCopied++; }
let publicCopied = 0;
if (existsSync(join(ROOT, 'site/public'))) for (const f of walk(join(ROOT, 'site/public'))) { const rel = relative(join(ROOT, 'site/public'), f); mkdirSync(dirname(join(OUT, rel)), { recursive: true }); copyFileSync(f, join(OUT, rel)); publicCopied++; }

// Sitemap (the worker adds the CRM's pages and blog posts), robots.txt
const indexable = [...staticPaths].filter((p) => !/thank-you|quote-requested/.test(p) && !/<meta name="robots" content="[^"]*noindex/.test(captured.get(p))).sort();
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((p) => `<url><loc>${ORIGIN}${p === '/' ? '/' : p + '/'}</loc>${lastmod.get(p) ? `<lastmod>${lastmod.get(p).slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_crm-page/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);

// Redirects: content/site.json, plus old links to "/x" where the page is "/x-2" (or moved under a parent).
const redirects = { ...extra.redirects };
for (const p of brokenLinks) {
  if (redirects[p]) continue;
  const last = p.split('/').pop();
  const cands = [p + '-2', p.replace(/-2$/, ''), ...[...staticPaths].filter((s) => s.split('/').pop() === last || s.split('/').pop() === last + '-2')].filter((c) => staticPaths.has(c));
  if (cands.length) redirects[p] = cands[0];
}
writeFileSync(join(ROOT, 'worker/redirects.json'), JSON.stringify(redirects, null, 1) + '\n');
writeFileSync(join(ROOT, 'worker/static-paths.json'), JSON.stringify([...staticPaths].sort()) + '\n');

const stillBroken = [...brokenLinks].filter((p) => !redirects[p]).sort();
console.log(`Built ${staticPaths.size} pages from the WordPress capture (CRM pages left to the worker: ${crmPages.join(', ') || 'none'}), ${assetsCopied} theme/plugin files, ${publicCopied} uploads, ${Object.keys(redirects).length} redirects.`);
if (stillBroken.length) console.log(`Links to addresses the site doesn't have: ${stillBroken.join(', ')}`);
