// Broadland Digital website worker. Serves the static site in dist/ and adds what needs a server:
//   /api/forms            enquiry, quote, guide and order forms → CRM leads (forms.js)
//   CRM SEO pages         locations, guides, comparisons, sectors, services, published in the CRM (crm-pages.js)
//   sector links          signage hub "Industries we work with", signage pages "Popular with" (sector-links.js)
//   /blog, /blog/<slug>   blog posts written and approved in the CRM (crm-blog.js, shared with the other sites)
//   /sitemap.xml          static pages + CRM pages + blog posts;  /llms.txt  from the CRM's site profile
//   redirects             old WordPress addresses (worker/redirects.json, written by tools/build.mjs)
//   /wp-content/uploads   files not copied into the repo yet are fetched from the old WordPress site (OLD_SITE_ORIGIN)
import { handleForms } from './forms.js';
import { crmPageResponse, addCrmPagesToSitemap, llmsTxt } from './crm-pages.js';
import { blogResponse, addPostsToSitemap } from './crm-blog.js';
import { trackAi } from './ai-visibility.js';
import { withHubResources } from './hub-resources.js';
import { withSectorLinks } from './sector-links.js';
import redirects from './redirects.json' with { type: 'json' };
import staticPaths from './static-paths.json' with { type: 'json' };

const FEED_KEY = 'c9a2ffbc-820c-45d0-a212-14f0f33a2f54'; // seo_sites.feed_key for Broadland Digital (public, read-only)
const ORIGIN = 'https://broadlanddigital.co.uk';
const SHELL = '/_crm-page/';
const STATIC = new Set(staticPaths);
const HUBS = new Set(['/signage-home', '/print-home', '/design-home', '/web-dev-home', '/liquid-wrapping-home']);

const BLOG = {
  feedUrl: 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1/seo-blog',
  feedKey: FEED_KEY,
  origin: ORIGIN,
  basePath: '/blog',
  shellPath: SHELL,
  siteName: 'Broadland Digital',
  blogName: 'Blog',
  blogTitle: 'Signage and vehicle graphics blog',
  kicker: 'Signage, print & design advice',
  intro: 'Our signage and vehicle graphics blog: practical advice on signs, van graphics, print and design for Norfolk and Suffolk businesses, from our Norwich studio and workshop.',
  description: 'Signage and vehicle graphics blog from Broadland Digital in Norwich: practical advice on signs, van graphics, print and design for local businesses.',
  outroHtml: `<div class="crmblog-about">
<div><h2>Signage advice</h2><p>Planning a shop sign, fascia or window graphics? Our signage advice covers planning consent, materials, illumination, measuring up and how long outdoor signs last, written by the people who make and fit them. Start with our <a href="/signage-home/guides-and-advice/">signage guides</a> or <a href="/signage-home/compare/">material comparisons</a>.</p></div>
<div><h2>Vehicle graphics advice</h2><p>Van graphics are one of the cheapest ways for a local business to be seen. Our vehicle graphics advice explains costs, coverage options from lettering to full wraps, lease van rules and aftercare. See <a href="/vehicle-graphics/">vehicle graphics</a> or download our <a href="/get-a-guide/">free vehicle graphics guide</a>.</p></div>
<div><h2>Design and branding</h2><p>Good signs, vehicles and print start with a clear brand. We share practical design tips on logos, colours and layouts that stay readable from across the street, at speed on a dual carriageway or on a small business card. See <a href="/design-home/">design services</a> or our <a href="/signage-home/signage-brochure/">signage brochure</a> for ideas.</p></div>
<div><h2>Local to Norfolk and Suffolk</h2><p>Every article is written by our team at Vulcan House in Norwich, who design, print and fit work for businesses across Norfolk and the Suffolk coast. Find your town on our <a href="/signage-home/locations/">signage locations</a> page, or visit the workshop: <a href="/contact-us/">directions and contact details</a>.</p></div>
<div><h2>Printing tips</h2><p>From business cards and leaflets to banners and pull-ups, our printing tips help you choose stock, finishes and sizes that suit the job and the budget. Browse <a href="/print-home/">print services</a> or <a href="/get-a-quote/">ask for a quote</a>.</p></div>
</div>`,
  guidesPath: '/signage-home/guides-and-advice',
  ctaHtml: '<p><strong>Planning a sign or print job?</strong> Tell us what you need, or call 01603 407786.</p><p><a class="crmblog-btn" href="/get-a-quote">Get a quote</a> <a class="crmblog-btn2" href="/signage-home">Signage services</a></p>',
  css: `.crmblog{max-width:880px;margin:0 auto;padding:56px 32px 80px;color:#2a2d32;font-family:azo-sans-web,Arial,sans-serif}
.crmblog-list{max-width:1240px}
.crmblog-about{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:32px;margin:64px 0 0;padding:40px 0 0;border-top:1px solid #e1dde9}.crmblog-about h2{font-size:22px;margin:0 0 10px}.crmblog-about p{font-size:16px;line-height:1.65;margin:0}.crmblog-about a{color:#713fff}
.crmblog-crumbs{font-size:13px;color:#5e6168;margin:0 0 22px}.crmblog-crumbs a{color:#5e6168}.crmblog-crumbs span:last-child{color:#2a2d32;font-weight:600}
.crmblog-kicker,.crmblog-meta{display:block;margin:0 0 12px;color:#713fff;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.crmblog h1{margin:0 0 18px;color:#2a2d32;font-family:adelle,Georgia,serif;font-size:clamp(40px,5.5vw,72px);line-height:1.05;font-weight:800;letter-spacing:-.02em}
.crmblog-post h1{font-size:clamp(34px,4.5vw,56px)}
.crmblog-intro,.crmblog-lead{font-size:20px;line-height:1.55;color:#5e6168;max-width:720px;margin:0 0 34px}
.crmblog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:28px}
.crmblog-card{display:flex;flex-direction:column;background:#fff;border-bottom:1px solid #e3dff0;text-decoration:none;color:inherit}
.crmblog-card img,.crmblog-noimg{width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;display:block;background:#f5f1ff}
.crmblog-cardbody{display:flex;flex-direction:column;gap:8px;padding:18px 0 24px}
.crmblog-card .crmblog-meta{margin:0;font-size:11px}
.crmblog-card h2{margin:0;color:#2a2d32;font-family:adelle,Georgia,serif;font-size:24px;line-height:1.15;font-weight:800}
.crmblog-excerpt{color:#5e6168;font-size:15px;line-height:1.55}
.crmblog-hero{width:100%;height:auto;margin:0 0 34px}
.crmblog-body{font-size:18px;line-height:1.7}.crmblog-body h2{font-family:adelle,Georgia,serif;color:#713fff;font-size:32px;line-height:1.15;margin:1.4em 0 .5em}
.crmblog-body h3{font-family:adelle,Georgia,serif;font-size:24px;margin:1.3em 0 .4em}.crmblog-body a{color:#713fff;font-weight:600}
.crmblog-cta{margin:40px 0 0;padding:30px;background:#713fff;color:#fff}.crmblog-cta a{color:#fff}
.crmblog-btn,.crmblog-btn2{display:inline-flex;padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:600;font-size:15px;margin:6px 8px 0 0}
.crmblog-btn{background:#fff;color:#713fff!important}.crmblog-btn2{border:1px solid currentColor;color:inherit}
.crmblog-back a{color:#713fff}`,
};

const MAIN_PAGES = [['/', 'Home'], ['/signage-home', 'Signage'], ['/print-home', 'Print'], ['/design-home', 'Design'], ['/web-dev-home', 'Web development'],
  ['/liquid-wrapping-home', 'Liquid wrapping'], ['/shop', 'Shop'], ['/blog', 'Blog'], ['/contact-us', 'Contact us'], ['/get-a-quote', 'Get a quote']];

// Redirects go to the page's own address: with the trailing slash, except the blog (its posts have none).
const withSlash = (to) => (to === '/' || to.endsWith('/') || /\.[a-z0-9]{2,5}$/i.test(to) || /^\/blog(\/|$)/.test(to) || to.includes('#') ? to : to + '/');
const redirect = (to, url) => Response.redirect(new URL(withSlash(to) + url.search, url.origin).toString(), 301);

const WP_PASSTHROUGH = /^\/(wp-admin(\/|$)|wp-login\.php|wp-json\/|wp-cron\.php|xmlrpc\.php)/;

async function route(request, env) {
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);
  // Once broadlanddigital.co.uk is routed to this worker, WordPress's admin and API still reach the old WordPress
  // server: a worker's request to its own (routed) hostname goes to the origin, not back to the worker.
  if (WP_PASSTHROUGH.test(path) && /(^|\.)broadlanddigital\.co\.uk$/.test(url.host)) return fetch(request);

  if (path === '/api/forms') return handleForms(request, env);
  if (path.startsWith('/_static/')) return env.ASSETS.fetch(request);

  // Uploads: from dist/ when copied in, otherwise from the old WordPress site while it is still running elsewhere.
  // Pictures and theme files don't change at the same address: let browsers and Cloudflare keep them (30 days).
  if (path.startsWith('/opt/')) return longCache(await env.ASSETS.fetch(request));
  if (path.startsWith('/wp-content/')) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return longCache(res);
    const old = env.OLD_SITE_ORIGIN || ORIGIN;
    // (when old is this site's own address, the request goes to the WordPress server behind it: see WP_PASSTHROUGH)
    const up = await fetch(old + url.pathname, { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    if (!up || !up.ok) return res;
    const h = new Headers(up.headers);
    h.set('Cache-Control', 'public, max-age=86400');
    return new Response(up.body, { status: 200, headers: h });
  }

  // Page addresses end in "/" as they did on WordPress (dist/ is served with force-trailing-slash); "key" is the
  // address without it, for the lookups below.
  const key = path.replace(/\/+$/, '') || '/';
  if (path === '/' && (url.searchParams.has('p') || url.searchParams.has('page_id'))) return Response.redirect(url.origin + '/', 301);
  if (path === '/sitemap_index.xml' || /^\/[a-z_-]+-sitemap\d*\.xml$/.test(path)) return Response.redirect(url.origin + '/sitemap.xml', 301);

  if (path === '/sitemap.xml') {
    const sm = await env.ASSETS.fetch(request);
    let xml = await sm.text();
    xml = await addCrmPagesToSitemap(xml, { feedKey: FEED_KEY, origin: ORIGIN });
    xml = await addPostsToSitemap(xml, BLOG);
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
  }
  if (path === '/llms.txt') {
    return new Response(await llmsTxt({ feedKey: FEED_KEY, origin: ORIGIN }, MAIN_PAGES), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
  }

  // The WordPress blog lived at /guides/<slug>; the CRM's blog is at /blog.
  const guide = key.match(/^\/guides\/([a-z0-9-]+)$/);
  if (guide) return redirect('/blog/' + guide[1], url);
  const blog = await blogResponse(request, env, BLOG);
  if (blog) return blog;

  // A page published in the CRM wins, then the static pages, then old addresses.
  const crm = await crmPageResponse(request, env, { feedKey: FEED_KEY, origin: ORIGIN, shellPath: SHELL, trailingSlash: true });
  if (crm) return request.method === 'GET' ? withSectorLinks(crm, key, FEED_KEY) : crm;
  if (key === '/_crm-page') return new Response('Not found', { status: 404 });
  if (!STATIC.has(key) && redirects[key]) return redirect(redirects[key], url);
  // A permanent redirect to the "/" address (the static files would answer with a temporary one).
  if (STATIC.has(key) && key !== '/' && !path.endsWith('/')) return redirect(key + '/', url);
  if (!STATIC.has(key) && (/^\/product\/.+-\d+$/.test(key) || key.startsWith('/product-category/'))) return redirect('/shop', url);
  const res = await env.ASSETS.fetch(request);
  // Section hubs: guides, comparisons, areas and blog posts from the CRM, added live
  if (HUBS.has(key) && request.method === 'GET') return withHubResources(res, { feedKey: FEED_KEY, blog: BLOG });
  // Signage category and service pages: "Popular with" links to the sectors that use them
  if (request.method === 'GET') return withSectorLinks(res, key, FEED_KEY);
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.host === 'www.broadlanddigital.co.uk') return Response.redirect(ORIGIN + url.pathname + url.search, 301);
    const response = await route(request, env);
    // Preview hosts (*.workers.dev) are kept out of search engines; AI-visibility stats only count the live site.
    if (url.host.endsWith('.workers.dev')) {
      const r = new Response(response.body, response);
      r.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return r;
    }
    if (url.host === 'broadlanddigital.co.uk' || url.host === 'www.broadlanddigital.co.uk') trackAi(request, response, ctx, { feedKey: FEED_KEY });
    return response;
  },
};

function longCache(res) {
  if (!res.ok) return res;
  const r = new Response(res.body, res);
  r.headers.set('Cache-Control', 'public, max-age=2592000');
  return r;
}
