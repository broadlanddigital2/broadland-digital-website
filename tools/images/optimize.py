"""Makes light WebP copies of the heavy pictures the pages show without a srcset (hub tiles, homepage, galleries):
max 1200px wide, quality 80, in site/public/opt/, and writes content/opt-images.json (original path → copy), which
tools/build.mjs uses to swap the src. Run after a new capture:  python3 tools/images/optimize.py  (needs Pillow)."""
import hashlib, json, os, re, glob
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST, OUT = os.path.join(ROOT, 'dist'), os.path.join(ROOT, 'site/public/opt')
os.makedirs(OUT, exist_ok=True)
seen = {}
for f in glob.glob(os.path.join(DIST, '**/index.html'), recursive=True):
    if '/wp-content/' in f: continue
    h = open(f, encoding='utf-8').read()
    for tag in re.findall(r'<img\b[^>]*>', h):
        if 'srcset=' in tag: continue
        m = re.search(r'\bsrc="(/wp-content/uploads/[^"?]+\.(?:png|jpe?g|webp|avif))"', tag, re.I)
        if m: seen[m.group(1)] = 1
    for m in re.finditer(r'url\((/wp-content/uploads/[^)\'"?]+\.(?:png|jpe?g|webp))\)', h, re.I): seen[m.group(1)] = 1
# pictures the CRM's pages use (content/crm-image-refs.txt; the worker swaps them too)
refs = os.path.join(ROOT, 'content/crm-image-refs.txt')
if os.path.exists(refs):
    for src in open(refs).read().split():
        seen[src] = 1
# product pictures shown in the shop category grids
for src in re.findall(r'"src":\s*"(/wp-content/uploads/[^"]+)"', open(os.path.join(ROOT, 'content/wordpress.json'), encoding='utf-8').read()):
    seen[src] = 1
mapping = {}
for src in sorted(seen):
    p = os.path.join(DIST, src.lstrip('/'))
    if not os.path.exists(p) or os.path.getsize(p) < 120_000: continue
    name = hashlib.sha1(src.encode()).hexdigest()[:12] + '-' + os.path.splitext(os.path.basename(src))[0][:40] + '.webp'
    if os.path.exists(os.path.join(OUT, name)):
        mapping[src] = '/opt/' + name
        continue
    try:
        im = Image.open(p)
        im.load()
    except Exception as e:
        print('skip', src, e); continue
    if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
    if im.width > 1200: im = im.resize((1200, round(im.height * 1200 / im.width)), Image.LANCZOS)
    name = hashlib.sha1(src.encode()).hexdigest()[:12] + '-' + os.path.splitext(os.path.basename(src))[0][:40] + '.webp'
    dst = os.path.join(OUT, name)
    im.save(dst, 'WEBP', quality=78, method=4)
    if os.path.getsize(dst) < os.path.getsize(p) * 0.9:
        mapping[src] = '/opt/' + name
        print(f'{os.path.getsize(p)//1024:>5}K → {os.path.getsize(dst)//1024:>4}K  {src}')
    else:
        os.remove(dst)
json.dump(mapping, open(os.path.join(ROOT, 'content/opt-images.json'), 'w'), indent=1)
print(len(mapping), 'optimised')
