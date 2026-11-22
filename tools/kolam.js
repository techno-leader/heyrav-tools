/* kolam.js - kolams from rules, for the tools and the Kolam world.

   Kolam: a sikku kolam as a line between dots. Dots sit at cell centres; the
   line runs at 45 degrees through the midpoints of the edges between them, like
   a ray of light. At each edge it crosses itself (0), bounces back along the edge
   and keeps the two dots apart (1), or bounces across and slips between them (2).
   The outer edge always bounces. Coordinates are doubled so every point is an
   integer.

   weave() starts from the fully crossed lattice, joins it into one line, then
   carves in turns that keep it one line - so the same dots give a new kolam
   every time. Shapes: diamond, square, stepped, star, octagon, cross, plus,
   triangle, blocks, or any mask typed as text. Drawing uses true tangents:
   diagonal through a crossing, along the mirror at a bounce, so lines cross
   square, hug the dots, and end their arms in pointed petals.
*/
const Kolam = (() => {
  function build(o) {
    const R = o.rows, C = o.cols, W = !!o.wrap, st = o.state || (o.state = new Map());
    const wc = c => W ? ((c % C) + C) % C : c;
    const has = (r, c) => { c = wc(c); return r >= 0 && r < R && c >= 0 && c < C && (!o.has || o.has(r, c)); };
    const wx = x => W ? ((x % (2 * C)) + 2 * C) % (2 * C) : x;
    const key = (x, y) => wx(x) + ',' + y;
    const inner = (x, y) => { x = wx(x); return x % 2 === 0 ? has((y - 1) / 2, x / 2 - 1) && has((y - 1) / 2, x / 2) : has(y / 2 - 1, (x - 1) / 2) && has(y / 2, (x - 1) / 2); };
    const kind = (x, y) => inner(x, y) ? (st.get(key(x, y)) || 0) : 1;
    function turn(x, y, dx, dy) {
      const s = kind(x, y), v = wx(x) % 2 === 0;
      if (!s) return [dx, dy];
      if (s === 1) return v ? [-dx, dy] : [dx, -dy];
      return v ? [dx, -dy] : [-dx, dy];
    }
    function seg(x, y, dx, dy) {
      let r, c;
      if (wx(x) % 2 === 0) { c = dx > 0 ? x / 2 : x / 2 - 1; r = (y - 1) / 2; } else { r = dy > 0 ? y / 2 : y / 2 - 1; c = (x - 1) / 2; }
      const rx = x + dx / 2 - (2 * c + 1), ry = y + dy / 2 - (2 * r + 1);
      return wc(c) + '_' + r + '_' + (rx > 0 ? 1 : 0) + (ry > 0 ? 1 : 0);
    }
    const cells = [], internal = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (has(r, c)) {
      cells.push([r, c]);
      if (has(r, c + 1) && (W || c + 1 < C)) internal.push([2 * c + 2, 2 * r + 1]);
      if (has(r + 1, c)) internal.push([2 * c + 1, 2 * r + 2]);
    }
    const seen = new Set(), loops = [], ptLoop = new Map();
    for (const [r, c] of cells) for (const [px, py, dx, dy] of [[2 * c, 2 * r + 1, 1, -1], [2 * c + 1, 2 * r, 1, 1], [2 * c + 2, 2 * r + 1, -1, 1], [2 * c + 1, 2 * r + 2, -1, -1]]) {
      if (seen.has(seg(px, py, dx, dy))) continue;
      const id = loops.length, pts = [], dirs = [];
      let x = px, y = py, ex = dx, ey = dy, n = 0, ix = dx, iy = dy;
      for (;;) {
        seen.add(seg(x, y, ex, ey)); pts.push([x, y]); dirs.push([ix, iy, ex, ey]);
        const k = key(x, y); (ptLoop.get(k) || ptLoop.set(k, []).get(k)).push(id);
        x += ex; y += ey; ix = ex; iy = ey; [ex, ey] = turn(x, y, ex, ey);
        if (wx(x) === wx(px) && y === py && ex === dx && ey === dy) break;
        if (++n > 80000) break;
      }
      // fix the first point's incoming direction (we started mid-line)
      dirs[0][0] = ix; dirs[0][1] = iy;
      loops.push({ pts, dirs, shift: x - px });
    }
    return { loops, cells, internal, ptLoop, key, kind, has, o };
  }

  /* ---------- dot shapes (masks on an R x C field) ---------- */
  const shapes = {
    diamond: N => { const m = (N - 1) / 2; return { rows: N, cols: N, has: (r, c) => Math.abs(r - m) + Math.abs(c - m) <= m }; },
    square: N => ({ rows: N, cols: N, has: null }),
    // a diamond of square blocks, like the black pin: |r|+|c| measured in blocks of b
    // a diamond whose outer layer is notched away from the axes: arms at the four ends, concave shoulders
    stepped: N => { const m = (N - 1) / 2; return { rows: N, cols: N, has: (r, c) => { const R = Math.abs(r - m), C = Math.abs(c - m); return R + C <= m && !(R + C === m && R >= 2 && C >= 2); } }; },
    cross: (N, w) => { const m = (N - 1) / 2; w = w || Math.max(1, Math.round(N / 6)); return { rows: N, cols: N, has: (r, c) => Math.abs(r - m) <= w || Math.abs(c - m) <= w }; },
    octagon: N => { const m = (N - 1) / 2, k = Math.round(m * 1.45); return { rows: N, cols: N, has: (r, c) => Math.abs(r - m) + Math.abs(c - m) <= k }; },
    // deeper notch: a four-armed star
    star: N => { const m = (N - 1) / 2; return { rows: N, cols: N, has: (r, c) => { const R = Math.abs(r - m), C = Math.abs(c - m); return (R + C <= m && !(R + C >= m - 1 && R >= 2 && C >= 2)) || R + C <= m - 2; } }; },
    plus: N => { const m = (N - 1) / 2; return { rows: N, cols: N, has: (r, c) => { const R = Math.abs(r - m), C = Math.abs(c - m); return R + C <= m && (R <= 1 || C <= 1 || R + C <= m - 1); } }; },
    // a triangle (the mountain): row r holds 2r+1 dots
    triangle: N => ({ rows: N, cols: 2 * N - 1, has: (r, c) => Math.abs(c - (N - 1)) <= r }),
    // blocks of b cells stepped into a cross (a stepped field)
    blocks: (N, b = 3) => { const m = (N - 1) / 2; return { rows: N, cols: N, has: (r, c) => Math.floor((Math.abs(r - m) + Math.floor(b / 2)) / b) + Math.floor((Math.abs(c - m) + Math.floor(b / 2)) / b) <= Math.floor((m + Math.floor(b / 2)) / b) }; },
    // any mask from text: 'o' is a dot
    ascii: lines => { const R = lines.length, C = Math.max(...lines.map(l => l.length)); return { rows: R, cols: C, has: (r, c) => (lines[r] || '')[c] === 'o' }; },
    rows: (spec) => { // e.g. [3,5,7,7,7,5,3]
      const N = Math.max(...spec), R = spec.length; return { rows: R, cols: N, has: (r, c) => { const w = spec[r], a = (N - w) / 2; return c >= a && c < a + w && Number.isInteger(a) ? true : c >= Math.ceil(a) && c < Math.ceil(a) + w; } };
    },
  };

  /* ---------- symmetry orbits of an edge point on an R x C field ---------- */
  function orbiter(R, C, sym) {
    const T = [], id = p => p;
    const rot = ([x, y]) => [C + R - y, x - C + R], flipX = ([x, y]) => [2 * C - x, y], flipY = ([x, y]) => [x, 2 * R - y];
    // rot only valid when R==C; centre (C,R) in doubled coords
    const r2 = p => flipX(flipY(p));
    if (sym === 'none') T.push(id);
    else if (sym === 'mirror') T.push(id, flipX);
    else if (sym === 'D2') T.push(id, flipX, flipY, r2);
    else if (sym === 'C2') T.push(id, r2);
    else if (sym === 'C4') T.push(id, rot, p => rot(rot(p)), p => rot(rot(rot(p))));
    else T.push(id, rot, p => rot(rot(p)), p => rot(rot(rot(p))), flipX, p => flipX(rot(p)), p => flipX(rot(rot(p))), p => flipX(rot(rot(rot(p)))));
    return p => { const m = new Map(); T.forEach(t => { const q = t(p); m.set(q[0] + ',' + q[1], q); }); return [...m.values()]; };
  }
  /* translation orbit for bands: repeat every `per` cells */
  const period = (C, per) => p => { const out = []; for (let k = 0; k < C / per; k++) out.push([((p[0] + 2 * per * k) % (2 * C) + 2 * C) % (2 * C), p[1]]); return out; };

  /* translation orbit in 2D: repeat every p cells across and down (tiled fields) */
  const lattice = (R, C, p) => q => { const out = []; for (let i = -R; i <= R; i++) for (let j = -C; j <= C; j++) { const x = q[0] + 2 * p * j, y = q[1] + 2 * p * i; if (x > 0 && y > 0 && x < 2 * C && y < 2 * R) out.push([x, y]); } return out; };
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* is this loop a small ring round a single dot (4 bounces)? */
  const isRing = l => l.pts.length === 4;

  /* join loops into one by flipping points where two different loops meet */
  function join(o, k, orbits, rnd, keepRings) {
    const big = k => k.loops.filter(l => !(keepRings && isRing(l))).length;
    for (let guard = 0; big(k) > 1 && guard < 600; guard++) {
      let ok = false;
      for (const orbit of orbits) {
        const c = shuffle(k.internal.filter(p => new Set(k.ptLoop.get(k.key(p[0], p[1]))).size > 1), rnd);
        c.sort((a, b) => (o.state.get(k.key(a[0], a[1])) ? 1 : 0) - (o.state.get(k.key(b[0], b[1])) ? 1 : 0));
        for (const p of c.slice(0, 60)) {
          const keys = orbit(p).map(q => k.key(q[0], q[1])), cur = o.state.get(keys[0]) || 0;
          if (keys.some(q => (o.state.get(q) || 0) !== cur)) continue;
          const opts = shuffle([0, 1, 2].filter(v => v !== cur), rnd);
          for (const s of opts) {
            keys.forEach(q => s ? o.state.set(q, s) : o.state.delete(q));
            const k2 = build(o);
            if (big(k2) < big(k)) { k = k2; ok = true; break; }
            keys.forEach(q => cur ? o.state.set(q, cur) : o.state.delete(q));
          }
          if (ok) break;
        }
        if (ok) break;
      }
      if (!ok) break;
    }
    return k;
  }

  /* weave: crossed lattice -> one line -> carve turns that keep one line -> a few quirks.
     opts: sym ('D4','C4','D2','C2','mirror','none' or a function), density 0..1 (how many points
     become turns), bias 0..1 (share of turns that bounce along vs across), rings (allow small
     circles round single dots), quirks (count of asymmetric single changes), seed */
  function weave(o, opts = {}) {
    const rnd = opts.rnd || rng(opts.seed || 1);
    const R = o.rows, C = o.cols;
    const orbitOf = typeof opts.sym === 'function' ? opts.sym : orbiter(R, C, opts.sym || 'C4');
    const fall = [orbitOf, orbiter(R, C, 'C2'), orbiter(R, C, 'none')];
    if (R !== C && typeof opts.sym !== 'function') fall[0] = orbiter(R, C, opts.sym === 'none' ? 'none' : 'D2');
    o.state = new Map(opts.state || []);
    const locked = new Set();
    let k = build(o);
    if (opts.ringCells) for (const [r, c] of opts.ringCells) {
      [[2 * c, 2 * r + 1], [2 * c + 2, 2 * r + 1], [2 * c + 1, 2 * r], [2 * c + 1, 2 * r + 2]].forEach(([x, y]) => { const kk = k.key(x, y); if (k.internal.some(p => p[0] === x && p[1] === y)) { o.state.set(kk, 1); locked.add(kk); } });
    }
    k = build(o);
    k = join(o, k, fall, rnd, !!opts.ringCells);
    const ringsOk = !!opts.rings || !!opts.ringCells, density = opts.density ?? .35, bias = opts.bias ?? .5;
    const count = l => l.filter(x => !(ringsOk && isRing(x))).length;
    const base = count(k.loops);
    // carve
    const done = new Set(), orbits = [];
    for (const p of shuffle(k.internal.slice(), rnd)) {
      const kk = k.key(p[0], p[1]); if (done.has(kk)) continue;
      const orb = orbitOf(p); orb.forEach(q => done.add(k.key(q[0], q[1]))); orbits.push(orb);
    }
    let target = Math.round(orbits.length * density), made = 0, ringN = 0;
    const maxRings = opts.maxRings ?? Math.max(1, Math.round(k.cells.length / 9)) + (opts.ringCells ? opts.ringCells.length : 0);
    for (const orb of orbits) {
      if (made >= target) break;
      const keys = orb.map(q => k.key(q[0], q[1])); const cur = o.state.get(keys[0]) || 0;
      if (cur || keys.some(q => locked.has(q))) continue;
      const first = rnd() < bias ? 1 : 2;
      for (const s of [first, 3 - first]) {
        keys.forEach(q => o.state.set(q, s));
        const k2 = build(o), rn = k2.loops.filter(isRing).length;
        if (count(k2.loops) <= base && (!ringsOk || rn <= maxRings)) { k = k2; made++; ringN = rn; break; }
        keys.forEach(q => o.state.delete(q));
      }
    }
    // quirks: single-point changes that keep one line, breaking symmetry a little
    let q = opts.quirks || 0;
    const pool = shuffle(k.internal.slice(), rnd);
    for (const p of pool) {
      if (q <= 0) break;
      const kk = k.key(p[0], p[1]), cur = o.state.get(kk) || 0;
      if (locked.has(kk)) continue;
      for (const s of shuffle([0, 1, 2].filter(v => v !== cur), rnd)) {
        s ? o.state.set(kk, s) : o.state.delete(kk);
        const k2 = build(o);
        if (count(k2.loops) <= base && k2.loops.filter(isRing).length <= Math.max(ringN, ringsOk ? maxRings : 0)) { k = k2; q--; break; }
        cur ? o.state.set(kk, cur) : o.state.delete(kk);
      }
    }
    return k;
  }

  /* ---------- drawing ----------
     Each point of a loop carries its incoming and outgoing direction. The tangent there is their
     average: diagonal through a crossing, along the mirror at a bounce. Consecutive points join by
     cubic Bezier with handles along those tangents.
     style.round  handle length (0.35 tight .. 0.62 very round)
     style.tips   'round' | 'petal' (corners and ends become pointed petals, as women draw them)
     style.reach  how far a petal tip reaches beyond its dot (1 = cell corner) */
  function geom(loop, k, style = {}) {
    const P = loop.pts, D = loop.dirs, n = P.length, sh = loop.shift;
    const hr = style.round ?? .5, tips = style.tips || 'round', reach = style.reach ?? 1.35, endReach = style.endReach ?? 1.9;
    const N = [];
    for (let i = 0; i < n; i++) {
      const [ix, iy, ox, oy] = D[i];
      let tx = ix + ox, ty = iy + oy; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const bounce = !(ix === ox && iy === oy);
      N.push({ x: P[i][0], y: P[i][1], tx, ty, bounce, cell: null });
    }
    // cell of the segment from i to i+1 (the dot it curls around)
    const cellOf = (a, b) => [Math.floor((a.x + b.x) / 2 / 2) * 2 + 1, Math.floor((a.y + b.y) / 2 / 2) * 2 + 1];
    const pts = N.map(p => ({ ...p }));
    if (tips === 'petal' || tips === 'all') {
      // find runs of consecutive bounces on the outer edge that wrap one dot
      const outer = i => { const p = P[(i + n) % n]; return k && k.kind(p[0], p[1]) === 1 && !isInner(k, p[0], p[1]); };
      const mark = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        const a = N[i], b = N[(i + 1) % n];
        if (!(a.bounce && b.bounce && outer(i) && outer(i + 1))) continue;
        const c3 = N[(i + 2) % n];
        const cA = cellOf(a, b);
        if (c3.bounce && outer(i + 2) && sameCell(cellOf(b, c3), cA)) {
          // end of an arm: three bounces round one dot -> long pointed tip through the middle one
          const vx = b.x - cA[0], vy = b.y - cA[1];
          mark[(i + 1) % n] = { x: cA[0] + vx * endReach, y: cA[1] + vy * endReach, cusp: true };
          i += 2; continue;
        }
        if (tips !== 'all') continue;
        // corner: two bounces round one dot -> petal tip at the cell corner
        const vx = a.x + b.x - 2 * cA[0], vy = a.y + b.y - 2 * cA[1];
        mark[i] = { x: cA[0] + vx * reach / 2 * 1, y: cA[1] + vy * reach / 2 * 1, cusp: true, drop: (i + 1) % n };
        i += 1;
      }
      const out = [];
      for (let i = 0; i < n; i++) {
        if (mark[i] && mark[i].drop !== undefined) { out.push({ ...mark[i] }); i++; continue; }
        if (mark[i]) { out.push({ ...mark[i] }); continue; }
        out.push(pts[i]);
      }
      return { pts: out, hr, sh };
    }
    return { pts, hr, sh };
  }
  const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
  function isInner(k, x, y) { // an internal point with a mirror is not "outer"
    return k.internal.some(p => p[0] === x && p[1] === y);
  }

  /* closed path string; map(x,y) -> [X,Y] in pixels */
  // neighbour j of a closed loop; past the end the loop continues shifted (wrapped bands)
  const nb = (g, j) => { const p = g.pts, n = p.length, k = Math.floor(j / n), q = p[((j % n) + n) % n]; return k && g.sh ? { ...q, x: q.x + g.sh * k } : q; };
  function pathD(g, map) {
    const p = g.pts, n = p.length, hr = g.hr, f = v => v.toFixed(2);
    const T = i => {
      const a = p[(i + n) % n];
      if (!a.cusp) return [a.tx, a.ty];
      return null;
    };
    let d = '';
    for (let i = 0; i <= n; i++) {
      const a = nb(g, i), b = nb(g, i + 1);
      if (i === 0) { const q = map(a.x, a.y); d += 'M' + f(q[0]) + ' ' + f(q[1]); }
      if (i === n) break;
      const dist = Math.hypot(b.x - a.x, b.y - a.y), h = dist * hlen(a, b, hr);
      let ta = T(i), tb = T(i + 1);
      // cusp handles aim along the chord, pulled outward a little, giving pointed petals
      if (!ta) { const pr = nb(g, i - 1); ta = norm(b.x - a.x + (a.x - pr.x) * -.15, b.y - a.y + (a.y - pr.y) * -.15); }
      if (!tb) { const nx = nb(g, i + 2); tb = norm(b.x - a.x + (nx.x - b.x) * -.15, b.y - a.y + (nx.y - b.y) * -.15); }
      const c1 = map(a.x + ta[0] * h, a.y + ta[1] * h), c2 = map(b.x - tb[0] * h, b.y - tb[1] * h), q = map(b.x, b.y);
      d += 'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(q[0]) + ' ' + f(q[1]);
    }
    return d + 'Z';
  }
  // bounce-to-bounce arcs are quarter circles round a dot (0.39 of the chord); crossings pass straighter
  const hlen = (a, b, hr) => { if (a.cusp || b.cusp) return hr * .9; const nb = (a.bounce ? 1 : 0) + (b.bounce ? 1 : 0); return nb === 2 ? .39 * hr / .5 : nb === 1 ? .44 * hr / .5 : .5 * hr / .5; };
  const norm = (x, y) => { const L = Math.hypot(x, y) || 1; return [x / L, y / L]; };

  /* sample a geom into a polyline (for canvas, animation and polar mapping) */
  function sample(g, per = 8) {
    const p = g.pts, n = p.length, hr = g.hr, out = [];
    for (let i = 0; i < n; i++) {
      const a = nb(g, i), b = nb(g, i + 1), dist = Math.hypot(b.x - a.x, b.y - a.y), h = dist * hlen(a, b, hr);
      let ta = a.cusp ? null : [a.tx, a.ty], tb = b.cusp ? null : [b.tx, b.ty];
      if (!ta) { const pr = nb(g, i - 1); ta = norm(b.x - a.x + (a.x - pr.x) * -.15, b.y - a.y + (a.y - pr.y) * -.15); }
      if (!tb) { const nx = nb(g, i + 2); tb = norm(b.x - a.x + (nx.x - b.x) * -.15, b.y - a.y + (nx.y - b.y) * -.15); }
      const c1 = [a.x + ta[0] * h, a.y + ta[1] * h], c2 = [b.x - tb[0] * h, b.y - tb[1] * h];
      for (let t = 0; t < per; t++) {
        const u = t / per, v = 1 - u;
        out.push([v * v * v * a.x + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b.x, v * v * v * a.y + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b.y]);
      }
    }
    const e = nb(g, n); out.push([e.x, e.y]);
    return out;
  }

  /* L-system (Prusinkiewicz & Lindenmayer 1990, after Siromoney): Krishna's anklets */
  function lsys(axiom, rules, n) { let s = axiom; for (let i = 0; i < n; i++) s = s.replace(/./g, ch => rules[ch] ?? ch); return s; }
  function turtle(s, { step = 10, ang = 45, sweep = 270, jitter = 0, rnd = Math.random, steps = 18 } = {}) {
    // F: straight step. X: a loop of `sweep` degrees round a dot, entered and left by half-diagonals.
    const l = step / (2 * Math.SQRT2), A = ang * Math.PI / 180, sw = sweep * Math.PI / 180;
    let x = 0, y = 0, h = 0; const P = [[0, 0]], dots = [];
    const fw = d => { x += Math.cos(h) * d; y += Math.sin(h) * d; P.push([x, y]); };
    const j = () => 1 + (rnd() - .5) * jitter;
    for (const ch of s) {
      if (ch === '+') h -= A; else if (ch === '-') h += A;
      else if (ch === 'F') fw(step * j());
      else if (ch === 'X') {
        fw(l); const da = -sw / steps, r = l * j();
        dots.push([x + Math.cos(h - Math.PI / 2) * r, y + Math.sin(h - Math.PI / 2) * r]);
        for (let i = 0; i < steps; i++) { h += da / 2; fw(r * Math.abs(da)); h += da / 2; }
        fw(l);
      }
    }
    return { pts: P, dots };
  }

  return { build, weave, join, orbiter, period, lattice, shapes, rng, hash, shuffle, geom, pathD, sample, isRing, lsys, turtle };
})();

/* KolamArt - drawing for the kolam engine, the same on canvas and in SVG.

   A pen records strokes, fills and dots once; it then paints them onto a
   canvas (pen.paint(ctx)) or writes them as SVG (pen.svg(W, H)). Every motif
   and every piece of the set draws with a pen, so a tool, a page and an
   export all show the same thing.

   KolamArt.pen()                          a new pen
   KolamArt.piece(pen, G, cx, cy, size, o) a generated kolam G = { o, k } in a size × size box
   KolamArt.gen(spec)                      { o, k } from { shape, n, sym, density, bias, rings, quirks, seed }
   KolamArt.specOf(seed)                   a whole spec from one number - the daily kolam
   KolamArt.daySeed(name, date)            seed for a page name on a date
   KolamArt.SET[id].draw(pen, W, H, o)     the named pieces
   KolamArt.LAYOUTS[id](pen, W, H, rnd, o) compositions: one large kolam and its small ones
   KolamArt.motif.drop/lotus/swirl/ribbon/vine/grain/bud/coil(pen, ...)                       */
const KolamArt = (() => {
  const K = Kolam, TAU = Math.PI * 2;
  const f1 = v => +v.toFixed(1);

  function pen() {
    const ops = [], food = [];
    const P = {
      ops, food,
      stroke(d, w = 2, col = '#f2ece1', o = {}) { ops.push({ t: 's', d, w, col, join: o.join || 'round', cap: o.cap || 'round', alpha: o.alpha ?? 1 }); return P; },
      fill(d, col) { ops.push({ t: 'f', d, col }); return P; },
      dot(x, y, r, col = '#f2ece1') { ops.push({ t: 'c', x, y, r, col }); return P; },
      rect(x, y, w, h, col, rot = 0) { ops.push({ t: 'r', x, y, w, h, col, rot }); return P; },
      /* paint onto a 2D context; colours can be remapped ({ '#f2ece1': ink }) */
      paint(ctx, o = {}) {
        const map = c => (o.remap && o.remap[c]) || c;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const op of ops) {
          if (op.t === 's') { ctx.globalAlpha = op.alpha; ctx.strokeStyle = map(op.col); ctx.lineWidth = op.w * (o.weight || 1); ctx.lineJoin = op.join; ctx.lineCap = op.cap; ctx.stroke(op.p || (op.p = new Path2D(op.d))); }
          else if (op.t === 'f') { ctx.globalAlpha = 1; ctx.fillStyle = map(op.col); ctx.fill(op.p || (op.p = new Path2D(op.d))); }
          else if (op.t === 'c') { ctx.globalAlpha = 1; ctx.fillStyle = map(op.col); ctx.beginPath(); ctx.arc(op.x, op.y, op.r * (o.weight || 1), 0, TAU); ctx.fill(); }
          else if (op.t === 'r') { ctx.globalAlpha = 1; ctx.fillStyle = map(op.col); ctx.save(); ctx.translate(op.x, op.y); ctx.rotate(op.rot); ctx.fillRect(-op.w / 2, -op.h / 2, op.w, op.h); ctx.restore(); }
        }
        ctx.restore();
      },
      /* an SVG document (or just the marks, with o.inner) */
      svg(W, H, o = {}) {
        const map = c => (o.remap && o.remap[c]) || c, wt = o.weight || 1;
        const body = ops.map(op => op.t === 's' ? `<path d="${op.d}" fill="none" stroke="${map(op.col)}" stroke-width="${f1(op.w * wt)}" stroke-linecap="${op.cap}" stroke-linejoin="${op.join}"${op.alpha < 1 ? ` stroke-opacity="${op.alpha}"` : ''}/>`
          : op.t === 'f' ? `<path d="${op.d}" fill="${map(op.col)}"/>`
          : op.t === 'c' ? `<circle cx="${f1(op.x)}" cy="${f1(op.y)}" r="${f1(op.r * wt)}" fill="${map(op.col)}"/>`
          : `<rect x="${f1(op.x - op.w / 2)}" y="${f1(op.y - op.h / 2)}" width="${f1(op.w)}" height="${f1(op.h)}" fill="${map(op.col)}" transform="rotate(${f1(op.rot * 180 / Math.PI)} ${f1(op.x)} ${f1(op.y)})"/>`).join('');
        if (o.inner) return body;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${o.bg ? `<rect width="${W}" height="${H}" fill="${o.bg}"/>` : ''}${body}</svg>`;
      },
    };
    return P;
  }

  /* ---------- generation ---------- */
  const SHAPES = ['diamond', 'stepped', 'star', 'octagon', 'square', 'plus', 'cross', 'triangle', 'blocks'];
  function gen(sp) {
    const o = sp.ascii ? K.shapes.ascii(sp.ascii) : K.shapes[sp.shape || 'diamond'](sp.n || 9);
    const k = K.weave(o, { seed: sp.seed || 1, sym: sp.sym || 'C4', density: sp.density ?? .4, bias: sp.bias ?? .5, rings: sp.rings ?? true, quirks: sp.quirks || 0, ringCells: sp.ringCells });
    return { o, k, sp };
  }
  function specOf(seed) {
    const r = K.rng(seed), pick = a => a[Math.floor(r() * a.length)];
    const shape = pick(['diamond', 'diamond', 'diamond', 'stepped', 'stepped', 'star', 'octagon', 'square']);
    const n = { diamond: pick([5, 7, 7, 9, 9, 11]), stepped: pick([9, 11, 13]), star: pick([11, 13]), octagon: pick([7, 9]), square: pick([5, 6, 7]) }[shape];
    return { shape, n, sym: pick(['C4', 'C4', 'C4', 'D4', 'C2', 'none']), density: .12 + r() * .55, bias: .3 + r() * .4, tips: r() < .75 ? 'petal' : 'round', rings: r() < .55, quirks: Math.floor(r() * 3), seed: (r() * 4294967296) >>> 0 };
  }
  const dayNo = d => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const daySeed = (name, date) => (K.hash(String(name || 'home').trim().toLowerCase()) ^ (date ? Math.imul(dayNo(date), 2654435761) : 0)) >>> 0;

  /* a kolam in a box: returns the map so motifs can sit on its dots */
  function piece(p, G, cx, cy, size, o = {}) {
    const { o: g, k } = G, tips = o.tips || 'petal', rot = (o.rot || 0) * Math.PI / 180;
    const S = (Math.max(g.rows, g.cols) + (tips === 'petal' ? 1.4 : .6)) * (rot ? Math.SQRT1_2 * 1.12 : 1) / (o.fit || 1), s = size / (2 * S);
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const map = (x, y) => { const X = (x - g.cols) * s, Y = (y - g.rows) * s; return [cx + X * ca - Y * sa, cy + X * sa + Y * ca]; };
    const col = o.color || '#f2ece1', lw = o.lw || Math.max(1.2, s * .17), dr = o.dotR || Math.max(1, s * .12);
    k.loops.forEach(L => {
      const geo = K.geom(L, k, { tips, reach: o.reach, endReach: o.endReach }), d = K.pathD(geo, map);
      if (o.double) { p.stroke(d, lw * 2.6, col); p.stroke(d, lw * 1.1, o.double); } else p.stroke(d, lw, col);
      if (o.food) K.sample(geo, 6).forEach(q => p.food.push(map(q[0], q[1])));
    });
    if (o.dots !== false) k.cells.forEach(([r, c]) => { const q = map(2 * c + 1, 2 * r + 1); p.dot(q[0], q[1], dr, col); });
    return { map, s };
  }
  /* a wrapped band (ring or frame) drawn through any map (x, y) -> [X, Y] */
  function band(p, rows, cols, per, seed, map, o = {}) {
    const g = { rows, cols, wrap: true }, k = K.weave(g, { sym: K.period(cols, per), seed, density: o.density ?? .4, bias: o.bias ?? .5, rings: o.rings ?? true, maxRings: o.maxRings ?? cols / per });
    const col = o.color || '#f2ece1';
    k.loops.forEach(L => { const pts = K.sample(K.geom(L, k, { tips: o.tips || 'petal' }), o.per || 6).map(q => map(q[0], q[1])); p.stroke(poly(pts), o.lw || 2, col); if (o.food) pts.forEach(q => p.food.push(q)); });
    if (o.dots !== false) k.cells.forEach(([r, c]) => { const q = map(2 * c + 1, 2 * r + 1); p.dot(q[0], q[1], o.dotR || 1.5, col); });
    return k;
  }
  const polar = (cols, rows, rin, rout, cx, cy, off = 0) => (x, y) => { const a = (x / (2 * cols) + off) * TAU - Math.PI / 2, r = rin + y / (2 * rows) * (rout - rin); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  function rrect(x0, y0, w, h, rad) {
    const segs = [], add = (len, f) => segs.push({ len, f }), q = Math.PI / 2 * rad;
    add(w - 2 * rad, t => [[x0 + rad + t * (w - 2 * rad), y0], [0, -1]]);
    add(q, t => { const a = -Math.PI / 2 + t * Math.PI / 2; return [[x0 + w - rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad], [Math.cos(a), Math.sin(a)]]; });
    add(h - 2 * rad, t => [[x0 + w, y0 + rad + t * (h - 2 * rad)], [1, 0]]);
    add(q, t => { const a = t * Math.PI / 2; return [[x0 + w - rad + Math.cos(a) * rad, y0 + h - rad + Math.sin(a) * rad], [Math.cos(a), Math.sin(a)]]; });
    add(w - 2 * rad, t => [[x0 + w - rad - t * (w - 2 * rad), y0 + h], [0, 1]]);
    add(q, t => { const a = Math.PI / 2 + t * Math.PI / 2; return [[x0 + rad + Math.cos(a) * rad, y0 + h - rad + Math.sin(a) * rad], [Math.cos(a), Math.sin(a)]]; });
    add(h - 2 * rad, t => [[x0, y0 + h - rad - t * (h - 2 * rad)], [-1, 0]]);
    add(q, t => { const a = Math.PI + t * Math.PI / 2; return [[x0 + rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad], [Math.cos(a), Math.sin(a)]]; });
    const total = segs.reduce((a, s) => a + s.len, 0);
    return u => { let d = (((u % 1) + 1) % 1) * total; for (const s of segs) { if (d <= s.len) return s.f(s.len ? d / s.len : 0); d -= s.len; } return segs[0].f(0); };
  }
  const frameMap = (cols, rows, R, bw, off = 0) => (x, y) => { const [[px, py], [nx, ny]] = R(x / (2 * cols) + off), v = (.5 - y / (2 * rows)) * bw; return [px + nx * v, py + ny * v]; };

  /* ---------- small geometry ---------- */
  const poly = (pts, close = true) => 'M' + pts.map(q => f1(q[0]) + ' ' + f1(q[1])).join('L') + (close ? 'Z' : '');
  function smooth(P, closed = true, per = 4) {
    const n = P.length, out = [], g = i => closed ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < (closed ? n : n - 1); i++) { const a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2); for (let t = 0; t < per; t++) { const u = t / per, u2 = u * u, u3 = u2 * u; out.push([0, 1].map(m => .5 * (2 * b[m] + (-a[m] + c[m]) * u + (2 * a[m] - 5 * b[m] + 4 * c[m] - d[m]) * u2 + (-a[m] + 3 * b[m] - 3 * c[m] + d[m]) * u3))); } }
    return out;
  }
  const rot = (x, y, a) => (dx, dy) => [x + dx * Math.cos(a) - dy * Math.sin(a), y + dx * Math.sin(a) + dy * Math.cos(a)];
  const q2 = (...ps) => ps.map(v => f1(v[0]) + ' ' + f1(v[1])).join(' ');

  /* ---------- motifs ---------- */
  const motif = {
    /* a teardrop round a dot: base at (x, y), tip h away along angle a + up */
    drop(p, x, y, h, w, a, col, lw, withDot = true) {
      const R = rot(x, y, a), pts = [R(0, 0), R(-w, -h * .35), R(-w * .55, -h * .8), R(0, -h), R(w * .55, -h * .8), R(w, -h * .35)];
      p.stroke(`M${q2(pts[0])}C${q2(pts[1], pts[2], pts[3])}C${q2(pts[4], pts[5], pts[0])}Z`, lw, col);
      if (withDot) { const c = R(0, -h * .45); p.dot(c[0], c[1], lw * .7, col); }
    },
    /* a ribbon leaf: two edges leave a root, swell and meet at a point, a vein between */
    ribbon(p, cps, w, col, lw, vein = true) {
      const B = t => { const u = 1 - t; return [0, 1].map(m => u * u * u * cps[0][m] + 3 * u * u * t * cps[1][m] + 3 * u * t * t * cps[2][m] + t * t * t * cps[3][m]); };
      const L = [], Rr = [], V = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40, a = B(t), b = B(Math.min(1, t + .01)), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, ww = w * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * .35);
        L.push([a[0] + nx * ww, a[1] + ny * ww]); Rr.push([a[0] - nx * ww, a[1] - ny * ww]); if (t > .12 && t < .82) V.push(a); }
      p.stroke(poly(L, false), lw, col); p.stroke(poly(Rr, false), lw, col); if (vein) p.stroke(poly(V, false), lw * .8, col);
    },
    /* a coil with two ribbon tails sweeping away in opposite directions */
    swirl(p, x, y, s, a, col, lw, flip = 1) {
      const R = (dx, dy) => [x + (dx * Math.cos(a) - dy * flip * Math.sin(a)) * s, y + (dx * Math.sin(a) + dy * flip * Math.cos(a)) * s];
      const sp = []; for (let t = 0; t < 2.4 * Math.PI; t += .15) { const r = .22 * (1 - t / (2.6 * Math.PI)); sp.push(R(Math.cos(t + Math.PI) * r, Math.sin(t + Math.PI) * r)); } p.stroke(poly(sp, false), lw, col);
      motif.ribbon(p, [R(-.05, -.22), R(-.55, -.5), R(-.95, -.6), R(-1.45, -.95)], .1 * s, col, lw);
      motif.ribbon(p, [R(.12, .2), R(.55, .45), R(.95, .5), R(1.3, .42)], .09 * s, col, lw);
    },
    /* a lotus: tall centre petal, two outer petals, two sepals curling away at the foot */
    lotus(p, x, y, s, a, col, lw, fill = null) {
      const R = (dx, dy) => [x + (dx * Math.cos(a) - dy * Math.sin(a)) * s, y + (dx * Math.sin(a) + dy * Math.cos(a)) * s];
      const P = (d, w, h, tilt) => { const c = Math.cos(tilt), sn = Math.sin(tilt), q = (u, v) => R(u * c - v * sn + d, u * sn + v * c); return `M${q2(q(0, 0))}C${q2(q(-w, -h * .3), q(-w * .7, -h * .8), q(0, -h))}C${q2(q(w * .7, -h * .8), q(w, -h * .3), q(0, 0))}Z`; };
      if (fill) p.fill(P(0, .2, .62, 0), fill);
      p.stroke(P(0, .3, 1, 0), lw, col); p.stroke(P(0, .16, .7, 0), lw * .8, col);
      p.stroke(P(-.08, .28, .82, -.55), lw, col); p.stroke(P(.08, .28, .82, .55), lw, col);
      p.stroke(`M${q2(R(-.05, 0))}C${q2(R(-.4, .02), R(-.75, -.1), R(-1.05, -.42))}M${q2(R(.05, 0))}C${q2(R(.4, .02), R(.75, -.1), R(1.05, -.42))}`, lw, col);
      p.stroke(`M${q2(R(-.1, .06))}C${q2(R(-.45, .1), R(-.8, .02), R(-1.05, -.42))}M${q2(R(.1, .06))}C${q2(R(.45, .1), R(.8, .02), R(1.05, -.42))}`, lw * .8, col);
    },
    /* a bud of three pointed petals */
    bud(p, x, y, s, a, col, lw) { [-.55, 0, .55].forEach((o, i) => motif.drop(p, x, y, s * (i === 1 ? 1 : .78), s * .32, a + o, col, lw, i === 1)); },
    /* a grain vine: a one-dot rope chain with pairs of eye leaves, ending in a ribbon leaf */
    grain(p, x0, y0, x1, y1, n, col, lw) {
      const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0), ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, step = len / n, amp = step * .32;
      const s1 = [], s2 = []; for (let i = 0; i <= n * 12; i++) { const t = i / 12, along = t * step, off = Math.sin(t * Math.PI) * amp; s1.push([x0 + ux * along + nx * off, y0 + uy * along + ny * off]); s2.push([x0 + ux * along - nx * off, y0 + uy * along - ny * off]); }
      p.stroke(poly(s1, false), lw, col); p.stroke(poly(s2, false), lw, col);
      for (let i = 0; i < n; i++) { const c = [x0 + ux * (i + .5) * step, y0 + uy * (i + .5) * step]; p.dot(c[0], c[1], lw * .75, col);
        if (i % 2 === 1 && i < n - 1) { const b = [x0 + ux * (i + 1) * step, y0 + uy * (i + 1) * step], lf = step * 1.5;
          [1, -1].forEach(sd => { const tip = [b[0] + (nx * sd * .92 + ux * .38) * lf, b[1] + (ny * sd * .92 + uy * .38) * lf], m = [(b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2], px = -(tip[1] - b[1]) * .2, py = (tip[0] - b[0]) * .2;
            p.stroke(`M${q2(b)}Q${q2([m[0] + px, m[1] + py], tip)}Q${q2([m[0] - px, m[1] - py], b)}Z`, lw, col); p.dot(m[0], m[1], lw * .7, col); }); } }
      const e = [x1, y1], tip = [x1 + ux * step * 2.2, y1 + uy * step * 2.2]; motif.ribbon(p, [e, [e[0] + ux * step * .6 + nx * step * .6, e[1] + uy * step * .6 + ny * step * .6], [tip[0] - ux * step * .6 + nx * step * .2, tip[1] - uy * step * .6 + ny * step * .2], tip], step * .38, col, lw);
    },
    /* a coil of t turns, radius r */
    coil(p, x, y, r, turns, a0, col, lw) { const sp = []; for (let t = 0; t < turns * TAU; t += .2) { const rr = r * (1 - t / ((turns + .2) * TAU)); sp.push([x + Math.cos(t + a0) * rr, y + Math.sin(t + a0) * rr]); } p.stroke(poly(sp, false), lw, col); },
    /* a lamp flame over a dot: the drop, with a filled heart when a colour is given */
    flame(p, x, y, h, col, lw, heart) { motif.drop(p, x, y, h, h * .34, 0, col, lw, !heart); if (heart) { const R = rot(x, y, 0); p.fill(`M${q2(R(0, -h * .12))}C${q2(R(-h * .18, -h * .35), R(-h * .1, -h * .65), R(0, -h * .78))}C${q2(R(h * .1, -h * .65), R(h * .18, -h * .35), R(0, -h * .12))}Z`, heart); } },
  };

  /* ---------- the set: named pieces ---------- */
  const W2 = '#f2ece1', KV = '#ad3b23';
  const lamp = { hanging: ['.....o.....', '.....o.....', '.....o.....', '.....o.....', 'ooooooooooo', '....ooo....', '...ooooo...', '....ooo....', '.....o.....', '.....o.....'],
    standing: ['ooooooooooo', '.ooooooooo.', '...ooooo...', '....ooo....', '.....o.....', '.....o.....', '.....o.....', '....ooo....', '..ooooooo..', '.ooooooooo.'],
    small: ['..o..', '..o..', '..o..', 'ooooo', '.ooo.', '..o..'] };
  function lampAt(p, kind, cx, cy, size, o = {}) {
    const L = lamp[kind], g = K.shapes.ascii(L), G = { o: g, k: K.weave(g, { seed: o.seed || 4, sym: 'mirror', density: kind === 'standing' ? .25 : 0, rings: false }) };
    const m = piece(p, G, cx, cy, size, { color: o.color, lw: o.lw, dotR: o.dotR, fit: kind === 'standing' ? .9 : 1, food: o.food });
    const col = o.color || W2, lw = o.lw || 2;
    if (kind === 'standing') [1, 3, 5, 7, 9].forEach(c => { const [x, y] = m.map(2 * c + 1, 0); motif.flame(p, x, y - m.s * .4, m.s * 2.6, col, lw, o.heart); });
    else { const row = kind === 'small' ? 6 : 8, cols = kind === 'small' ? [0, 1, 3, 4] : [0, 2, 4, 6, 8, 10]; cols.forEach(c => { const [x, y] = m.map(2 * c + 1, row); motif.flame(p, x, y - m.s * .3, m.s * 2.2, col, lw, o.heart); }); }
    return m;
  }
  const lsysPts = (axiom, rules, n, ang = 45) => { const s = K.lsys(axiom, rules, n); let x = 0, y = 0, h = 0; const P = [[0, 0]], A = ang * Math.PI / 180; for (const ch of s) { if (ch === '+') h -= A; else if (ch === '-') h += A; else if (ch === 'f') { x += Math.cos(h); y += Math.sin(h); P.push([x, y]); } } if (Math.hypot(x, y) < .01) P.pop(); return P; };
  const fitPts = (pts, W, H, pad) => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys), sc = Math.min((W - 2 * pad) / (b - a || 1), (H - 2 * pad) / (d - c || 1)); return q => [W / 2 + (q[0] - (a + b) / 2) * sc, H / 2 + (q[1] - (c + d) / 2) * sc]; };

  const SET = {
    textbook: { name: 'The textbook sikku', ground: '#3a3633', draw(p, W, H, o) { piece(p, gen({ shape: 'diamond', n: 7, sym: 'C4', density: 0, rings: false, seed: o.seed || 9 }), W / 2, H / 2, Math.min(W, H) * .92, { tips: 'round', color: o.ink, food: o.food }); } },
    field: { name: 'Stepped field', ground: '#4a4744', draw(p, W, H, o) { const g = K.shapes.blocks(15, 3), m = 7, rc = []; for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) if ((r - m) % 4 === 0 && (c - m) % 4 === 0 && g.has(r, c)) rc.push([r, c]);
        const G = { o: g, k: K.weave(g, { seed: o.seed || 21, sym: 'C4', density: .32, ringCells: rc }) }, M = piece(p, G, W / 2, H / 2, Math.min(W, H) * .94, { tips: 'round', color: o.ink, lw: Math.min(W, H) / 250, dotR: Math.min(W, H) / 360, food: o.food });
        const e = .45, segs = [], has = (r, c) => r >= 0 && c >= 0 && r < 15 && c < 15 && g.has(r, c);
        G.k.cells.forEach(([r, c]) => { const x0 = 2 * c - e, x1 = 2 * c + 2 + e, y0 = 2 * r - e, y1 = 2 * r + 2 + e, L = (a, b) => segs.push(`M${q2(M.map(...a))}L${q2(M.map(...b))}`);
          if (!has(r - 1, c)) L([x0, y0], [x1, y0]); if (!has(r + 1, c)) L([x0, y1], [x1, y1]); if (!has(r, c - 1)) L([x0, y0], [x0, y1]); if (!has(r, c + 1)) L([x1, y0], [x1, y1]); });
        p.stroke(segs.join(''), Math.min(W, H) / 125, o.kaavi || KV, { cap: 'square' }); } },
    kaavi: { name: 'Kaavi frame', ground: '#c99b52', draw(p, W, H, o) {
        const Z = Math.min(W, H) / 400, C = [W / 2, H / 2], ink = o.ink || W2, kv = o.kaavi || KV, l = 1.5 * Z;
        const RS = (d, u) => { const half = (150 - d) * Z, rad = (62 - d * .4) * Z, per = 8 * (half - rad) + TAU * rad; let t = (((u % 1) + 1) % 1) * per;
          for (let k = 0; k < 4; k++) for (const [ty, len] of [['L', 2 * (half - rad)], ['A', Math.PI / 2 * rad]]) { if (t <= len) { const ang = k * Math.PI / 2; let x, y, nx, ny;
              if (ty === 'L') { x = -(half - rad) + t; y = -half; nx = 0; ny = -1; } else { const th = -Math.PI / 2 + t / rad; x = (half - rad) + Math.cos(th) * rad; y = -(half - rad) + Math.sin(th) * rad; nx = Math.cos(th); ny = Math.sin(th); }
              const c = Math.cos(ang), sn = Math.sin(ang); return [[C[0] + x * c - y * sn, C[1] + x * sn + y * c], [nx * c - ny * sn, nx * sn + ny * c]]; } t -= len; }
          return [C, [0, -1]]; };
        const ring = (d, f) => { const Pt = []; for (let i = 0; i <= 480; i++) { const u = i / 480, [[x, y], [nx, ny]] = RS(d, u), oo = (f ? f(u) : 0) * Z; Pt.push([x + nx * oo, y + ny * oo]); } return Pt; };
        const corner = u => { const qq = (u * 4) % 1; return Math.max(0, 1 - Math.abs(qq - .625) / .12); };
        p.stroke(poly(ring(-26, u => Math.abs(Math.sin(u * 44 * Math.PI)) * 9)), 5 * Z, kv); p.stroke(poly(ring(-20, u => Math.abs(Math.sin(u * 44 * Math.PI)) * 8)), l, ink);
        for (let i = 0; i < 44; i++) { const [[x, y], [nx, ny]] = RS(-8, (i + .5) / 44), a = Math.atan2(ny, nx) + Math.PI / 2; motif.drop(p, x - nx * 2 * Z, y - ny * 2 * Z, 13 * Z, 4.5 * Z, a, ink, 1.2 * Z, false); p.dot(x + nx * 4 * Z, y + ny * 4 * Z, 2.2 * Z, kv); }
        p.stroke(poly(ring(4)), 4 * Z, kv); p.stroke(poly(ring(54)), 4 * Z, kv);
        for (let i = 0; i < 8; i++) p.stroke(poly(ring(8 + i * 6, u => corner(u) * Math.sin(u * 520) * 2.2)), l, ink);
        const sq = (half, ang, n, gap) => { for (let i = 0; i < n; i++) { const hh = (half - i * gap) * Z, oo = 12 * Z; for (let k = 0; k < 4; k++) { const R = rot(C[0], C[1], ang + k * Math.PI / 2); p.stroke(`M${q2(R(-hh - oo, -hh))}L${q2(R(hh + oo, -hh))}`, l, ink); } } };
        sq(78, 0, 4, 6); sq(78, Math.PI / 4, 4, 6);
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 - Math.PI / 2; motif.lotus(p, C[0] + Math.cos(a) * 116 * Z, C[1] + Math.sin(a) * 116 * Z, 22 * Z, a + Math.PI / 2, ink, 1.3 * Z, kv); }
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8, x = C[0] + Math.cos(a) * 92 * Z, y = C[1] + Math.sin(a) * 92 * Z; motif.coil(p, x, y, 6.5 * Z, 1, a, ink, 1.3 * Z); p.dot(x, y, 1.8 * Z, kv); }
        const hs = 44 * Z, R = rot(C[0], C[1], Math.PI / 4); p.stroke(poly([R(-hs, -hs), R(hs, -hs), R(hs, hs), R(-hs, hs)]), 6 * Z, kv);
        for (let i = 1; i < 10; i++) { const v = -hs + i * hs / 5; p.stroke(`M${q2(R(v, -hs + 4 * Z))}L${q2(R(v, hs - 4 * Z))}M${q2(R(-hs + 4 * Z, v))}L${q2(R(hs - 4 * Z, v))}`, 1.2 * Z, ink); }
        p.dot(C[0], C[1], 3.2 * Z, kv);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => [[-6, 0], [6, 0], [0, -8]].forEach(([dx, dy]) => motif.coil(p, C[0] + sx * 156 * Z + dx * Z, C[1] + sy * 156 * Z + dy * Z, 5 * Z, .9, 0, ink, 1.2 * Z))); } },
    oxide: { name: 'On a red oxide floor', ground: '#9c4a33', draw(p, W, H, o) {
        const Z = Math.min(W, H) / 400, ox = W / 2 - 200 * Z, oy = H / 2 - 200 * Z, X = (x, y) => [ox + x * Z, oy + y * Z], ink = o.ink || W2, l = 1.5 * Z;
        if (o.tiles !== false) { const t = []; for (let i = 0; i <= 400; i += 80) t.push(`M${q2(X(i, 0))}L${q2(X(i, 400))}M${q2(X(0, i))}L${q2(X(400, i))}`); p.stroke(t.join(''), Z, 'rgba(0,0,0,.12)');
          [[80, 160], [320, 160], [80, 400], [320, 400], [160, 80], [240, 80]].forEach(([x, y]) => { const q = X(x, y); p.rect(q[0], q[1], 14 * Z, 14 * Z, '#1d1715', Math.PI / 4); }); }
        [[200, 224], [200, 160], [264, 224], [200, 288], [136, 224]].forEach(([x, y], i) => { const q = X(x, y); piece(p, gen({ shape: 'diamond', n: 5, sym: 'C4', density: .3, seed: (o.seed || 40) + i, rings: false }), q[0], q[1], 82 * Z, { color: ink, lw: l, dotR: 1.1 * Z, food: o.food }); });
        [[106, 146, -3 * Math.PI / 4, 1], [294, 146, -Math.PI / 4, -1], [106, 304, 3 * Math.PI / 4, -1], [294, 304, Math.PI / 4, 1]].forEach(([x, y, th, f]) => { const q = X(x, y); motif.swirl(p, q[0], q[1], 52 * Z, th + f * 2.562, ink, l, f); });
        [120, 280].forEach(x => { const q = X(x, 70); motif.lotus(p, q[0], q[1], 42 * Z, 0, ink, l); });
        const c = X(200, 64); piece(p, gen({ shape: 'plus', n: 3, sym: 'C4', density: 0, seed: 2, rings: false }), c[0], c[1], 50 * Z, { color: ink, lw: 1.4 * Z, dotR: Z });
        const top = []; for (let i = 0; i <= 18; i++) top.push(X(20 + i * 20, 18 + (i % 2 ? 6 : -2))); p.stroke(poly(smooth(top, false, 6), false), 1.4 * Z, ink);
        for (let i = 1; i < 18; i += 2) { const q = X(20 + i * 20, 12); motif.coil(p, q[0], q[1], 5 * Z, .8, 0, ink, 1.2 * Z); }
        let a = X(22, 388), b = X(52, 120); motif.grain(p, a[0], a[1], b[0], b[1], 12, ink, 1.4 * Z); a = X(378, 388); b = X(348, 120); motif.grain(p, a[0], a[1], b[0], b[1], 12, ink, 1.4 * Z);
        if (o.flowers !== false) [[176, 30], [200, 26], [224, 32], [190, 218], [212, 230]].forEach(([x, y]) => { const q = X(x, y); for (let i = 0; i < 6; i++) { const t = i / 6 * TAU; p.dot(q[0] + Math.cos(t) * 3.4 * Z, q[1] + Math.sin(t) * 3.4 * Z, 2.1 * Z, '#f2c12e'); } }); } },
    star: { name: 'Double-line star', ground: '#57504a', draw(p, W, H, o) {
        const Z = Math.min(W, H) / 400, C = [W / 2, H / 2], ink = o.ink || W2, bg = o.ground || '#57504a';
        const pet = (a, L, w) => { const R = rot(C[0], C[1], a); return `M${q2(R(0, 0))}C${q2(R(L * .35, -w), R(L * .7, -w * .8), R(L, 0))}C${q2(R(L * .7, w * .8), R(L * .35, w), R(0, 0))}Z`; };
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8, L = (i % 2 ? 128 : 150) * Z; p.stroke(pet(a, L, 36 * Z), 7 * Z, ink); p.stroke(pet(a, L, 36 * Z), 2.6 * Z, bg); }
        const sp = []; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8 + Math.PI / 8, r = (i % 2 ? 120 : 176) * Z; sp.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]); } p.stroke(poly(sp), 6 * Z, ink); p.stroke(poly(sp), 2.2 * Z, bg);
        p.dot(C[0], C[1], 9 * Z, '#e8761a'); p.dot(C[0], C[1], 5 * Z, '#8e1a14'); } },
    house: { name: 'At a new house', ground: '#8d8a84', draw(p, W, H, o) {
        const Z = Math.min(W, H) / 400, X = (x, y) => [W / 2 + (x - 200) * Z, H / 2 + (y - 200) * Z], ink = o.ink || W2;
        const m0 = X(150, 70); p.rect(m0[0] + 50 * Z, m0[1] + 23 * Z, 100 * Z, 46 * Z, '#b23a2a'); const sc = X(200, 93); motif.coil(p, sc[0], sc[1], 14 * Z, 2, 0, ink, 1.5 * Z);
        [[100, 100], [300, 100]].forEach(([x, y], i) => { const q = X(x, y); piece(p, gen({ shape: 'plus', n: 5, sym: 'C4', density: .2, seed: 70 + i, rings: false }), q[0], q[1], 88 * Z, { color: ink, lw: 1.6 * Z, dotR: 1.2 * Z, food: o.food }); });
        const g = K.shapes.ascii(['...o.....o.....o...', '..ooo...ooo...ooo..', '.ooooo.ooooo.ooooo.', 'ooooooooooooooooooo', '.ooooo.ooooo.ooooo.', '..ooo...ooo...ooo..', '...o.....o.....o...']);
        const q = X(200, 262); piece(p, { o: g, k: K.weave(g, { seed: o.seed || 12, sym: 'D2', density: .3, rings: false }) }, q[0], q[1], 360 * Z, { color: ink, lw: 1.8 * Z, dotR: 1.3 * Z, food: o.food }); } },
    rings: { name: 'Rings of the courtyard', ground: '#9c8466', draw(p, W, H, o) {
        const Z = Math.min(W, H) / 400, C = [W / 2, H / 2], ink = o.ink || W2, sd = o.seed || 50;
        piece(p, gen({ shape: 'plus', n: 3, sym: 'C4', density: 0, seed: 3, rings: false }), C[0], C[1], 64 * Z, { color: ink, lw: 1.8 * Z, dotR: 1.3 * Z });
        [[1, 16, 2, 48, 66, .6], [2, 24, 3, 76, 108, .3], [2, 36, 4, 116, 150, .2]].forEach(([rows, cols, per, a, b, den], i) => band(p, rows, cols, per, sd + i, polar(cols, rows, a * Z, b * Z, C[0], C[1]), { density: den, rings: i === 0, color: ink, lw: 1.7 * Z, dotR: 1.2 * Z, per: 8, food: o.food }));
        for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, x0 = C[0] + Math.cos(a) * 154 * Z, y0 = C[1] + Math.sin(a) * 154 * Z, x1 = C[0] + Math.cos(a) * 176 * Z, y1 = C[1] + Math.sin(a) * 176 * Z; p.stroke(`M${q2([x0, y0])}L${q2([x1, y1])}`, 1.6 * Z, ink); motif.drop(p, x1, y1, 20 * Z, 8 * Z, a + Math.PI / 2, ink, 1.6 * Z); }
        for (let i = 0; i < 40; i++) { const a = i / 40 * TAU + .05; p.dot(C[0] + Math.cos(a) * 198 * Z, C[1] + Math.sin(a) * 198 * Z, 1.3 * Z, ink); } } },
    hanging: { name: 'Hanging lamp', ground: '#2d2520', draw(p, W, H, o) { lampAt(p, 'hanging', W / 2, H / 2, Math.min(W, H) * .86, { color: o.ink, lw: Math.min(W, H) / 180, dotR: Math.min(W, H) / 240, heart: o.flame, food: o.food }); } },
    standing: { name: 'Standing lamp', ground: '#4a1c18', draw(p, W, H, o) { lampAt(p, 'standing', W / 2, H / 2 + Math.min(W, H) * .05, Math.min(W, H) * .86, { color: o.ink, lw: Math.min(W, H) / 180, dotR: Math.min(W, H) / 240, heart: o.flame, food: o.food }); } },
    kooja: { name: 'Kooja', ground: '#2f2a27', draw(p, W, H, o) {
        const g = K.shapes.plus(7), k = K.weave(g, { seed: o.seed || 6, sym: 'C4', density: .45, rings: false }), sc = Math.min(W, H) * .75 / (2 * 7) / Math.SQRT2 * 1.4, ink = o.ink || W2, lw = Math.min(W, H) / 180;
        const map = (x, y) => { const X = (x - 7) * sc, Y = (y - 7) * sc; return [W / 2 + (X - Y) * Math.SQRT1_2, H / 2 + (X + Y) * Math.SQRT1_2]; };
        k.loops.forEach(L => p.stroke(poly(L.pts.map(q => map(q[0], q[1]))), lw, ink, { join: 'bevel' }));
        k.cells.forEach(([r, c]) => { const [x, y] = map(2 * c + 1, 2 * r + 1), s = sc * .55; p.stroke(`M${q2([x - s, y - s])}H${f1(x + s)}V${f1(y + s)}H${f1(x - s)}Z`, lw * .6, ink); }); } },
    mittai: { name: 'Kolam candies', ground: '#2a2422', draw(p, W, H, o) { const P = lsysPts('-D--D', { A: 'f++ffff--f--ffff++f++ffff--f', B: 'f--ffff++f++ffff--f--ffff++f', C: 'BfA--BfA', D: 'CfC--CfC' }, 3), f = fitPts(P, W, H, Math.min(W, H) * .07); const pts = smooth(P.map(f), true, 4); p.stroke(poly(pts), Math.min(W, H) / 200, o.ink || W2); if (o.food) pts.forEach(q => p.food.push(q)); } },
    mountain: { name: 'Mountain', ground: '#33302c', draw(p, W, H, o) { piece(p, gen({ shape: 'triangle', n: 5, sym: 'mirror', density: .2, rings: false, seed: o.seed || 14 }), W / 2, H / 2, Math.min(W, H) * .9, { color: o.ink, food: o.food }); } },
    anklets: { name: 'Anklets of Krishna', ground: '#2b2522', draw(p, W, H, o) { const t = K.turtle(K.lsys('-X--X', { X: 'XFX--XFX' }, o.order || 3), { step: 10 }), f = fitPts(t.pts.concat(t.dots), W, H, Math.min(W, H) * .06), ink = o.ink || W2; p.stroke(poly(t.pts.map(f)), Math.min(W, H) / 270, ink); t.dots.forEach(q => { const r = f(q); p.dot(r[0], r[1], Math.min(W, H) / 360, ink); }); } },
    hridaya: { name: 'Hridaya kamalam', ground: '#1f1a18', draw(p, W, H, o) { const R0 = Math.min(W, H) * .4, pts = []; for (let i = 0; i <= 1440; i++) { const th = i / 1440 * 6 * Math.PI, r = R0 * (.58 + .42 * Math.cos(8 * th / 3)); pts.push([W / 2 + Math.cos(th) * r, H / 2 + Math.sin(th) * r]); } const Z = Math.min(W, H) / 400; p.stroke(poly(pts), 7 * Z, o.ink || W2); p.stroke(poly(pts), 2.6 * Z, o.ground || '#1f1a18'); p.dot(W / 2, H / 2, 7 * Z, o.ink || W2); p.dot(W / 2, H / 2, 3 * Z, o.ground || '#1f1a18'); } },
  };

  /* ---------- compositions: one large kolam and its small ones ---------- */
  function rnd0(r, a) { return a[Math.floor(r() * a.length)]; }
  const LAYOUTS = {
    courtyard(p, W, H, r, o) {
      const Z = Math.min(W / 640, H / 420), ink = o.ink || W2, X = (x, y) => [W / 2 + (x - 320) * Z, H / 2 + (y - 210) * Z];
      const big = () => gen({ shape: rnd0(r, ['diamond', 'stepped', 'star', 'octagon']), n: rnd0(r, [9, 11]), sym: rnd0(r, ['C4', 'C4', 'D4']), density: .25 + r() * .35, seed: (r() * 1e9) | 0, rings: r() < .6 });
      const small = () => gen({ shape: rnd0(r, ['diamond', 'plus', 'diamond']), n: rnd0(r, [3, 5, 5]), sym: 'C4', density: .2 + r() * .4, seed: (r() * 1e9) | 0, rings: r() < .4 });
      let q = X(320, 210); piece(p, big(), q[0], q[1], 300 * Z, { color: ink, lw: 1.8 * Z, dotR: 1.3 * Z, food: o.food });
      [[150, 70], [490, 70], [490, 350], [150, 350]].forEach(([x, y]) => { q = X(x, y); piece(p, small(), q[0], q[1], 110 * Z, { color: ink, lw: 1.6 * Z, dotR: 1.2 * Z, food: o.food }); });
      [[64, 210, -Math.PI / 2], [576, 210, Math.PI / 2]].forEach(([x, y, a]) => { q = X(x, y); motif.bud(p, q[0], q[1], 30 * Z, a, ink, 1.6 * Z); });
      const tl = X(18, 14); band(p, 1, 72, 4, (r() * 1e9) | 0, frameMap(72, 1, rrect(tl[0], tl[1], 604 * Z, 392 * Z, 26 * Z), 14 * Z), { density: .5, color: ink, lw: 1.4 * Z, dotR: Z });
      return X(320, 210);
    },
    threshold(p, W, H, r, o) {
      const Z = Math.min(W / 640, H / 420), ink = o.ink || W2, X = (x, y) => [W / 2 + (x - 320) * Z, H / 2 + (y - 210) * Z];
      let q = X(320, 23); p.rect(q[0], q[1], 100 * Z, 46 * Z, '#b23a2a'); motif.coil(p, q[0], q[1], 12 * Z, 2, 0, ink, 1.4 * Z);
      q = X(320, 250); piece(p, gen({ shape: rnd0(r, ['diamond', 'stepped', 'octagon']), n: rnd0(r, [9, 11]), sym: 'C4', density: .25 + r() * .35, seed: (r() * 1e9) | 0, rings: r() < .5 }), q[0], q[1], 300 * Z, { color: ink, lw: 1.8 * Z, dotR: 1.3 * Z, food: o.food });
      [150, 490].forEach(x => { q = X(x, 120); piece(p, gen({ shape: rnd0(r, ['plus', 'diamond']), n: 5, sym: 'C4', density: .2 + r() * .3, seed: (r() * 1e9) | 0, rings: false }), q[0], q[1], 120 * Z, { color: ink, lw: 1.6 * Z, dotR: 1.2 * Z, food: o.food }); });
      [60, 580].forEach(x => { q = X(x, 250); lampAt(p, 'small', q[0], q[1], 130 * Z, { color: ink, lw: 1.5 * Z, dotR: 1.1 * Z, heart: o.flame }); });
      return X(320, 250);
    },
    knots(p, W, H, r, o) {
      const Z = Math.min(W / 640, H / 420), ink = o.ink || W2, X = (x, y) => [W / 2 + (x - 320) * Z, H / 2 + (y - 210) * Z], n = rnd0(r, [5, 5, 7]);
      [[320, 210], [320, 120], [410, 210], [320, 300], [230, 210]].forEach(([x, y]) => { const q = X(x, y); piece(p, gen({ shape: 'diamond', n, sym: 'C4', density: .3, seed: (r() * 1e9) | 0, rings: false }), q[0], q[1], 112 * Z, { color: ink, lw: 1.6 * Z, dotR: 1.1 * Z, food: o.food }); });
      [[230, 120, -3 * Math.PI / 4, 1], [410, 120, -Math.PI / 4, -1], [230, 300, 3 * Math.PI / 4, -1], [410, 300, Math.PI / 4, 1]].forEach(([x, y, th, f]) => { const q = X(x, y); motif.swirl(p, q[0], q[1], 62 * Z, th + f * 2.562, ink, 1.6 * Z, f); });
      let a = X(40, 390), b = X(70, 60); motif.grain(p, a[0], a[1], b[0], b[1], 12, ink, 1.4 * Z); a = X(600, 390); b = X(570, 60); motif.grain(p, a[0], a[1], b[0], b[1], 12, ink, 1.4 * Z);
      return X(320, 210);
    },
    ring(p, W, H, r, o) {
      const Z = Math.min(W / 640, H / 420), ink = o.ink || W2, C = [W / 2, H / 2];
      piece(p, gen({ shape: 'plus', n: 5, sym: 'C4', density: .2, seed: (r() * 1e9) | 0 }), C[0], C[1], 96 * Z, { color: ink, lw: 1.7 * Z, dotR: 1.2 * Z, food: o.food });
      [[1, 20, rnd0(r, [2, 4, 5]), 56, 74], [2, 30, rnd0(r, [3, 5]), 86, 114], [2, 42, rnd0(r, [3, 6, 7]), 126, 154]].forEach(([rows, cols, per, a, b], i) => band(p, rows, cols, per, (r() * 1e9) | 0, polar(cols, rows, a * Z, b * Z, C[0], C[1]), { density: .2 + r() * .4, rings: i === 0, color: ink, lw: 1.6 * Z, dotR: 1.1 * Z, per: 8, food: o.food }));
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, x1 = C[0] + Math.cos(a) * 172 * Z, y1 = C[1] + Math.sin(a) * 172 * Z; p.stroke(`M${q2([C[0] + Math.cos(a) * 158 * Z, C[1] + Math.sin(a) * 158 * Z])}L${q2([x1, y1])}`, 1.5 * Z, ink); motif.drop(p, x1, y1, 18 * Z, 7 * Z, a + Math.PI / 2, ink, 1.5 * Z); }
      return C;
    },
  };

  /* grounds and inks of the threshold: stone, lime wash, arakku, indigo, turmeric */
  const GROUNDS = { stone: '#291f1a', lime: '#f1ebdf', arakku: '#a5281e', indigo: '#344965', turmeric: '#e9b44d', maroon: '#561f1b', oxide: '#9c4a33', ochre: '#c99b52', cement: '#8d8a84' };
  const INKS = { flour: '#f2ece1', kaavi: '#8c3420', chalk: '#e4ebef', soot: '#2b241e' };

  /* flowers for the centre, as Paper Pixel assets: folded card in 3D over a flat kolam */
  const FLOWERS = {
    pumpkin: { v: 1, name: 'Pumpkin flower on a mud ball', kind: 'plant', tilt: 52, palette: ['#f5b324', '#e3921a', '#fde08a', '#6a4b30', '#53381f', '#5e8c35', '#b87316', '#8a6440'],
      pieces: [
        { name: 'disc', rows: ['...444...', '.4444444.', '.4484444.', '444445444', '448444444', '444445484', '.4444444.', '.4844444.', '...444...'], ax: 4, ay: 4, rx: -90, grow: 'scale', dur: .4 },
        { name: 'dome', rows: ['...44...', '..4444..', '.448444.', '44444584'], ax: 4, ay: 0, repeat: 3, step: 60, grow: 'scale', dur: .5 },
        { name: 'sepal', rows: ['.6.', '666', '.6.'], ax: 1, ay: 0, y: 4, rx: -80, order: 'YXZ', repeat: 5, step: 72, ry: 36, grow: 'fold', delay: .25 },
        { name: 'petal', rows: ['..131..', '.11311.', '1113111', '1112111', '1112111', '.11211.', '.11211.', '..121..', '..171..', '...7...'], ax: 3, ay: 0, y: 4, rx: -50, order: 'YXZ', repeat: 5, step: 72, grow: 'fold', delay: .35, flex: .35, role: 'petal' },
        { name: 'stamen', rows: ['.3.', '333', '737', '.7.'], ax: 1, ay: 0, y: 4, repeat: 2, step: 90, grow: 'scale', delay: .7 } ] },
    marigold: { v: 1, name: 'Marigold', kind: 'plant', tilt: 55, palette: ['#f08a1c', '#d96a10', '#ffb340', '#9a3f0c', '#4f7a3a'],
      pieces: [
        { name: 'leaf', rows: ['..5..', '.555.', '55555', '.555.', '..5..', '..5..'], ax: 2, ay: 0, rx: -84, order: 'YXZ', repeat: 4, step: 90, ry: 20, grow: 'fold' },
        { name: 'outer', rows: ['1.1.1', '11111', '12121', '.111.', '..4..'], ax: 2, ay: 0, y: 1, rx: -70, order: 'YXZ', repeat: 10, step: 36, grow: 'fold', delay: .2, flex: .25, role: 'petal' },
        { name: 'middle', rows: ['3.3', '313', '121', '.4.'], ax: 1, ay: 0, y: 2, rx: -46, order: 'YXZ', repeat: 8, step: 45, ry: 22, grow: 'fold', delay: .4, role: 'petal' },
        { name: 'inner', rows: ['3.3', '333', '.2.'], ax: 1, ay: 0, y: 3, rx: -18, order: 'YXZ', repeat: 6, step: 60, grow: 'scale', delay: .55 } ] },
  };

  return { pen, gen, specOf, daySeed, dayNo, piece, band, polar, rrect, frameMap, poly, smooth, motif, lampAt, SET, LAYOUTS, GROUNDS, INKS, SHAPES, FLOWERS };
})();
if (typeof window !== 'undefined') { window.Kolam = Kolam; window.KolamArt = KolamArt; }
if (typeof module !== 'undefined') module.exports = { Kolam, KolamArt };
