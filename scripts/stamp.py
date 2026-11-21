#!/usr/bin/env python3
"""Fingerprint the shared tool files where pages load them.

GitHub Pages caches every file for ten minutes on its own clock, so after a
deploy a browser can pair a fresh page with a stale script - a new control
that does nothing. Each local reference to a shared file gets ?v=<hash of
that file's content>, so a page always asks for the exact version it was
built with, and an unchanged file keeps its cached copy.

Run before committing:  python3 scripts/stamp.py
"""
import glob, hashlib, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED = ['kit.js', 'kit.css', 'brand.js', 'window-light.js', 'scroll-nav.js', 'paper-pixel.js', 'paper-assets.js', 'pixel-sprites.js', 'water-sea.js', 'nacre.js', 'contour.js', 'sea3d.js', 'aurora-sky.js']
HASH = {n: hashlib.sha1(open(os.path.join(ROOT, 'tools', n), 'rb').read()).hexdigest()[:10] for n in SHARED}

# a real attribute, optionally under tools/ - never the assets/... paths quoted
# inside the "copy for the site" snippets
REF = re.compile(r'((?:src|href)=")((?:tools/)?)(' + '|'.join(re.escape(n) for n in SHARED) + r')(?:\?v=[0-9a-f]+)?(")')

changed = []
for path in glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'tools', '*.html')) + glob.glob(os.path.join(ROOT, 'herbius', '*.html')):
    s = open(path).read()
    t = REF.sub(lambda m: f'{m.group(1)}{m.group(2)}{m.group(3)}?v={HASH[m.group(3)]}{m.group(4)}', s)
    if t != s:
        open(path, 'w').write(t)
        changed.append(os.path.relpath(path, ROOT))
print('stamped', len(changed), 'pages:', ', '.join(sorted(changed)) or 'none')
