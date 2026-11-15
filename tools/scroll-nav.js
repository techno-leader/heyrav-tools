/* scroll-nav.js - section navigation that lives where the scrollbar does.
   Three styles, one engine:
     island  the scrollbar thumb as a pill: section number and time left
             while scrolling, a chapter card on hover
     ruler   a tick per section along the edge, sized to the section; the
             ticks near the pointer magnify and name themselves
     pill    a capsule at the bottom: section x of y, a progress ring,
             previous / next, and a sheet of every section
   Sections are found by `section` + `.sec-label` (the case pages' own
   markup); the label is the section's name and its words set the reading
   time. Motion is transform and opacity, interruptible, ease-out, and
   reduced motion keeps only the fades.

   Site:  <script src="scroll-nav.js" data-mount defer></script>
          settings from window.scrollNavConfig, set before it loads
   Tool:  ScrollNav.mount({ scroller, root, config }) -> { destroy() }  */
(() => {
  const DEF = {
    style: 'island',            // island | ruler | pill
    bg: '#161616', fg: '#ffffff', accent: '#bbfff0', rest: '#161616',
    font: 12, edge: 8, insetT: 72, insetB: 16, offset: 72, hideBar: true,
    ease: 'out-quint', dur: 260, swap: 180, idle: 1100,
    wpm: 230, numbers: true, smooth: true, keys: true, shadow: .16,
    spring: true, bounce: .16,       // size changes ride a spring; bounce 0 is critically damped
    // what the numbers say
    miniMeta: 'page',                // compact island: page | count | time | none
    head: 'count-page',              // card header: count-page | page-time | count-time | off
    rowMeta: 'state',                // each row: state (read / % / -) | progress | time | none
    headlines: true,                 // each row carries its section's headline, a story outline
    rowBars: true,                   // a progress bar under each section: read, reading, still to read
    hideHeads: [],                   // section labels whose headline stays hidden (or data-subhead="off" on the section)
    // island
    iRest: 4, iRestA: .22, iW: 30, iMinH: 76, iMaxH: 180, iRad: 15, iCardW: 300, iRow: 36, iOpen: 110, iClose: 260,
    stretch: .35, hint: true,
    // ruler
    rGap: 8, rMinor: 5, rMajor: 13, rThick: 1.5, rTickA: .16, rMajorA: .42, rMag: 18, rRadius: 72, rHit: 56, rInd: 24, rSnap: true, rTip: true, rLabBg: '#ffffff',
    // pill
    pBottom: 20, pH: 44, pRing: 18, pRingMode: 'page', pArrows: true, pTuck: true, pSheetW: 312, pRow: 36
  };
  const EASE = {
    'out-quint': 'cubic-bezier(.23,1,.32,1)',
    'drawer': 'cubic-bezier(.32,.72,0,1)',
    'snappy': 'cubic-bezier(.2,.8,.2,1)',
    'out-back': 'cubic-bezier(.34,1.36,.64,1)',
    'in-out': 'cubic-bezier(.77,0,.175,1)'
  };

  const CSS = `
.snav{position:absolute;inset:0;pointer-events:none;z-index:60;font-family:inherit;font-size:var(--sn-font);
  -webkit-font-smoothing:antialiased;--sn-ease:${EASE['out-quint']};}
.snav.fixed{position:fixed;}
.snav *{box-sizing:border-box;}
/* the reset weighs nothing, so every component's own padding wins over it */
:where(.snav) button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;}
.snav .num{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums;letter-spacing:.02em;}
.snav-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}
.snav-row{position:relative;display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;column-gap:10px;width:100%;
  min-height:var(--sn-row);padding:9px 12px;border-radius:10px;text-align:left;color:var(--sn-mut);
  transition:background-color 150ms var(--sn-ease),color 150ms var(--sn-ease);}
.snav-row .num{opacity:.65;align-self:start;line-height:1.45;}
.snav-row .lab{display:flex;flex-direction:column;min-width:0;line-height:1.35;}
.snav-row .lab b{font-weight:450;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.snav-row .lab small{font-size:.92em;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
.snav-row .meta{font-size:.92em;opacity:.75;align-self:start;line-height:1.45;}
.snav-row .meta svg{width:12px;height:12px;fill:currentColor;display:block;margin-top:2px;}
.snav-row.seen .meta{color:var(--sn-accent);opacity:.9;}
.snav-row.on{color:var(--sn-fg);background:color-mix(in srgb,var(--sn-fg) 9%,transparent);}
/* progress under each section: a faint track, soft ink once read, mint while reading */
.snav-rows.bars .snav-row{padding-bottom:15px;}
.snav-row .pb{position:absolute;left:46px;right:12px;bottom:7px;height:2px;border-radius:2px;overflow:hidden;
  background:color-mix(in srgb,var(--sn-fg) 10%,transparent);}
.snav-row .pb i{display:block;height:100%;border-radius:inherit;background:color-mix(in srgb,var(--sn-fg) 36%,transparent);
  transform-origin:0 50%;transform:scaleX(var(--p,0));transition:transform 160ms var(--sn-ease),background-color 160ms var(--sn-ease);}
.snav-row.on .pb i{background:var(--sn-accent);}
.snav-row.on .num{color:var(--sn-accent);opacity:1;}
.snav-row:focus-visible{outline:2px solid var(--sn-accent);outline-offset:-2px;}
@media (hover:hover) and (pointer:fine){.snav-row:hover{color:var(--sn-fg);background:color-mix(in srgb,var(--sn-fg) 6%,transparent);}}
.snav-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 12px 10px;color:var(--sn-mut);white-space:nowrap;}
.snav-head b{font-weight:500;color:var(--sn-fg);}
.roll{display:inline-grid;overflow:hidden;vertical-align:bottom;}
.roll > span{grid-area:1/1;}
.rolls{display:inline-flex;}

/* ---- island ----
   minimal: a thin thumb. compact: the black pill, number on top, the
   accent in the middle growing with the section, the metric below.
   expanded: the same pill grown into the card - the number stays top
   left, the accent travels to the progress line under the section. */
.snav-hit{position:absolute;top:0;bottom:0;right:0;width:22px;pointer-events:auto;cursor:pointer;}
.snav-i{position:absolute;right:var(--sn-edge);top:0;width:var(--sn-irest);height:var(--sn-h,60px);
  border-radius:var(--sn-irad);background:color-mix(in srgb,var(--sn-rest) calc(var(--sn-irestA)*100%),transparent);
  overflow:hidden;pointer-events:auto;cursor:pointer;color:var(--sn-fg);will-change:transform;transform-origin:100% 50%;
  transition:width var(--sn-mdur) var(--sn-mease),height var(--sn-mdur) var(--sn-mease),border-radius var(--sn-mdur) var(--sn-mease),
    background-color var(--sn-dur) var(--sn-ease),box-shadow var(--sn-dur) var(--sn-ease),scale 420ms var(--sn-mease);}
.snav-i.glide{transition:width var(--sn-mdur) var(--sn-mease),height var(--sn-mdur) var(--sn-mease),border-radius var(--sn-mdur) var(--sn-mease),
    transform var(--sn-mdur) var(--sn-mease),background-color var(--sn-dur) var(--sn-ease),box-shadow var(--sn-dur) var(--sn-ease),scale 420ms var(--sn-mease);}
.snav-i.act{width:var(--sn-iw);background:var(--sn-bg);}
.snav-i.act.hint{width:calc(var(--sn-iw) + 4px);}
.snav-i.drag{cursor:grabbing;}
.snav-i.open{width:var(--sn-icard);height:var(--sn-oh);border-radius:calc(var(--sn-irad) + 5px);background:var(--sn-bg);
  box-shadow:0 16px 40px rgba(0,0,0,var(--sn-shadow)),0 2px 6px rgba(0,0,0,calc(var(--sn-shadow)*.6));cursor:default;}
.snav-i:focus-visible{outline:2px solid var(--sn-accent);outline-offset:2px;}
.snav-i.open:focus-visible{outline:0;}
.snav-mini{position:absolute;right:0;top:0;width:var(--sn-iw);height:100%;display:flex;flex-direction:column;align-items:center;
  justify-content:space-between;padding:10px 0;opacity:0;scale:.9;filter:blur(2px);
  transition:opacity 160ms var(--sn-ease),scale 200ms var(--sn-ease),filter 160ms var(--sn-ease);}
.snav-i.act .snav-mini{opacity:1;scale:1;filter:none;}
.snav-i.open .snav-mini{opacity:0;scale:.86;filter:blur(3px);transition-duration:110ms;}
.snav-mini .num{font-size:10.5px;font-weight:500;}
.snav-mini .m{font-size:9.5px;color:var(--sn-mut);}
.snav-acc{position:absolute;right:var(--ax,13px);top:var(--ay,30px);width:4px;height:4px;border-radius:50%;
  background:var(--sn-accent);opacity:0;pointer-events:none;
  transition:right var(--sn-mdur) var(--sn-mease),top var(--sn-mdur) var(--sn-mease),opacity 160ms var(--sn-ease);}
.snav-i.act .snav-acc{opacity:1;}
.snav-i.open .snav-acc{opacity:var(--ao,1);}
.snav-card{position:absolute;right:0;top:0;width:var(--sn-icard);padding:8px;pointer-events:none;}
.snav-i.open .snav-card{pointer-events:auto;}
.snav-card .snav-head,.snav-card li{opacity:0;transform:translateY(6px);filter:blur(3px);
  transition:opacity 90ms var(--sn-ease),transform 90ms var(--sn-ease),filter 90ms var(--sn-ease);}
.snav-i.open .snav-card .snav-head,.snav-i.open .snav-card li{opacity:1;transform:none;filter:none;
  transition:opacity 220ms var(--sn-ease),transform 280ms var(--sn-ease),filter 220ms var(--sn-ease);
  transition-delay:calc(var(--sn-mdur)*.28 + var(--d,0ms));}

/* ---- ruler ---- */
.snav-r{position:absolute;right:0;top:var(--sn-insetT);bottom:var(--sn-insetB);width:var(--sn-rhit);pointer-events:auto;cursor:pointer;touch-action:none;}
.snav-tk{position:absolute;right:var(--sn-edge);height:var(--sn-rthick);margin-top:calc(var(--sn-rthick)/-2);width:var(--sn-rminor);
  border-radius:var(--sn-rthick);background:var(--sn-rest);opacity:var(--sn-rtickA);transform-origin:100% 50%;
  transition:transform 260ms var(--sn-ease),opacity 260ms var(--sn-ease);}
.snav-tk.maj{width:var(--sn-rmajor);opacity:var(--sn-rmajorA);}
.snav-r.hov .snav-tk{transition-duration:70ms;}
.snav-lab{position:absolute;right:calc(var(--sn-edge) + var(--sn-rmajor) + var(--sn-rmag) + 8px);transform:translateY(-50%);
  white-space:nowrap;color:var(--sn-rest);opacity:0;pointer-events:none;padding:3px 7px;border-radius:6px;
  background:color-mix(in srgb,var(--sn-rlabbg) 88%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  transition:opacity 200ms var(--sn-ease),transform 200ms var(--sn-ease);}
.snav-lab .num{opacity:.5;margin-right:6px;}
.snav-ind{position:absolute;right:var(--sn-edge);top:0;width:var(--sn-rind);height:2px;margin-top:-1px;border-radius:2px;background:var(--sn-rest);will-change:transform;}
.snav-tip{position:absolute;right:calc(var(--sn-edge) + var(--sn-rind) + 10px);top:0;padding:5px 9px;border-radius:7px;white-space:nowrap;
  background:var(--sn-bg);color:var(--sn-fg);opacity:0;pointer-events:none;will-change:transform;
  box-shadow:0 6px 18px rgba(0,0,0,var(--sn-shadow));transition:opacity var(--sn-swap) var(--sn-ease);}
.snav-tip .num{color:var(--sn-accent);margin-right:6px;}
.snav-tip.show{opacity:1;}
.snav-ghost{position:absolute;right:var(--sn-edge);top:0;width:calc(var(--sn-rmajor) + var(--sn-rmag));height:1px;background:var(--sn-rest);
  opacity:0;transition:opacity 120ms;}
.snav-r.hov .snav-ghost{opacity:.5;}

/* ---- pill ---- */
.snav-p{position:absolute;left:50%;bottom:var(--sn-pbottom);width:max-content;max-width:calc(100% - 24px);white-space:nowrap;display:flex;align-items:center;height:var(--sn-ph);padding:0 5px 0 5px;gap:2px;
  border-radius:999px;background:var(--sn-bg);color:var(--sn-fg);pointer-events:auto;transform:translateX(-50%);
  box-shadow:0 10px 30px rgba(0,0,0,var(--sn-shadow)),0 1px 3px rgba(0,0,0,calc(var(--sn-shadow)*.7));
  transition:transform var(--sn-dur) var(--sn-ease),opacity var(--sn-dur) var(--sn-ease);}
.snav-p.tuck{transform:translate(-50%,calc(100% + var(--sn-pbottom) + 8px));opacity:0;}
.snav-pm{display:flex;align-items:center;gap:9px;height:calc(var(--sn-ph) - 10px);padding:0 12px 0 8px;border-radius:999px;
  transition:background-color 150ms,scale 150ms var(--sn-ease);}
.snav-pm:active{scale:.97;}
@media (hover:hover) and (pointer:fine){.snav-pm:hover,.snav-pa:hover{background:color-mix(in srgb,var(--sn-fg) 9%,transparent);}}
.snav-pm .num{color:var(--sn-mut);}
.snav-pl{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;transition:width var(--sn-dur) var(--sn-ease);}
.snav-pm .num{flex:none;}
.snav-pl span{display:inline-block;}
.snav-ring{flex:none;transform:rotate(-90deg);}
.snav-ring circle{fill:none;stroke-width:2;}
.snav-ring .tr{stroke:color-mix(in srgb,var(--sn-fg) 18%,transparent);}
.snav-ring .fl{stroke:var(--sn-accent);stroke-linecap:round;}
.snav-pd{width:1px;height:16px;background:color-mix(in srgb,var(--sn-fg) 16%,transparent);margin:0 3px;}
.snav-pa{display:grid;place-items:center;width:calc(var(--sn-ph) - 10px);height:calc(var(--sn-ph) - 10px);border-radius:50%;
  transition:background-color 150ms,scale 150ms var(--sn-ease),opacity 150ms;}
.snav-pa:active{scale:.92;}
.snav-pa[disabled]{opacity:.3;cursor:default;}
.snav-pa svg{width:15px;height:15px;fill:currentColor;}
.snav-pm:focus-visible,.snav-pa:focus-visible{outline:2px solid var(--sn-accent);outline-offset:-2px;}
.snav-sheet{position:absolute;left:50%;bottom:calc(var(--sn-pbottom) + var(--sn-ph) + 8px);width:min(var(--sn-psheet),calc(100% - 24px));
  padding:8px;border-radius:18px;background:var(--sn-bg);color:var(--sn-fg);pointer-events:none;opacity:0;
  display:flex;flex-direction:column;max-height:calc(100% - var(--sn-pbottom) - var(--sn-ph) - 24px);
  transform:translate(-50%,8px) scale(.96);transform-origin:50% 100%;
  box-shadow:0 18px 44px rgba(0,0,0,var(--sn-shadow)),0 2px 6px rgba(0,0,0,calc(var(--sn-shadow)*.6));
  transition:opacity var(--sn-swap) var(--sn-ease),transform var(--sn-mdur) var(--sn-mease);}
.snav-sheet.open{opacity:1;transform:translate(-50%,0) scale(1);pointer-events:auto;}

@media (prefers-reduced-motion:reduce){
  .snav *{transition-property:opacity!important;}
}`;

  /* A spring as a CSS easing: simulate a damped spring (SwiftUI's
     duration / bounce parameters) and sample it into linear(). Bounce 0
     is critically damped - no overshoot; .2 overshoots by a hair. The
     returned ms is the time it takes to settle, which is the duration the
     transition needs so the curve is not cut short. */
  function springEase(bounce, ms) {
    const d = Math.max(.08, ms / 1000), k = Math.pow(2 * Math.PI / d, 2), c = 4 * Math.PI * (1 - bounce) / d;
    let x = 0, v = 0, t = 0, last = 0; const dt = 1 / 600, pts = [0];
    while (t < 4 * d) {
      v += (-k * (x - 1) - c * v) * dt; x += v * dt; t += dt;
      if (t - last >= d / 28) { pts.push(x); last = t; }
      if (t > d * .4 && Math.abs(x - 1) < .002 && Math.abs(v) < .02) break;
    }
    pts.push(1);
    return { ease: `linear(${pts.map(p => +p.toFixed(4)).join(',')})`, ms: Math.round(t * 1000) };
  }
  const CHECK = '<svg viewBox="0 0 256 256"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';

  let styled = false;
  const injectCSS = () => {
    if (styled) return; styled = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  };
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CHEV = {
    up: '<svg viewBox="0 0 256 256"><path d="M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z"/></svg>',
    down: '<svg viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>'
  };

  function mount(opts = {}) {
    injectCSS();
    const cfg = Object.assign({}, DEF, opts.config || {});
    const win = !opts.scroller || opts.scroller === window;
    const sc = win ? document.scrollingElement : opts.scroller;
    const evT = win ? window : sc;
    const root = opts.root || document.body;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : cfg.dur, swapMs = reduce ? 0 : cfg.swap;
    /* size changes (the island's morph, the sheet) ride the spring */
    const sp = cfg.spring && !reduce ? springEase(cfg.bounce, cfg.dur) : { ease: EASE[cfg.ease] || EASE['out-quint'], ms: dur };
    const doc = sc.ownerDocument || document;

    /* sections: the page's own, named by their label */
    const secs = (opts.sections || [...(win ? doc : sc).querySelectorAll(opts.selector || 'section')])
      .map(el => ({ el, label: (el.dataset.label || el.querySelector('.sec-label, h2')?.textContent || '').trim() }))
      .filter(s => s.label);
    const words = el => +el.dataset.words || (el.textContent.trim().match(/\S+/g) || []).length;
    secs.forEach(s => {
      s.words = words(s.el);
      /* the section's own headline: the sentence that sums it up */
      s.head = (s.el.querySelector('h2')?.textContent || '').replace(/\s+/g, ' ').trim();
    });
    const seen = secs.map(() => false);
    if (!secs.length) return null;

    const box = h('div', 'snav' + (win ? ' fixed' : ''));
    box.setAttribute('role', 'navigation'); box.setAttribute('aria-label', 'Sections');
    const vars = {
      '--sn-bg': cfg.bg, '--sn-fg': cfg.fg, '--sn-accent': cfg.accent, '--sn-rest': cfg.rest,
      '--sn-mut': `color-mix(in srgb, ${cfg.fg} 58%, transparent)`, '--sn-font': cfg.font + 'px',
      '--sn-edge': cfg.edge + 'px', '--sn-insetT': cfg.insetT + 'px', '--sn-insetB': cfg.insetB + 'px', '--sn-ease': EASE[cfg.ease] || EASE['out-quint'],
      '--sn-dur': dur + 'ms', '--sn-swap': swapMs + 'ms', '--sn-mdur': sp.ms + 'ms', '--sn-mease': sp.ease, '--sn-shadow': cfg.shadow, '--sn-row': cfg.iRow + 'px',
      '--sn-irest': cfg.iRest + 'px', '--sn-irestA': cfg.iRestA, '--sn-iw': cfg.iW + 'px', '--sn-irad': cfg.iRad + 'px', '--sn-icard': cfg.iCardW + 'px',
      '--sn-rminor': cfg.rMinor + 'px', '--sn-rmajor': cfg.rMajor + 'px', '--sn-rthick': cfg.rThick + 'px', '--sn-rtickA': cfg.rTickA,
      '--sn-rmajorA': cfg.rMajorA, '--sn-rlabbg': cfg.rLabBg, '--sn-rmag': cfg.rMag + 'px', '--sn-rhit': cfg.rHit + 'px', '--sn-rind': cfg.rInd + 'px',
      '--sn-pbottom': cfg.pBottom + 'px', '--sn-ph': cfg.pH + 'px', '--sn-psheet': cfg.pSheetW + 'px'
    };
    for (const k in vars) box.style.setProperty(k, vars[k]);
    root.append(box);
    /* the island and the ruler stand in for the scrollbar, so the native one goes */
    let barStyle = null;
    if (win && cfg.hideBar && cfg.style !== 'pill') {
      barStyle = document.createElement('style');
      barStyle.textContent = 'html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';
      document.head.append(barStyle);
    }

    /* ---- geometry and reading state ---- */
    const G = { k: 1, viewH: 0, contentH: 0, max: 0, words: 0 };
    function measure() {
      const r = win ? { top: 0, height: innerHeight } : sc.getBoundingClientRect();
      G.viewH = win ? innerHeight : sc.clientHeight;
      G.k = win ? 1 : (r.height / G.viewH) || 1;
      G.contentH = sc.scrollHeight;
      G.max = Math.max(1, G.contentH - G.viewH);
      G.words = 0;
      secs.forEach(s => {
        const b = s.el.getBoundingClientRect();
        s.top = (b.top - r.top) / G.k + sc.scrollTop;
        s.h = Math.max(1, b.height / G.k);
        s.words = words(s.el); G.words += s.words;
      });
    }
    const st = { y: 0, p: 0, i: 0, sp: 0, dir: 1, left: 0 };
    function read() {
      const y = sc.scrollTop;
      st.dir = y >= st.y ? 1 : -1; st.y = y;
      st.p = clamp(y / G.max, 0, 1);
      const probe = y + G.viewH * .3;
      let i = -1; secs.forEach((s, j) => { if (s.top <= probe) i = j; });
      if (st.p > .995) i = secs.length - 1;
      st.pre = i < 0;                       /* still above the first section */
      st.i = Math.max(0, i);
      const s = secs[st.i];
      st.sp = clamp((probe - s.top) / s.h, 0, 1);
      if (st.p > .995) st.sp = 1;
      let w = s.words * (1 - st.sp); for (let j = i + 1; j < secs.length; j++) w += secs[j].words;
      st.left = w / cfg.wpm;
      return st;
    }
    /* -1 is the top of the page, above the first section */
    const jump = i => {
      const top = i < 0 ? 0 : Math.max(0, secs[Math.min(i, secs.length - 1)].top - cfg.offset);
      sc.scrollTo({ top, behavior: cfg.smooth && !reduce ? 'smooth' : 'instant' });
    };
    /* a content swap: the old value slides out the way you are scrolling */
    const swap = (el, html, dir) => {
      if (el.innerHTML === html) return;
      el.innerHTML = html;
      if (!swapMs) return;
      el.animate([{ opacity: 0, transform: `translateY(${dir * 6}px)`, filter: 'blur(2px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: swapMs, easing: EASE[cfg.ease] || EASE['out-quint'] });
    };
    /* digits roll, one slot per character: only the characters that change
       move, in the direction you are reading */
    const rollOne = (slot, ch, dir) => {
      if (slot.dataset.v === ch) return;
      const old = slot.lastElementChild; slot.dataset.v = ch;
      const n = document.createElement('span'); n.textContent = ch; slot.append(n);
      if (!old || !swapMs || !dir) { if (old) old.remove(); return; }
      const o = { duration: swapMs, easing: EASE[cfg.ease] || EASE['out-quint'] };
      old.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: `translateY(${-dir * 80}%)`, opacity: 0, filter: 'blur(1.5px)' }], o).onfinish = () => old.remove();
      n.animate([{ transform: `translateY(${dir * 80}%)`, opacity: 0, filter: 'blur(1.5px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], o);
    };
    const roll = (el, text, dir) => {
      text = String(text);
      if (el.dataset.v === text) return;
      const fresh = !el.dataset.v || el.children.length !== text.length;
      if (fresh) { el.innerHTML = ''; [...text].forEach(() => { const sl = document.createElement('span'); sl.className = 'roll'; el.append(sl); }); }
      el.dataset.v = text;
      [...text].forEach((ch, j) => rollOne(el.children[j], ch, fresh ? 0 : dir));
    };

    /* a section's headline shows unless turned off for it - in the settings, or on the section itself */
    const hidden = new Set(cfg.hideHeads || []);
    const showHead = s => cfg.headlines && s.head && !hidden.has(s.label) && s.el.dataset.subhead !== 'off';
    const mins = w => { const m = w / cfg.wpm; return m < .75 ? '<1m' : Math.round(m) + 'm'; };
    function rowsHTML() {
      return secs.map((s, j) => `<li style="--d:${Math.min(j, 10) * 18}ms"><button class="snav-row" data-i="${j}" type="button">` +
        `<span class="num">${pad(j + 1)}</span><span class="lab"><b>${esc(s.label)}</b>${showHead(s) ? `<small>${esc(s.head)}</small>` : ''}</span>` +
        `<span class="meta num"></span>${cfg.rowBars ? '<i class="pb"><i></i></i>' : ''}</button></li>`).join('');
    }
    function syncRows(list) {
      secs.forEach((s, j) => { if (j < st.i || (j === st.i && st.sp > .85)) seen[j] = true; });
      list.querySelectorAll('.snav-row').forEach((b, j) => {
        const on = !st.pre && j === st.i; b.classList.toggle('on', on); b.classList.toggle('seen', seen[j] && !on);
        if (on) b.setAttribute('aria-current', 'location'); else b.removeAttribute('aria-current');
        if (cfg.rowBars) b.style.setProperty('--p', (on ? st.sp : seen[j] ? 1 : 0).toFixed(3));
        const m = b.querySelector('.meta'); let html = '';
        if (cfg.rowMeta === 'state') html = on ? Math.round(st.sp * 100) + '%' : seen[j] ? CHECK : '';
        else if (cfg.rowMeta === 'progress') html = (on ? Math.round(st.sp * 100) : seen[j] ? 100 : 0) + '%';
        else if (cfg.rowMeta === 'time') html = mins(secs[j].words);
        if (m.innerHTML !== html) m.innerHTML = html;
        b.setAttribute('aria-label', `${secs[j].label}${seen[j] ? ', read' : ''}${on ? ', current section' : ''}`);
      });
    }
    /* the header: where you are and how far, in the words chosen */
    const headParts = () => {
      const count = `Section <b class="rolls h-c"></b> of ${pad(secs.length)}`, page = `<b class="rolls h-p"></b> read`, time = `<b class="h-t"></b> left`;
      return { 'count-page': [count, page], 'page-time': [page, time], 'count-time': [count, time] }[cfg.head] || null;
    };
    const headHTML = () => { const p = headParts(); return p ? `<div class="snav-head"><span>${p[0]}</span><span>${p[1]}</span></div>` : ''; };
    function syncHead(el, dir) {
      if (!el) return;
      const c = el.querySelector('.h-c'), p = el.querySelector('.h-p'), t = el.querySelector('.h-t');
      if (c) roll(c, pad(st.pre ? 0 : st.i + 1), dir);
      if (p) roll(p, Math.round(st.p * 100) + '%', dir);
      if (t) t.textContent = st.left < .75 ? 'under a minute' : Math.round(st.left) + ' min';
    }

    const off = []; // teardown
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); off.push(() => t.removeEventListener(e, f, o)); };
    let api;

    /* ================= island ================= */
    if (cfg.style === 'island') {
      const hit = h('div', 'snav-hit'); box.append(hit);
      const isl = h('div', 'snav-i'); isl.tabIndex = 0; isl.setAttribute('aria-label', 'Sections - open the list'); isl.setAttribute('aria-expanded', 'false');
      const mini = h('div', 'snav-mini', `<b class="num rolls"></b><i class="m num rolls"></i>`);
      const acc = h('i', 'snav-acc');
      const card = h('div', 'snav-card', `${headHTML()}<ol class="snav-rows${cfg.rowBars ? ' bars' : ''}">${rowsHTML()}</ol>`);
      isl.append(card, mini, acc); box.append(isl);
      const numEl = mini.querySelector('.num'), mEl = mini.querySelector('.m'), list = card.querySelector('.snav-rows'), head = card.querySelector('.snav-head');
      let act = false, open = false, hov = false, idleT, openT, closeT, lastI = -1, oh = 0, hh = 60;
      let lastY = sc.scrollTop, lastT = performance.now(), calmT;
      const trackH = () => G.viewH - cfg.insetT - cfg.insetB;
      const thumbH = () => clamp(G.viewH / G.contentH * trackH(), 28, cfg.iMaxH);
      /* opening rides the full spring; closing is quicker, as exits should be */
      const glide = closing => {
        isl.style.setProperty('--sn-mdur', Math.round(sp.ms * (closing ? .72 : 1)) + 'ms');
        isl.classList.add('glide'); clearTimeout(isl._g);
        isl._g = setTimeout(() => { isl.classList.remove('glide'); isl.style.removeProperty('--sn-mdur'); }, sp.ms + 60);
      };
      const metric = () => cfg.miniMeta === 'page' ? Math.round(st.p * 100) + '' : cfg.miniMeta === 'count' ? '/' + pad(secs.length)
        : cfg.miniMeta === 'time' ? (st.left < .75 ? '<1' : Math.round(st.left) + 'm') : '';
      /* the accent is one dot. In the compact pill it sits between the
         number and the metric; when the card opens it travels on the same
         spring to the current section, just before its % - you are here */
      function placeAcc() {
        if (open) {
          const row = list.querySelector('.snav-row.on');
          if (!row || st.pre) { isl.style.setProperty('--ao', 0); return; }
          /* measured from the row's list item: while the rows ease in, their
             transform makes each item the row's offset parent */
          const top = row.parentElement.offsetTop - list.scrollTop + 9 + 8 - 2;   /* row padding + half the first line */
          const inView = top > list.offsetTop - 2 && top < list.offsetTop + list.clientHeight;
          /* just before the row's metric, like a live indicator: "• 16%" */
          const meta = row.querySelector('.meta');
          const left = 8 + (meta.textContent ? meta.offsetLeft - 10 : row.offsetWidth - 12 - 4);
          isl.style.setProperty('--ao', inView ? 1 : 0);
          isl.style.setProperty('--ay', top.toFixed(1) + 'px');
          isl.style.setProperty('--ax', (cfg.iCardW - left - 4).toFixed(1) + 'px');
        } else {
          const showM = cfg.miniMeta !== 'none' && hh >= 64;
          isl.style.setProperty('--ay', ((showM ? hh : hh + 8) / 2 - 2).toFixed(1) + 'px');
          isl.style.setProperty('--ax', (cfg.iW / 2 - 2) + 'px');
          mEl.style.display = showM ? '' : 'none';
        }
      }
      function place() {
        const tH = trackH(); hh = thumbH();
        if (act && !open) hh = Math.max(cfg.iMinH, hh);
        let y;
        if (open) {
          /* a long contents list scrolls inside the card rather than leaving the screen */
          list.style.maxHeight = Math.max(80, tH - (head ? head.offsetHeight : 0) - 16) + 'px';
          oh = Math.min(card.offsetHeight, tH);
          const c = cfg.insetT + st.p * (tH - thumbH()) + thumbH() / 2;
          y = clamp(c - oh / 2, cfg.insetT, cfg.insetT + tH - oh);
          isl.style.setProperty('--sn-oh', oh + 'px');
        } else y = cfg.insetT + st.p * (tH - hh);
        isl.style.setProperty('--sn-h', hh + 'px');
        isl.style.transform = `translateY(${y.toFixed(1)}px)`;
        placeAcc();
      }
      function setAct(v) { if (act === v) return; act = v; isl.classList.toggle('act', v); place(); }
      /* the open height has to exist before the class flips, or the browser
         resolves it as auto for a frame - and auto does not animate */
      function prepOpen() {
        list.style.maxHeight = Math.max(80, trackH() - (head ? head.offsetHeight : 0) - 16) + 'px';
        oh = Math.min(card.offsetHeight, trackH());
        isl.style.setProperty('--sn-oh', oh + 'px');
      }
      function setOpen(v) {
        if (open === v) return;
        if (v) prepOpen();
        open = v; glide(!v);
        isl.classList.remove('hint');
        isl.classList.toggle('open', v); isl.setAttribute('aria-expanded', String(v));
        if (v) { setAct(true); isl.style.scale = ''; }
        place();
        if (v) { const on = list.querySelector('.snav-row.on'); if (on) list.scrollTop = Math.max(0, on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2); placeAcc(); }
        if (!v && !hov) wake();
      }
      function wake() { setAct(true); clearTimeout(idleT); idleT = setTimeout(() => { if (!hov && !open) setAct(false); }, cfg.idle); }
      function render() {
        read();
        const dir = lastI < 0 ? 0 : (st.i > lastI ? 1 : st.i < lastI ? -1 : st.dir);
        roll(numEl, pad(st.i + 1), lastI < 0 ? 0 : (st.i !== lastI ? (st.i > lastI ? 1 : -1) : 0));
        lastI = st.i;
        roll(mEl, metric(), dir);
        syncHead(head, dir);
        syncRows(list);
        place();
      }
      /* scroll speed stretches the compact pill a touch, and it settles back
         on the spring - the squash of a living thing, not a bar */
      function stretch() {
        /* never while dragging: under a finger the thumb must not deform */
        if (!cfg.stretch || reduce || open || drag) { isl.style.scale = ''; return; }
        const now = performance.now(), v = (sc.scrollTop - lastY) / Math.max(8, now - lastT);
        lastY = sc.scrollTop; lastT = now;
        const k = clamp(Math.abs(v) * cfg.stretch * .07, 0, .32 * cfg.stretch);   /* default peaks near 11% */
        isl.style.scale = `${(1 - k * .3).toFixed(3)} ${(1 + k).toFixed(3)}`;
        clearTimeout(calmT); calmT = setTimeout(() => { isl.style.scale = ''; }, 90);
      }
      on(isl, 'pointerenter', e => {
        if (e.pointerType !== 'mouse') return; hov = true; clearTimeout(closeT); setAct(true);
        if (cfg.hint && !open) isl.classList.add('hint');
        openT = setTimeout(() => { if (!drag) setOpen(true); }, cfg.iOpen);
      });
      on(isl, 'pointerleave', e => {
        if (e.pointerType !== 'mouse' || drag) return; hov = false; clearTimeout(openT); isl.classList.remove('hint');
        closeT = setTimeout(() => setOpen(false), cfg.iClose);
      });
      on(list, 'scroll', () => { if (open) placeAcc(); }, { passive: true });
      /* the thumb drags like a scrollbar's; a press that does not move opens
         the card on touch (mouse opens on hover) */
      let drag = null;
      on(isl, 'pointerdown', e => {
        if (open || e.button > 0 || e.target.closest('.snav-row')) return;
        clearTimeout(openT);
        drag = { y0: e.clientY, s0: sc.scrollTop, moved: false, id: e.pointerId };
        try { isl.setPointerCapture(e.pointerId); } catch {}
      });
      on(isl, 'pointermove', e => {
        if (!drag) return;
        const dy = (e.clientY - drag.y0) / G.k;
        if (!drag.moved && Math.abs(dy) < 3) return;
        drag.moved = true; isl.classList.add('drag'); isl.classList.remove('hint');
        const span = Math.max(1, trackH() - Math.max(cfg.iMinH, thumbH()));
        sc.scrollTo({ top: clamp(drag.s0 + dy / span * G.max, 0, G.max), behavior: 'instant' });
      });
      const endDrag = e => {
        if (!drag) return;
        const moved = drag.moved; drag = null; isl.classList.remove('drag');
        if (moved) { isl._noClick = true; setTimeout(() => { isl._noClick = false; }, 0); }
        else if (hov && e.pointerType === 'mouse') setOpen(true);
      };
      on(isl, 'pointerup', endDrag); on(isl, 'pointercancel', endDrag);
      on(isl, 'click', e => {
        if (isl._noClick) return;
        const r = e.target.closest('.snav-row');
        if (r) { jump(+r.dataset.i); return; }
        if (e.pointerType !== 'mouse') setOpen(!open);
      });
      on(isl, 'keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { if (!e.target.closest('.snav-row')) { e.preventDefault(); setOpen(!open); if (open) (list.querySelector('.on') || list.querySelector('.snav-row'))?.focus(); } }
        if (e.key === 'Escape') { setOpen(false); isl.focus(); }
        const r = e.target.closest?.('.snav-row');
        if (r && /Arrow(Up|Down)/.test(e.key)) {
          e.preventDefault(); const rows = [...list.querySelectorAll('.snav-row')], j = rows.indexOf(r) + (e.key === 'ArrowDown' ? 1 : -1);
          rows[clamp(j, 0, rows.length - 1)].focus();
        }
      });
      on(isl, 'focusout', e => { if (!isl.contains(e.relatedTarget)) setOpen(false); });
      on(hit, 'pointerenter', () => { wake(); });
      on(hit, 'click', e => {
        if (e.pointerType && e.pointerType !== 'mouse') { wake(); return; }
        const b = hit.getBoundingClientRect();
        const f = clamp(((e.clientY - b.top) / G.k - cfg.insetT - thumbH() / 2) / (trackH() - thumbH()), 0, 1);
        sc.scrollTo({ top: f * G.max, behavior: cfg.smooth && !reduce ? 'smooth' : 'instant' });
      });
      on(doc, 'pointerdown', e => { if (open && !isl.contains(e.target)) setOpen(false); });
      api = { render, onScroll() { if (!open) wake(); stretch(); render(); } };
    }

    /* ================= ruler ================= */
    if (cfg.style === 'ruler') {
      const rail = h('div', 'snav-r'); box.append(rail);
      const ind = h('div', 'snav-ind'), tip = h('div', 'snav-tip'), ghost = h('div', 'snav-ghost');
      tip.innerHTML = '<span class="num"></span><span class="l"></span>';
      let ticks = [], labs = [], hov = false, py = -1, tipT, lastI = -1, drag = null, raf = 0;
      const H = () => rail.clientHeight;
      function build() {
        rail.innerHTML = ''; ticks = []; labs = [];
        const tH = H();
        const majY = secs.map(s => clamp(s.top / G.contentH * tH, 0, tH));
        for (let y = 0; y <= tH; y += cfg.rGap) {
          if (majY.some(m => Math.abs(m - y) < cfg.rGap * .5)) continue;
          const t = h('i', 'snav-tk'); t.style.top = y + 'px'; t._y = y; rail.append(t); ticks.push(t);
        }
        majY.forEach((y, j) => {
          const t = h('i', 'snav-tk maj'); t.style.top = y + 'px'; t._y = y; t._j = j; rail.append(t); ticks.push(t);
          const l = h('span', 'snav-lab', `<span class="num">${pad(j + 1)}</span>${esc(secs[j].label)}`);
          l.style.top = y + 'px'; l._y = y; rail.append(l); labs.push(l);
        });
        rail.append(ghost, ind, tip);
      }
      function fish() {
        raf = 0;
        ticks.forEach(t => {
          const f = hov ? Math.exp(-Math.pow((t._y - py) / cfg.rRadius, 2)) : 0;
          const base = t._j != null ? cfg.rMajor : cfg.rMinor;
          t.style.transform = `scaleX(${((base + cfg.rMag * f) / base).toFixed(3)})`;
          t.style.opacity = hov ? (t._j != null ? cfg.rMajorA : cfg.rTickA) + (1 - (t._j != null ? cfg.rMajorA : cfg.rTickA)) * f * .9 : '';
        });
        labs.forEach(l => {
          const f = hov ? Math.exp(-Math.pow((l._y - py) / (cfg.rRadius * .8), 2)) : 0;
          l.style.opacity = f > .12 ? Math.min(1, f * 1.3).toFixed(2) : 0;
          l.style.transform = `translate(${((1 - f) * 8).toFixed(1)}px,-50%)`;
        });
        ghost.style.transform = `translateY(${py}px)`;
      }
      const kick = () => { if (!raf) raf = requestAnimationFrame(fish); };
      function showTip(ms) { if (!cfg.rTip) return; tip.classList.add('show'); clearTimeout(tipT); if (ms) tipT = setTimeout(() => { if (!hov) tip.classList.remove('show'); }, ms); }
      function render() {
        read();
        const y = st.p * H();
        ind.style.transform = `translateY(${y.toFixed(1)}px)`;
        tip.style.transform = `translateY(${(y - tip.offsetHeight / 2).toFixed(1)}px)`;
        if (st.i !== lastI) {
          swap(tip.querySelector('.num'), pad(st.i + 1), lastI < 0 ? 0 : (st.i > lastI ? 1 : -1));
          swap(tip.querySelector('.l'), esc(secs[st.i].label), lastI < 0 ? 0 : (st.i > lastI ? 1 : -1));
          lastI = st.i;
        }
      }
      const yOf = e => (e.clientY - rail.getBoundingClientRect().top) / G.k;
      const target = y => {
        const f = clamp(y / H(), 0, 1);
        if (cfg.rSnap) {
          const near = secs.map((s, j) => [Math.abs(s.top / G.contentH * H() - y), j]).sort((a, b) => a[0] - b[0])[0];
          if (near[0] < 28) return { sec: near[1] };
        }
        return { top: f * G.contentH - G.viewH * .3 };
      };
      on(rail, 'pointerenter', e => { if (e.pointerType !== 'mouse') return; hov = true; rail.classList.add('hov'); py = yOf(e); kick(); });
      on(rail, 'pointermove', e => {
        py = yOf(e); if (e.pointerType === 'mouse') kick();
        if (drag) { drag.moved = true; sc.scrollTo({ top: clamp(py / H(), 0, 1) * G.max, behavior: 'instant' }); }
      });
      on(rail, 'pointerleave', () => { hov = false; rail.classList.remove('hov'); kick(); showTip(cfg.idle); });
      on(rail, 'pointerdown', e => { drag = { moved: false }; try { rail.setPointerCapture(e.pointerId); } catch {} py = yOf(e); });
      on(rail, 'pointerup', e => {
        if (drag && !drag.moved) { const t = target(yOf(e)); if (t.sec != null) jump(t.sec); else sc.scrollTo({ top: clamp(t.top, 0, G.max), behavior: cfg.smooth && !reduce ? 'smooth' : 'instant' }); }
        drag = null;
      });
      api = { render, build, onScroll() { render(); showTip(cfg.idle); } };
      build();
    }

    /* ================= pill ================= */
    if (cfg.style === 'pill') {
      const R = (cfg.pRing - 2) / 2, C = 2 * Math.PI * R;
      const pill = h('div', 'snav-p');
      pill.innerHTML =
        `<button class="snav-pm" type="button" aria-expanded="false" aria-label="All sections">` +
        `<svg class="snav-ring" width="${cfg.pRing}" height="${cfg.pRing}" viewBox="0 0 ${cfg.pRing} ${cfg.pRing}"><circle class="tr" cx="${cfg.pRing / 2}" cy="${cfg.pRing / 2}" r="${R}"/>` +
        `<circle class="fl" cx="${cfg.pRing / 2}" cy="${cfg.pRing / 2}" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>` +
        (cfg.numbers ? `<span class="num"><b class="ix" style="font-weight:500;color:var(--sn-fg)">01</b> / ${pad(secs.length)}</span>` : '') +
        `<span class="snav-pl"><span></span></span></button>` +
        (cfg.pArrows ? `<i class="snav-pd"></i><button class="snav-pa" data-d="-1" type="button" aria-label="Previous section">${CHEV.up}</button>` +
          `<button class="snav-pa" data-d="1" type="button" aria-label="Next section">${CHEV.down}</button>` : '');
      const sheet = h('div', 'snav-sheet', `${headHTML()}<ol class="snav-rows${cfg.rowBars ? ' bars' : ''}">${rowsHTML()}</ol>`);
      box.append(sheet, pill);
      const main = pill.querySelector('.snav-pm'), ix = pill.querySelector('.ix'), lab = pill.querySelector('.snav-pl'), labIn = lab.firstChild;
      const fl = pill.querySelector('.fl'), list = sheet.querySelector('.snav-rows');
      const prev = pill.querySelector('[data-d="-1"]'), next = pill.querySelector('[data-d="1"]');
      const meas = h('span', ''); meas.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;'; pill.append(meas);
      let lastI = -1, open = false, tucked = false, lastY = 0;
      function setOpen(v) {
        open = v; sheet.classList.toggle('open', v); main.setAttribute('aria-expanded', String(v));
        if (v) { setTuck(false); sheet.style.setProperty('--sn-row', cfg.pRow + 'px'); }
      }
      function setTuck(v) { if (tucked === v) return; tucked = v; pill.classList.toggle('tuck', v); }
      function render() {
        read();
        if (st.i !== lastI) {
          const d = lastI < 0 ? 0 : (st.i > lastI ? 1 : -1);
          const text = secs[st.i].label;
          meas.textContent = text; lab.style.width = Math.ceil(meas.getBoundingClientRect().width / G.k) + 'px';
          swap(labIn, esc(text), d);
          if (ix) roll(ix, pad(st.i + 1), d);
          lastI = st.i;
          if (prev) prev.disabled = st.i === 0 && sc.scrollTop <= secs[0].top - cfg.offset + 24;
          if (next) next.disabled = st.i === secs.length - 1;
        }
        const p = cfg.pRingMode === 'section' ? st.sp : st.p;
        fl.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(2));
        syncHead(sheet.querySelector('.snav-head'), st.dir);
        syncRows(list);
      }
      on(main, 'click', () => setOpen(!open));
      pill.querySelectorAll('.snav-pa').forEach(b => on(b, 'click', () => {
        read();
        if (+b.dataset.d > 0) jump(st.pre ? 0 : st.i + 1);
        else jump(sc.scrollTop > secs[st.i].top - cfg.offset + 24 ? st.i : st.i - 1);
      }));
      on(sheet, 'click', e => { const r = e.target.closest('.snav-row'); if (r) { jump(+r.dataset.i); setOpen(false); } });
      on(doc, 'pointerdown', e => { if (open && !sheet.contains(e.target) && !pill.contains(e.target)) setOpen(false); });
      api = {
        render, onScroll() {
          render();
          const y = st.y, d = y - lastY;
          if (cfg.pTuck && !open) {
            if (y < 120 || st.p > .97) setTuck(false);
            else if (d > 6) setTuck(true);
            else if (d < -6) setTuck(false);
          }
          if (Math.abs(d) > 6) lastY = y;
        }
      };
      api.esc = () => setOpen(false);
    }

    /* ---- wiring ---- */
    let sraf = 0;
    on(evT, 'scroll', () => { if (!sraf) sraf = requestAnimationFrame(() => { sraf = 0; api.onScroll(); }); }, { passive: true });
    const relayout = () => { measure(); api.build && api.build(); api.render(); };
    const ro = new ResizeObserver(relayout); ro.observe(win ? doc.documentElement : sc); if (sc.firstElementChild) ro.observe(sc.firstElementChild);
    if (cfg.keys) on(doc, 'keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      const k = e.key.toLowerCase();
      if (k === 'j') { read(); jump(st.pre ? 0 : st.i + 1); }
      else if (k === 'k') { read(); if (st.pre) return;
        /* back to this section's start, or the one before if already there */
        const at = secs[st.i].top - cfg.offset;
        jump(sc.scrollTop > at + 24 ? st.i : st.i - 1); }
      else if (k === 'escape' && api.esc) api.esc();
    });
    measure(); api.render();

    return {
      el: box, sections: secs, state: st,
      destroy() { off.forEach(f => f()); ro.disconnect(); box.remove(); barStyle && barStyle.remove(); }
    };
  }

  window.ScrollNav = { DEF, EASE, mount };
  const me = document.currentScript;
  if (me && me.hasAttribute('data-mount')) {
    const go = () => { window.scrollNav = mount({ config: window.scrollNavConfig || {} }); };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', go) : go();
  }
})();
