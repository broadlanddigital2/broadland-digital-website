"""Records the pixel size of every picture the pages use (content/img-sizes.json: path → [w, h]), so tools/build.mjs
can give each <img> its width and height (stops the page jumping as it loads). Run after a capture."""
import json, os, re, glob
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
srcs = set()
for f in glob.glob(os.path.join(ROOT, 'dist/**/index.html'), recursive=True):
    if '/wp-content/' in f: continue
    for m in re.finditer(r'<img\b[^>]*\ssrc="(/[^/"][^"?]+)', open(f, encoding='utf-8', errors='ignore').read()): srcs.add(m.group(1))
out = {}
for s in sorted(srcs):
    for base in ('dist', 'site/public'):
        p = os.path.join(ROOT, base, s.lstrip('/'))
        if os.path.exists(p):
            try:
                if p.endswith('.svg'):
                    t = open(p, errors='ignore').read(2000)
                    m = re.search(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"', t)
                    if m: out[s] = [round(float(m.group(1))), round(float(m.group(2)))]
                else:
                    with Image.open(p) as im: out[s] = list(im.size)
            except Exception: pass
            break
json.dump(out, open(os.path.join(ROOT, 'content/img-sizes.json'), 'w'), separators=(',', ':'))
print(len(srcs), 'used,', len(out), 'measured')
