# Broadland Digital — website

broadlanddigital.co.uk, rebuilt from the old WordPress site and run from the CRM. Hosted on Cloudflare as the
Worker `broadland-digital-website`.

The pages are the old WordPress site's own pages, captured as WordPress served them, so the site looks exactly as
it did (same theme, menus, colours per section, galleries, footer). The CRM's pages and blog are served live inside
the same header and footer.

| Folder / file | What it is |
| --- | --- |
| `dist/` | **The live website**, built from the folders below. This is what Cloudflare serves. |
| `source/wordpress/` | Every WordPress page and product, as WordPress served it (from the capture). Edit wording here. |
| `source/wordpress-assets/` | The theme's (bd-2022) and plugins' CSS, scripts, fonts and images. |
| `site/public/` | Uploads (`wp-content/uploads`: images, PDFs) and anything else copied in as it is. |
| `site/bd-forms.js` | Sends the theme's forms to the CRM (in place of Contact Form 7). |
| `site/bd-consent.js` | The cookie banner (in place of CookieYes). Google Analytics/Ads and Linkbot ("Analytics & marketing") and the chat bot and reviews widget ("Chat & reviews") only load once a visitor agrees; the choice is kept for a year in the `bd_consent` cookie and can be changed from "Cookie settings" in the footer. |
| `content/menu.json` | The menus: the header's section dropdowns and the full-screen (hamburger) menu, with the buttons and contact line underneath. Built into every page with `site/bd-menu.css` and `site/bd-menu.js`. |
| `content/site.json` | Redirects for old addresses; the CRM's page addresses. |
| `content/wordpress.json` | The WordPress export as data (product names, dates), used for the sitemap and the CRM form notes. |
| `tools/build.mjs` | Builds `dist/`: takes out WordPress, WooCommerce, Stripe, reCAPTCHA and WP Rocket scripts, makes links local, turns "Add to basket" into "Enquire now", points the forms at the CRM. |
| `tools/capture/` | Captures the WordPress site: every address in its sitemaps (run by Actions → Capture WordPress site). |
| `.github/workflows/check-urls.yml` | Actions → Check URLs against live site: tests every live sitemap address on the new site. |
| `worker/` | The server side (below). |

## What comes from the CRM

- **SEO pages** (Marketing → SEO pages: locations, guides, comparisons, sectors, services and their hubs) are served
  live from the CRM's `seo-feed` inside the site's header and footer (`worker/crm-pages.js`). A page appears on its
  release date with no rebuild. A page published in the CRM at an address the static site also has replaces it.
  Preview links from the CRM (`?crmseo_preview=…`) work as they did on WordPress.
- **Blog** (Marketing → Blog posts) at `/blog`, from `seo-blog` (`worker/crm-blog.js`, shared with the other sites).
  The old WordPress post addresses `/guides/<slug>` redirect to `/blog/<slug>`.
- **Forms** (contact, quote, guide download, product orders, the footer form) post to `/api/forms`, which files them
  in the CRM as Broadland Digital leads (channel "Broadland Digital Web Forms"; the CRM emails
  enquiries@broadlanddigital.co.uk) (`worker/forms.js`). Until the CRM's Meta app is approved, each enquiry is also
  emailed to Boxly (`BOXLY_EMAIL` in `wrangler.jsonc`) in the old Contact Form 7 format, through SendGrid: the worker
  needs the secret `SENDGRID_API_KEY`. Delete `BOXLY_EMAIL` to stop.
- **Sitemap and llms.txt** add the CRM's pages and posts to the static ones; AI crawler visits are reported to the CRM
  (Marketing → SEO tracking) from the live domain only.

## Editing the site

1. Change the page in `source/wordpress/<address>/index.html` (or `content/site.json`, `site/`). To start again from
   WordPress, run **Actions → Capture WordPress site** while it is online (this overwrites `source/`).
2. Run `node tools/build.mjs` (Node 22+, no install needed). It lists any links to addresses the site doesn't have.
3. Commit and push — Cloudflare deploys it.

Check locally without Cloudflare: `node tools/test/serve.mjs` and open http://localhost:8787 (the CRM is stubbed out;
`CRM_FIXTURE=feed.json` serves a saved feed).

## Deploying

Cloudflare **Workers Builds** connected to this repo: every push to `main` deploys. Build command: *(none)*.
Deploy command: `npx wrangler deploy`.

## Before go-live

1. **Make the last changes on WordPress first, then capture.** Run **Actions → Capture WordPress site** once more just
   before the switch, so the copy is up to date. After the switch, edit pages here, not in WordPress.
2. Check the `*.workers.dev` preview (it is marked `noindex`). The theme's fonts (Adobe Fonts kit `qbw1hzk`) are
   registered to broadlanddigital.co.uk, so on the preview address the headings fall back to a standard font.
3. Add the routes `broadlanddigital.co.uk/*` and `www.broadlanddigital.co.uk/*` to this Worker (www redirects to the
   bare domain). Addresses are the same as WordPress's, ending in "/" (`/signage-home/`); the CRM's pages too. Old `-2` pages, `/privacy`, `/cart` and the like redirect
   (`worker/redirects.json`, built from `content/site.json`).
4. Turn off the CRM SEO Pages plugin on the old WordPress site, or retire the site.

## Not carried over

WooCommerce checkout ("Add to basket" is now "Enquire now", which fills in the enquiry form; orders arrive in the CRM
as leads), the van graphics builder's live price lookups, the account/cart/checkout pages,
the estimate/invoice/workspace app pages, the sample page, the Post SMTP email log and plugin settings.
