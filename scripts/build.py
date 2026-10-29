#!/usr/bin/env python3
"""Build the library home page (index.html) from scripts/library.json.

Also turns the screenshots from scripts/thumbs.js (thumbs/*.png, 1440x900) into
960x600 webp. Run after thumbs.js:  python3 scripts/build.py
"""
import glob, html, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lib = json.load(open(os.path.join(ROOT, 'scripts/library.json')))

for f in glob.glob(os.path.join(ROOT, 'thumbs/*.png')):
    Image.open(f).convert('RGB').resize((960, 600), Image.LANCZOS).save(f[:-4] + '.webp', quality=80, method=6)
    os.remove(f)

def shot(it): return it.get('shot') or it['file'].replace('.html', '').replace('/', '-')
def e(s): return html.escape(s, quote=True)

CLARITY = """<!-- Microsoft Clarity - the same project as heyrav.in -->
<script>
  (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","ysfrdr3mko");
</script>"""

def card(it):
    href = it.get('href') or (it['file'] + ('#' + it['hash'] if it.get('hash') else ''))
    ext = ' target="_blank" rel="noopener"' if it.get('href') else ''
    tag = f'<span class="tag">{e(it["tag"])}</span>' if it.get('tag') else ''
    img = f'thumbs/{shot(it)}.webp'
    alt = e(f'{it["title"]} - {it["note"]}')[:240]
    return f'''      <a class="item rv" href="{e(href)}"{ext}>
        <span class="shot"><img src="{img}" alt="{alt}" loading="lazy" width="960" height="600"></span>
        <span class="meta"><b>{e(it["title"])}</b>{tag}<time class="num">{e(it["date"])}</time></span>
        <span class="note">{e(it["note"])}</span>
      </a>'''

sections = []
for g in lib['groups']:
    items = [i for i in lib['items'] if i['g'] == g['id']]
    cls = 'cols-2' if g['id'] == 'tools' else 'cols-3'
    sections.append(f'''  <section class="group" id="{g["id"]}" aria-labelledby="h-{g["id"]}">
    <header class="group-h rv">
      <h2 id="h-{g["id"]}">{e(g["title"])}</h2>
      <p>{e(g["lede"])}</p>
    </header>
    <div class="items {cls}">
{chr(10).join(card(i) for i in items)}
    </div>
  </section>''')

total = len(lib['items'])
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Library - heyrav</title>
<meta name="description" content="Every exploration behind heyrav.in: live tools, the hero through time, project thumbnails, and the benches each design decision was made on.">
<link rel="icon" href="favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="tools/kit.css">
<style>
  @font-face{{font-family:"Redaction 35";font-style:italic;font-weight:400;font-display:swap;
    src:url(https://cdn.jsdelivr.net/fontsource/fonts/redaction-35@latest/latin-400-italic.woff2) format("woff2");}}
  :root{{--serif:"Redaction 35",Georgia,serif;--t-head:56px;--t-sub-md:32px;}}
  html,body{{height:auto;}}
  body{{background:var(--paper);font-size:var(--t-body);}}
  .wrap{{max-width:1180px;margin:0 auto;padding:0 24px;}}
  header.top{{display:flex;align-items:center;justify-content:space-between;min-height:68px;border-bottom:1px solid var(--line);
    position:sticky;top:0;background:var(--paper);z-index:5;}}
  header.top a{{color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;min-height:44px;}}
  header.top img{{height:32px;width:auto;display:block;}}
  .jump{{display:flex;gap:4px;font-size:var(--t-ui);}}
  .jump a{{padding:0 12px;border-radius:var(--r-pill);color:var(--ink-3);}}
  .jump a:hover{{color:var(--ink);background:var(--wash);}}
  h1{{font-size:var(--t-head);font-weight:var(--w-head);letter-spacing:-.02em;line-height:1.05;margin:84px 0 18px;max-width:15ch;}}
  h1 em,h2 em{{font-family:var(--serif);font-style:italic;font-weight:400;color:var(--ink-2);}}
  .intro{{color:var(--ink-3);max-width:62ch;line-height:1.55;}}
  .keys{{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:22px;color:var(--mut);font-size:var(--t-ui);}}
  .keys kbd{{font-family:var(--mono);font-size:var(--t-label);border:1px solid var(--line);border-radius:var(--r-xs);padding:2px 6px;margin-right:6px;color:var(--ink-2);}}

  .group{{padding-top:84px;margin-top:84px;border-top:1px solid var(--line);scroll-margin-top:68px;}}
  .group:first-of-type{{border-top:0;margin-top:40px;}}
  .group-h{{display:grid;gap:6px;}}
  .group-h h2{{font-size:var(--t-sub-md);font-weight:var(--w-head);letter-spacing:-.01em;}}
  .group-h .count{{font-size:var(--t-label);color:var(--mut);}}
  .group-h p{{grid-column:1/-1;color:var(--ink-3);max-width:62ch;line-height:1.55;}}
  .items{{display:grid;gap:40px 28px;margin-top:40px;}}
  .cols-2{{grid-template-columns:repeat(2,1fr);}}
  .cols-3{{grid-template-columns:repeat(3,1fr);}}
  .item{{display:flex;flex-direction:column;gap:12px;text-decoration:none;color:var(--ink);min-height:44px;}}
  .item .shot{{display:block;aspect-ratio:16/10;border-radius:var(--r-md);overflow:hidden;background:var(--wash);border:1px solid var(--line);}}
  .cols-2 .item .shot{{border-radius:var(--r-lg);}}
  .item .shot img{{width:100%;height:100%;object-fit:cover;display:block;transition:transform .8s var(--ease);}}
  .item:hover .shot img{{transform:scale(1.03);}}
  .item:focus-visible{{outline:2px solid var(--ink);outline-offset:6px;border-radius:var(--r-md);}}
  .meta{{display:flex;align-items:center;gap:10px;}}
  .meta b{{font-weight:var(--w-head);font-size:var(--t-body);}}
  .meta time{{margin-left:auto;font-size:var(--t-label);color:var(--mut);white-space:nowrap;}}
  .tag{{font-size:var(--t-label);color:var(--ink-2);border:1px solid var(--line);border-radius:var(--r-pill);padding:1px 8px;white-space:nowrap;}}
  .note{{color:var(--ink-3);font-size:var(--t-ui);line-height:1.5;}}

  .lessons{{display:grid;grid-template-columns:repeat(3,1fr);gap:40px 32px;margin-top:40px;}}
  .lessons b{{display:block;font-weight:var(--w-head);margin-bottom:8px;}}
  .lessons p{{color:var(--ink-3);line-height:1.5;font-size:var(--t-ui);}}
  footer{{margin:128px 0 0;padding:28px 0 40px;border-top:1px solid var(--line);display:flex;gap:18px;flex-wrap:wrap;
    font-family:var(--mono);font-size:var(--t-label);color:var(--mut);text-transform:uppercase;letter-spacing:.06em;}}
  footer a{{color:inherit;}}

  .rv{{opacity:0;transform:translateY(8px);filter:blur(4px);transition:opacity .6s var(--ease) var(--d,0ms),transform .6s var(--ease) var(--d,0ms),filter .6s var(--ease) var(--d,0ms);}}
  .rv.in{{opacity:1;transform:none;filter:none;}}
  @media (prefers-reduced-motion:reduce){{ .rv{{opacity:1;transform:none;filter:none;transition:none;}} .item .shot img{{transition:none;}} }}
  @media (max-width:900px){{ :root{{--t-head:44px;--t-sub-md:28px;}} .cols-3,.lessons{{grid-template-columns:1fr 1fr;}} h1{{margin-top:64px;}} .jump{{display:none;}} }}
  @media (max-width:640px){{ :root{{--t-head:36px;--t-sub-md:24px;}} .wrap{{padding:0 16px;}} .cols-2,.cols-3,.lessons{{grid-template-columns:1fr;}} }}
</style>
{CLARITY}
</head>
<body>
<div class="wrap">
  <header class="top">
    <a href="https://heyrav.in" aria-label="heyrav.in"><img src="tools/brand/lockup.svg" alt="Ravindra Pratap" width="194" height="63"></a>
    <nav class="jump" aria-label="Sections">{''.join(f'<a href="#{g["id"]}">{e(g["title"].split(",")[0])}</a>' for g in lib["groups"])}</nav>
  </header>

  <h1 class="rv">Everything that was tried <em>on the way.</em></h1>
  <p class="intro rv">{total} explorations behind heyrav.in, in one place: the tools for finding the visual language, the home page at every turn it took, every way the work has been framed, and the benches each decision was made on - most of them with the option that won noted on the card.</p>
  <div class="keys rv" aria-label="Keyboard shortcuts in the instruments">
    <span><kbd>R</kbd>random</span><span><kbd>Z</kbd>undo</span><span><kbd>⇧ Z</kbd>redo</span><span><kbd>Space</kbd>play / pause</span><span>every tool state is a link</span>
  </div>

{chr(10).join(sections)}

  <section class="group" id="method" aria-labelledby="h-method">
    <header class="group-h rv"><h2 id="h-method">How the instruments are made</h2>
      <p>From James McDonald's Dive Club session on building with Claude (Oct 2026), and from reading how accessgrid.com's own motion is built.</p></header>
    <div class="lessons">
      <div class="rv"><b>Build a tool, not eight mockups</b><p>A throwaway tool you can play with finds the idea faster than a page of variations.</p></div>
      <div class="rv"><b>Always a random button</b><p>Random across every parameter turns up results nobody would aim for. Undo keeps it safe.</p></div>
      <div class="rv"><b>One line of help per control</b><p>Each slider says what it does, so the tool is its own documentation.</p></div>
      <div class="rv"><b>One easing, almost everywhere</b><p>Ease-out quint, cubic-bezier(.23,1,.32,1), at 200 to 500ms. Most of "smooth" is never mixing curves.</p></div>
      <div class="rv"><b>Write the motion as numbers</b><p>Every timing named and commented - stagger, snap, sweep - so it can be tuned, not storyboarded.</p></div>
      <div class="rv"><b>Self-plagiarise</b><p>A shelved idea is a library entry. This page exists so none of them are lost.</p></div>
    </div>
  </section>

  <footer><span>heyrav library</span><a href="https://heyrav.in">heyrav.in</a><span>Ravindra Pratap</span></footer>
</div>
<script>
  // reveal on scroll: blur and rise, the instruments' own entrance
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => {{
    if (x.isIntersecting) {{ x.target.classList.add('in'); io.unobserve(x.target); }}
  }}), {{ rootMargin: '0px 0px -6% 0px' }}) : null;
  document.querySelectorAll('.rv').forEach((el, i) => {{ el.style.setProperty('--d', (i % 3) * 70 + 'ms'); io ? io.observe(el) : el.classList.add('in'); }});
</script>
</body>
</html>
'''
open(os.path.join(ROOT, 'index.html'), 'w').write(page)
missing = [shot(i) for i in lib['items'] if not os.path.exists(os.path.join(ROOT, 'thumbs', shot(i) + '.webp'))]
print('index.html written,', total, 'items; missing thumbs:', missing or 'none')
