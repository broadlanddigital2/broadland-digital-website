"""One-off: turns the old WordPress site's export files (Tools → Export, one XML per content type) into
content/wordpress.json, which tools/build.mjs turns into the static pages.

    python3 -I tools/wordpress-import/extract.py <folder of .xml exports> content/wordpress.json

Kept: published pages (wording, ACF sections, galleries, SEO title and description), WooCommerce products, blog posts
and every image they use. Left out: WooCommerce/app pages (cart, checkout, account, estimate, invoice, workspace), sent
emails (Post SMTP log), plugin records and drafts.
"""
import glob, html, json, re, sys
import xml.etree.ElementTree as ET

NS = {'wp': 'http://wordpress.org/export/1.2/', 'content': 'http://purl.org/rss/1.0/modules/content/',
      'excerpt': 'http://wordpress.org/export/1.2/excerpt/'}
ORIGIN = 'https://broadlanddigital.co.uk'
SKIP_PATHS = {'/sample-page', '/shop', '/checkout', '/my-account', '/cart', '/estimate', '/invoice', '/workspace', '/blog'}


def php_unserialize(s):
    """Just enough of PHP's unserialize for ACF values (arrays, strings, ints, bools)."""
    s = s.encode('utf-8')
    pos = 0

    def read():
        nonlocal pos
        t = chr(s[pos])
        if t == 'N':
            pos += 2
            return None
        if t in 'ibd':
            end = s.index(b';', pos)
            v = s[pos + 2:end].decode()
            pos = end + 1
            return {'i': int, 'b': lambda x: x == '1', 'd': float}[t](v)
        if t == 's':
            colon = s.index(b':', pos + 2)
            n = int(s[pos + 2:colon])
            v = s[colon + 2:colon + 2 + n].decode('utf-8', 'replace')
            pos = colon + 2 + n + 2
            return v
        if t == 'a':
            colon = s.index(b':', pos + 2)
            n = int(s[pos + 2:colon])
            pos = colon + 2
            out = {}
            for _ in range(n):
                k = read()
                out[k] = read()
            pos += 1
            return out
        raise ValueError('unsupported php type ' + t)

    try:
        return read()
    except Exception:
        return None


def items(folder):
    seen = set()
    for f in sorted(glob.glob(folder + '/*.xml')):
        for it in ET.parse(f).getroot().findall('.//item'):
            pid = it.findtext('wp:post_id', namespaces=NS)
            if pid in seen:
                continue
            seen.add(pid)
            meta = {}
            for m in it.findall('wp:postmeta', namespaces=NS):
                meta.setdefault(m.findtext('wp:meta_key', namespaces=NS), m.findtext('wp:meta_value', namespaces=NS) or '')
            yield {
                'id': pid, 'type': it.findtext('wp:post_type', namespaces=NS), 'status': it.findtext('wp:status', namespaces=NS),
                'title': it.findtext('title') or '', 'link': it.findtext('link') or '', 'slug': it.findtext('wp:post_name', namespaces=NS),
                'parent': it.findtext('wp:post_parent', namespaces=NS), 'order': int(it.findtext('wp:menu_order', namespaces=NS) or 0),
                'content': it.findtext('content:encoded', namespaces=NS) or '', 'excerpt': it.findtext('excerpt:encoded', namespaces=NS) or '',
                'date': it.findtext('wp:post_date_gmt', namespaces=NS), 'modified': it.findtext('wp:post_modified_gmt', namespaces=NS),
                'attachment_url': it.findtext('wp:attachment_url', namespaces=NS),
                'cats': [(c.get('domain'), c.get('nicename'), c.text) for c in it.findall('category')], 'meta': meta,
            }


def local(url):
    """Site address → path on the new site (keeps other sites' addresses as they are)."""
    if not url:
        return ''
    u = url.strip()
    u = re.sub(r'^https?://(www\.)?broadlanddigital\.co\.uk', '', u)
    if u.startswith('http'):
        return u
    u = u.split('#')[0] if u.startswith('#') is False and '#' in u and u.split('#')[0] else u
    if u.startswith('/') and not u.startswith('/wp-content/') and len(u) > 1:
        u = u.rstrip('/')
    return u or '/'


def clean_html(raw):
    h = re.sub(r'<!--.*?-->', '', raw, flags=re.S)
    h = re.sub(r'<p>\s*(<br\s*/?>)?\s*</p>', '', h)
    h = re.sub(r'\s(class|style|id)="[^"]*"', lambda m: m.group(0) if m.group(1) == 'class' and 'wp-block-table' in m.group(0) else '', h)
    h = re.sub(r'href="(https?://(www\.)?broadlanddigital\.co\.uk[^"]*)"', lambda m: f'href="{local(m.group(1))}"', h)
    h = re.sub(r'src="https?://(www\.)?broadlanddigital\.co\.uk(/wp-content/[^"]*)"', r'src="\2"', h)
    h = re.sub(r'\[/?[a-z_\-]+[^\]]*\]', '', h)  # leftover shortcodes
    h = re.sub(r'\n{3,}', '\n\n', h).strip()
    return h


def br_text(s):
    return re.sub(r'\s*<br\s*/?>\s*', ' ', html.unescape(s or '')).strip()


def acf_list(meta, name, fields):
    n = meta.get(name)
    try:
        n = int(n)
    except (TypeError, ValueError):
        return []
    return [{f: meta.get(f'{name}_{i}_{f}', '') for f in fields} for i in range(n)]


def link_of(v, pages_by_id):
    if not v:
        return ''
    if str(v).isdigit():
        p = pages_by_id.get(str(v))
        return p['path'] if p else ''
    d = php_unserialize(v)
    if isinstance(d, dict):
        return local(d.get('url', ''))
    return local(v)


def main(folder, out):
    all_items = list(items(folder))
    att = {}
    for it in all_items:
        if it['type'] == 'attachment' and it['attachment_url']:
            md = php_unserialize(it['meta'].get('_wp_attachment_metadata', '')) or {}
            att[it['id']] = {'src': local(it['attachment_url']), 'alt': it['meta'].get('_wp_attachment_image_alt', '') or '',
                             'w': md.get('width') if isinstance(md, dict) else None, 'h': md.get('height') if isinstance(md, dict) else None}
    used = set()

    def image(i):
        a = att.get(str(i or ''))
        if a:
            used.add(a['src'])
        return a

    pages = [it for it in all_items if it['type'] == 'page' and it['status'] == 'publish']
    for p in pages:
        p['path'] = local(p['link'])
    by_id = {p['id']: p for p in pages}
    products_raw = [it for it in all_items if it['type'] == 'product' and it['status'] == 'publish' and it['slug'] != 'ttest']
    product_path = {p['id']: local(p['link']) for p in products_raw}

    out_pages = []
    for p in pages:
        if p['path'] in SKIP_PATHS:
            continue
        m = p['meta']
        tpl = (m.get('_wp_page_template') or 'default').replace('.php', '')
        seo_title = (m.get('meta_title') or m.get('rank_math_title') or m.get('meta_data_meta_title') or '').strip()
        seo_title = seo_title.replace('%sitename%', 'Broadland Digital')
        seo_desc = (m.get('meta_desc') or m.get('rank_math_description') or m.get('meta_data_meta_desc') or '').strip()
        page = {
            'path': p['path'], 'wpId': p['id'], 'template': tpl, 'title': html.unescape(p['title']),
            'parent': by_id[p['parent']]['path'] if p['parent'] in by_id else None, 'order': p['order'],
            'heading': br_text(m.get('title')) or '', 'subtitle': br_text(m.get('subtitle')),
            'seoTitle': seo_title, 'seoDescription': seo_desc, 'noindex': 'noindex' in (m.get('rank_math_robots') or ''),
            'image': image(m.get('_thumbnail_id')) or image(m.get('banner_image')),
            'html': clean_html(p['content']), 'modified': p['modified'],
        }
        sections = []
        blocks = acf_list(m, 'section_blocks', ['name', 'image', 'link'])
        if blocks:
            sections.append({'kind': 'tiles', 'items': [{'title': br_text(b['name']), 'image': image(b['image']), 'href': link_of(b['link'], by_id)} for b in blocks]})
        sub = acf_list(m, 'pages', ['link', 'title', 'subtext', 'image'])
        if sub:
            sections.append({'kind': 'cards', 'title': br_text(m.get('section_2_title')) or 'Our services', 'items': [
                {'title': br_text(s['title']) or (by_id.get(s['link'], {}).get('title', '')), 'text': br_text(s['subtext']), 'image': image(s['image']),
                 'href': link_of(s['link'], by_id)} for s in sub]})
        svc = acf_list(m, 'services', ['title', 'content', 'image', 'link'])
        if svc:
            sections.append({'kind': 'cards', 'title': 'Related services', 'items': [
                {'title': br_text(s['title']), 'text': br_text(re.sub('<[^>]+>', ' ', s['content'])), 'image': image(s['image']), 'href': link_of(s['link'], by_id)} for s in svc]})
        if m.get('enable_products') == '1':
            pr = acf_list(m, 'products', ['title', 'product_description', 'price', 'image'])
            if pr and not any('dsdssds' in x['product_description'] for x in pr):
                sections.append({'kind': 'packages', 'title': br_text(m.get('products_title')), 'items': [
                    {'title': br_text(x['title']), 'text': x['product_description'].strip(), 'price': x['price'], 'image': image(x['image'])} for x in pr]})
        if m.get('woo_block_enabled') == '1' or m.get('show_shop') == '1':
            ids = [x['product'] for x in acf_list(m, 'products2', ['product'])]
            prods = [product_path.get(i) for i in ids if product_path.get(i)]
            if prods:
                sections.append({'kind': 'products', 'title': br_text(m.get('woo_block_title')) or 'Packages', 'subtitle': br_text(m.get('woo_block_subtitle')), 'items': prods})
        gal = php_unserialize(m.get('gallery') or '')
        if isinstance(gal, dict) and gal:
            imgs = [image(v) for v in gal.values()]
            imgs = [i for i in imgs if i]
            if imgs:
                sections.append({'kind': 'gallery', 'title': br_text(m.get('gallery_title')) or 'Gallery', 'items': imgs})
        details = [br_text(x['line']) for x in acf_list(m, 'details', ['line']) if x['line']]
        if details:
            sections.append({'kind': 'list', 'title': br_text(m.get('details_title')), 'items': details})
        if tpl in ('page-form', 'contact-page', 'get-a-quote'):
            fe = m.get('form_element') or ''
            form = 'guide' if 'id="593"' in fe else 'quote' if 'id="704"' in fe else 'contact'
            sections.append({'kind': 'form', 'form': form, 'title': br_text(m.get('form_title')), 'text': br_text(m.get('form_desc') or m.get('form_description')),
                             'subtitle': br_text(m.get('form_subtitle')), 'subtext': br_text(m.get('form_subtext'))})
            if not page['image']:
                page['image'] = image(m.get('banner_image'))
        if m.get('cta_cta_title') and m.get('woo_block_enabled') == '1':
            sections.append({'kind': 'cta', 'title': br_text(m.get('cta_cta_title')), 'text': br_text(m.get('cta_cta_subtitle')), 'button': br_text(m.get('cta_cta_button_text'))})
        page['sections'] = sections
        for src in re.findall(r'src="(/wp-content/[^"]+)"', page['html']):
            used.add(src)
        out_pages.append(page)

    products = []
    for p in products_raw:
        m = p['meta']
        gal = [image(i) for i in (m.get('_product_image_gallery') or '').split(',') if i]
        cats = [c[2] for c in p['cats'] if c[0] == 'product_cat']
        price = m.get('_price') or m.get('_regular_price') or ''
        try:
            price = float(price) if float(price) > 0 else None
        except ValueError:
            price = None
        products.append({
            'path': product_path[p['id']], 'wpId': p['id'], 'title': html.unescape(p['title']), 'price': price,
            'categories': cats, 'html': clean_html(p['content']), 'summary': clean_html(p['excerpt']),
            'image': image(m.get('_thumbnail_id')), 'gallery': [g for g in gal if g],
            'seoTitle': (m.get('rank_math_title') or '').replace('%sitename%', 'Broadland Digital').strip(),
            'seoDescription': (m.get('rank_math_description') or '').strip(), 'modified': p['modified'],
        })

    posts = []
    for p in all_items:
        if p['type'] == 'post' and p['status'] == 'publish':
            m = p['meta']
            posts.append({'path': local(p['link']), 'slug': p['slug'], 'title': html.unescape(p['title']), 'excerpt': p['excerpt'],
                          'html': clean_html(p['content']), 'image': image(m.get('_thumbnail_id')), 'date': p['date'],
                          'seoTitle': m.get('rank_math_title') or '', 'seoDescription': m.get('rank_math_description') or ''})

    brochures = []
    for p in all_items:
        if p['type'] == 'dflip' and p['status'] == 'publish':
            d = php_unserialize(p['meta'].get('_dflip_data', '')) or {}
            if d.get('pdf_source'):
                src = local(d['pdf_source'])
                used.add(src)
                brochures.append({'title': html.unescape(p['title']), 'pdf': src})

    used.add('/wp-content/uploads/2023/03/Broadland_Digital_Logo.svg')
    data = {'source': 'WordPress export of broadlanddigital.co.uk, 2 November 2026', 'pages': sorted(out_pages, key=lambda x: x['path']),
            'products': sorted(products, key=lambda x: x['path']), 'posts': posts, 'brochures': brochures,
            'uploads': sorted(u for u in used if u.startswith('/wp-content/'))}
    with open(out, 'w') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"{len(out_pages)} pages, {len(products)} products, {len(posts)} posts, {len(brochures)} brochures, {len(data['uploads'])} files used")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
