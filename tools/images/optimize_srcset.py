"""WebP copies (same size, quality 78) of the heavy PNG/JPG sizes WordPress lists in srcset attributes, so phones and
laptops download the light version. Writes site/public/opt/s/ and content/opt-srcset.json (original → copy); the build
swaps them into srcset/src. Re-runs skip files already done.  python3 tools/images/optimize_srcset.py"""
import hashlib, json, os, re, glob, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST, OUT = os.path.join(ROOT, 'dist'), os.path.join(ROOT, 'site/public/opt/s')
os.makedirs(OUT, exist_ok=True)
seen = {}
for f in glob.glob(os.path.join(DIST, '**/index.html'), recursive=True):
    if '/wp-content/' in f: continue
    for ss in re.findall(r'srcset="([^"]+)"', open(f, encoding='utf-8').read()):
        for part in ss.split(','):
            bits = part.strip().split(' ')
            if bits[0].startswith('/wp-content/uploads/') and not bits[0].lower().endswith('.webp'): seen[bits[0]] = 1
mp = os.path.join(ROOT, 'content/opt-srcset.json')
mapping = json.load(open(mp)) if os.path.exists(mp) else {}
limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10**9
done = 0
for src in sorted(seen):
    p = os.path.join(DIST, src.lstrip('/'))
    if src in mapping or not os.path.exists(p) or os.path.getsize(p) < 100_000: continue
    if done >= limit: break
    name = hashlib.sha1(src.encode()).hexdigest()[:12] + '-' + os.path.splitext(os.path.basename(src))[0][:40] + '.webp'
    dst = os.path.join(OUT, name)
    try:
        im = Image.open(p); im.load()
        if im.width > 2600: continue
        if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB')
        im.save(dst, 'WEBP', quality=78, method=4)
    except Exception as e:
        print('skip', src, e); continue
    if not os.path.exists(p) or not os.path.exists(dst): continue
    if os.path.getsize(dst) < os.path.getsize(p) * 0.8: mapping[src] = '/opt/s/' + name
    else: os.remove(dst)
    done += 1
    if done % 20 == 0: json.dump(mapping, open(mp, 'w'), indent=0)
json.dump(mapping, open(mp, 'w'), indent=0)
print(len(mapping), 'in map;', done, 'processed this run;', sum(1 for s in seen if s not in mapping), 'left (incl. small/skipped)')
