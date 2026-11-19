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
    squid: 2, rocks: 1, kelp: 1, fogFar: .82, fogMid: .55, fogNear: .22, parallax: 1, creatures: 1, floor: 1, from: 0, to: 1,
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
        const kelpN = P.from < .1 ? Math.round(7 * P.kelp * dens) : 0;
        for (let i = 0; i < kelpN; i++) { const side = r() < .5 ? -1 : 1; objs.push({ type: 'kelp', li, L, side, x: 0, y: (frac(4 + r() * 34) - P.from) / (P.to - P.from) * tall + h * (.5 + r() * .5), len: (200 + r() * 280) * L.s, ph: r() * 6, leaves: 7 + (r() * 6 | 0) }); }
      });
      // the sea floor at the very bottom of the page
      const floorY = page - h * .22;
      // creatures, each at its real depth
      const R0 = P.from, R1 = P.to, at = m => (frac(m) - R0) / (R1 - R0) * page, cre = [], keep = c => c.y > -h && c.y < page + h;
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
        if (P.floor && R1 > .95) { cre.push({ type: 'tripod', y: floorY + h * .1, x: w * .2 }, { type: 'tripod', y: floorY + h * .12, x: w * .66 }, { type: 'seapig', y: floorY + h * .15, x: w * .44 }, { type: 'sponge', y: floorY + h * .12, x: w * .86 }); }
      }
      world = { page, w, h, layers, objs, cre: cre.filter(keep), floorY: R1 > .95 ? floorY : 1e9 };
    }
    function jelly(r, y, w) {
      const x = r() < .5 ? w * (.08 + r() * .2) : w * (.72 + r() * .2), n = 7 + (r() * 4 | 0), bell = (26 + r() * 22) * P.bell, j = { type: 'jelly', y, x, x0: x, y0: y, bell, ph: r() * 6, tents: [], arms: [] };
      for (let i = 0; i < n; i++) j.tents.push(chain(12, x, y, 9 * P.tentLen));
      for (let i = 0; i < 3; i++) j.arms.push(chain(8, x, y, 7 * P.tentLen));
      return j;
    }
    function squid(r, y, w) { const x = w * (.2 + r() * .6); const s = { type: 'squid', y, x, x0: x, y0: y, dir: r() < .5 ? -1 : 1, ph: r() * 6, arms: [] }; for (let i = 0; i < 8; i++) s.arms.push(chain(8, x, y, 6)); s.arms.push(chain(13, x, y, 7), chain(13, x, y, 7)); return s; }

    let SC = 1;
    function resize(w, h, page, sc = 1) { W = w; H = h; SC = sc; const cw = Math.round(w * sc), ch = Math.round(h * sc); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; } layout(page || h, w, h); }

    function frame(t, cam) {
      if (!world || (!world.solo && (world.page !== cam.page || world.w !== cam.w || world.h !== cam.h || SC !== (cam.scale || 1)))) resize(cam.w, cam.h, cam.page, cam.scale || 1);
      g.setTransform(SC, 0, 0, SC, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H);
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
        else if (c.type === 'turtle') drawTurtle(c, t, sy, body, f);
        else if (c.type === 'manta') drawManta(c, t, sy, null, f);
        else if (c.type === 'lantern') drawLantern(c, t, sy, body);
        else if (c.type === 'siphon') drawSiphon(c, t, sy);
        else if (c.type === 'angler') drawAngler(c, t, sy, body);
        else if (c.type === 'tripod') drawTripod(c, t, sy, body);
        else if (c.type === 'seapig') drawSeapig(c, t, sy);
        else if (c.type === 'sponge') drawSponge(c, t, sy, f);
        g.restore();
      });
    }

    /* ---------- creatures, after ABZÛ: flat forms, countershaded (dark back, pale belly),
       one bright detail each. Shapes follow the real animals' anatomy. ---------- */
    const shade = (y0, y1, top, bot) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, css(top)); gr.addColorStop(1, css(bot)); return gr; };
    function fishPath(a, ht, tail) {           // nose at +a, tail fork at -a; tail swings by `tail`
      const p = new Path2D(); p.moveTo(a, 0);
      p.bezierCurveTo(a * .55, -ht * .66, -a * .35, -ht * .6, -a * .7, -ht * .1);
      p.lineTo(-a * 1.18, -ht * .62 + tail); p.lineTo(-a * 1.02, tail * .4); p.lineTo(-a * 1.18, ht * .62 + tail); p.lineTo(-a * .7, ht * .1);
      p.bezierCurveTo(-a * .35, ht * .58, a * .55, ht * .62, a, 0); p.closePath(); return p;
    }
    // school fish are drawn once per colour and size into three tail frames
    const fishSprites = new Map();
    function fishSprite(col, s, k) {
      const key = col.map(v => v.toFixed(2)).join() + '|' + Math.round(s * 2) + '|' + k; if (fishSprites.has(key)) return fishSprites.get(key);
      const w = Math.ceil(s * 2.6), h = Math.ceil(s * 1.2), c = document.createElement('canvas'), sc = 2; c.width = w * sc; c.height = h * sc;
      const x = c.getContext('2d'); x.scale(sc, sc); x.translate(w * .58, h / 2);
      const gr = x.createLinearGradient(0, -s * .35, 0, s * .35); gr.addColorStop(0, css(mix(col, [0, .08, .12], .55))); gr.addColorStop(.55, css(col)); gr.addColorStop(1, css(mix(col, [1, 1, 1], .55)));
      x.fillStyle = gr; x.fill(fishPath(s, s * .5, (k - 1) * s * .14));
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(-s * .5, -s * .02, s * 1.2, s * .05);               // the lateral line catching light
      x.fillStyle = css(mix(col, [0, 0, 0], .7)); x.beginPath(); x.arc(s * .62, -s * .06, s * .07, 0, 7); x.fill();
      if (fishSprites.size > 200) fishSprites.clear(); fishSprites.set(key, c); return c;
    }
    // a bait ball: each fish circles a drifting centre on its own orbit and parts around the pointer
    function school(c, t, sy, f, ptr) {
      if (c.fish.length !== c.n) { const r = rng(P.seed + 5); c.fish = []; for (let i = 0; i < c.n; i++) c.fish.push({ a: r() * 6.28, rr: .25 + r() * .75, tilt: (r() - .5) * .9, sp: .6 + r() * .6, x: c.cx, y: sy, s: .75 + r() * .5, depth: r(), ph: r() * 6 }); }
      const cx = c.cx + Math.sin(t * .11) * c.r * .8, cy = sy + Math.cos(t * .09) * c.r * .35, col = mix(rgb(P.schoolColor), f, .3);
      c.fish.sort((a, b) => a.depth - b.depth).forEach(q => {
        q.a += .012 * q.sp * P.schoolSpeed; const ox = Math.cos(q.a) * c.r * q.rr, oy = Math.sin(q.a) * c.r * q.rr * (.45 + .25 * Math.sin(q.tilt + t * .2));
        let tx = cx + ox, ty = cy + oy;
        if (ptr) { const dx = tx - ptr[0], dy = ty - ptr[1], d = Math.hypot(dx, dy) || 1; if (d < 120) { tx += dx / d * (120 - d); ty += dy / d * (120 - d); } }
        const vx = tx - q.x, vy = ty - q.y; q.x += vx * .12; q.y += vy * .12;
        const dir = Math.cos(q.a + Math.PI / 2) < 0 ? -1 : 1, s = 7 * P.fishSize * q.s * (.65 + q.depth * .55);
        const tone = mix(col, f, (1 - q.depth) * .45), k = 1 + Math.round(Math.sin(t * 9 * q.sp + q.ph)), spr = fishSprite(tone.map(v => Math.round(v * 12) / 12), s, k);
        g.save(); g.translate(q.x, q.y); g.scale(dir, 1); g.rotate(Math.sin(q.a) * .35 * dir * dir); g.drawImage(spr, -spr.width / 4 - s * .1, -spr.height / 4, spr.width / 2, spr.height / 2); g.restore();
      });
    }
    function drawJelly(j, t, sy, f, flow) {
      const ph = t * 1.4 * P.pulse + j.ph, beat = Math.max(0, Math.sin(ph)), rise = Math.pow(beat, 3) * 1.2;
      j.yo = (j.yo || 0) - rise * .6 + .25; if (j.yo < -120) j.yo = 120; if (j.fixed) j.yo = Math.sin(t * .5) * 8; const x = j.x0 + Math.sin(t * .2 + j.ph) * 30, y = sy + j.yo, b = j.bell * (1 + .12 * Math.cos(ph)), bh = j.bell * (.75 - .15 * Math.cos(ph));
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
      g.fillStyle = css(mix(tint, [1, .8, .9], .4), .6); for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; g.beginPath(); g.arc(x + Math.cos(a) * b * .98, y + Math.sin(a) * bh * .98, 1.4, 0, 7); g.fill(); }
      if (dark > .2) { g.globalCompositeOperation = 'lighter'; const gl = g.createRadialGradient(x, y, 0, x, y, b * 2.2); gl.addColorStop(0, css(glow, .25 * dark * P.glow)); gl.addColorStop(1, css(glow, 0)); g.fillStyle = gl; g.fillRect(x - b * 2.2, y - b * 2.2, b * 4.4, b * 4.4); }
    }
    function drawSquid(s, t, sy, body, f, flow) {
      const ph = t * .9 + s.ph, jet = Math.pow(Math.max(0, Math.sin(ph)), 4); s.xo = (s.xo || 0) + s.dir * (.15 + jet * 2.2); if (Math.abs(s.xo) > W * .35) s.dir *= -1; if (s.fixed) s.xo = Math.sin(t * .4) * W * .08;
      const x = s.x0 + s.xo, y = sy + Math.sin(t * .5 + s.ph) * 14, L = 52 * (s.k || 1), d = s.dir, deep = clamp(s.y0 / (world.page || 1));
      const c = mix([.62, .2, .22], f, .25 + (1 - deep) * .25);          // deep squid are red: invisible where red light never reaches
      g.strokeStyle = css(mix(c, [0, 0, 0], .15), .9); g.lineCap = 'round';
      s.arms.forEach((a, i) => { stepChain(a, x - d * L * .42, y + (i - 4.5) * 1.4, .9, .6, [-d * (.25 + jet * .6), flow[1] + Math.sin(t * 2 + i) * .05]); strokeChain(g, a, i >= 8 ? 1.4 : 3.2, .5); });
      g.save(); g.translate(x, y); g.scale(d, 1);
      const m = new Path2D(); m.moveTo(-L * .42, -L * .13); m.bezierCurveTo(L * .1, -L * .2 * (1 - jet * .15), L * .5, -L * .1, L * .62, 0); m.bezierCurveTo(L * .5, L * .1, L * .1, L * .2 * (1 - jet * .15), -L * .42, L * .13); m.closePath();
      g.fillStyle = shade(-L * .2, L * .2, mix(c, [0, 0, 0], .25), mix(c, [1, .85, .85], .3)); g.fill(m);
      const fin = new Path2D(); fin.moveTo(L * .3, 0); fin.lineTo(L * .66, -L * .22 - Math.sin(t * 4) * 2); fin.lineTo(L * .62, 0); fin.lineTo(L * .66, L * .22 + Math.sin(t * 4) * 2); fin.closePath(); g.fill(fin);
      g.fillStyle = css(mix(c, [1, .6, .5], .4), .7); for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(-L * .2 + (i * 13 % 50) / 50 * L * .7, ((i * 7) % 9 / 9 - .5) * L * .18, 1.3, 0, 7); g.fill(); }   // chromatophores
      g.fillStyle = '#f2f6f4'; g.beginPath(); g.arc(-L * .3, -L * .02, 4.2, 0, 7); g.fill(); g.fillStyle = '#0b1418'; g.beginPath(); g.arc(-L * .31, -L * .02, 2.4, 0, 7); g.fill();
      g.restore();
    }
    function drawTurtle(c, t, sy, body, f) {
      c.xo = c.fixed ? 100 : ((c.xo || 0) + .25) % (W + 200); const x = (c.x + c.xo) % (W + 200) - 100, y = sy + Math.sin(t * .4) * 10, fl = Math.sin(t * 1.3), k = c.k || 1;
      const shell = mix([.42, .36, .2], f, .35), skin = mix([.55, .55, .42], f, .35);
      g.save(); g.translate(x, y); g.scale(k, k);
      g.fillStyle = shade(-10, 20, mix(skin, [0, 0, 0], .2), mix(skin, [1, 1, 1], .35));
      [[1], [-1]].forEach(([sd]) => { g.save(); g.translate(14, sd * 10); g.rotate(sd * (.5 + fl * .45)); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(22, sd * 4, 40, sd * 22); g.quadraticCurveTo(18, sd * 14, 0, sd * 8); g.fill(); g.restore();
        g.save(); g.translate(-22, sd * 10); g.rotate(-sd * (.4 - fl * .2)); g.beginPath(); g.ellipse(-6, sd * 4, 10, 4.5, 0, 0, 7); g.fill(); g.restore(); });
      g.beginPath(); g.ellipse(37, -1, 11, 8, -.1, 0, 7); g.fill();
      g.fillStyle = shade(-24, 24, mix(shell, [0, 0, 0], .25), mix(shell, [1, .95, .8], .35)); g.beginPath(); g.ellipse(0, 0, 33, 24, 0, 0, 7); g.fill();
      g.strokeStyle = css(mix(shell, [1, .95, .75], .35), .7); g.lineWidth = 1.1;       // scutes
      [[-14, -8], [0, -10], [14, -8], [-16, 6], [0, 8], [16, 6]].forEach(([sx, syy]) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + .5; g.lineTo(sx + Math.cos(a) * 8, syy + Math.sin(a) * 7); } g.closePath(); g.stroke(); });
      g.fillStyle = '#0b1418'; g.beginPath(); g.arc(42, -4, 1.8, 0, 7); g.fill(); g.restore();
    }
    function drawManta(c, t, sy, col, f) {
      c.xo = c.fixed ? 200 : ((c.xo || 0) - .35); const span = c.fixed ? Math.min(W * 1.1, H * .95) : 150, x = ((c.x + c.xo) % (W + 400) + W + 400) % (W + 400) - 200, y = sy + Math.sin(t * .3) * 20, fl = Math.sin(t * .9);
      const top = mix([.1, .16, .2], f, .3), belly = mix([.85, .9, .9], f, .3);
      g.save(); g.translate(x, y);
      const p = new Path2D(), tip = span * .5, wy = fl * span * .22;
      p.moveTo(-span * .12, 0); p.bezierCurveTo(-span * .05, -span * .12, span * .05, -span * .2 - wy * .5, span * .02, -tip - wy);       // left wing to tip
      p.quadraticCurveTo(span * .16, -span * .14, span * .34, -span * .06); p.lineTo(span * .4, -span * .07); p.lineTo(span * .37, 0);    // cephalic fin
      p.lineTo(span * .4, span * .07); p.lineTo(span * .34, span * .06); p.quadraticCurveTo(span * .16, span * .14, span * .02, tip + wy);
      p.bezierCurveTo(span * .05, span * .2 + wy * .5, -span * .05, span * .12, -span * .12, 0); p.closePath();
      g.fillStyle = shade(-tip, tip, top, mix(top, belly, .3)); g.fill(p);
      g.fillStyle = css(mix(top, belly, .55), .5); g.beginPath(); g.ellipse(span * .02, -span * .1 - wy * .3, span * .06, span * .03, -.5, 0, 7); g.ellipse(span * .02, span * .1 + wy * .3, span * .06, span * .03, .5, 0, 7); g.fill();   // shoulder marks
      g.strokeStyle = css(top); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-span * .12, 0); g.quadraticCurveTo(-span * .4, Math.sin(t) * 6, -span * .62, Math.sin(t * 1.3) * 10); g.stroke();
      g.restore();
    }
    function drawLantern(c, t, sy, body) {
      c.xo = c.fixed ? 30 : (c.xo || 0) + c.dir * .4 * c.s; const x = ((c.x + c.xo) % (W + 60) + W + 60) % (W + 60) - 30, y = sy + Math.sin(t + c.x) * 6, s = 10 * c.s, glow = rgb(P.glowCol);
      g.save(); g.translate(x, y); g.scale(c.dir, 1);
      g.fillStyle = shade(-s * .4, s * .4, mix(body, [0, 0, 0], .4), mix(body, [.7, .8, .85], .35)); g.fill(fishPath(s, s * .5, Math.sin(t * 8 + c.x) * s * .1));
      g.fillStyle = '#dfe9ea'; g.beginPath(); g.arc(s * .55, -s * .05, s * .14, 0, 7); g.fill(); g.fillStyle = '#071014'; g.beginPath(); g.arc(s * .57, -s * .05, s * .08, 0, 7); g.fill();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) { const px = s * .45 - i * s * .2, py = s * .2 - Math.abs(i - 3) * s * .015, gr = g.createRadialGradient(px, py, 0, px, py, s * .16);
        gr.addColorStop(0, css(glow, .95 * P.glow)); gr.addColorStop(1, css(glow, 0)); g.fillStyle = gr; g.fillRect(px - s * .16, py - s * .16, s * .32, s * .32); }
      g.restore();
    }
    function drawSiphon(c, t, sy) {
      const glow = rgb(P.glowCol), x0 = c.x;
      // swimming bells at the top, then the stem with its glowing feeding polyps
      for (let i = 0; i < 4; i++) { const x = x0 + Math.sin(t * .4 + i * .3) * 6, y = sy + i * 9; g.fillStyle = css(mix([.8, .95, 1], glow, .3), .35); g.strokeStyle = css(mix([.8, .95, 1], glow, .4), .6); g.lineWidth = .8;
        g.beginPath(); g.ellipse(x, y, 7, 5, 0, 0, 7); g.fill(); g.stroke(); }
      g.strokeStyle = css(glow, .35); g.lineWidth = 1; g.beginPath(); const pts = [];
      for (let i = 0; i < c.links; i++) { const x = x0 + Math.sin(t * .4 + i * .45) * 18 + i * 3, y = sy + 36 + i * 13; pts.push([x, y]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.globalCompositeOperation = 'lighter';
      pts.forEach(([x, y], i) => { const a = .5 + .5 * Math.sin(t * 2 - i * .5), gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, css(glow, .65 * a * P.glow)); gr.addColorStop(1, css(glow, 0)); g.fillStyle = gr; g.fillRect(x - 9, y - 9, 18, 18);
        g.strokeStyle = css(glow, .25 * a); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + 10, x + 2 + Math.sin(t + i) * 4, y + 22); g.stroke(); });
    }
    function drawAngler(c, t, sy, body) {
      const k = c.k || 1, x = c.x + Math.sin(t * .15) * 30, y = sy + Math.sin(t * .3) * 8, d = c.dir, glow = rgb(P.glowCol), gape = .5 + .5 * Math.sin(t * .7);
      g.save(); g.translate(x, y); g.scale(d * k, k);
      const b = mix(body, [0, 0, 0], .55);
      g.fillStyle = css(b); g.beginPath(); g.moveTo(-30, 0); g.lineTo(-56, -18); g.quadraticCurveTo(-50, 0, -56, 18); g.closePath(); g.fill();   // tail
      const jaw = 10 + gape * 6; g.beginPath(); g.moveTo(34, -6); g.bezierCurveTo(30, -34, -22, -34, -30, -6); g.bezierCurveTo(-34, 14, 0, 30, 40, jaw); g.lineTo(18, 2); g.closePath(); g.fill();
      g.fillStyle = '#e9efe9'; for (let i = 0; i < 6; i++) { const tx = 32 - i * 5; g.beginPath(); g.moveTo(tx, -5 + i * .8); g.lineTo(tx - 2, 2 + i); g.lineTo(tx - 4, -4 + i * .8); g.fill(); g.beginPath(); g.moveTo(tx + 4, jaw - 2 - i); g.lineTo(tx + 2, jaw - 10 - i); g.lineTo(tx, jaw - 3 - i); g.fill(); }
      g.fillStyle = '#cfe6ea'; g.beginPath(); g.arc(14, -16, 2.6, 0, 7); g.fill();
      g.strokeStyle = css(mix(body, [.4, .4, .4], .3)); g.lineWidth = 1.5; const lx = 52, ly = -48 + Math.sin(t * 1.1) * 4; g.beginPath(); g.moveTo(10, -26); g.quadraticCurveTo(30, -60, lx, ly); g.stroke();
      g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(lx, ly, 0, lx, ly, 42); gr.addColorStop(0, css([.92, 1, .96], .95 * P.glow)); gr.addColorStop(.14, css(glow, .55 * P.glow)); gr.addColorStop(1, css(glow, 0)); g.fillStyle = gr; g.fillRect(lx - 42, ly - 42, 84, 84);
      g.restore();
    }
    function drawTripod(c, t, sy, body) {
      const k = c.k || 1, x = c.x, y = sy, col = mix([.55, .58, .6], body, .3);
      g.save(); g.translate(x, y); g.scale(k, k);
      g.strokeStyle = css(col); g.lineWidth = 1.1; [[-16, -30], [6, -30], [-30, -28]].forEach(([fx, fy], i) => { g.beginPath(); g.moveTo(fx * .3, fy); g.lineTo(i === 2 ? -44 : fx, 0); g.stroke(); });   // the tripod: two fins and the tail
      g.lineWidth = .8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(10, -34); g.quadraticCurveTo(22 + i * 6, -52 - i * 6, 30 + i * 8, -44 - Math.sin(t + i) * 4); g.stroke(); }   // pectoral feelers
      g.fillStyle = shade(-40, -26, mix(col, [0, 0, 0], .2), mix(col, [1, 1, 1], .25)); g.beginPath(); g.moveTo(18, -33); g.bezierCurveTo(10, -40, -20, -38, -36, -32); g.bezierCurveTo(-20, -28, 8, -26, 18, -33); g.fill();
      g.fillStyle = '#0b1418'; g.beginPath(); g.arc(13, -34, 1.3, 0, 7); g.fill(); g.restore();
    }
    function drawSeapig(c, t, sy) {
      const k = c.k || 1, x = c.x + (c.fixed ? 0 : Math.sin(t * .08) * 30), y = sy;
      g.save(); g.translate(x, y); g.scale(k, k);
      g.strokeStyle = 'rgba(230,170,195,.8)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-14 + i * 7, -4); g.lineTo(-15 + i * 7 + Math.sin(t * 2 + i) * 1.5, 2); g.stroke(); }      // tube feet
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(-4 + i * 7, -18); g.quadraticCurveTo(-6 + i * 9, -30, -2 + i * 10 + Math.sin(t + i) * 2, -32); g.stroke(); }   // the papillae on its back
      const gr = g.createLinearGradient(0, -20, 0, 0); gr.addColorStop(0, 'rgba(240,190,210,.85)'); gr.addColorStop(1, 'rgba(200,130,165,.8)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, -10, 22, 10, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,230,240,.5)'; g.beginPath(); g.ellipse(-4, -15, 12, 3, 0, 0, 7); g.fill(); g.restore();
    }
    function drawSponge(c, t, sy, f) {
      const k = c.k || 1, x = c.x, y = sy; g.save(); g.translate(x, y); g.scale(k, k);
      g.strokeStyle = css(mix([.88, .93, .92], f, .35), .75); g.lineWidth = .9;
      for (let i = 0; i < 7; i++) { const s = i / 6 - .5; g.beginPath(); g.moveTo(s * 18, 0); g.bezierCurveTo(s * 30, -40, s * 20, -70, s * 26, -96); g.stroke(); }
      for (let kk = 1; kk < 10; kk++) { const yy = -kk * 10, w = 10 + Math.sin(kk * .6) * 2 + kk * .6; g.beginPath(); g.ellipse(0, yy, w, 2.6, 0, 0, 7); g.stroke(); }
      for (let kk = 1; kk < 9; kk++) for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-10 + i * 4, -kk * 10); g.lineTo(-8 + i * 4, -kk * 10 - 10); g.stroke(); }   // the lattice
      g.restore();
    }
    /* one creature alone in a w × h frame, for asset tiles: school, jelly, squid, turtle, manta,
       lantern, siphon, angler, tripod, seapig, sponge, kelp, wall, pillar */
    function solo(type, w, h) {
      W = w; H = h; SC = Math.min(2, devicePixelRatio || 1); if (cv.width !== w * SC) { cv.width = w * SC; cv.height = h * SC; } const r = r0(), mid = h * .5;
      const L = { par: 0, fog: .15, s: Math.min(1, h / 300) }, objs = [], cre = [];
      if (type === 'kelp') objs.push({ type: 'kelp', li: 0, L, side: 0, x: w * .5, y: h * .98, len: h * .85, ph: 1, leaves: 10 });
      else if (type === 'wall') objs.push({ type: 'wall', li: 0, L, side: -1, base: w * .35, amp: w * .12, seed: 4 });
      else if (type === 'pillar') { const ow = w * .4; objs.push({ type: 'pillar', li: 0, L, x: w * .5, y: h * .06, w: ow, path: rockPath(r, ow, h * 3, 'pillar') }); }
      else if (type === 'school') cre.push({ type: 'school', y: mid, cx: w * .5, cy: 0, r: Math.min(w, h) * .32, n: 70, fish: [] });
      else if (type === 'jelly') { const j = jelly(r, h * .3, w); j.x0 = w * .5; j.bell = Math.min(w, h) * .16; j.yo = 0; j.fixed = true; cre.push(j); }
      else if (type === 'squid') { const q = squid(r, mid, w); q.x0 = w * .55; q.fixed = true; q.k = Math.min(w, h) / 110; cre.push(q); }
      else { const k = Math.min(w, h) / 120; cre.push({ type, y: type === 'tripod' || type === 'seapig' || type === 'sponge' ? h * .84 : type === 'siphon' ? h * .12 : type === 'angler' ? mid + 16 * k : mid, x: w * (type === 'manta' ? .6 : type === 'turtle' ? .45 : type === 'angler' ? .42 : .5), dir: 1, s: 2.6 * k, k: Math.min(1.8, k * .9), links: 7, fixed: true }); }
      world = { solo: true, page: h, w, h, layers: [L], objs, cre, floorY: /tripod|seapig|sponge/.test(type) ? h * .86 : 1e9 };
    }
    return { frame, resize, solo, set(p) { P = Object.assign({}, DEFAULTS, p); world = null; }, get P() { return P; } };
  }
  window.SeaLife = { DEFAULTS, create, metres, frac };
})();
