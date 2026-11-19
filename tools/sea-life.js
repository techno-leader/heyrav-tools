/* Sea Life - the layered scene and the creatures of the Sunken world.
   After ABZÛ: distance is fog. Three planes of flat silhouettes (far, mid,
   near) take more of the water's colour the further away they are and move
   slower as the camera travels, so the page reads as a camera moving down
   through the sea. Scenery keeps to the edges; the middle stays clear for
   reading. Creatures live where they really live: a bait ball, a turtle and a
   manta near the surface; lanternfish, jellyfish and squid in the twilight;
   an anglerfish and glowing siphonophores in the midnight zone; tripod fish
   and sea pigs on the abyssal floor. Bodies are soft: tentacles and arms are
   Verlet chains dragged through the water.

   const life = SeaLife.create(canvas, preset)
   life.frame(t, cam)   cam = { y: scroll px, page: page height px, w, h, depth: 0-1,
                                 fog: (yScreen) => [r,g,b] 0-1, pointer: [x,y] | null }
   life.set(preset)      SeaLife.DEFAULTS lists every key                          */
(function () {
  const DEFAULTS = {
    seed: 7, density: 1, schoolCount: 110, schoolSpeed: 1, fishSize: 1, schoolColor: '#d9eef0',
    jellies: 4, bell: 1, pulse: 1, tentLen: 1, tentStiff: .55, drag: .96, glow: 1, glowCol: '#63f2d6',
    squid: 2, rocks: 1, kelp: 1, fogFar: .82, fogMid: .55, fogNear: .22, parallax: 1, creatures: 1, floor: 1,
  };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  // page fraction -> metres, matching the four zones of the water engine
  const metres = d => d <= 1 / 3 ? d * 600 : d <= 2 / 3 ? 200 + (d - 1 / 3) * 2400 : 1000 + (d - 2 / 3) * 9000;
  const frac = m => m <= 200 ? m / 600 : m <= 1000 ? 1 / 3 + (m - 200) / 2400 : 2 / 3 + (m - 1000) / 9000;

  /* ---------- soft bodies ---------- */
  function chain(n, x, y, seg) { const p = []; for (let i = 0; i < n; i++) p.push({ x, y: y + i * seg, px: x, py: y + i * seg }); return { p, seg }; }
  function stepChain(c, ax, ay, drag, stiff, flow) {
    const p = c.p; if (Math.hypot(ax - p[0].x, ay - p[0].y) > 60) p.forEach((q, i) => { q.x = q.px = ax; q.y = q.py = ay + i * c.seg; });
    p[0].x = ax; p[0].y = ay; p[0].px = ax; p[0].py = ay;
    for (let i = 1; i < p.length; i++) { const q = p[i], vx = (q.x - q.px) * drag, vy = (q.y - q.py) * drag; q.px = q.x; q.py = q.y; q.x += vx + flow[0]; q.y += vy + flow[1]; }
    for (let k = 0; k < 3; k++) for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, e = (d - c.seg) / d;
      if (i === 1) { b.x -= dx * e; b.y -= dy * e; } else { a.x += dx * e * .5 * stiff; a.y += dy * e * .5 * stiff; b.x -= dx * e * (1 - .5 * stiff); b.y -= dy * e * (1 - .5 * stiff); }
    }
  }
  function strokeChain(g, c, w0, w1) {
    const p = c.p; for (let i = 1; i < p.length; i++) { g.lineWidth = w0 + (w1 - w0) * i / p.length; g.beginPath(); g.moveTo(p[i - 1].x, p[i - 1].y); g.lineTo(p[i].x, p[i].y); g.stroke(); }
  }

  /* ---------- scenery silhouettes, cached per object ---------- */
  function rockPath(r, w, h, kind) {
    const P = new Path2D(), pts = [], n = 14;
    if (kind === 'arch') {
      P.moveTo(0, h); for (let i = 0; i <= n; i++) { const t = i / n, x = t * w, y = h * (.05 + .25 * Math.sin(t * Math.PI) * 0) + (1 - Math.sin(t * Math.PI)) * h * .85 * (t < .5 ? 1 : 1) - r() * h * .06; pts.push([x, Math.max(0, y)]); }
      pts.forEach(p => P.lineTo(p[0], p[1])); P.lineTo(w, h); P.lineTo(w * .72, h);
      for (let i = n; i >= 0; i--) { const t = i / n; P.lineTo(w * .28 + t * w * .44, h - Math.sin(t * Math.PI) * h * .55 - r() * h * .03); }
      P.lineTo(w * .28, h); P.closePath(); return P;
    }
    // a column of stacked, broken blocks narrowing upward with ledges
    const L = [], R = [], top = kind === 'pillar' ? 0 : h * .45; let y = h, wl = w * .5;
    while (y > top) { const bh = 30 + r() * 90, sh = (r() - .5) * w * .12; wl = Math.max(w * .14, wl * (.86 + r() * .14));
      L.push([w * .5 - wl + sh, y], [w * .5 - wl + sh - r() * 10, y - bh * .2], [w * .5 - wl * .92 + sh, y - bh]);
      R.push([w * .5 + wl + sh, y], [w * .5 + wl + sh + r() * 10, y - bh * .3], [w * .5 + wl * .9 + sh, y - bh]); y -= bh; }
    P.moveTo(L[0][0], h); L.forEach(p => P.lineTo(p[0], Math.max(top, p[1]))); P.lineTo(w * .5 + (r() - .5) * 20, top - 12);
    R.reverse().forEach(p => P.lineTo(p[0], Math.max(top, p[1])));
    P.closePath(); return P;
  }

  // the x of a wall's face at world height y (fbm with ledges)
  function wallX(o, y, w) {
    const n = Math.sin(y * .004 + o.seed) * .5 + Math.sin(y * .011 + o.seed * 2.1) * .3 + Math.sin(y * .027 + o.seed * 3.7) * .2;
    const ledge = Math.max(0, Math.sin(y * .0021 + o.seed * 5)) ** 6 * 1.6;      // occasional shelves jutting out
    const x = o.base + o.amp * (n + ledge);
    return o.side < 0 ? x : w - x;
  }
  function create(cv, preset) {
    const g = cv.getContext('2d'); let P = Object.assign({}, DEFAULTS, preset), W = 0, H = 0, world = null;
    const r0 = () => rng(P.seed);
    // scenery and creatures are laid out along the page, once per page height
    function layout(page, w, h) {
      const r = r0(), objs = [], dens = P.density;
      const layers = [{ par: .14 * P.parallax, fog: P.fogFar, s: .55 }, { par: .38 * P.parallax, fog: P.fogMid, s: .8 }, { par: .72 * P.parallax, fog: P.fogNear, s: 1.15 }];
      const span = L => h + (page - h) * L.par;                // how far a layer travels
      layers.forEach((L, li) => {
        const tall = span(L);
        // reef walls down both edges: the dive runs along them. Far walls sit further in and paler.
        [-1, 1].forEach(side => objs.push({ type: 'wall', li, L, side, base: [.13, .085, .035][li] * w, amp: [.05, .045, .03][li] * w * P.rocks, seed: r() * 100 }));
        // a few pillars rising from below in the far planes
        if (li < 2) for (let i = 0, n = Math.round(tall / h * .8 * P.rocks * dens); i < n; i++) { const ow = (70 + r() * 70) * L.s; objs.push({ type: 'pillar', li, L, x: (r() < .5 ? .14 + r() * .16 : .7 + r() * .16) * w, y: (i + r()) / n * tall, w: ow, path: rockPath(r, ow, 900 * L.s, 'pillar') }); }
        // kelp only in the sunlit top, at the edges
        const kelpN = Math.round(7 * P.kelp * dens);
        for (let i = 0; i < kelpN; i++) { const side = r() < .5 ? -1 : 1; objs.push({ type: 'kelp', li, L, side, x: 0, y: frac(4 + r() * 34) * tall + h * (.5 + r() * .5), len: (200 + r() * 280) * L.s, ph: r() * 6, leaves: 7 + (r() * 6 | 0) }); }
      });
      // the sea floor at the very bottom of the page
      const floorY = page - h * .22;
      // creatures, each at its real depth
      const cre = [], at = m => frac(m) * page;
      const C = P.creatures;
      if (C) {
        cre.push({ type: 'school', y: at(30), cx: w * .72, cy: 0, r: Math.min(w, 900) * .16, n: P.schoolCount, fish: [] });
        cre.push({ type: 'turtle', y: at(15), x: w * .15, dir: 1 }, { type: 'manta', y: at(90), x: w * .8, dir: -1 });
        for (let i = 0; i < 18; i++) cre.push({ type: 'lantern', y: at(320 + r() * 560), x: r() * w, dir: r() < .5 ? -1 : 1, s: .7 + r() * .5 });
        for (let i = 0; i < P.jellies; i++) cre.push(jelly(r, at(260 + r() * 1400), w));
        for (let i = 0; i < P.squid; i++) cre.push(squid(r, at(420 + r() * 900), w));
        cre.push({ type: 'siphon', y: at(1500), x: w * .2, links: 14 });
        cre.push({ type: 'angler', y: at(2300), x: w * .78, dir: -1 });
        cre.push({ type: 'angler', y: at(3400), x: w * .12, dir: 1 });
        if (P.floor) { cre.push({ type: 'tripod', y: floorY + h * .1, x: w * .2 }, { type: 'tripod', y: floorY + h * .12, x: w * .66 }, { type: 'seapig', y: floorY + h * .15, x: w * .44 }, { type: 'sponge', y: floorY + h * .12, x: w * .86 }); }
      }
      world = { page, w, h, layers, objs, cre, floorY };
    }
    function jelly(r, y, w) {
      const x = r() < .5 ? w * (.08 + r() * .2) : w * (.72 + r() * .2), n = 7 + (r() * 4 | 0), bell = (26 + r() * 22) * P.bell, j = { type: 'jelly', y, x, x0: x, y0: y, bell, ph: r() * 6, tents: [], arms: [] };
      for (let i = 0; i < n; i++) j.tents.push(chain(12, x, y, 9 * P.tentLen));
      for (let i = 0; i < 3; i++) j.arms.push(chain(8, x, y, 7 * P.tentLen));
      return j;
    }
    function squid(r, y, w) { const x = w * (.2 + r() * .6); const s = { type: 'squid', y, x, x0: x, y0: y, dir: r() < .5 ? -1 : 1, ph: r() * 6, arms: [] }; for (let i = 0; i < 8; i++) s.arms.push(chain(8, x, y, 6)); s.arms.push(chain(13, x, y, 7), chain(13, x, y, 7)); return s; }

    function resize(w, h, page) { W = w; H = h; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } layout(page || h, w, h); }

    function frame(t, cam) {
      if (!world || world.page !== cam.page || world.w !== cam.w || world.h !== cam.h) resize(cam.w, cam.h, cam.page);
      g.clearRect(0, 0, W, H);
      const fog = cam.fog || (() => [.2, .5, .6]), dark = clamp((cam.depth - .4) / .5);
      // scenery, far to near
      world.layers.forEach((L, li) => {
        const off = cam.y * L.par;
        world.objs.forEach(o => {
          if (o.li !== li) return; const sy = o.y - off;
          if (o.type === 'pillar' && (sy > H + 40 || sy + 900 * o.L.s < -40)) return;
          if (o.type === 'kelp' && (sy < -40 || sy - o.len > H + 40)) return;
          const f = fog(o.type === 'wall' ? .55 : clamp(sy / H)), base = mix([.05, .16, .2], [.01, .03, .06], dark), col = mix(base, f, o.L.fog);
          if (o.type === 'wall') {
            const pts = []; for (let yy = -40; yy <= H + 40; yy += 10) pts.push([wallX(o, yy + off, W), yy]);
            const gr = g.createLinearGradient(o.side < 0 ? 0 : W, 0, pts[0][0], 0), lit = mix(col, f, .3);
            gr.addColorStop(0, css(col)); gr.addColorStop(1, css(lit)); g.fillStyle = gr;
            g.beginPath(); g.moveTo(o.side < 0 ? 0 : W, -40); pts.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(o.side < 0 ? 0 : W, H + 40); g.fill();
            // light catches the top of each ledge
            g.strokeStyle = css(mix(lit, [1, 1, 1], .25 * (1 - dark)), .55); g.lineWidth = 2; g.beginPath();
            for (let i = 1; i < pts.length; i++) { const dx = (pts[i][0] - pts[i - 1][0]) * -o.side; if (dx > 1.2) { g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); } } g.stroke();
          } else if (o.type === 'pillar') {
            g.save(); g.translate(o.x - o.w / 2, sy); g.fillStyle = css(col); g.fill(o.path); g.restore();
          } else if (o.type === 'kelp') {
            const k = mix(mix([.12, .42, .2], [.25, .55, .2], .4), f, o.L.fog * .9); g.strokeStyle = css(k); g.fillStyle = css(k); g.lineWidth = 3 * o.L.s;
            const bx = (() => { const wl = world.objs.find(q => q.type === 'wall' && q.li === li && q.side === o.side); return wl ? wallX(wl, sy + off, W) + o.side * -2 : o.x; })(); o.x = bx;
            let x = o.x, y = sy; g.beginPath(); g.moveTo(x, y);
            const pts = []; for (let i = 1; i <= 16; i++) { const tt = i / 16; x = o.x + Math.sin(t * .6 + o.ph + tt * 2.4) * 22 * tt * o.L.s; y = sy - tt * o.len; pts.push([x, y]); g.lineTo(x, y); } g.stroke();
            for (let i = 2; i < 16; i += 2) { const [lx, ly] = pts[i], s = i % 4 ? 1 : -1, sw = Math.sin(t * .8 + o.ph + i) * .3; g.beginPath(); g.ellipse(lx + s * 9 * o.L.s, ly, 11 * o.L.s, 4 * o.L.s, s * .5 + sw, 0, 7); g.fill(); }
          }
        });
      });
      // the sea floor
      const fy = world.floorY - cam.y;
      if (P.floor && fy < H) { const f = fog(clamp(fy / H)); g.fillStyle = css(mix([.09, .08, .1], f, .35)); g.beginPath(); g.moveTo(0, fy + 30); for (let x = 0; x <= W; x += 40) g.lineTo(x, fy + 18 + Math.sin(x * .013) * 14 + Math.sin(x * .041) * 6); g.lineTo(W, H); g.lineTo(0, H); g.fill(); }
      // creatures
      const ptr = cam.pointer, flow = [Math.sin(t * .3) * .04, .02];
      world.cre.forEach(c => {
        const sy = c.y - cam.y;   // creatures swim in the reading plane, at their real depth if (sy < -300 || sy > H + 300) return;
        const f = fog(clamp(sy / H)), body = mix([.04, .13, .17], f, .35);
        g.save();
        if (c.type === 'school') school(c, t, sy, f, ptr);
        else if (c.type === 'jelly') drawJelly(c, t, sy, f, flow);
        else if (c.type === 'squid') drawSquid(c, t, sy, body, f, flow);
        else if (c.type === 'turtle') drawTurtle(c, t, sy, body);
        else if (c.type === 'manta') drawManta(c, t, sy, mix(body, f, .45));
        else if (c.type === 'lantern') drawLantern(c, t, sy, body);
        else if (c.type === 'siphon') drawSiphon(c, t, sy);
        else if (c.type === 'angler') drawAngler(c, t, sy, body);
        else if (c.type === 'tripod') drawTripod(c, t, sy, body);
        else if (c.type === 'seapig') drawSeapig(c, t, sy);
        else if (c.type === 'sponge') drawSponge(c, t, sy, f);
        g.restore();
      });
    }

    // a bait ball: each fish circles a drifting centre on its own orbit and parts around the pointer
    function school(c, t, sy, f, ptr) {
      if (c.fish.length !== c.n) { const r = rng(P.seed + 5); c.fish = []; for (let i = 0; i < c.n; i++) c.fish.push({ a: r() * 6.28, rr: .25 + r() * .75, tilt: (r() - .5) * .9, sp: .6 + r() * .6, x: 0, y: 0, s: .7 + r() * .6, depth: r() }); }
      const cx = c.cx + Math.sin(t * .11) * c.r * .8, cy = sy + Math.cos(t * .09) * c.r * .35, col = mix(rgb(P.schoolColor), f, .35);
      c.fish.forEach(q => {
        q.a += .012 * q.sp * P.schoolSpeed; const ox = Math.cos(q.a) * c.r * q.rr, oy = Math.sin(q.a) * c.r * q.rr * (.45 + .25 * Math.sin(q.tilt + t * .2));
        let tx = cx + ox, ty = cy + oy;
        if (ptr) { const dx = tx - ptr[0], dy = ty - ptr[1], d = Math.hypot(dx, dy); if (d < 110) { tx += dx / d * (110 - d) * .9; ty += dy / d * (110 - d) * .9; } }
        const vx = tx - q.x, vy = ty - q.y; q.x += vx * .12; q.y += vy * .12;
        const ang = Math.atan2(Math.sin(q.a) * .5, -Math.sin(q.a) < 0 ? 1 : -1) + Math.atan2(vy, vx) * 0, dirx = Math.cos(q.a + Math.PI / 2) < 0 ? -1 : 1;
        const s = 6 * P.fishSize * q.s * (.7 + q.depth * .5), shade = mix(col, f, (1 - q.depth) * .35), flick = .5 + .5 * Math.sin(q.a * 3 + q.depth * 9);
        g.fillStyle = css(mix(shade, [1, 1, 1], flick * .25)); g.save(); g.translate(q.x, q.y); g.scale(dirx, 1); g.rotate(Math.sin(q.a) * .35);
        g.beginPath(); g.ellipse(0, 0, s, s * .32, 0, 0, 7); g.moveTo(-s * .8, 0); g.lineTo(-s * 1.45, -s * .38); g.lineTo(-s * 1.45, s * .38); g.fill(); g.restore();
      });
    }
    function drawJelly(j, t, sy, f, flow) {
      const ph = t * 1.4 * P.pulse + j.ph, beat = Math.max(0, Math.sin(ph)), rise = Math.pow(beat, 3) * 1.2;
      j.yo = (j.yo || 0) - rise * .6 + .25; if (j.yo < -120) j.yo = 120; const x = j.x0 + Math.sin(t * .2 + j.ph) * 30, y = sy + j.yo, b = j.bell * (1 + .12 * Math.cos(ph)), bh = j.bell * (.75 - .15 * Math.cos(ph));
      const dark = clamp((j.y0 / (world.page || 1) - .3) / .4), glow = rgb(P.glowCol), tint = mix([.85, .95, 1], glow, dark * .7);
      // tentacles first, behind the bell
      g.strokeStyle = css(tint, .32 + dark * .3); g.lineCap = 'round';
      j.tents.forEach((c, i) => { const a = (i / (j.tents.length - 1) - .5) * 1.7; stepChain(c, x + Math.sin(a) * b * .9, y + bh * .15, P.drag, P.tentStiff, [flow[0] + Math.sin(t + i) * .03, .06 + rise * .5]); strokeChain(g, c, 1.4, .3); });
      g.strokeStyle = css(mix(tint, [1, .7, .85], .3), .5); j.arms.forEach((c, i) => { stepChain(c, x + (i - 1) * b * .2, y + bh * .2, P.drag, .8, [flow[0], .05 + rise * .4]); strokeChain(g, c, 3, .8); });
      // the bell: translucent dome with a bright rim and radial canals (Haeckel's symmetry)
      const gr = g.createRadialGradient(x, y - bh * .3, b * .1, x, y, b * 1.1); gr.addColorStop(0, css(tint, .55)); gr.addColorStop(.7, css(tint, .22)); gr.addColorStop(1, css(tint, .05));
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, b, bh, 0, Math.PI, 0); g.quadraticCurveTo(x, y + bh * .35, x - b, y); g.fill();
      g.strokeStyle = css(mix(tint, [1, 1, 1], .4), .7); g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, b, bh, 0, Math.PI, 0); g.stroke();
      g.strokeStyle = css(tint, .3); g.lineWidth = .8; for (let k = 1; k < 8; k++) { const a = Math.PI + k / 8 * Math.PI; g.beginPath(); g.moveTo(x, y - bh * .1); g.lineTo(x + Math.cos(a) * b * .95, y + Math.sin(a) * bh * .95); g.stroke(); }
      if (dark > .2) { g.globalCompositeOperation = 'lighter'; const gl = g.createRadialGradient(x, y, 0, x, y, b * 2.2); gl.addColorStop(0, css(glow, .25 * dark * P.glow)); gl.addColorStop(1, css(glow, 0)); g.fillStyle = gl; g.fillRect(x - b * 2.2, y - b * 2.2, b * 4.4, b * 4.4); }
    }
    function drawSquid(s, t, sy, body, f, flow) {
      const ph = t * .9 + s.ph, jet = Math.pow(Math.max(0, Math.sin(ph)), 4); s.xo = (s.xo || 0) + s.dir * (.15 + jet * 2.2); if (Math.abs(s.xo) > W * .35) s.dir *= -1;
      const x = s.x0 + s.xo, y = sy + Math.sin(t * .5 + s.ph) * 14, L = 46, d = s.dir, c = mix(body, [.55, .2, .25], .35 - clamp(s.y0 / world.page) * .3);
      // arms trail behind the mantle, opposite the swimming direction
      g.strokeStyle = css(c, .85); g.lineCap = 'round';
      s.arms.forEach((a, i) => { stepChain(a, x - d * L * .45, y + (i - 4.5) * 1.6, .9, .6, [-d * (.25 + jet * .6), flow[1] + Math.sin(t * 2 + i) * .05]); strokeChain(g, a, i >= 8 ? 1.6 : 3, .5); });
      g.fillStyle = css(c); g.beginPath(); g.ellipse(x + d * L * .1, y, L * .55, L * .17 * (1 - jet * .15), 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x + d * L * .62, y); g.lineTo(x + d * L * .36, y - L * .2); g.lineTo(x + d * L * .36, y + L * .2); g.fill();
      g.fillStyle = css(mix(c, [1, 1, 1], .5)); g.beginPath(); g.arc(x - d * L * .28, y - 2, 3.2, 0, 7); g.fill();
    }
    function drawTurtle(c, t, sy, body) {
      c.xo = ((c.xo || 0) + .25) % (W + 200); const x = (c.x + c.xo) % (W + 200) - 100, y = sy + Math.sin(t * .4) * 10, fl = Math.sin(t * 1.3);
      g.fillStyle = css(mix(body, [.25, .32, .2], .4)); g.save(); g.translate(x, y);
      g.beginPath(); g.ellipse(0, 0, 34, 24, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(36, -2, 11, 8, 0, 0, 7); g.fill();
      [[-1, 1], [1, 1]].forEach(([s]) => { g.beginPath(); g.ellipse(10, s * 22, 26, 7, s * (.6 + fl * .4), 0, 7); g.fill(); g.beginPath(); g.ellipse(-24, s * 16, 12, 5, -s * .5, 0, 7); g.fill(); });
      g.restore();
    }
    function drawManta(c, t, sy, col) {
      c.xo = ((c.xo || 0) - .35); const span = 150, x = ((c.x + c.xo) % (W + 400) + W + 400) % (W + 400) - 200, y = sy + Math.sin(t * .3) * 20, fl = Math.sin(t * .9) * 24;
      g.fillStyle = css(col); g.beginPath(); g.moveTo(x - span * .3, y); g.quadraticCurveTo(x, y - span * .2, x + span * .25, y); g.quadraticCurveTo(x + span * .05, y - 30 - fl, x - span * .05, y - span * .55 - fl);
      g.quadraticCurveTo(x - span * .12, y - 20, x - span * .3, y); g.moveTo(x - span * .3, y); g.quadraticCurveTo(x - span * .1, y + 30 + fl * .5, x - span * .05, y + span * .5 + fl);
      g.quadraticCurveTo(x + span * .05, y + 20, x + span * .25, y); g.fill(); g.strokeStyle = css(col); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + span * .25, y); g.lineTo(x + span * .7, y + 4); g.stroke();
    }
    function drawLantern(c, t, sy, body) {
      c.xo = (c.xo || 0) + c.dir * .4 * c.s; const x = ((c.x + c.xo) % (W + 60) + W + 60) % (W + 60) - 30, y = sy + Math.sin(t + c.x) * 6, s = 9 * c.s, glow = rgb(P.glowCol);
      g.fillStyle = css(body); g.save(); g.translate(x, y); g.scale(c.dir, 1); g.beginPath(); g.ellipse(0, 0, s, s * .3, 0, 0, 7); g.lineTo(-s * 1.5, -s * .35); g.lineTo(-s * 1.5, s * .35); g.fill();
      g.globalCompositeOperation = 'lighter'; g.fillStyle = css(glow, .9 * P.glow); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-s * .5 + i * s * .35, s * .18, 1.1, 0, 7); g.fill(); } g.restore();
    }
    function drawSiphon(c, t, sy) {
      const glow = rgb(P.glowCol); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < c.links; i++) { const x = c.x + Math.sin(t * .4 + i * .45) * 18 + i * 4, y = sy + i * 14, a = .5 + .5 * Math.sin(t * 2 - i * .5);
        const gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, css(glow, .6 * a * P.glow)); gr.addColorStop(1, css(glow, 0)); g.fillStyle = gr; g.fillRect(x - 9, y - 9, 18, 18); }
    }
    function drawAngler(c, t, sy, body) {
      const x = c.x + Math.sin(t * .15) * 30, y = sy + Math.sin(t * .3) * 8, d = c.dir, lx = x + d * 46, ly = y - 40 + Math.sin(t * 1.1) * 4, glow = rgb(P.glowCol);
      g.fillStyle = css(mix(body, [0, 0, 0], .5)); g.beginPath(); g.ellipse(x, y, 34, 26, 0, 0, 7); g.fill();
      g.beginPath(); g.moveTo(x - d * 30, y); g.lineTo(x - d * 56, y - 16); g.lineTo(x - d * 56, y + 16); g.fill();
      g.strokeStyle = css(mix(body, [.3, .3, .3], .3)); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + d * 10, y - 22); g.quadraticCurveTo(x + d * 30, y - 52, lx, ly); g.stroke();
      g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 40); gr.addColorStop(0, css([.9, 1, .95], .95 * P.glow)); gr.addColorStop(.15, css(glow, .5 * P.glow)); gr.addColorStop(1, css(glow, 0)); g.fillStyle = gr; g.fillRect(lx - 40, ly - 40, 80, 80);
    }
    function drawTripod(c, t, sy, body) {
      const x = c.x, y = sy; g.strokeStyle = css(mix(body, [.5, .5, .5], .2)); g.lineWidth = 1.2; [-14, 10, 22].forEach(o => { g.beginPath(); g.moveTo(x + o * .3, y - 26); g.lineTo(x + o, y); g.stroke(); });
      g.fillStyle = css(mix(body, [.4, .42, .45], .3)); g.beginPath(); g.ellipse(x, y - 30, 22, 6, -.05, 0, 7); g.fill(); g.beginPath(); g.moveTo(x - 20, y - 30); g.lineTo(x - 34, y - 36); g.lineTo(x - 34, y - 24); g.fill();
    }
    function drawSeapig(c, t, sy) {
      const x = c.x + Math.sin(t * .08) * 30, y = sy; g.fillStyle = 'rgba(214,170,190,.75)'; g.beginPath(); g.ellipse(x, y - 9, 22, 10, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(214,170,190,.75)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 6 + i * 6, y - 18); g.lineTo(x - 8 + i * 7, y - 28 + Math.sin(t + i) * 2); g.stroke(); }
    }
    function drawSponge(c, t, sy, f) {
      const x = c.x, y = sy; g.strokeStyle = css(mix([.85, .9, .9], f, .4), .7); g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x - 12 + i * 4, y); g.bezierCurveTo(x - 18 + i * 6, y - 40, x - 10 + i * 4, y - 70, x - 4 + i * 2, y - 90); g.stroke(); }
      for (let k = 1; k < 9; k++) { g.beginPath(); g.ellipse(x, y - k * 10, 10 - k * .4, 2.5, 0, 0, 7); g.stroke(); }
    }
    return { frame, resize, set(p) { P = Object.assign({}, DEFAULTS, p); world = null; }, get P() { return P; } };
  }
  window.SeaLife = { DEFAULTS, create, metres, frac };
})();
