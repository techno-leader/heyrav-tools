# heyrav library

Everything tried on the way to [heyrav.in](https://heyrav.in), live at **tools.heyrav.in**:
the instruments (`tools/`), the home page at each milestone (`hero-*.html`, rebuilt from the
portfolio's git history), every project-thumbnail treatment, and the benches each design decision
was made on.

Static, no build step to serve. To regenerate from the portfolio:

```
python3 scripts/collect.py      # copy benches, rebuild hero snapshots, copy referenced assets
python3 -m http.server 8132 &   # serve for the screenshots
node scripts/thumbs.js          # screenshot every entry in scripts/library.json
python3 scripts/build.py        # webp thumbnails + index.html
```

Add an exploration by adding it to `scripts/library.json` (and to `BENCHES` in `collect.py` if it
lives in the portfolio repo).
