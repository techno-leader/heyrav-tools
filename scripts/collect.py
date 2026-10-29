#!/usr/bin/env python3
"""Collect heyrav's explorations into the library (tools.heyrav.in).

Copies every bench from the portfolio repo, rebuilds the home page as it stood at
each milestone commit, brings in the early hero files that predate the repo, and
copies only the assets those pages actually reference. A page that builds an
asset path at runtime ('assets/grid/' + name) gets that whole folder, unless the
folder is one of the heavy ones, which are copied file by file.

Run from anywhere:  python3 scripts/collect.py
"""
import json, os, re, shutil, subprocess, sys

SRC = os.path.expanduser('~/portfolio')
DL = os.path.expanduser('~/Downloads')
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEAVY = {'assets/museum', 'assets/ad-studio', 'assets/irbs-legacy'}  # never copied wholesale

# the benches: gitignored in the portfolio, so this is their first public home
BENCHES = ['aurora', 'bar', 'btn', 'codebg', 'foot', 'glitch', 'grid', 'loader', 'mark',
           'particles', 'redaction', 'reel', 'review', 'tokens', 'lab-evidence', 'lab-design-review']
# (out name, commit, path in that commit) - the home page at each milestone
HISTORY = [
    ('hero-2026-07-07-lavender', 'e854529', 'portfolio/ravindra-hero.html'),
    ('hero-2026-08-19-cluster', '1ec9e0d', 'index.html'),
    ('hero-2026-08-23-particles', '7c648b2', 'index.html'),
    ('hero-2026-09-11-monochrome', 'ea9c23d', 'index.html'),
    ('hero-2026-09-14-hint', '75887a1', 'index.html'),
    ('hero-2026-09-20-drum', '0d52d41', 'index.html'),
    ('hero-2026-09-21-one-screen', 'a0da68e', 'index.html'),
]
# folders the tools themselves read (tools/wall.html)
EXTRA = ['herbius/assets/ads', 'assets/grid', 'assets/about', 'assets/lab/001']
EARLY = [
    ('hero-2026-07-05-flower', os.path.join(DL, 'ravindra-hero-flower.html')),
]

REF = re.compile(r"""(?<![\w/.-])((?:assets|herbius/assets)/[\w\-./]+?\.(?:webp|png|jpe?g|svg|gif|mp4|webm|woff2?|json|pdf))""")
DIR = re.compile(r"""['"`]((?:assets|herbius/assets)/[\w\-]+/)(?:['"`]\s*\+|\$\{)""")
# links that leave the library for the live site
LIVE = re.compile(r"""(href=["'])((?:case-[\w-]+|museum|components|herbius/case-herbius)\.html|resume\.pdf)""")

def git(*a, binary=False):
    r = subprocess.run(['git', '-C', SRC, *a], capture_output=True)
    if r.returncode: return None
    return r.stdout if binary else r.stdout.decode()

def live(t): return LIVE.sub(lambda m: m.group(1) + 'https://heyrav.in/' + m.group(2), t)

def put(rel, data):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f: f.write(data)

def copy_asset(rel, commit=None, prefix=''):
    dest = os.path.join(OUT, rel)
    if os.path.exists(dest): return 'have'
    src = os.path.join(SRC, rel)
    if os.path.isfile(src): os.makedirs(os.path.dirname(dest), exist_ok=True); shutil.copy2(src, dest); return 'tree'
    if commit:
        b = git('show', f'{commit}:{prefix}{rel}', binary=True)
        if b: put(rel, b); return 'git'
    return 'missing'

def assets_for(text, commit=None, prefix=''):
    stats = {}
    for d in set(DIR.findall(text)):
        d = d.rstrip('/')
        if d in HEAVY: continue
        if commit:   # the folder as it stood then
            for fn in (git('ls-tree', '--name-only', f'{commit}:{prefix}{d}') or '').split():
                k = copy_asset(f'{d}/{fn}', commit, prefix); stats[k] = stats.get(k, 0) + 1
            continue
        if not os.path.isdir(os.path.join(SRC, d)): continue
        for fn in os.listdir(os.path.join(SRC, d)):
            if os.path.isfile(os.path.join(SRC, d, fn)): k = copy_asset(f'{d}/{fn}'); stats[k] = stats.get(k, 0) + 1
    for rel in set(REF.findall(text)):
        k = copy_asset(rel, commit, prefix); stats[k] = stats.get(k, 0) + 1
        if k == 'missing': stats.setdefault('_missing', []).append(rel)
    return stats

def main():
    log = {}
    for b in BENCHES:
        t = open(os.path.join(SRC, b + '.html'), encoding='utf-8').read()
        put(b + '.html', live(t).encode()); log[b] = assets_for(t)
    t = open(os.path.join(SRC, 'herbius/bench-system.html'), encoding='utf-8').read()
    put('herbius/bench-system.html', t.encode())
    # its paths are relative to herbius/
    for rel in set(re.findall(r"""['"(]((?:assets)/[\w\-./]+?\.(?:webp|png|jpe?g|svg|woff2?|mp4))""", t)):
        copy_asset('herbius/' + rel)
    for name, commit, path in HISTORY:
        t = git('show', f'{commit}:{path}')
        prefix = 'portfolio/' if path.startswith('portfolio/') else ''
        put(name + '.html', live(t).encode()); log[name] = assets_for(t, commit, prefix)
    for name, path in EARLY:
        t = open(path, encoding='utf-8').read(); put(name + '.html', live(t).encode()); log[name] = assets_for(t)
    for d in EXTRA:
        for fn in os.listdir(os.path.join(SRC, d)): copy_asset(f'{d}/{fn}')
    shutil.copy2(os.path.join(SRC, 'assets/brand/favicon-32.png'), os.path.join(OUT, 'favicon-32.png'))
    json.dump(log, open(os.path.join(OUT, 'scripts/collect-log.json'), 'w'), indent=1)
    for k, v in log.items():
        print(k, {a: b for a, b in v.items() if a != '_missing'}, ('MISSING ' + ', '.join(v['_missing'][:4])) if v.get('_missing') else '')

if __name__ == '__main__':
    main()
