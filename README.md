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
| `site/bd-forms.js` | The footer's enquiry form and the theme's own forms (quote, guide, product): checks each field with a clear message, then sends them to `/api/forms` (in place of Contact Form 7). |
| `site/bd-consent.js` | The cookie banner (in place of CookieYes). Google Analytics/Ads and Linkbot ("Analytics & marketing") and the chat bot and reviews widget ("Chat & reviews") only load once a visitor agrees; the choice is kept for a year in the `bd_consent` cookie and can be changed from "Cookie settings" in the footer. |
| `content/menu.json` | The header links, the full-screen (hamburger) menu and the footer (enquiry form wording, contact details, link columns, legal and social links). Built into every page with `site/bd-menu.*` and `site/bd-footer.css`. |
| `content/hubs.json` | The five section hubs (Signage, Print, Design, Web Dev, Liquid Wrapping): heading, intro, how it works and FAQs. Their "Guides & resources" (the CRM's guides, comparisons, areas and matching blog posts) are added live by `worker/hub-resources.js`. |
| `content/site.json` | Redirects for old addresses; the CRM's page addresses. |
| `content/business-signs.json` | The business signs section (hub, categories, products): names, URLs, keywords, meta, options, image plan, copy and prices. Built by `tools/business-signs.mjs` (below). |
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

## Shop products (`/product/…`: van graphics, liquid wrapping, Full Dip)

The 57 shop products are edited in the CRM: **Commerce → Products** with Broadland Digital chosen (table
`shop_products`, imported from the WordPress products on 28 Nov 2026). Saved changes go live with the hourly
**Publish from CRM**: `tools/fetch-crm.mjs` saves them to `crm-data/shop-products.json` (seo-feed `?products=1`) and,
when they changed, rebuilds the site.

- **What the CRM controls:** title (renaming it also changes the page heading), price (van packages: "From £… + VAT",
  blank = "Quoted per van"; Full Dip: blank = "Priced on request"; liquid wrapping pages always say "Quoted per
  vehicle"), price note, shop categories, short intro, description (blank lines = paragraphs), the tick list, images
  (first = main picture, the rest = the "Vans we've done" gallery), FAQs, meta title and description, and Live/Hidden.
- **Hidden** products aren't built: their address redirects to `/shop/` and they drop out of the shop lists and switches.
- **Blank fields** keep the page's own wording, so the site is unchanged until something is edited.
- `tools/build.mjs` applies them (`SHOP`, `productContent()`); the page designs stay in the build. A product added
  in the CRM with an address the site doesn't have isn't built yet (each product type has its own page design).
- `BD_EXPORT_PRODUCTS=1 node tools/build.mjs` writes what every product page shows to
  `content/shop-products-export.json` (how the import was made).

## Business signs section (`/business-signs/`)

A shop-style section: a hub, 25 categories and 195 products, edited in the CRM and built (with `content/business-signs.json`) by
`tools/business-signs.mjs` into `dist/business-signs/`, inside the site's header and footer (styles:
`site/bd-business-signs.css`).

- **Staging (now):** `"staging": true` in the JSON. The worker serves these pages **only on the preview address**
  (`broadland-digital-website.justin-b8f.workers.dev/business-signs/`); broadlanddigital.co.uk answers 404. Pages are
  noindex, left out of the sitemap, and each shows a yellow SEO panel (keywords, title and description lengths, image
  plan) plus "to be written / to be set" markers.
- **Edit in the CRM:** every page is a CRM SEO page (Marketing → SEO pages → Broadland Digital → Pages; templates
  "Business sign product" and "Business sign category"). Headings, meta titles and descriptions, keywords (first =
  primary), summary, price, photos, description, key features, specs, uses, installation, included, good to know,
  FAQs and the dropdowns are fields. **Publish** the page in the CRM: the hourly **Publish from CRM** workflow (or the
  CRM's crm-publish dispatch) saves published pages to `crm-data/business-signs.json` and rebuilds the section
  (`tools/business-signs-crm.mjs` applies them over the JSON). A page published under `/business-signs/<category>/`
  that the JSON doesn't have becomes a new product; unpublishing a page removes it. The CRM's Preview button shows
  unsaved wording in the CRM's own layout.
- **Dropdowns:** in the CRM, one row per option: a label and its choices one per line; `Matt black | 5` adds £5 (ex
  VAT). For a size box leave the choices empty and fill in min and max (max 0 = no limit). "Enquire with these options"
  sends the choices through the site's enquiry form to the CRM; with a price set the page shows a running total.
- **Prices:** "Price from" in the CRM (ex VAT): the page shows "From £45 + VAT" and gets Product/Offer structured
  data. Without one, live pages say "Price on request".
- **Photos:** either upload in the CRM's image picker, or save the planned file (e.g. `clear-acrylic-sign-front.webp`)
  in `site/public/img/business-signs/` and pick `/img/business-signs/<file>` in the CRM.
- **Stays in the JSON:** the staging switch, the how-to guides and artwork checklist, the copy briefs and photo plans
  (shown in the SEO panel), and the fallback copy used if the CRM has nothing published.
- **Go live:** set `"staging": false`, run `node tools/build.mjs`, commit and push. The pages then appear on the live
  domain, lose noindex and the SEO panel, and join the sitemap. Add menu links at the same time.

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
