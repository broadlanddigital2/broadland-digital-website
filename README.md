# Broadland Digital — website

broadlanddigital.co.uk, rebuilt from the old WordPress site and run from the CRM. Hosted on Cloudflare as the
Worker `broadland-digital-website`.

| Folder / file | What it is |
| --- | --- |
| `dist/` | **The live website**: the static pages built from `content/`. This is what Cloudflare serves. |
| `content/wordpress.json` | Every page, product and post from the old WordPress site (wording, sections, galleries, SEO title and description). Edit wording here. |
| `content/site.json` | Menu, footer, page names, redirects, which products show on which page. |
| `site/` | `styles.css`, `site.js` and `public/` (files copied into `dist/` as they are, e.g. `wp-content/uploads`). |
| `tools/build.mjs` | Builds `dist/` from `content/` and `site/`. |
| `tools/wordpress-import/extract.py` | One-off: turned the WordPress export files into `content/wordpress.json`. |
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
  enquiries@broadlanddigital.co.uk) (`worker/forms.js`).
- **Sitemap and llms.txt** add the CRM's pages and posts to the static ones; AI crawler visits are reported to the CRM
  (Marketing → SEO tracking) from the live domain only.

## Editing the site

1. Change `content/wordpress.json`, `content/site.json` or `site/`.
2. Run `node tools/build.mjs` (Node 22+, no install needed). It lists any links to addresses the site doesn't have.
3. Commit and push — Cloudflare deploys it.

Check locally without Cloudflare: `node tools/test/serve.mjs` and open http://localhost:8787 (the CRM is stubbed out;
`CRM_FIXTURE=feed.json` serves a saved feed).

## Deploying

Cloudflare **Workers Builds** connected to this repo: every push to `main` deploys. Build command: *(none)*.
Deploy command: `npx wrangler deploy`.

## Before go-live

1. **Images and PDFs.** Until they're in the repo, `/wp-content/uploads/...` files are fetched from the old WordPress
   site (`OLD_SITE_ORIGIN` in `wrangler.jsonc`). Run **Actions → Import WordPress uploads** while WordPress is still
   online: it copies the 275 files the site uses into `site/public/`, rebuilds and commits.
2. Check the `*.workers.dev` preview (it is marked `noindex`).
3. Add the routes `broadlanddigital.co.uk/*` and `www.broadlanddigital.co.uk/*` to this Worker (www redirects to the
   bare domain). Old WordPress addresses with trailing slashes, `-2` pages, `/privacy`, `/cart` and the like redirect
   (`worker/redirects.json`, built from `content/site.json`).
4. Turn off the CRM SEO Pages plugin on the old WordPress site, or retire the site.

## Not carried over

WooCommerce checkout (product pages now take an order enquiry into the CRM instead), the account/cart/checkout pages,
the estimate/invoice/workspace app pages, the sample page, the Post SMTP email log and plugin settings.
