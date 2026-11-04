// SEO finishing pass over every built page (tools/build.mjs calls finishSeo once all pages are built), for the points
// the CRM's SEO optimiser scores: titles 30–65 characters, unique and ending "| Broadland Digital"; meta descriptions
// 120–165 characters and unique; one H1; alt text and width/height on every image; FAQs (with FAQPage schema) on shop
// and product pages; utility pages kept out of search. Pages whose title and description are already good are left
// exactly as WordPress had them.
const BRAND = 'Broadland Digital';
const decode = (t) => String(t || '').replace(/&amp;|&#0?38;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;|&#039;|&#39;/g, '’')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (t, n) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:–-]\s*$/, ''));

// Utility pages: no value in search results.
export const NOINDEX = /^\/(posts\/[^/]+|estimate|invoice|workspace|quote-requested|request-quote-thank-you|download-guide-thank-you|my-account|cart|checkout)(\/|$)/;

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
    d = `Shop ${trailNames.join(' – ')} from Broadland Digital in Norwich. Compare options and prices online, or ask our team for a quote and advice.`;
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

export function finishSeo(pages, { trail, sizes = {}, faqs = {} }) {
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
  const tc = count('title'), dc = count('desc');
  const out = new Map();
  for (let [path, h] of pages) {
    const { title, desc, h1 } = info.get(path);
    const pageN = (path.match(/\/page\/(\d+)$/) || [])[1];
    const names = (trail(path) || []).map((c) => c.name).filter(Boolean);
    const name = h1 || names[names.length - 1] || title.split(/\s[|–-]\s/)[0];
    const shopLike = /^\/(product|category)\//.test(path);
    let t = title, d = desc;
    const price = path.startsWith('/product/') ? ((h.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)/) || [])[1] || '') : '';
    const priced = price ? `${name.replace(/\.\s*$/, '')} – £${String(+price).replace(/\.0+$/, '')}` : name;
    if (t.length > 65 || t.length < 30 || tc.get(t) > 1 || pageN || (shopLike && !t.includes(BRAND))) t = titleFor(path, priced, names, pageN);
    if (!d || d.length < 120 || d.length > 165 || dc.get(d) > 1 || pageN) d = describe(path, priced, names);
    if (pageN) d = clip(d, 150) + ` Page ${pageN}.`;
    if (t !== title) {
      h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t)}</title>`)
        .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${esc(t)}"`);
    }
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
    const altBase = (name || '').replace(/\.\s*$/, '');
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
    out.set(path, head + body);
  }
  return out;
}
