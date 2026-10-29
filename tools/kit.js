/* heyrav tools - shared kit.
   Kit.tool({...}) builds the rail from a declarative schema, owns state, undo /
   redo, random, presets, the URL hash (every state is a shareable link), the
   artboard, the animation clock and the export helpers. A tool only supplies
   draw(ctx, W, H, t) and, optionally, svg(W, H, t). */

const Kit = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  // Phosphor regular, pasted (caret-down, arrow-u-up-left, arrow-u-up-right, shuffle, play, pause)
  const ICON = {
    caret: '<svg viewBox="0 0 256 256" class="icon"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>',
    undo: '<svg viewBox="0 0 256 256" class="icon"><path d="M232,144a64.07,64.07,0,0,1-64,64H80a8,8,0,0,1,0-16h88a48,48,0,0,0,0-96H51.31l34.35,34.34a8,8,0,0,1-11.32,11.32l-48-48a8,8,0,0,1,0-11.32l48-48A8,8,0,0,1,85.66,45.66L51.31,80H168A64.07,64.07,0,0,1,232,144Z"/></svg>',
    redo: '<svg viewBox="0 0 256 256" class="icon"><path d="M88,96H204.69L170.34,130.34a8,8,0,0,0,11.32,11.32l48-48a8,8,0,0,0,0-11.32l-48-48a8,8,0,0,0-11.32,11.32L204.69,80H88a64,64,0,0,0,0,128h88a8,8,0,0,0,0-16H88a48,48,0,0,1,0-96Z"/></svg>',
    shuffle: '<svg viewBox="0 0 256 256" class="icon"><path d="M237.66,178.34a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32-11.32L212.69,192H200.94a72.12,72.12,0,0,1-58.59-30.15l-41.72-58.4A56.1,56.1,0,0,0,55.06,80H32a8,8,0,0,1,0-16H55.06a72.12,72.12,0,0,1,58.59,30.15l41.72,58.4A56.1,56.1,0,0,0,200.94,176h11.75l-10.35-10.34a8,8,0,0,1,11.32-11.32ZM143,107a8,8,0,0,0,11.16-1.86l1.2-1.67A56.1,56.1,0,0,1,200.94,80h11.75L202.34,90.34a8,8,0,0,0,11.32,11.32l24-24a8,8,0,0,0,0-11.32l-24-24a8,8,0,0,0-11.32,11.32L212.69,64H200.94a72.12,72.12,0,0,0-58.59,30.15l-1.2,1.67A8,8,0,0,0,143,107Zm-30,42a8,8,0,0,0-11.16,1.86l-1.2,1.67A56.1,56.1,0,0,1,55.06,176H32a8,8,0,0,0,0,16H55.06a72.12,72.12,0,0,0,58.59-30.15l1.2-1.67A8,8,0,0,0,113,149Z"/></svg>',
    play: '<svg viewBox="0 0 256 256" class="icon"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z"/></svg>',
    pause: '<svg viewBox="0 0 256 256" class="icon"><path d="M200,32H160a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32Zm0,176H160V48h40ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Zm0,176H56V48H96Z"/></svg>',
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clone = o => JSON.parse(JSON.stringify(o));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const snap = (v, step, min) => {
    const s = Math.round((v - min) / step) * step + min;
    return +s.toFixed(String(step).split('.')[1]?.length || 0);
  };

  let toastT;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = h('div', { class: 'toast', role: 'status' }); document.body.append(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600);
  }
  async function copy(text, label = 'copied') {
    try { await navigator.clipboard.writeText(text); toast(label); }
    catch { download(new Blob([text], { type: 'text/plain' }), 'export.txt'); toast('clipboard blocked - downloaded instead'); }
  }
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------------------------------------------------------------- */
  function tool(cfg) {
    const ctrls = [];
    cfg.groups.forEach(g => g.controls.forEach(c => { c.group = g.name; ctrls.push(c); }));
    const defaults = {};
    ctrls.forEach(c => { if (c.k && c.type !== 'button' && c.type !== 'buttons' && c.type !== 'note') defaults[c.k] = c.value; });

    const S = clone(defaults);
    // state from the hash: only the keys that differ from the defaults are ever written
    try {
      const raw = decodeURIComponent(location.hash.slice(1));
      if (raw) Object.assign(S, JSON.parse(raw));
    } catch {}

    const listeners = [];
    const api = { S, defaults, ctrls, set, commit, refresh, on: f => listeners.push(f), toast, copy, download, h };

    /* ---- rail ---- */
    const rail = $('.rail');
    rail.append(
      h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
        h('a', { href: '../' }, 'library'), h('span', { class: 'sep' }, '/'), h('b', {}, cfg.title)),
      h('p', { class: 'lede' }, cfg.lede || '')
    );
    if (cfg.presets) {
      const box = h('div', { class: 'presets', role: 'group', 'aria-label': 'Presets' });
      Object.keys(cfg.presets).forEach(name => box.append(h('button', {
        class: 'chip', type: 'button', 'data-preset': name,
        onclick: () => { Object.assign(S, clone(defaults), clone(cfg.presets[name])); api.preset = name; commit('preset'); }
      }, name)));
      rail.append(box);
    }
    const hasAdv = ctrls.some(c => c.adv);
    let showAdv = false;
    try { showAdv = localStorage.getItem('kit-adv') === '1'; } catch {}
    if (hasAdv) {
      const t = h('label', { class: 'tgl' }, 'show advanced controls',
        h('input', { type: 'checkbox', checked: showAdv, onchange: e => {
          showAdv = e.target.checked; rail.classList.toggle('adv-hidden', !showAdv);
          try { localStorage.setItem('kit-adv', showAdv ? '1' : '0'); } catch {}
        } }), h('span', { class: 'sw' }));
      rail.append(t);
      rail.classList.toggle('adv-hidden', !showAdv);
    }

    const rows = new Map();
    cfg.groups.forEach(g => {
      const body = h('div', { class: 'grp-b' });
      const sec = h('section', { class: 'grp', 'data-closed': g.closed || null },
        h('button', { class: 'grp-h', type: 'button', 'aria-expanded': String(!g.closed), html: ICON.caret + '<span>' + g.name + '</span>',
          onclick: e => { const c = sec.toggleAttribute('data-closed'); e.currentTarget.setAttribute('aria-expanded', String(!c)); } }),
        body);
      g.controls.forEach(c => { const r = row(c); rows.set(c, r); body.append(r); });
      rail.append(sec);
    });

    function row(c) {
      const id = 'c-' + (c.k || Math.random().toString(36).slice(2));
      const r = h('div', { class: 'row', 'data-adv': c.adv || null });
      const help = c.help ? h('p', { class: 'help' }, c.help) : null;
      const top = (valEl) => h('div', { class: 'row-top' }, h('label', { for: id }, c.label ?? c.k), valEl);
      switch (c.type) {
        case 'range': {
          const v = h('span', { class: 'val' });
          const inp = h('input', { id, class: 'rng', type: 'range', min: c.min, max: c.max, step: c.step || 1 });
          inp.addEventListener('input', () => set(c.k, +inp.value));
          inp.addEventListener('change', () => commit(c.k));
          r.append(top(v), inp);
          r._sync = () => {
            inp.value = S[c.k];
            inp.style.setProperty('--f', ((S[c.k] - c.min) / (c.max - c.min) * 100) + '%');
            v.textContent = c.fmt ? c.fmt(S[c.k]) : (S[c.k] + (c.unit || ''));
          };
          break;
        }
        case 'seg': {
          const opts = c.options.map(o => Array.isArray(o) ? o : [o, String(o)]);
          const box = h('div', { class: 'seg', role: 'group', 'aria-label': c.label ?? c.k });
          opts.forEach(([val, lab]) => box.append(h('button', { type: 'button', 'data-v': JSON.stringify(val),
            onclick: () => { set(c.k, val); commit(c.k); } }, lab)));
          r.append(h('div', { class: 'row-top' }, h('span', { class: 'lbl' }, c.label ?? c.k)), box);
          r._sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === JSON.stringify(S[c.k]))));
          break;
        }
        case 'select': {
          const opts = c.options.map(o => Array.isArray(o) ? o : [o, String(o)]);
          const sel = h('select', { id, class: 'sel', onchange: e => { set(c.k, JSON.parse(e.target.value)); commit(c.k); } },
            opts.map(([val, lab]) => h('option', { value: JSON.stringify(val) }, lab)));
          r.append(top(null), sel);
          r._sync = () => { sel.value = JSON.stringify(S[c.k]); };
          break;
        }
        case 'toggle': {
          const inp = h('input', { id, type: 'checkbox', onchange: e => { set(c.k, e.target.checked); commit(c.k); } });
          r.append(h('label', { class: 'tgl', for: id }, c.label ?? c.k, inp, h('span', { class: 'sw' })));
          r._sync = () => { inp.checked = !!S[c.k]; };
          break;
        }
        case 'color': {
          const box = h('div', { class: 'sws', role: 'group', 'aria-label': c.label ?? c.k });
          c.options.forEach(([val, name]) => box.append(h('button', { type: 'button', class: 'sw-b', title: name, 'aria-label': name, 'data-v': val,
            style: `--c:${val}`, html: '<i></i>', onclick: () => { set(c.k, val); commit(c.k); } })));
          const custom = h('input', { type: 'color', 'aria-label': 'custom colour' });
          custom.addEventListener('input', () => set(c.k, custom.value));
          custom.addEventListener('change', () => commit(c.k));
          const pk = h('label', { class: 'sw-b pick', title: 'custom', html: '<i></i>' }, custom);
          box.append(pk);
          r.append(h('div', { class: 'row-top' }, h('span', { class: 'lbl' }, c.label ?? c.k), h('span', { class: 'val' })), box);
          r._sync = () => {
            let hit = false;
            box.querySelectorAll('button').forEach(b => { const on = b.dataset.v === S[c.k]; hit ||= on; b.setAttribute('aria-pressed', String(on)); });
            pk.querySelector('i').style.background = hit ? '' : S[c.k];
            pk.setAttribute('aria-pressed', String(!hit));
            r.querySelector('.val').textContent = hit ? '' : S[c.k];
          };
          break;
        }
        case 'button': case 'buttons': {
          const list = c.type === 'button' ? [c] : c.buttons;
          r.append(h('div', { class: 'btns' }, list.map(b => h('button', { type: 'button', class: 'btn' + (b.primary ? ' primary' : ''),
            onclick: () => b.run(api) }, b.label))));
          break;
        }
        case 'text': {
          const t = h(c.rows ? 'textarea' : 'input', { id, class: 'txt', rows: c.rows || null, spellcheck: 'false' });
          t.addEventListener('input', () => set(c.k, t.value));
          t.addEventListener('change', () => commit(c.k));
          r.append(top(null), t);
          r._sync = () => { if (document.activeElement !== t) t.value = S[c.k]; };
          break;
        }
        case 'file': {
          const inp = h('input', { type: 'file', accept: c.accept || 'image/*', hidden: true });
          const zone = h('div', { class: 'drop', tabindex: 0, role: 'button' },
            h('span', {}, c.prompt || 'drop an image here'), h('small', {}, c.sub || 'or click to choose'));
          const take = f => { if (!f) return; c.onFile(f, api); zone.classList.add('has'); zone.firstChild.textContent = f.name; };
          zone.addEventListener('click', () => inp.click());
          zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
          inp.addEventListener('change', () => take(inp.files[0]));
          zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
          zone.addEventListener('dragleave', () => zone.classList.remove('over'));
          zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); take(e.dataTransfer.files[0]); });
          r.append(h('div', { class: 'row-top' }, h('span', { class: 'lbl' }, c.label ?? '')), zone, inp);
          break;
        }
        case 'note': r.append(h('p', { class: 'help' }, c.text)); break;
        case 'hidden': r.dataset.hiddenCtl = ''; break;
        case 'custom': { const el = c.render(api); r.append(el); r._sync = () => c.sync && c.sync(S, el); break; }
      }
      if (help) r.append(help);
      return r;
    }

    function refresh() {
      rows.forEach((r, c) => {
        r._sync && r._sync();
        r.hidden = c.type === 'hidden' || (c.when ? !c.when(S) : false);
      });
      document.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === api.preset)));
      undoBtn && (undoBtn.disabled = hi <= 0);
      redoBtn && (redoBtn.disabled = hi >= hist.length - 1);
    }

    function set(k, v) {
      S[k] = v;
      api.preset = null;
      listeners.forEach(f => f(k, S));
      refresh();
    }

    /* ---- history ---- */
    const hist = [JSON.stringify(S)]; let hi = 0;
    function commit(k) {
      const snapS = JSON.stringify(S);
      if (snapS !== hist[hi]) { hist.splice(hi + 1); hist.push(snapS); hi = hist.length - 1; if (hist.length > 120) { hist.shift(); hi--; } }
      writeHash();
      listeners.forEach(f => f(k, S));
      refresh();
    }
    function restore(i) {
      hi = i; const o = JSON.parse(hist[hi]);
      Object.keys(S).forEach(k => delete S[k]); Object.assign(S, o);
      api.preset = null; writeHash(); listeners.forEach(f => f('*', S)); refresh();
    }
    function writeHash() {
      const diff = {};
      for (const k in S) if (JSON.stringify(S[k]) !== JSON.stringify(defaults[k]) && !ctrls.find(c => c.k === k)?.nohash) diff[k] = S[k];
      const str = Object.keys(diff).length ? '#' + encodeURIComponent(JSON.stringify(diff)) : location.pathname + location.search;
      history.replaceState(null, '', str);
    }
    function randomise() {
      ctrls.forEach(c => {
        if (c.rand === false || !c.k || (c.when && !c.when(S))) return;
        if (typeof c.rand === 'function') { S[c.k] = c.rand(S); return; }
        if (c.type === 'range') {
          const [a, b] = Array.isArray(c.rand) ? c.rand : [c.min, c.max];
          S[c.k] = snap(rnd(a, b), c.step || 1, c.min);
        } else if (c.type === 'seg' || c.type === 'select') {
          const o = pick(Array.isArray(c.rand) ? c.rand : c.options); S[c.k] = Array.isArray(o) ? o[0] : o;
        } else if (c.type === 'toggle') S[c.k] = Math.random() < .5;
        else if (c.type === 'color') S[c.k] = pick(c.options)[0];
      });
      api.preset = null;
      cfg.onRandom && cfg.onRandom(S);
      commit('*');
    }
    api.randomise = randomise;
    api.undo = () => hi > 0 && restore(hi - 1);
    api.redo = () => hi < hist.length - 1 && restore(hi + 1);

    /* ---- stage: artboard + dock ---- */
    const stage = $('.stage');
    const wrap = h('div', { class: 'board-wrap' });
    const board = h('div', { class: 'board' });
    const tag = h('span', { class: 'board-tag' });
    const canvas = h('canvas', { 'aria-label': cfg.title + ' canvas' });
    const backdrop = h('img', { class: 'backdrop', alt: '', hidden: true });
    board.append(backdrop, canvas, tag);
    wrap.append(board);
    const playB = h('button', { type: 'button', 'aria-label': 'play or pause', onclick: () => clock.toggle() });
    const undoBtn = h('button', { type: 'button', 'aria-label': 'undo', html: ICON.undo + '<span>Undo</span>', onclick: api.undo });
    const redoBtn = h('button', { type: 'button', 'aria-label': 'redo', html: ICON.redo + '<span>Redo</span>', onclick: api.redo });
    const randB = h('button', { type: 'button', class: 'primary', html: ICON.shuffle + '<span>Random</span><kbd>R</kbd>', onclick: randomise });
    const dock = h('div', { class: 'dock' }, undoBtn, redoBtn, h('span', { class: 'div' }), playB, h('span', { class: 'div' }), randB);
    if (cfg.static) playB.remove();
    stage.append(wrap, dock);

    const ctx = canvas.getContext('2d');
    const view = { W: 0, H: 0, scale: 1, dpr: 1 };
    function layout() {
      const size = (cfg.size ? cfg.size(S) : 'fill');
      const fill = size === 'fill';
      board.classList.toggle('fill', fill);
      const pad = getComputedStyle(wrap);
      const aw = wrap.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
      const ah = wrap.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
      let W, H, sc;
      if (fill) { W = wrap.clientWidth; H = wrap.clientHeight; sc = 1; board.style.width = board.style.height = ''; }
      else {
        [W, H] = size; sc = Math.min(aw / W, ah / H, 1);
        board.style.width = W * sc + 'px'; board.style.height = H * sc + 'px';
        tag.textContent = `${W} × ${H}  ·  ${Math.round(sc * 100)}%`;
      }
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * sc * dpr); canvas.height = Math.round(H * sc * dpr);
      Object.assign(view, { W, H, scale: sc, dpr });
      cfg.onResize && cfg.onResize(W, H, S);
      draw();
    }
    new ResizeObserver(layout).observe(wrap);

    /* pointer, in artboard units */
    const ptr = { x: 0, y: 0, in: false, down: false };
    const toArt = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * view.W, (e.clientY - r.top) / r.height * view.H]; };
    canvas.addEventListener('pointermove', e => { [ptr.x, ptr.y] = toArt(e); ptr.in = true; cfg.onPointer && cfg.onPointer(ptr, 'move', S); if (!clock.on) draw(); });
    canvas.addEventListener('pointerleave', () => { ptr.in = false; if (!clock.on) draw(); });
    canvas.addEventListener('pointerdown', e => { [ptr.x, ptr.y] = toArt(e); ptr.down = true; cfg.onPointer && cfg.onPointer(ptr, 'down', S); if (!clock.on) draw(); });
    addEventListener('pointerup', () => { ptr.down = false; });

    /* clock */
    const clock = {
      on: false, t: 0, last: 0, raf: 0,
      start() { if (this.on) return; this.on = true; this.last = performance.now(); this.raf = requestAnimationFrame(tick); syncPlay(); },
      stop() { this.on = false; cancelAnimationFrame(this.raf); syncPlay(); },
      toggle() { this.on ? this.stop() : this.start(); },
    };
    function syncPlay() { playB.innerHTML = (clock.on ? ICON.pause + '<span>Pause</span>' : ICON.play + '<span>Play</span>') + '<kbd>␣</kbd>'; }
    // heavy frames drop to every other vsync, so a slow laptop gets 30fps instead of a pegged core
    let cost = 0, skip = 0;
    function tick(now) {
      if (!clock.on) return;
      clock.t += Math.min(64, now - clock.last) / 1000; clock.last = now;
      if (cost > 22 && (skip ^= 1)) { clock.raf = requestAnimationFrame(tick); return; }
      const t0 = performance.now(); draw(); cost = cost * .9 + (performance.now() - t0) * .1;
      clock.raf = requestAnimationFrame(tick);
    }
    function draw() {
      if (!view.W) return;
      const k = view.scale * view.dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, view.W, view.H);
      cfg.draw(ctx, view.W, view.H, clock.t, S, ptr);
    }
    api.draw = draw; api.layout = layout; api.clock = clock; api.view = view; api.ptr = ptr; api.canvas = canvas; api.board = board; api.backdrop = backdrop;

    /* exports */
    api.png = async (mult = 2, name = cfg.slug + '.png') => {
      const c = document.createElement('canvas'); c.width = view.W * mult; c.height = view.H * mult;
      const x = c.getContext('2d'); x.scale(mult, mult);
      cfg.draw(x, view.W, view.H, clock.t, S, { in: false }, true);
      c.toBlob(b => { download(b, name); toast('png saved'); });
    };
    api.svgText = () => cfg.svg ? cfg.svg(view.W, view.H, clock.t, S) : null;
    api.link = () => copy(location.href, 'link copied');
    // the visible canvas as a webm, for posting - starts the clock if paused
    api.record = (secs = 6) => {
      if (!canvas.captureStream || !window.MediaRecorder) return toast('recording is not supported in this browser');
      const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(canvas.captureStream(60), { mimeType: type, videoBitsPerSecond: 12e6 });
      const chunks = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => { download(new Blob(chunks, { type: 'video/webm' }), cfg.slug + '.webm'); toast('webm saved'); };
      if (!clock.on) clock.start();
      rec.start(); toast(`recording ${secs}s`);
      setTimeout(() => rec.stop(), secs * 1000);
    };

    /* keys */
    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); }
      else if (e.metaKey || e.ctrlKey || e.altKey) return;
      else if (k === 'r') randomise();
      else if (k === ' ' && !cfg.static) { e.preventDefault(); clock.toggle(); }
      else if (k === 'z') e.shiftKey ? api.redo() : api.undo();
    });

    refresh();
    requestAnimationFrame(() => {
      layout();
      syncPlay();
      if (!cfg.static && !reduced) clock.start();
    });
    return api;
  }

  /* ---------- shared drawing helpers ---------- */
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  /* luminance field of an image fitted into W x H (contain), as Float32 0..1 ink */
  function inkField(img, W, H, { fit = 0.8, blur = 0, invert = false, ox = 0, oy = 0, alphaOnly = false } = {}) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    if (img) {
      const s = Math.min(W * fit / img.width, H * fit / img.height);
      const w = img.width * s, hh = img.height * s;
      if (blur) x.filter = `blur(${blur}px)`;
      x.drawImage(img, (W - w) / 2 + ox * W, (H - hh) / 2 + oy * H, w, hh);
    }
    const d = x.getImageData(0, 0, W, H).data, f = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const l = (d[i * 4] * .2126 + d[i * 4 + 1] * .7152 + d[i * 4 + 2] * .0722) / 255;
      f[i] = invert ? l : 1 - l;
    }
    return { W, H, f, at(px, py) { const ix = px | 0, iy = py | 0; return (ix < 0 || iy < 0 || ix >= W || iy >= H) ? 0 : f[iy * W + ix]; },
      // bilinear
      lerp(px, py) {
        const x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
        const a = this.at(x0, y0), b = this.at(x0 + 1, y0), c2 = this.at(x0, y0 + 1), d2 = this.at(x0 + 1, y0 + 1);
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d2 * tx) * ty;
      } };
  }
  const ease = {
    linear: t => t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    expo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    back: t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  // tiny deterministic PRNG so a seed reproduces a composition
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }

  return { tool, h, $, toast, copy, download, loadImage, inkField, ease, clamp, rng, reduced, ICON };
})();
