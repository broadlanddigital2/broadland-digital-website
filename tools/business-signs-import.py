"""Import 'Ready' rows from business-signs-rewrite.xlsx into content/business-signs.json.
Usage: python3 tools/business-signs-import.py <business-signs-rewrite.xlsx> [content/business-signs.json]  (needs openpyxl)
The workbook itself (with the UK Sign Shop reference text) is private and must never be committed here."""
import json, re, sys
from openpyxl import load_workbook

wbp = sys.argv[1]
SITE = sys.argv[2] if len(sys.argv) > 2 else 'content/business-signs.json'
site = json.load(open(SITE))
prods = {p['ref']: p for p in site['products']}
cats = {c['key']: c for c in site['categories']}
wb = load_workbook(wbp)

def paras(t): return [re.sub(r'\s*\n\s*', ' ', x).strip() for x in re.split(r'\n\s*\n', str(t or '').strip()) if x.strip()]
def lines(t): return [re.sub(r'^[\-•*]\s*', '', x).strip() for x in str(t or '').splitlines() if x.strip()]
def faqs(t):
    out, q = [], None
    for ln in str(t or '').splitlines():
        ln = ln.strip()
        if re.match(r'^Q[:.]', ln, re.I): q = ln[2:].strip()
        elif re.match(r'^A[:.]', ln, re.I) and q: out.append({'q': q, 'a': ln[2:].strip()}); q = None
        elif out and ln and not q: out[-1]['a'] += ' ' + ln
    return out

def col(ws, name): return [c.value for c in ws[1]].index(name)
n_p = n_c = 0; issues = []
ws = wb['Product rewrite']
ix = {k: col(ws, k) for k in ('Ref', 'Our description', 'Our key features', "Our what's included", 'Our good to know', 'Status')}
for row in ws.iter_rows(min_row=2, values_only=True):
    if str(row[ix['Status']] or '').strip().lower() != 'ready': continue
    p = prods.get(row[ix['Ref']])
    if not p: issues.append(f'unknown ref {row[ix["Ref"]]}'); continue
    p['description'] = paras(row[ix['Our description']]); p['facts'] = lines(row[ix['Our key features']])
    p['included'] = lines(row[ix["Our what's included"]]); p['goodToKnow'] = lines(row[ix['Our good to know']])
    words = sum(len(x.split()) for x in p['description'])
    if words < 80: issues.append(f"{p['ref']}: description only {words} words")
    if p['primary'].lower() not in ' '.join(p['description']).lower(): issues.append(f"{p['ref']}: primary keyword '{p['primary']}' not in description")
    n_p += 1
ws = wb['Category rewrite']
ix = {k: col(ws, k) for k in ('Key', 'Our intro', 'Our FAQs', 'Status')}
for row in ws.iter_rows(min_row=2, values_only=True):
    if str(row[ix['Status']] or '').strip().lower() != 'ready': continue
    c = cats.get(row[ix['Key']])
    if not c: issues.append(f'unknown category {row[ix["Key"]]}'); continue
    c['intro'] = paras(row[ix['Our intro']]); c['faqs'] = faqs(row[ix['Our FAQs']])
    n_c += 1
json.dump(site, open(SITE, 'w'), indent=1, ensure_ascii=False)
print(f'Imported {n_p} products, {n_c} categories.'); print('\n'.join(issues) or 'No issues.')
