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
  h = h.replace(/<a href="\/cart\/?\?add-to-cart=\d+[^"]*">\s*<button class="([^"]*)">\s*ADD TO BASKET\s*<\/button>\s*<\/a>/gi, (_m, cls) => {
    const price = (h.match(/class="price[^"]*">\s*£<b>([\d.,]+)<\/b>/) || [])[1];
    return `<a href="#enquiry" data-enquire="${esc(title + (price ? ` (£${price})` : ''))}"><button type="button" class="${cls}">ENQUIRE NOW</button></a>`;
  });
  h = h.replace(/href="\/cart\/?\?add-to-cart=\d+[^"]*"/g, `href="${path}/"`).replace(/href="\/cart\/?"/g, 'href="/shop/"').replace(/href="\/(checkout|my-account)\/?"/g, 'href="/contact-us/"');
  h = h.replace(/<div[^>]*class="klarna-container"[^>]*>[\s\S]*?<\/div>/g, '');
  // Cookie consent first in <head>; "Cookie settings" in the footer's bottom line
  h = h.replace(/<head>/i, `<head>\n<script src="/_static/bd-consent.js?v=${CONSENT_V}"></script>`);
  // Browser-tab icon: the logo on the header's charcoal (site/public/favicon.*)
  h = h.replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\s*|<link[^>]+apple-touch-icon[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, '<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n</head>');

  // Menu: the theme's checkbox menu is replaced (content/menu.json)
  if (/<div class="navbar">/.test(h)) {
    const m = megaMenu(path);
    h = h.replace(/<div class="navbar">[\s\S]*?(<\/nav><!-- #site-navigation -->)/, () => m.button + '\n</nav><!-- #site-navigation -->')
      .replace(/<\/header>(<!-- #masthead -->)?/, (x) => x + '\n' + m.panel);
  }
  h = sectionHeader(h, path);
  h = breadcrumbs(h, path);
  if (path === '/') h = homePage(h);
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-pages.css?v=${PAGES_V}">\n</head>`);
  // header.js expects the theme's menu checkbox; landing pages have no menu, so give it an inert one.
  if (!/class="nav-container"/.test(h)) h = h.replace(/<\/header>/, '<span class="nav-container" hidden><input type="checkbox" tabindex="-1" aria-hidden="true"></span></header>');
  // Footer: ours in place of the theme's (same section colour)
  h = h.replace(/<footer\b([^>]*)>[\s\S]*?<\/footer>/, (_m, attrs) => footerHtml((attrs.match(/class="([^"]*)"/) || [])[1] || ''));
  h = h.replace(/<\/head>/i, `<link rel="stylesheet" href="/_static/bd-footer.css?v=${FOOTER_V}">\n</head>`);
  // Phone fields were number inputs (no spaces, arrows): proper phone fields
  h = h.replace(/(<input[^>]*name="your-phone"[^>]*)type="number"/g, '$1type="tel" inputmode="tel"').replace(/type="number"([^>]*name="your-phone")/g, 'type="tel" inputmode="tel"$1');
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
const footerCss = readFileSync(join(ROOT, 'site/bd-footer.css'));
const FOOTER_V = hash(footerCss);
const pagesCss = readFileSync(join(ROOT, 'site/bd-pages.css'));
const PAGES_V = hash(pagesCss);

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

// Footer (content/menu.json → footer): enquiry form, contact details, every section's links, legal and social links.
// Its colour follows the page's section, as the theme's footer did.
const FOOTER_CLASSES = ['signage', 'print', 'design', 'web-dev', 'liquid-wrapping'];
const ICON = {
  phone: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  Facebook: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8.5V6.8c0-.8.5-1 1-1h2.3V2.1L14.2 2C10.8 2 10 4.5 10 6.2v2.3H7.6V12H10v10h4V12h3l.4-3.5z"/></svg>',
  Instagram: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.3" fill="currentColor"/></svg>',
};
function footerHtml(cls) {
  const f = menu.footer;
  const field = (name, label, attrs, wide, hint = '') => `<div class="bdf-field${wide ? ' wide' : ''}"><label for="bdf-${name}">${label}${hint ? ` <small>${hint}</small>` : ''}</label>`
    + (name === 'message' ? `<textarea id="bdf-${name}" name="${name}" ${attrs} aria-describedby="bdf-${name}-err"></textarea>` : `<input id="bdf-${name}" name="${name}" ${attrs} aria-describedby="bdf-${name}-err">`)
    + `<span class="bdf-err" id="bdf-${name}-err" aria-live="polite"></span></div>`;
  const cols = menu.sections.map((sec) => `<div><h3><a href="${sec.href}">${esc(sec.title)}</a></h3><ul>${sec.links.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('')
    + `<div><h3>Broadland Digital</h3><ul>${f.company.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`;
  return `<footer class="bdf ${FOOTER_CLASSES.includes(cls) ? cls : ''}"><div class="container">
<div class="bdf-top">
<div class="bdf-intro"><h2 class="bdf-h">${esc(f.heading)}</h2><p>${esc(f.intro)}</p>
<ul class="bdf-contact">
<li>${ICON.phone}<a class="bdf-big" href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a></li>
<li>${ICON.mail}<a href="mailto:${menu.email}">${esc(menu.email)}</a></li>
<li>${ICON.pin}<a href="${esc(f.maps)}" target="_blank" rel="noopener">Broadland Digital, ${esc(menu.address)}</a></li>
</ul></div>
<div class="bdf-wrap" id="enquiry">
<form class="bdf-form" data-bd-form="contact" novalidate aria-label="Enquiry form">
${field('name', 'Name', 'type="text" autocomplete="name" required maxlength="120"')}
${field('phone', 'Phone', 'type="tel" inputmode="tel" autocomplete="tel" required maxlength="40" placeholder="e.g. 07700 900123"')}
${field('email', 'Email', 'type="email" inputmode="email" autocomplete="email" required maxlength="254" placeholder="name@company.co.uk"', true)}
${field('message', 'How can we help?', 'rows="4" maxlength="6000" placeholder="What you need, rough sizes or quantities, and when you need it"', true, '(optional)')}
<div class="bdf-hp" aria-hidden="true"><label for="bdf-website">Leave this empty</label><input id="bdf-website" name="website" tabindex="-1" autocomplete="off"></div>
<div class="bdf-summary" role="alert"></div>
<div class="bdf-actions"><button class="bdf-send" type="submit"><span class="bdf-spin" aria-hidden="true"></span><span class="bdf-label">Send enquiry</span></button>
<p class="bdf-note">We'll only use your details to reply to your enquiry. See our <a href="/privacy-policy/">privacy policy</a>.</p></div>
</form>
<div class="bdf-done" role="status"><h3>Thank you<span class="bdf-done-name"></span>.</h3><p>We've received your enquiry and will be in touch shortly, usually the same working day. If it's urgent, call us on <a href="tel:${menu.phone.replace(/\s/g, '')}">${esc(menu.phone)}</a>.</p><button type="button" class="bdf-again">Send another enquiry</button></div>
</div>
</div>
<nav class="bdf-links" aria-label="Footer">${cols}</nav>
<section class="bdf-brands" aria-labelledby="bdf-brands-title"><h3 id="bdf-brands-title">Group brands</h3><div class="bdf-brand-grid">${f.brands.map((b) => {
    const img = `<img src="${b.logo}" alt="${esc(b.name)}" loading="lazy"${b.square ? ' class="sq"' : ''}>`;
    return b.current ? `<a href="/" aria-current="true" aria-label="${esc(b.name)} home page">${img}</a>`
      : b.href ? `<a href="${b.href}" target="_blank" rel="noopener" aria-label="${esc(b.name)} website (opens in a new tab)">${img}</a>` : `<div>${img}</div>`;
  }).join('')}</div></section>
<div class="bdf-bottom"><span>© ${new Date().getFullYear()} Broadland Digital Ltd. All rights reserved.</span>
<nav aria-label="Legal">${f.legal.map(([l, h]) => `<a href="${h}">${esc(l)}</a>`).join('')}<a href="#cookie-settings" data-bd-cookie-settings>Cookie settings</a></nav>
<div class="bdf-social">${f.social.map(([l, h]) => `<a href="${h}" target="_blank" rel="noopener" aria-label="Broadland Digital on ${l}">${ICON[l] || l}</a>`).join('')}</div></div>
</div></footer>`;
}

// Breadcrumbs: a trail above each page's title (Home / Signage / Vehicle graphics / Van graphics) and the same trail
// as BreadcrumbList schema. Parents come from the address, WordPress's page parents, the hub that lists a page, and the
// menu (content/menu.json); names from the menu, else the page's own title.
const wpParent = new Map(wp.pages.filter((p) => p.parent).map((p) => [p.path, p.parent]));
// (the brochure page links to everything, so it's never a parent)
for (const p of wp.pages) for (const sec of p.sections || []) if (sec.kind === 'cards' && /-home$/.test(p.path)) for (const it of sec.items || []) {
  const h = String(it.href || '').replace(/\/+$/, '');
  if (h && h.startsWith('/') && h !== p.path && !wpParent.has(h)) wpParent.set(h, p.path);
}
const slugify = (t) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const catName = new Map(wp.products.flatMap((p) => p.categories).map((c) => [slugify(c), c]));
const menuName = new Map();
const menuParent = new Map();
for (const sec of menu.sections) {
  menuName.set(sec.href.replace(/\/+$/, ''), sec.title);
  for (const [l, h] of sec.links) { const k = h.replace(/\/+$/, ''); if (!menuName.has(k)) menuName.set(k, l); if (k !== sec.href.replace(/\/+$/, '')) menuParent.set(k, sec.href.replace(/\/+$/, '')); }
}
const decode = (t) => t.replace(/&amp;|&#0?38;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));
function pageName(p) {
  if (p === '/') return 'Home';
  const pg = p.match(/\/page\/(\d+)$/);
  if (pg) return `Page ${pg[1]}`;
  if (p === '/shop' || p === '/category') return 'Shop';
  const bc = extra.breadcrumbs || {};
  if (bc.names && bc.names[p]) return bc.names[p];
  if (menuName.has(p)) return menuName.get(p);
  const html = captured.get(p) || '';
  // Shop categories: the WooCommerce category's own name (from the products), blog categories: from the address.
  if (p.startsWith('/category/')) { const n = catName.get(p.split('/').pop()); if (n) return n; }
  if (p.startsWith('/posts/')) { const w = p.split('/').pop().replace(/-/g, ' '); return w === 'web dev' ? 'Web Dev' : w.charAt(0).toUpperCase() + w.slice(1); }
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const t = h1 ? decode(h1.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().replace(/\.$/, '') : '';
  if (t && t !== 'Our Shop') return t;
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || p.split('/').pop().replace(/-/g, ' ');
  return decode(title).split(/ [-|–] /)[0].trim();
}
const known = (p) => p === '/' || staticPaths.has(p) || p === '/shop';
function trail(path) {
  if (path === '/') return [];
  const chain = [path];
  let cur = path;
  for (let i = 0; i < 8; i++) {
    let parent = null;
    if (/\/page\/\d+$/.test(cur)) parent = cur.replace(/\/page\/\d+$/, '');
    else if (cur.startsWith('/product/')) parent = productParent(cur);
    else if (cur.startsWith('/category/')) { const up = cur.split('/').slice(0, -1).join('/'); parent = up === '/category' ? '/shop' : up; }
    else if ((extra.breadcrumbs || {}).parents?.[cur]) parent = extra.breadcrumbs.parents[cur];
    else {
      const up = cur.split('/').slice(0, -1).join('/');
      parent = (up && known(up)) ? up : (menuParent.get(cur) || wpParent.get(cur) || null);
    }
    if (!parent || parent === '/' || chain.includes(parent) || !known(parent)) break;
    chain.unshift(parent); cur = parent;
  }
  return ['/', ...chain].map((p) => ({ path: p, name: pageName(p) }));
}
function productParent(p) {
  const prod = wp.products.find((x) => x.path === p);
  const cats = prod ? prod.categories : [];
  if (cats.includes('Vehicle Graphics') && known('/category/signage/vehicle-graphics')) return '/category/signage/vehicle-graphics';
  if (cats.includes('Liquid Wrapping') && known('/category/liquid-wrapping')) return '/category/liquid-wrapping';
  return '/shop';
}
function breadcrumbs(h, path) {
  const t = trail(path);
  const hero = /(<section[^>]*class="[^"]*\bbanner\b[^"]*"[^>]*>\s*<div[^>]*class="container[^"]*"[^>]*>)/;
  if (t.length < 2 || !hero.test(h)) return h;
  const url = (p) => ORIGIN + (p === '/' ? '/' : p + '/');
  const nav = `<nav class="bdc" aria-label="Breadcrumb"><ol>${t.map((c, i) => i === t.length - 1
    ? `<li><span aria-current="page">${esc(c.name)}</span></li>` : `<li><a href="${c.path === '/' ? '/' : c.path + '/'}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: t.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: url(c.path) })) };
  return h.replace(hero, (m) => m + '\n' + nav)
    .replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
}

// Home page: hero with the quote and call buttons and a picture collage, the five services as a grid, why us, and
// the about text (from WordPress) with the rest behind "Read more". Wording in content/menu.json → home.
function homePage(h) {
  const tiles = {};
  for (const m of h.matchAll(/<a href="([^"]+)" class="section [^"]*"[^>]*style="background-image: url\(([^)]+)\)"/g)) tiles[m[1].replace(/\/+$/, '')] = m[2].replace(/['"]/g, '');
  const title = decode(((h.match(/<h1 class="banner-title">([\s\S]*?)<\/h1>/) || [])[1] || 'Creative solutions. Real results.').replace(/<[^>]+>/g, '')).trim();
  const lead = decode(((h.match(/<div class="banner-subtitle">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<[^>]+>/g, '')).trim();
  const about = (h.match(/<section class="container standard-padding home-content[^"]*">([\s\S]*?)<\/section>/) || [])[1] || '';
  const paras = [...about.matchAll(/<p class="wp-block-paragraph">([\s\S]*?)<\/p>/g)].map((m) => m[1].trim()).filter(Boolean);
  const H = menu.home;
  const secs = HEADER_ORDER.map((c) => menu.sections.find((x) => x.class === c)).filter(Boolean);
  const order = ['signage', 'print', 'design', 'web', 'liquid-wrapping'].map((c) => menu.sections.find((x) => x.class === c));
  const img = (sec) => tiles[sec.href.replace(/\/+$/, '')] || '';
  const [t1, ...t2] = title.split(/(?<=\.)\s+/);
  const collage = ['signage', 'liquid-wrapping', 'print'].map((c) => menu.sections.find((x) => x.class === c)).map((sec) =>
    `<a href="${sec.href}" tabindex="-1" aria-hidden="true"><img src="${img(sec)}" alt="" loading="eager"><span>${esc(sec.title)}</span></a>`).join('');
  const cards = order.map((sec) => `<a class="bdh-card ${sec.class}" href="${sec.href}"><img src="${img(sec)}" alt="" loading="lazy">
<h3>${esc(sec.title)}.</h3><p>${esc(sec.summary)}</p><span class="bdh-go"><i aria-hidden="true">→</i>Explore ${esc(sec.title.toLowerCase())}</span></a>`).join('\n');
  const body = `<div class="bdh">
<section class="bdh-hero"><div class="wrap">
<div><span class="bdh-eyebrow">${esc(H.eyebrow)}</span>
<h1><span>${esc(t1)}</span>${t2.length ? `<span>${esc(t2.join(' '))}</span>` : ''}</h1>
${lead ? `<p class="bdh-lead">${esc(lead)}</p>` : ''}
<div class="bdh-cta"><a class="bdh-btn bdh-btn--solid" href="/get-a-quote/">Get a free quote</a><a class="bdh-btn bdh-btn--ghost" href="tel:${menu.phone.replace(/\s/g, '')}">Call ${esc(menu.phone)}</a></div>
<ul class="bdh-chips">${secs.map((sec) => `<li><a href="${sec.href}" style="--c:var(--c-${sec.class})">${esc(sec.title)}</a></li>`).join('')}</ul></div>
<div class="bdh-collage">${collage}</div>
</div></section>
<section class="bdh-section" aria-labelledby="bdh-what"><div class="wrap">
<div class="bdh-head"><h2 id="bdh-what">What we do.</h2><p>Signage, print, design, web and liquid wrapping under one roof in Norwich, so one call covers the whole job.</p></div>
<div class="bdh-grid">${cards}</div>
</div></section>
<section class="bdh-section bdh-why" aria-labelledby="bdh-why"><div class="wrap">
<div class="bdh-head"><h2 id="bdh-why">Why Broadland Digital.</h2></div>
<div class="bdh-points">${H.points.map((pt, i) => `<div class="bdh-point"><b aria-hidden="true">${i + 1}</b><h3>${esc(pt.title)}</h3><p>${esc(pt.text)}</p></div>`).join('')}</div>
</div></section>
<section class="bdh-section bdh-about" aria-labelledby="bdh-about"><div class="wrap">
<h2 id="bdh-about">About Broadland Digital.</h2>
<div class="bdh-text">${paras.slice(0, 2).map((p) => `<p>${p}</p>`).join('')}
${paras.length > 2 ? `<details><summary><span class="more">Read more</span><span class="less">Show less</span></summary>${paras.slice(2).map((p) => `<p>${p}</p>`).join('')}</details>` : ''}
<ul class="bdh-guides">${H.guides.map(([l, h2]) => `<li><a href="${h2}">${esc(l)}</a></li>`).join('')}</ul></div>
</div></section>
</div>`;
  return h.replace(/<div class="homepage">[\s\S]*?(?=<footer)/, body + '\n');
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
write('_static/bd-footer.css', footerCss);
write('_static/bd-pages.css', pagesCss);
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
