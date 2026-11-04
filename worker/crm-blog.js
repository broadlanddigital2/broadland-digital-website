/**
 * CRM blog (shared by the Le Man Cave, Auto Opulence, Race Car Graphics and Broadland Digital workers; keep the copies in step).
 *
 * The CRM writes a blog post for the site every few days (Marketing → Blog posts) and staff approve it there. Published
 * posts come from the CRM's seo-blog feed and are rendered here on request, so a post is live as soon as it's approved:
 *   <base>          the blog list
 *   <base>/<slug>   a post
 * Both use the site's own page as a shell (the static page at opts.shellPath, which has the header and footer and an
 * empty <div data-crm-blog="slot"></div> where the blog goes). The sitemap gets the posts added (addPostsToSitemap).
 */

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "<title> | <site name>", unless the title already names the business.
const branded = (t, site) => { const core = String(site).toLowerCase().split(/\s+/).slice(0, 2).join(' '); if (String(t).toLowerCase().includes(core)) return t; const full = `${t} | ${site}`; return full.length > 65 && String(t).length >= 30 ? t : full; };
const date = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : '');

/** Published posts from the CRM (cached at the edge for two minutes). */
export async function fetchPosts(opts, slug = '') {
  const url = `${opts.feedUrl}?key=${encodeURIComponent(opts.feedKey)}${opts.kind ? '&kind=' + encodeURIComponent(opts.kind) : ''}${slug ? '&slug=' + encodeURIComponent(slug) : ''}`;
  try {
    const r = await fetch(url, { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!r.ok) return null;
    const j = await r.json();
    const posts = Array.isArray(j.posts) ? j.posts : [];
    posts.business = j.business || null; // name, address, phone, hours and map for the "Find us" block and schema
    return posts;
  } catch {
    return null;
  }
}

function setHead(html, { title, description, url, image, jsonLd, noindex }) {
  const meta = (attr, name, content) => {
    const re = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*>`, 'i');
    const tag = `<meta ${attr}="${name}" content="${esc(content)}">`;
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', tag + '</head>');
  };
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:url', url);
  meta('property', 'og:type', image ? 'article' : 'website');
  if (image) { meta('property', 'og:image', image); meta('name', 'twitter:image', image); }
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', description);
  // The same social and search tags WordPress printed (and the CRM pages print: crm-pages.js)
  meta('property', 'og:locale', 'en_US');
  meta('property', 'og:site_name', 'Broadland Digital');
  meta('property', 'article:publisher', 'https://www.facebook.com/broadlanddigital');
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'robots', noindex ? 'noindex' : 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large');
  html = /<link[^>]*rel="canonical"[^>]*>/i.test(html)
    ? html.replace(/<link[^>]*rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}">`)
    : html.replace('</head>', `<link rel="canonical" href="${esc(url)}"></head>`);
  // The shell page's own structured data describes the shell, so it's replaced with the blog's.
  html = html.replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, (m) => (/EntertainmentBusiness|LocalBusiness|AutoRepair|Organization/.test(m) && !/BreadcrumbList|WebPage|FAQPage/.test(m) ? m : ''));
  return html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script></head>`);
}

// The blog goes into the slot for search engines and first paint. React sites re-render the page when it loads, so the
// same HTML and title are also handed over in window.__crmBlog, and the site's blog slot component puts them back.
function fill(shell, inner, title) {
  const re = /(<div[^>]*data-crm-blog="slot"[^>]*>)\s*<\/div>/i;
  const html = re.test(shell) ? shell.replace(re, (_m, open) => open + inner + '</div>') : shell.replace(/<\/main>/i, inner + '</main>');
  const data = JSON.stringify({ title, html: inner }).replace(/</g, '\\u003c');
  return html.replace('</head>', `<script>window.__crmBlog=${data}</script></head>`);
}

function listHtml(opts, posts) {
  const base = opts.basePath;
  const cards = posts.map((p) => `<a class="crmblog-card" href="${esc(p.path)}">
${p.image ? `<img src="${esc(p.image.url)}" alt="${esc(p.image.alt)}" width="${p.image.width || 1536}" height="${p.image.height || 1024}" loading="lazy">` : '<span class="crmblog-noimg"></span>'}
<span class="crmblog-cardbody"><span class="crmblog-meta">${esc(p.category || 'Blog')} · ${esc(date(p.publishedAt))}</span>
<h2>${esc(p.title)}</h2><span class="crmblog-excerpt">${esc(p.excerpt)}</span><span class="crmblog-more">Read more →</span></span></a>`).join('\n');
  return `<style>${opts.css}</style>
<section class="crmblog crmblog-list">
<nav class="crmblog-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <span>${esc(opts.blogName)}</span></nav>
<p class="crmblog-kicker">${esc(opts.kicker)}</p>
<h1>${esc(opts.blogTitle)}</h1>
<p class="crmblog-intro">${esc(opts.intro)}</p>
${posts.length ? `<div class="crmblog-grid">${cards}</div>` : `<p class="crmblog-empty">New posts are on their way. In the meantime, have a look at our <a href="${esc(opts.guidesPath || '/')}">guides</a>.</p>`}
${opts.outroHtml || ''}
</section>`;
}

const DAYS = { mon: 'Mo', tue: 'Tu', wed: 'We', thu: 'Th', fri: 'Fr', sat: 'Sa', sun: 'Su' };
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
// The business as schema.org data (publisher of the post): name, address, phone, position and opening hours.
function businessLd(b, origin, siteName) {
  if (!b) return { '@type': 'Organization', name: siteName, url: origin };
  const hours = b.hours ? Object.entries(DAYS).filter(([k]) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(b.hours[k] || ''))).map(([k, d]) => `${d} ${b.hours[k]}`) : [];
  return { '@type': 'LocalBusiness', '@id': origin + '/#business', name: b.name || siteName, url: origin, telephone: b.phone || undefined, email: b.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: (b.address || []).filter((l) => l !== b.locality && l !== b.postcode).join(', '), addressLocality: b.locality || undefined, addressRegion: b.region || undefined, postalCode: b.postcode || undefined, addressCountry: 'GB' },
    geo: b.lat ? { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng } : undefined, hasMap: b.mapsUrl, openingHours: hours.length ? hours : undefined };
}
// "Find us" block under each post: name, address, phone, hours, a map and a directions link.
function visitHtml(b) {
  if (!b || !(b.address || []).length) return '';
  const tel = String(b.phone || '').replace(/[^\d+]/g, '');
  const hours = b.hours ? Object.keys(DAY_NAMES).filter((k) => b.hours[k]).map((k) => `<li><span>${DAY_NAMES[k]}</span> ${esc(b.hours[k] === 'closed' ? 'Closed' : String(b.hours[k]).replace('-', '–'))}</li>`).join('') : '';
  return `<section class="crmblog-visit" aria-label="Find us">
<div class="crmblog-nap"><h2>Find ${esc(b.name)}</h2>
<p><strong>${esc(b.name)}</strong><br>${(b.address || []).map(esc).join('<br>')}</p>
${b.phone ? `<p>Phone: <a href="tel:${esc(tel)}">${esc(b.phone)}</a>${b.email ? `<br>Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</p>` : ''}
${hours ? `<ul class="crmblog-hours">${hours}</ul>${b.hours.note ? `<p class="crmblog-hoursnote">${esc(b.hours.note)}</p>` : ''}` : ''}
<p><a class="crmblog-btn2" href="${esc(b.mapsUrl)}" target="_blank" rel="noopener">Get directions</a></p></div>
${b.mapImage ? `<a class="crmblog-map" href="${esc(b.mapsUrl)}" target="_blank" rel="noopener"><img src="${esc(b.mapImage)}" alt="Map showing where ${esc(b.name)} is" width="640" height="320" loading="lazy"></a>` : ''}
</section>`;
}

// Neutral styles for the "Find us" block (works on light and dark sites; a site's own css can override them).
const VISIT_CSS = `.crmblog-visit{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:24px;align-items:start;margin:36px 0 0;padding:24px;border-radius:10px;border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.07)}
.crmblog-visit h2{margin:0 0 10px;font-size:26px;line-height:1.1}.crmblog-nap p{margin:0 0 12px;line-height:1.55}
.crmblog-hours{list-style:none;margin:0 0 6px;padding:0;font-size:15px}.crmblog-hours li{display:flex;justify-content:space-between;gap:12px;max-width:280px;padding:2px 0}
.crmblog-hoursnote{font-size:14px;opacity:.8}.crmblog-map img{width:100%;height:auto;border-radius:8px;display:block}
@media (max-width:760px){.crmblog-visit{grid-template-columns:1fr}}`;

function postHtml(opts, p, biz) {
  return `<style>${opts.css}${VISIT_CSS}</style>
<article class="crmblog crmblog-post">
<nav class="crmblog-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> <a href="${esc(opts.basePath)}">${esc(opts.blogName)}</a> <span aria-hidden="true">/</span> <span>${esc(p.title)}</span></nav>
<p class="crmblog-meta">${esc(p.category || 'Blog')} · <time datetime="${esc(p.publishedAt || '')}">${esc(date(p.publishedAt))}</time></p>
<h1>${esc(p.title)}</h1>
${p.excerpt ? `<p class="crmblog-lead">${esc(p.excerpt)}</p>` : ''}
${p.image ? `<img class="crmblog-hero" src="${esc(p.image.url)}" alt="${esc(p.image.alt)}" width="${p.image.width || 1536}" height="${p.image.height || 1024}">` : ''}
<div class="crmblog-body">${p.html}</div>
<div class="crmblog-cta">${opts.ctaHtml || ''}</div>
${visitHtml(biz)}
<p class="crmblog-back"><a href="${esc(opts.basePath)}">← All posts</a></p>
</article>`;
}

/**
 * Serves the blog list and posts. Returns null for other paths.
 * opts: { feedUrl, feedKey, kind ('news' for the CRM's news updates; default blog articles), origin, basePath, shellPath, siteName, blogName, blogTitle, kicker, intro, guidesPath, ctaHtml, css }
 */
export async function blogResponse(request, env, opts) {
  const url = new URL(request.url);
  const base = opts.basePath;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path !== base && !path.startsWith(base + '/')) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const shellRes = await env.ASSETS.fetch(new Request(new URL(opts.shellPath, url.origin)));
  if (!shellRes.ok) return null;
  const shell = await shellRes.text();
  const origin = opts.origin || url.origin;
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' };

  if (path === base) {
    const posts = (await fetchPosts(opts)) || [];
    const title = `${opts.blogTitle} | ${opts.siteName}`;
    const html = setHead(fill(shell, listHtml(opts, posts), title), {
      title, description: opts.intro, url: origin + base, image: posts[0]?.image?.url,
      jsonLd: { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Blog', name: opts.blogTitle, url: origin + base, publisher: { '@type': 'Organization', name: opts.siteName, url: origin },
          blogPost: posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: origin + p.path, datePublished: p.publishedAt })) },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: opts.blogName, item: origin + base }] },
      ] },
    });
    return new Response(request.method === 'HEAD' ? null : html, { headers });
  }

  const slug = path.slice(base.length + 1);
  const posts = /^[a-z0-9-]{1,120}$/.test(slug) ? await fetchPosts(opts, slug) : [];
  const p = (posts || [])[0];
  if (!p) {
    const nf = await env.ASSETS.fetch(new Request(new URL('/404', url.origin)));
    return new Response(nf.ok ? await nf.text() : 'Not found', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const biz = posts.business || null;
  const html = setHead(fill(shell, postHtml(opts, p, biz), branded(p.metaTitle || p.title, opts.siteName)), {
    title: branded(p.metaTitle || p.title, opts.siteName), description: p.metaDescription || p.excerpt, url: origin + p.path, image: p.image?.url,
    jsonLd: { '@context': 'https://schema.org', '@graph': [
      { '@type': 'BlogPosting', headline: p.title, description: p.metaDescription || p.excerpt, url: origin + p.path, mainEntityOfPage: origin + p.path,
        datePublished: p.publishedAt, dateModified: p.updatedAt || p.publishedAt, image: p.image ? [p.image.url] : undefined, keywords: (p.keywords || []).join(', '),
        wordCount: p.wordCount || undefined, inLanguage: 'en-GB', author: { '@type': 'Organization', name: opts.siteName, url: origin }, publisher: biz ? { '@id': origin + '/#business' } : { '@type': 'Organization', name: opts.siteName, url: origin } },
      ...(biz ? [businessLd(biz, origin, opts.siteName)] : []),
      ...((p.faq || []).length ? [{ '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' }, { '@type': 'ListItem', position: 2, name: opts.blogName, item: origin + base }, { '@type': 'ListItem', position: 3, name: p.title, item: origin + p.path }] },
    ] },
  });
  return new Response(request.method === 'HEAD' ? null : html, { headers });
}

/** Adds the blog list and published posts to a sitemap.xml body. */
export async function addPostsToSitemap(xml, opts) {
  const posts = await fetchPosts(opts);
  if (!posts) return xml;
  const origin = opts.origin;
  const listUrl = esc(origin + opts.basePath);
  const urls = [...(xml.includes(`<loc>${listUrl}</loc>`) ? [] : [`<url><loc>${listUrl}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`]),
    ...posts.map((p) => `<url><loc>${esc(origin + p.path)}</loc><lastmod>${esc(p.updatedAt || p.publishedAt || '')}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`)];
  return xml.includes('</urlset>') ? xml.replace('</urlset>', urls.join('\n') + '\n</urlset>') : xml;
}
