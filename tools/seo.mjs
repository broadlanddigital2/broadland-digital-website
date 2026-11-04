import { leadHtml, blockHtml } from '../worker/seo-blocks.js';
import { readFileSync as _rf } from 'node:fs';
const REDIRECTS = JSON.parse(_rf(new URL('../worker/redirects.json', import.meta.url), 'utf8'));
// SEO finishing pass over every built page (tools/build.mjs calls finishSeo once all pages are built), for the points
// the CRM's SEO optimiser scores: titles 30–65 characters, unique and ending "| Broadland Digital"; meta descriptions
// 120–165 characters and unique; one H1; alt text and width/height on every image; FAQs (with FAQPage schema) on shop
// and product pages; utility pages kept out of search. Pages whose title and description are already good are left
// exactly as WordPress had them.
const BRAND = 'Broadland Digital';
const decode = (t) => String(t || '').replace(/&amp;|&#0?38;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;|&#039;|&#39;/g, '’')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fitDesc = (d, n = 165) => {
  if (d.length <= n) return d;
  const cut = d.slice(0, n);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(': '));
  if (end >= 120) return cut.slice(0, end) + '.';
  const sentences = d.match(/[^.!?]+[.!?]+(\s|$)/g) || [];
  let acc = '';
  for (const x of sentences) { if ((acc + x).trim().length > n) break; acc += x; }
  acc = acc.trim();
  for (const tail of [' Call 01603 407786 for a free quote.', ' Call 01603 407786.', ' Ask us for a quote.']) if (acc && acc.length < 120 && (acc + tail).length <= n && (acc + tail).length >= 120) return acc + tail;
  if (acc.length >= 120) return acc;
  return cut.slice(0, n - 1).replace(/\s+\S*$/, '').replace(/(\s+(and|or|the|to|a|an|our|call|for|with|of|in|on|from))+$/i, '').replace(/[,;:–-]\s*$/, '') + '.';
};
const clip = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:–-]\s*$/, ''));

// Utility pages: no value in search results.
export const NOINDEX = /^\/(category\/uncategorized|posts\/[^/]+|estimate|invoice|workspace|quote-requested|request-quote-thank-you|download-guide-thank-you|my-account|cart|checkout)(\/|$)/;

const FAQ = {
  liquid: [
    ['What is liquid wrapping?', 'A sprayed-on, peelable coating that changes the colour or finish of a vehicle or its parts without a permanent respray. It forms a flexible layer that can be peeled off later.'],
    ['Can liquid wrap be removed?', 'Yes. It is designed to peel off without damaging the original paintwork underneath, provided that paint is in sound, factory condition.'],
    ['How do I choose between Budget, Standard, Premium and Ultra?', 'They differ in how much is removed and masked (handles, mirrors, lights) and in the finish. Tell us the vehicle and the look you want and we will recommend one.'],
    ['Can I spray it myself?', 'Yes. Our shop sells Full Dip liquid wrap colours, primers and glossifier for DIY projects, or we can do the work for you at our Norwich workshop.'],
  ],
  van: [
    ['What is included in van graphics?', 'Basic graphics are single-colour cut vinyl of your company name, phone number and web address. Standard and Pro packages add colours, logos and design options.'],
    ['Supply only or fitted?', 'Supply-only kits are posted for you to fit. Fitted packages are applied by our team at the Norwich workshop or within 30 miles.'],
    ['How long do van graphics last?', 'We use 3M and Metamark materials. Looked after correctly, van graphics will last up to 7 years.'],
    ['Do you need my van details?', 'Yes: the make, model and year (or registration) and photos of each side, so the graphics fit your exact vehicle.'],
  ],
  shop: [
    ['Can I order online?', 'Yes. Choose the product and options in our shop and check out, or ask us for a quote if you need something made to measure.'],
    ['Do prices include VAT?', 'Shop prices are shown as listed on each product. Contact us if you need a VAT invoice or a business account.'],
    ['Can I collect my order?', 'Yes, from our Norwich workshop at Vulcan House, Vulcan Road North, NR6 6AQ, Monday to Friday, 8:30am to 5pm.'],
  ],
};
const faqSet = (path) => (/liquid|full-dip|dip-/.test(path) ? FAQ.liquid : /van-graphics|vehicle-graphics|vans/.test(path) ? FAQ.van : FAQ.shop);

function describe(path, name, trailNames) {
  const n = name.replace(/\.\s*$/, '');
  let d;
  if (path.startsWith('/product/')) {
    if (/full-dip|dip/.test(path)) d = `${n} from Broadland Digital in Norwich: peelable liquid wrap for DIY colour changes without a respray. Order online or ask our team for advice.`;
    else if (/liquid/.test(path)) d = `${n} from Broadland Digital, Norwich: a peelable liquid wrap colour change applied at our workshop. See what's included and book online.`;
    else d = `${n} from Broadland Digital, Norwich: cut vinyl van graphics with your name, number and web address. Order online or ask us for a fitted quote.`;
  } else if (path.startsWith('/category/')) {
    d = `Shop ${trailNames.filter((x) => !/^(shop )?home$|^shop$/i.test(x)).join(' – ')} from Broadland Digital in Norwich. Compare options and prices online, or ask our team for a quote and advice.`;
  } else {
    d = `${n} from Broadland Digital in Norwich: design, print, signage, web and liquid wrapping under one roof. Call 01603 407786 or ask for a free quote.`;
  }
  if (d.length > 165) d = clip(d, 162) + '.';
  return d;
}

function titleFor(path, name, trailNames, page) {
  const n = name.replace(/\.\s*$/, '').trim();
  let core;
  if (path.startsWith('/category/') && trailNames.length > 1) core = trailNames.slice(-2).join(' – ');
  else core = n;
  if (page) core += ` – Page ${page}`;
  const full = `${core} | ${BRAND}`;
  if (full.length < 30) return `${core} | Norwich & Norfolk | ${BRAND}`;
  return full.length <= 65 ? full : clip(core, 62 - BRAND.length) + ` | ${BRAND}`;
}

const SECTION_OF = (h, path) => {
  const cls = (h.match(/class="bdhub bdsub ([a-z-]+)/) || h.match(/id="masthead" class="site-header ([a-z-]+)"/) || [])[1] || '';
  if (/liquid/.test(path) || cls === 'liquid-wrapping') return 'liquid-wrapping';
  if (/web-dev|web-hosting|ecommerce|laravel|magento|woocommerce/.test(path) || /web/.test(cls)) return 'web';
  if (/design/.test(path) || cls === 'design') return 'design';
  if (/print|site-safety/.test(path) || cls === 'print') return 'print';
  return 'signage';
};
const NO_FAQ = /^\/(|contact-us|get-a-quote|get-a-guide|privacy-policy|returns|refund_returns|shop|blog|posts\/.*|estimate|invoice|workspace|quote-requested|request-quote-thank-you|download-guide-thank-you|sample-page|norwich)$/;

// Heading order: no skipped levels (h2 → h5 becomes h2 → h3) and one H1 per page.
// The old level stays as a class so the look doesn't change.
// Extra copy for pages the WordPress capture left thin
const GUIDE_FAQ = [
  ['Is the vehicle graphics guide free?', 'Yes. Fill in the short form and we email you a link to the guide. There is no charge and no obligation to buy.'],
  ['Does the guide cover vans and cars?', 'Yes. It covers small, medium and large vans as well as cars, with typical budgets for each size and the coverage options from cut vinyl lettering to a full wrap.'],
  ['Can I use the guide if I want to fit my own graphics?', 'Yes. The preparation and aftercare sections apply whether we fit your graphics or you buy a supply-only kit and fit it yourself.'],
  ['What happens after I read the guide?', 'When you are ready, send us a photo of your vehicle and your logo through the quote form and we will come back with a design and a fixed price.'],
];
const PAGE_EXTRA = {
  '/get-a-guide': {
    replace: [[/(<h[1-6][^>]*>)\s*Download our Vehicle Graphics how to guide\.\.?/, '$1Download our free vehicle graphics guide.']],
    after: /(<section class="section-padding section-two row signage guide">[\s\S]*?<\/section>)/,
    html: `<section class="bdsub-copy bdguide-copy"><div class="wrap">
<h2>What is in our vehicle graphics guide?</h2>
<p>Our free vehicle graphics guide is a plain-English, how-to guide for anyone planning graphics for a van, car or small fleet. It is written by the team who design, print and fit vehicle graphics every week at our Norwich workshop, so it answers the questions we are asked most: what graphics cost, what to put on the vehicle, which materials to choose and how to keep them looking good.</p>
<ul>
<li><strong>Budgets by vehicle size</strong> – typical prices for small, medium and large vans, from simple cut vinyl lettering to half and full wraps.</li>
<li><strong>Design tips</strong> – what to include, how much text is too much, and how to make a van readable at a glance in traffic.</li>
<li><strong>Types of graphics</strong> – cut vinyl, printed and laminated vinyl, reflective chapter 8 kits and full wraps, and where each one works best.</li>
<li><strong>Preparation</strong> – how to get your vehicle ready so graphics stick properly and last.</li>
<li><strong>Aftercare</strong> – washing, pressure washers and other simple habits that extend the life of your graphics.</li>
</ul>
<h2>A van graphics guide for trades and small businesses</h2>
<p>Most of our vehicle work is for tradespeople and local businesses across Norwich and Norfolk: electricians, builders, gardeners, cleaners, caterers and delivery firms. The van graphics guide is written for them. It helps you plan a design that shows your name, services, phone number and web address clearly, and gives you a realistic idea of budget before you ask anyone for a quote.</p>
<h2>A vehicle livery guide for fleets and brands</h2>
<p>If you run several vehicles, the vehicle livery guide section covers keeping a consistent look across different makes and sizes, planning designs that can be updated when phone numbers or services change, and phasing graphics across a fleet as vehicles come in.</p>
<h2>From the guide to your finished vehicle</h2>
<p>When you are ready, <a href="/get-a-quote/">ask us for a free quote</a> with a photo of your vehicle and your logo. You can also browse <a href="/vehicle-graphics/">vehicle graphics</a>, compare <a href="/category/signage/vehicle-graphics/">van graphics packages and prices</a>, see ideas by <a href="/vehicle-graphics/sectors/">business sector</a>, or read our <a href="/signage-home/guides-and-advice/">signage guides and advice</a>.</p>
</div></section>
<section class="bdhub-faq"><div class="wrap"><h2>Questions about the vehicle graphics guide.</h2><div class="bdhub-faqs">${GUIDE_FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>`,
    schema: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: GUIDE_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  },
};

// Keyword copy: a lead paragraph under the hero, and the keyword section above the FAQs / closing band / footer.
export function addBlocks(body, sec, video) {
  if (!sec && !video) return body;
  const lead = leadHtml(sec);
  if (lead && body.includes('<div class="bdsub-intro-text')) {
    // sub pages: the lead opens the intro, beside its photo
    body = body.replace(/(<div class="bdsub-intro-text[^"]*">)/, `$1${lead}`).replace('bdsub-intro bdsub-intro--empty', 'bdsub-intro bdsub-intro--solo');
  } else if (lead) {
    const h1end = body.indexOf('</h1>');
    const secEnd = h1end >= 0 ? body.indexOf('</section>', h1end) : -1;
    const nextH = h1end >= 0 ? body.slice(h1end + 5).search(/<h[1-6]\b/) : -1;
    if (secEnd > 0 && secEnd - h1end < 6000 && (nextH < 0 || h1end + 5 + nextH > secEnd)) body = body.slice(0, secEnd + 10) + `<div class="bdkw-leadband">${lead}</div>` + body.slice(secEnd + 10);
    else if (h1end >= 0) body = body.slice(0, h1end + 5) + lead + body.slice(h1end + 5);
  }
  // photos for the keyword cards: the page's own gallery / content photos not already shown near the top
  const used = new Set([...body.slice(0, Math.max(0, body.indexOf('bdkw-leadband') + 1) || body.indexOf('</h1>') + 2000).matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]));
  for (const m of (body.match(/<figure class="bdsub-intro-img">[\s\S]*?<\/figure>/) || [''])[0].matchAll(/\ssrc="([^"]+)"/g)) used.add(m[1]);
  const gallery = [...body.matchAll(/<a class="bdsub-ph[^"]*"[^>]*>\s*<img\b[^>]*>/g)].map((m) => m[0].match(/<img\b[^>]*>/)[0]);
  const pics = gallery.filter((t) => !used.has((t.match(/\ssrc="([^"]+)"/) || [])[1])).slice(2);
  const block = blockHtml(sec, video, pics);
  if (block) {
    // high enough that it is read as main copy (crawlers and the CRM audit only read the first ~1,300 words):
    // after the second section below the hero, or before the FAQs / closing band / footer if that comes first
    const end = [/<section class="bdhub-faq/, /<section class="bdhub-band">/, /<footer\b/, /<\/main>/].map((r) => body.search(r)).find((i) => i >= 0);
    let at = end;
    const lb = body.indexOf('bdkw-leadband') >= 0 ? body.indexOf('bdkw-leadband') : body.indexOf('<section class="bdsub-intro');
    if (lb > 0) { let i = body.indexOf('</section>', lb); if (i > 0) i = body.indexOf('</section>', i + 10); if (i > 0 && (end == null || i < end)) at = i + 10; }
    if (at != null) body = body.slice(0, at) + block + body.slice(at);
    else { const last = body.lastIndexOf('</section>'); if (last >= 0) body = body.slice(0, last + 10) + block + body.slice(last + 10); }
  }
  return body;
}

// WordPress "link list" lines ("Vehicle Graphics <a>Car Graphics</a>, <a>Van Graphics</a>") and "… here" links
// become a row of related-page buttons.
export function linkChips(body, path = '') {
  const fix = (href) => { const k = href.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/'; const to = REDIRECTS[k]; return to ? (to === '/' ? '/' : to.replace(/\/?$/, '/')) : href; };
  const self = (path.replace(/\/+$/, '') || '/') + '/';
  const chip = (href, label) => (fix(href) === self ? '' : `<a class="bdrel-chip" href="${fix(href)}">${label}<span aria-hidden="true">→</span></a>`);
  const clean = (t) => decode(String(t).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  body = body.replace(/<(h[2-6]|p)\b[^>]*>((?:(?!<\/\1>)[\s\S])*?)<\/\1>/g, (m, tag, inner) => {
    const links = [...inner.matchAll(/<a\b[^>]*href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((x) => [x[1], clean(x[2])]).filter((x) => x[1]);
    if (!links.length) return m;
    const rest = clean(inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '')).replace(/[,|&]/g, '').trim();
    if (links.length >= 2 && rest.length < 40 && !/[.?!]/.test(rest)) {
      return `<div class="bdrel">${links.map(([h, l]) => chip(h, esc(l))).join('')}</div>`;
    }
    if (links.length === 1 && /^(here|click here|this page)$/i.test(links[0][1]) && tag === 'p') {
      const label = rest.replace(/^(have a look at|take a look at|see|view|check out|browse)\s+(our|the)\s+/i, '').replace(/[.:]\s*$/, '').trim();
      if (label && label.length < 60) return `<div class="bdrel">${chip(links[0][0], esc(label.charAt(0).toUpperCase() + label.slice(1)))}</div>`;
    }
    return m;
  });
  // neighbouring rows → one row
  body = body.replace(/<div class="bdrel"><\/div>/g, '').replace(/<\/div>\s*<div class="bdrel">/g, '');
  body = body.replace(/<div class="bdrel">/g, '<div class="bdrel"><span class="bdrel-label">Related</span>');
  // keep the related row visible: out of the hidden "read more" text, under the button
  return body.replace(/(<div class="bdsub-more" hidden>[\s\S]*?)(<div class="bdrel">[\s\S]*?<\/div>)(\s*<\/div>\s*<button type="button" class="bdsub-morebtn"[\s\S]*?<\/button>)/, '$1$3$2');
}

export function fixHeadings(html) {
  const hasH1 = /<h1\b/.test(html);
  let prev = hasH1 ? 0 : -1;
  return html.replace(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g, (m, lv, attrs, inner) => {
    let L = +lv;
    if (prev === -1) { L = 1; prev = 1; }
    else if (prev === 0) { prev = L; return m; }
    else if (L > prev + 1) L = prev + 1;
    prev = L;
    if (L === +lv) return m;
    const a = /\sclass="/.test(attrs) ? attrs.replace(/\sclass="/, ` class="bd-was${lv} `) : `${attrs} class="bd-was${lv}"`;
    return `<h${L}${a}>${inner}</h${L}>`;
  });
}

// ---- Keywords (from the CRM's seo_page_keywords, copied to content/seo-keywords.json) ----
const norm = (x) => decode(String(x || '')).toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[’']/g, '').replace(/[^a-z0-9£]+/g, ' ').trim();
const hasKw = (text, kw) => !!kw && (' ' + norm(text) + ' ').includes(' ' + norm(kw) + ' ');
const PROPER = { norwich: 'Norwich', norfolk: 'Norfolk', suffolk: 'Suffolk', uk: 'UK', '3d': '3D', pvc: 'PVC', ppf: 'PPF', mot: 'MOT', kingsley: 'Kingsley', nardo: 'Nardo', laravel: 'Laravel', magento: 'Magento', lynn: 'Lynn', kings: 'Kings', yarmouth: 'Yarmouth', great: 'Great' };
const SMALL = new Set(['and', 'or', 'of', 'for', 'in', 'to', 'the', 'a', 'vs', 'with', 'on']);
const titleCase = (kw) => kw.split(' ').map((w, i) => PROPER[w] || (i && SMALL.has(w) ? w : w.replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase()))).join(' ');
const sentenceCase = (kw) => { const t = kw.split(' ').map((w) => PROPER[w] || w).join(' '); return t[0].toUpperCase() + t.slice(1); };
const NO_H1_KW = /^\/(|contact-us|returns|privacy-policy|blog|get-a-quote|shop|norwich|signage-home|design-home|print-home|liquid-wrapping-home)$/;
const QWORD = /^(can|how|what|do|does|which|should|is|are|why|when)\b/;

function applyKeywords(path, h, kw, usedTitles, price) {
  const [pk, sec = []] = kw;
  if (!pk || norm(pk).split(' ').length < 2) return h;
  const K = titleCase(pk);
  const BR = ' | ' + BRAND;
  const head = h.slice(0, h.indexOf('</head>'));
  const title = decode((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  // Title: lead with the keyword
  if (!norm(title).startsWith(norm(pk))) {
    const name = title.replace(/\s*\|.*$/, '').replace(/\s+–\s+£[\d.,]+$/, '').trim();
    const nameWords = norm(name).split(' ').filter(Boolean);
    const overlap = nameWords.filter((w) => norm(pk).split(' ').includes(w)).length / (nameWords.length || 1);
    const extras = [price ? `£${price}` : '', overlap < 0.6 && name ? name : ''].filter(Boolean);
    let t = '';
    for (let n = extras.length; n >= 0 && !t; n--) {
      const c = [K, ...extras.slice(0, n)].join(' – ') + BR;
      if (c.length <= 65 && c.length >= 30 && !usedTitles.has(c)) t = c;
    }
    if (!t) { const c = K + ' | Signs & Print' + BR; if (c.length <= 65 && !usedTitles.has(c)) t = c; }
    if (!t && (K + BR).length <= 65 && !usedTitles.has(K + BR)) t = K + BR;
    if (t) {
      usedTitles.delete(title); usedTitles.add(t);
      h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t)}</title>`).replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${esc(t)}"`);
    }
  }
  // Description: mention the keyword up front
  const desc = decode((head.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  if (path.startsWith('/category/') && /^Shop /.test(desc)) {
    const from = /norwich$/.test(pk) ? 'from Broadland Digital' : 'from Broadland Digital in Norwich';
    let d = `${sentenceCase(pk)} ${from}. Compare options and prices online, order securely or ask our team for a quote and advice.`;
    if (d.length > 165) d = `${sentenceCase(pk)} ${from}. Compare options and prices online or ask us for a quote.`;
    d = fitDesc(d);
    h = h.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(d)}">`).replace(/(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${esc(d)}"`);
  } else if (desc && !hasKw(desc, pk)) {
    let d = `${sentenceCase(pk)}: ${desc[0].toLowerCase() + desc.slice(1)}`;
    if (/^[A-Z]{2}|^[A-Z][a-z]+ [A-Z]/.test(desc)) d = `${sentenceCase(pk)}: ${desc}`;
    d = fitDesc(d);
    h = h.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(d)}">`).replace(/(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${esc(d)}"`);
  }
  const cut = Math.max(0, h.indexOf('</header>'));
  let body = h.slice(cut);
  // H1: short category/product headings name the keyword ("Small Vehicles." → "Budget Small Vehicle Liquid Wrapping.")
  const h1m = body.match(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/);
  if (h1m && !hasKw(h1m[2], pk) && !NO_H1_KW.test(path) && !/<(?!br\b)[a-z]/i.test(h1m[2])) {
    const words = norm(h1m[2]).split(' ').filter(Boolean).length;
    if (words <= 3 || /^\/(product|category)\//.test(path)) body = body.replace(h1m[0], `<h1${h1m[1]}>${esc(K)}.</h1>`);
  }
  // Subheadings: the FAQ heading names a secondary keyword
  const headings = [...body.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/g)].map((m) => m[1]);
  if (sec.length && !sec.some((s2) => headings.some((x) => hasKw(x, s2)))) {
    const s2 = sec.find((x) => !QWORD.test(x));
    const q = sec.find((x) => QWORD.test(x));
    const label = s2 ? `Questions about ${s2.split(' ').map((w) => PROPER[w] || w).join(' ')}.` : `${sentenceCase(q)}?`;
    body = body.replace(/<h2>Questions\.<\/h2>/, `<h2>${esc(label)}</h2>`);
  }
  // Image alt text: describe the first photo with the keyword
  const alts = [...body.matchAll(/<img\b[^>]*\salt="([^"]*)"/g)].map((m) => m[1]);
  if (!alts.some((a) => hasKw(a, pk))) {
    let done = false;
    body = body.replace(/<img\b[^>]*>/g, (tag) => {
      if (done || /logo|\.svg/i.test(tag) || /class="[^"]*(?:bdf|bdh-)/.test(tag)) return tag;
      done = true;
      const a = (tag.match(/\salt="([^"]*)"/) || [])[1];
      const next = a ? `${sentenceCase(pk)} – ${decode(a)}` : sentenceCase(pk);
      return a != null ? tag.replace(/\salt="[^"]*"/, ` alt="${esc(next)}"`) : tag.replace(/<img\b/, `<img alt="${esc(next)}"`);
    });
  }
  return h.slice(0, cut) + body;
}

// Share image: pages without one (or with the placeholder) use their first photo
function shareImage(h) {
  const cut = Math.max(0, h.indexOf('</header>'));
  const og = (h.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  if (og && !/placeholder/i.test(og)) return h;
  const src = [...h.slice(cut).matchAll(/<img\b[^>]*\ssrc="([^"]+\.(?:jpe?g|png|webp))"/gi)].map((m) => m[1]).find((x) => !/logo|placeholder|icon/i.test(x));
  const url = src ? (src.startsWith('http') ? src : 'https://broadlanddigital.co.uk' + (src.startsWith('/') ? '' : '/') + src) : 'https://broadlanddigital.co.uk/wp-content/uploads/2024/04/signage-15-scaled_v2-jpg.webp';
  if (og) return h.replace(/(<meta property="og:image" content=")[^"]*"/, `$1${url}"`).replace(/(<meta name="twitter:image" content=")[^"]*"/, `$1${url}"`);
  return h.replace('</head>', `<meta property="og:image" content="${url}">\n<meta name="twitter:image" content="${url}">\n</head>`);
}

export function finishSeo(pages, { trail, sizes = {}, faqs = {}, keywords = {}, sections = {}, videos = {} }) {
  const info = new Map();
  for (const [path, h] of pages) {
    const hd = h.slice(0, h.indexOf('</head>'));
    const title = decode((hd.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
    const desc = decode((hd.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').trim();
    const body = h.slice(h.indexOf('</header>'));
    const h1 = decode(((body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    info.set(path, { title, desc, h1 });
  }
  const count = (k) => { const c = new Map(); for (const v of info.values()) if (v[k]) c.set(v[k], (c.get(v[k]) || 0) + 1); return c; };
  const tc = count('title'), dc = count('desc'), hc = count('h1');
  const out = new Map();
  for (let [path, h] of pages) {
    const { title, desc, h1 } = info.get(path);
    const pageN = (path.match(/\/page\/(\d+)$/) || [])[1];
    const names = (trail(path) || []).map((c) => c.name).filter(Boolean);
    const name = h1 || names[names.length - 1] || title.split(/\s[|–-]\s/)[0];
    const shopLike = /^\/(product|category)\//.test(path);
    let t = title, d = desc;
    const prices = path.startsWith('/product/') ? [...h.slice(0, h.indexOf('</head>')).matchAll(/"(?:price|lowPrice)"\s*:\s*"?(\d+(?:\.\d+)?)/g)].map((m) => +m[1]).filter((x) => x > 0) : [];
    // only where several products share a name (fitted / supply-only versions)
    const price = prices.length && (tc.get(title) > 1 || hc.get(h1) > 1) ? String(Math.min(...prices)) : '';
    const priced = price ? `${name.replace(/\.\s*$/, '')} – £${String(+price).replace(/\.0+$/, '')}` : name;
    if (t.length > 65 || t.length < 30 || tc.get(t) > 1 || pageN || (shopLike && !t.includes(BRAND))) t = titleFor(path, priced, names, pageN);
    if (!d || d.length < 120 || d.length > 165 || dc.get(d) > 1 || pageN) d = describe(path, priced, names);
    if (pageN) d = clip(d, 150) + ` Page ${pageN}.`;
    if (t !== title) {
      h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t)}</title>`)
        .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${esc(t)}"`);
    }
    d = d.replace(/([a-z])\.(?=[A-Z])/g, '$1. ');
    if (d !== desc) {
      const tag = `<meta name="description" content="${esc(d)}">`;
      h = /<meta name="description"[^>]*>/.test(h) ? h.replace(/<meta name="description"[^>]*>/, tag) : h.replace('</head>', tag + '\n</head>');
      h = h.replace(/(<meta (?:property="og:description"|name="twitter:description") content=")[^"]*"/g, `$1${esc(d)}"`);
    }
    if (path === '/shop') h = h.replace(/<link rel="canonical" href="[^"]*"/, '<link rel="canonical" href="https://broadlanddigital.co.uk/shop/"').replace(/(<meta property="og:url" content=")[^"]*"/, '$1https://broadlanddigital.co.uk/shop/"');
    if (NOINDEX.test(path)) h = h.replace(/<meta name="robots"[^>]*>/, '').replace('</head>', '<meta name="robots" content="noindex, follow">\n</head>');
    // Links: product pages' relative slugs (href="basic-small-van-graphics") and a doubled address from WordPress
    if (path.startsWith('/product/')) h = h.replace(/\shref="([a-z0-9][a-z0-9-]*)"/g, (m, slug) => (pages.has('/product/' + slug) ? ` href="/product/${slug}/"` : m));
    h = h.replace(/href="\/[^"]*?(https?:)?\/\/broadlanddigital\.co\.uk(\/[^"]*)"/g, 'href="$2"');
    // Images in the page body: alt text and width/height
    const cut = Math.max(0, h.indexOf('</header>'));
    const head = h.slice(0, cut);
    let body = h.slice(cut);
    const altBase = (name || '').replace(/\.\s*$/, '').replace(/([a-z])\.(?=[A-Z])/g, '$1. ');
    body = body.replace(/<img\b[^>]*\ssrc="(?:|[^"]*woo-block-design\.png[^"]*)"[^>]*>/g, '').replace(/(\ssrc=")\/assets\/images\//g, '$1/wp-content/themes/bd-2022/assets/images/');
    body = body.replace(/<img\b[^>]*>/g, (tag) => {
      let t2 = tag;
      const src = (t2.match(/\ssrc="([^"?]+)/) || [])[1] || '';
      // alt that is only the file name (e.g. "Lilywhites Carpentry Van Graphics") → say whose work it is and where
      const altNow = (t2.match(/\salt="([^"]*)"/) || [])[1];
      const fileKey = (x) => decodeURIComponent(String(x)).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/^[0-9a-f]{12}-/, '').replace(/-(\d+x\d+|scaled|rotated|jpg|jpeg|png|webp|\d)$/g, '').replace(/-(\d+x\d+|scaled|rotated|jpg|jpeg|png|webp|\d)$/g, '').replace(/[^a-z0-9]+/g, '');
      if (altNow && fileKey(altNow) === fileKey(src.split('/').pop() || '') && !/logo/i.test(src)) t2 = t2.replace(/\salt="[^"]*"/, ` alt="${esc(decode(altNow).replace(/\s+/g, ' ').trim())}, by Broadland Digital in Norwich"`);
      if (!/\salt="[^"]+"/.test(t2) && !/logo/i.test(src)) {
        const file = decodeURIComponent(src.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/-(\d+x\d+|scaled|rotated|jpg|jpeg|png|webp|copy|e\d{6,})$/gi, '')
          .replace(/-(\d+x\d+|scaled|rotated|jpg|jpeg|png|webp)$/gi, '').replace(/^[0-9a-f]{12}-/, '').replace(/[-_]+/g, ' ').replace(/\b(img|pxl|dsc)\s*\d+\b/gi, '').replace(/\s+/g, ' ').trim();
        const alt = [altBase, file && file.toLowerCase() !== altBase.toLowerCase() ? file : ''].filter(Boolean).join(' – ') || BRAND;
        t2 = /\salt=""/.test(t2) ? t2.replace(/\salt=""/, ` alt="${esc(alt)}"`) : t2.replace(/<img\b/, `<img alt="${esc(alt)}"`);
      }
      if (!/\swidth=/.test(t2) || !/\sheight=/.test(t2)) {
        const sz = sizes[src];
        if (sz) t2 = t2.replace(/\s(width|height)="[^"]*"/g, '').replace(/<img\b/, `<img width="${sz[0]}" height="${sz[1]}"`);
      }
      return t2;
    });
    const ex = PAGE_EXTRA[path];
    if (ex && ex.after.test(body)) {
      body = body.replace(ex.after, `$1${ex.html}`);
      for (const [a, b] of ex.replace || []) body = body.replace(a, b);
    }
    if (!NOINDEX.test(path)) body = addBlocks(body, sections[path], videos[path]);
    body = linkChips(body, path);
    body = fixHeadings(body);
    // FAQs on shop and product pages (with FAQPage schema), when the page has none
    if (shopLike && !/FAQPage/.test(head)) {
      const set = faqSet(path);
      const block = `<section class="bdhub-faq bdshop-faq"><div class="wrap"><h2>Questions.</h2><div class="bdhub-faqs">${set.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>`;
      body = body.replace(/<footer\b/, block + '\n<footer');
      const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: set.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
      out.set(path, (head + body).replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`));
      continue;
    }
    const set = faqs[SECTION_OF(h, path)];
    if (set && !/FAQPage/.test(head) && !NO_FAQ.test(path) && !NOINDEX.test(path) && /<footer\b/.test(body)) {
      const block = `<section class="bdhub-faq"><div class="wrap"><h2>Questions.</h2><div class="bdhub-faqs">${set.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div></div></section>`;
      body = /<section class="bdhub-band">/.test(body) ? body.replace('<section class="bdhub-band">', block + '<section class="bdhub-band">') : body.replace(/<footer\b/, block + '\n<footer');
      const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: set.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
      out.set(path, (head + body).replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`));
      continue;
    }
    out.set(path, ex?.schema ? (head + body).replace('</head>', `<script type="application/ld+json">${JSON.stringify(ex.schema)}</script>\n</head>`) : head + body);
  }
  // Keywords and share images, once every page's title is known
  const usedTitles = new Set([...out.values()].map((h) => decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '')));
  for (const [path, h0] of out) {
    let h = h0;
    const kw = keywords[path];
    if (kw && !NOINDEX.test(path) && !/\/page\/\d+$/.test(path)) {
      const price = (decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').match(/–\s+£([\d.,]+)/) || [])[1] || '';
      h = applyKeywords(path, h, kw, usedTitles, price);
    }
    out.set(path, shareImage(h));
  }
  return out;
}
