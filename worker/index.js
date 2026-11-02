// Broadland Digital website worker. Serves the static site in dist/ and adds what needs a server:
//   /api/forms            enquiry, quote, guide and order forms → CRM leads (forms.js)
//   CRM SEO pages         locations, guides, comparisons, sectors, services, published in the CRM (crm-pages.js)
//   /blog, /blog/<slug>   blog posts written and approved in the CRM (crm-blog.js, shared with the other sites)
//   /sitemap.xml          static pages + CRM pages + blog posts;  /llms.txt  from the CRM's site profile
//   redirects             old WordPress addresses (worker/redirects.json, written by tools/build.mjs)
//   /wp-content/uploads   files not copied into the repo yet are fetched from the old WordPress site (OLD_SITE_ORIGIN)
import { handleForms } from './forms.js';
import { crmPageResponse, addCrmPagesToSitemap, llmsTxt } from './crm-pages.js';
import { blogResponse, addPostsToSitemap } from './crm-blog.js';
import { trackAi } from './ai-visibility.js';
import redirects from './redirects.json' with { type: 'json' };
import staticPaths from './static-paths.json' with { type: 'json' };

const FEED_KEY = 'c9a2ffbc-820c-45d0-a212-14f0f33a2f54'; // seo_sites.feed_key for Broadland Digital (public, read-only)
const ORIGIN = 'https://broadlanddigital.co.uk';
const SHELL = '/_crm-page/';
const STATIC = new Set(staticPaths);

const BLOG = {
  feedUrl: 'https://dipjypzrfigkzuarlsov.supabase.co/functions/v1/seo-blog',
  feedKey: FEED_KEY,
  origin: ORIGIN,
  basePath: '/blog',
  shellPath: SHELL,
  siteName: 'Broadland Digital',
  blogName: 'Blog',
  blogTitle: 'Broadland Digital blog',
  kicker: 'Signage, print & design advice',
  intro: 'Practical advice on signs, print and design for Norfolk and Suffolk businesses, from our Norwich studio and workshop.',
  guidesPath: '/signage-home/guides-and-advice',
  ctaHtml: '<p><strong>Planning a sign or print job?</strong> Tell us what you need, or call 01603 407786.</p><p><a class="crmblog-btn" href="/get-a-quote">Get a quote</a> <a class="crmblog-btn2" href="/signage-home">Signage services</a></p>',
  css: `.crmblog{max-width:880px;margin:0 auto;padding:56px 32px 80px;color:#2a2d32;font-family:azo-sans-web,Arial,sans-serif}
.crmblog-list{max-width:1240px}
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

async function route(request, env) {
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);

  if (path === '/api/forms') return handleForms(request);
  if (path.startsWith('/_static/')) return env.ASSETS.fetch(request);

  // Uploads: from dist/ when copied in, otherwise from the old WordPress site while it is still running elsewhere.
  if (path.startsWith('/wp-content/')) {
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;
    const old = env.OLD_SITE_ORIGIN || ORIGIN;
    if (new URL(old).host === url.host) return res;
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
  if (crm) return crm;
  if (key === '/_crm-page') return new Response('Not found', { status: 404 });
  if (!STATIC.has(key) && redirects[key]) return redirect(redirects[key], url);
  // A permanent redirect to the "/" address (the static files would answer with a temporary one).
  if (STATIC.has(key) && key !== '/' && !path.endsWith('/')) return redirect(key + '/', url);
  if (!STATIC.has(key) && (/^\/product\/.+-\d+$/.test(key) || key.startsWith('/product-category/'))) return redirect('/shop', url);
  return env.ASSETS.fetch(request);
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
