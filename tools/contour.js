/* Contour - generated sea floors drawn the way bathymetric charts draw them:
   a depth contour every `interval` metres, a heavier index contour every
   `index` lines with its depth written along it, spot soundings in metres,
   and depth tints that darken with depth. Terrain is noise shaped into a real
   form (shelf and slope, seamount, trench, canyon), so no real map is copied.

   Contour.field(o)            -> { w, h, z(x,y) in metres, data }
   Contour.draw(ctx, W, H, o)  -> draws the chart into a 2D context
   Contour.svg(W, H, o)        -> the same chart as an SVG string                */
(function () {
  function noise(seed) {
    const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 91.3) * 43758.5453; return s - Math.floor(s); };
    const v = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; };
    return (x, y) => { let s = 0, a = .5, f = 1; for (let i = 0; i < 5; i++) { s += a * v(x * f, y * f); a *= .5; f *= 2.03; } return s; };
  }
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // depth in metres (positive down) at u, v in 0..1
  function shape(o) {
    const n = noise(o.seed ?? 3), rough = o.rough ?? .5, max = o.max ?? 4000;
    const forms = {
      shelf: (u, v) => { const edge = .35 + (n(u * 2, 9) - .5) * .35; return 40 + sstep(edge - .08, edge + .25, v) * max; },
      seamount: (u, v) => { const r = Math.hypot((u - .5) * 1.4, v - .55); return max * (.25 + .75 * sstep(.05, .55, r)); },
      trench: (u, v) => { const c = .55 + (n(u * 1.5, 4) - .5) * .25; return max * (.35 + .65 * Math.exp(-Math.pow((v - c) / .14, 2))); },
      canyon: (u, v) => { const c = .5 + (n(v * 2, 7) - .5) * .35, wall = Math.exp(-Math.pow((u - c) / .08, 2)); return 60 + max * (.55 * sstep(0, 1, v) + .4 * wall * sstep(.1, .5, v)); },
      plain: (u, v) => max * (.6 + .3 * v),
    };
    const f = forms[o.form] || forms.shelf;
    const asp = o.asp || 1;   // keep features round on wide strips
    return (u, v) => f(u, v) + (n(u * (o.scale ?? 3) * asp, v * (o.scale ?? 3)) - .5) * max * .35 * rough;
  }
  function field(o, w, h) {
    const z = shape(o), data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = z(x / (w - 1), y / (h - 1));
    return { w, h, data, z };
  }
  // marching squares: segments for each level, in field cells
  function iso(f, lv) {
    const { w, h, data } = f, segs = [];
    const T = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 2], [0, 1]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 3], [1, 2]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = data[y * w + x], b = data[y * w + x + 1], c = data[(y + 1) * w + x + 1], d = data[(y + 1) * w + x];
      const k = (a > lv) | (b > lv) << 1 | (c > lv) << 2 | (d > lv) << 3; if (k === 0 || k === 15) continue;
      const I = (p, q) => (lv - p) / (q - p), e = [[x + I(a, b), y], [x + 1, y + I(b, c)], [x + I(d, c), y + 1], [x, y + I(a, d)]];
      T[k].forEach(s => segs.push(e[s[0]][0], e[s[0]][1], e[s[1]][0], e[s[1]][1]));
    }
    return segs;
  }
  // join loose segments into polylines so labels can follow a line
  function chain(segs) {
    const key = (x, y) => Math.round(x * 64) + ',' + Math.round(y * 64), ends = new Map(), used = new Uint8Array(segs.length / 4), lines = [];
    for (let i = 0; i < segs.length; i += 4) { [[segs[i], segs[i + 1]], [segs[i + 2], segs[i + 3]]].forEach(p => { const k = key(p[0], p[1]); (ends.get(k) || ends.set(k, []).get(k)).push(i / 4); }); }
    for (let s = 0; s < used.length; s++) {
      if (used[s]) continue; used[s] = 1; const line = [[segs[s * 4], segs[s * 4 + 1]], [segs[s * 4 + 2], segs[s * 4 + 3]]];
      for (const dir of [1, 0]) {
        for (;;) {
          const tip = dir ? line[line.length - 1] : line[0], cand = (ends.get(key(tip[0], tip[1])) || []).find(j => !used[j]); if (cand == null) break;
          used[cand] = 1; const p = [segs[cand * 4], segs[cand * 4 + 1]], q = [segs[cand * 4 + 2], segs[cand * 4 + 3]];
          const nxt = key(p[0], p[1]) === key(tip[0], tip[1]) ? q : p; dir ? line.push(nxt) : line.unshift(nxt);
        }
      }
      lines.push(line);
    }
    return lines;
  }
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  // build the chart once: tint image, lines, labels, soundings
  function build(W, H, o) {
    const res = o.res ?? 6, w = Math.max(8, Math.round(W / res)), h = Math.max(8, Math.round(H / res)), f = field({ asp: W / H, ...o }, w, h);
    const interval = +(o.interval ?? 200), every = +(o.index ?? 5), max = +(o.max ?? 4000), levels = [];
    for (let lv = interval; lv < max * 1.3; lv += interval) levels.push(lv);
    const sx = W / (w - 1), sy = H / (h - 1), out = { W, H, f, levels: [], soundings: [] };
    levels.forEach((lv, i) => { const idx = (i + 1) % every === 0; out.levels.push({ lv, idx, lines: chain(iso(f, lv)).map(l => l.map(p => [p[0] * sx, p[1] * sy])) }); });
    const n = noise((o.seed ?? 3) + 11), count = o.soundings ?? 18;
    for (let i = 0; i < count; i++) { const u = .05 + ((i * .618) % 1) * .9, v = .08 + ((i * .382 + .13) % 1) * .84; out.soundings.push([u * W, v * H, Math.round(f.z(u, v))]); }
    return out;
  }
  function draw(ctx, W, H, o = {}) {
    const B = o._built && o._built.W === W && o._built.H === H ? o._built : build(W, H, o);
    const c0 = rgb(o.shallow ?? '#cfeff0'), c1 = rgb(o.deep ?? '#0b3552'), ink = o.ink ?? '#0b2c36', idxInk = o.indexInk ?? ink, max = o.max ?? 4000;
    if (o.tint !== false) {            // depth tints in steps, as charts do
      const { w, h, data } = B.f, img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { const t = Math.min(1, Math.floor(Math.max(0, data[i]) / (o.interval ?? 200)) * (o.interval ?? 200) / (max * 1.15)); const c = lerp(c0, c1, Math.pow(t, .8)); img.data.set([c[0], c[1], c[2], 255], i * 4); }
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = o.tintAlpha ?? 1; ctx.drawImage(tmp, 0, 0, W, H); ctx.restore();
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    B.levels.forEach(L => {
      ctx.strokeStyle = L.idx ? idxInk : ink; ctx.globalAlpha = L.idx ? (o.indexAlpha ?? .9) : (o.lineAlpha ?? .45); ctx.lineWidth = L.idx ? (o.weight ?? 1) * 1.8 : (o.weight ?? 1) * .8;
      ctx.beginPath(); L.lines.forEach(l => { if (l.length < 3) return; ctx.moveTo(l[0][0], l[0][1]); for (let i = 1; i < l.length; i++) ctx.lineTo(l[i][0], l[i][1]); }); ctx.stroke();
    });
    if (o.labels !== false) {          // index depths written along the line, the line broken under them
      ctx.font = `italic 500 ${o.labelSize ?? 10}px ${o.font ?? 'ui-monospace, Menlo, monospace'}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      B.levels.filter(L => L.idx).forEach(L => L.lines.filter(l => l.length > 24).forEach(l => {
        const i = Math.floor(l.length / 2), a = l[i - 2], b = l[i + 2]; let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        const t = L.lv.toLocaleString(); ctx.save(); ctx.translate(l[i][0], l[i][1]); ctx.rotate(ang);
        ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.strokeStyle = o.halo ?? (o.shallow ?? '#cfeff0'); ctx.strokeText(t, 0, .5);
        ctx.globalAlpha = .95; ctx.fillStyle = idxInk; ctx.fillText(t, 0, .5); ctx.restore();
      }));
    }
    if (o.soundings !== 0) {           // spot depths in small italic figures
      ctx.font = `italic 400 ${(o.labelSize ?? 10) - 1}px ${o.font ?? 'ui-monospace, Menlo, monospace'}`; ctx.fillStyle = ink; ctx.globalAlpha = .7; ctx.textAlign = 'center';
      B.soundings.forEach(([x, y, z]) => ctx.fillText(z.toLocaleString(), x, y));
    }
    ctx.restore();
    return B;
  }
  function svg(W, H, o = {}) {
    const B = build(W, H, o), ink = o.ink ?? '#0b2c36', idxInk = o.indexInk ?? ink, r = v => Math.round(v * 10) / 10;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
    B.levels.forEach(L => { const d = L.lines.filter(l => l.length > 2).map(l => 'M' + l.map(p => r(p[0]) + ' ' + r(p[1])).join('L')).join('');
      if (d) s += `<path d="${d}" stroke="${L.idx ? idxInk : ink}" stroke-opacity="${L.idx ? .9 : .45}" stroke-width="${L.idx ? 1.8 : .8}"/>`; });
    B.soundings.forEach(([x, y, z]) => s += `<text x="${r(x)}" y="${r(y)}" fill="${ink}" fill-opacity=".7" font-family="ui-monospace,Menlo,monospace" font-style="italic" font-size="9" text-anchor="middle">${z}</text>`);
    return s + '</svg>';
  }
  window.Contour = { field, build, draw, svg };
})();
