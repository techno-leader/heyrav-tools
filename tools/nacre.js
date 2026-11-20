/* Nacre - thin-film colour for the Sunken world (UI states, pearls, shells, gems).
   Physics after Sussenbach, "Rendering Iridescent Objects in Real-time" (2013):
   a film of thickness d and index n on a substrate reflects each wavelength by
   the Airy sum, R = (r12² + r23² + 2 r12 r23 cos δ) / (1 + r12² r23² + 2 r12 r23 cos δ),
   δ = 4π n d cos θt / λ. The spectrum is turned into colour through the CIE 1931
   observer (Wyman, Sloan & Shirley's analytic fit) and sRGB. Thickness varies
   over the surface as d(x) = davg + drel·Δ(x) with Δ a noise in [-1, 1] - the
   thesis's "spatially varying thickness", which is what makes nacre swirl.

   Nacre.color({d, n, sub, angle})      -> [r, g, b] 0-1, the film's own reflection
   Nacre.lut(opts, steps)               -> [[r,g,b], ...] over thickness dMin..dMax
   Nacre.gradient(opts, stops, kind)    -> a CSS gradient of the film's colours
   Nacre.paint(ctx, size, shape, opts)  -> paints a pearl / shell / bubble / gem   */
(function () {
  const g = (x, m, a, b) => { const t = (x - m) / (x < m ? a : b); return Math.exp(-.5 * t * t); };
  const xb = l => 1.056 * g(l, 599.8, 37.9, 31) + .362 * g(l, 442, 16, 26.7) - .065 * g(l, 501.1, 20.4, 26.2);
  const yb = l => .821 * g(l, 568.8, 46.9, 40.5) + .286 * g(l, 530.9, 16.3, 31.1);
  const zb = l => 1.217 * g(l, 437, 11.8, 36) + .681 * g(l, 459, 26, 13.8);
  const L = []; for (let l = 380; l <= 780; l += 10) L.push(l);
  const W = L.map(l => [xb(l), yb(l), zb(l)]), Ysum = W.reduce((s, w) => s + w[1], 0);
  const gam = v => v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055;
  const clamp = v => Math.max(0, Math.min(1, v)), sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

  function fres(n1, n2, c1, c2) {        // amplitude reflection, s and p averaged
    const rs = (n1 * c1 - n2 * c2) / (n1 * c1 + n2 * c2), rp = (n2 * c1 - n1 * c2) / (n2 * c1 + n1 * c2);
    return [rs, rp];
  }
  function reflect(lambda, d, n, sub, cosI) {
    const n1 = 1.0, sinI = Math.sqrt(1 - cosI * cosI);
    const sinT = sinI * n1 / n, cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
    const sin3 = sinI * n1 / sub, cos3 = Math.sqrt(Math.max(0, 1 - sin3 * sin3));
    const [a12, b12] = fres(n1, n, cosI, cosT), [a23, b23] = fres(n, sub, cosT, cos3);
    const dl = 4 * Math.PI * n * d * cosT / lambda, c = Math.cos(dl);
    const R = (r1, r2) => (r1 * r1 + r2 * r2 + 2 * r1 * r2 * c) / (1 + r1 * r1 * r2 * r2 + 2 * r1 * r2 * c);
    return .5 * (R(a12, a23) + R(b12, b23));
  }
  // the film's reflected colour, normalised so the brightest hue sits near 1
  function color(o) {
    const d = o.d ?? 400, n = o.n ?? 1.33, sub = o.sub ?? 1.0, cosI = Math.cos((o.angle ?? 0) * Math.PI / 180);
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < L.length; i++) { const r = reflect(L[i], d, n, sub, cosI); X += r * W[i][0]; Y += r * W[i][1]; Z += r * W[i][2]; }
    X /= Ysum; Y /= Ysum; Z /= Ysum;
    let r = 3.2406 * X - 1.5372 * Y - .4986 * Z, gg = -.9689 * X + 1.8758 * Y + .0415 * Z, b = .0557 * X - .2040 * Y + 1.0570 * Z;
    const k = (o.gain ?? 1) / Math.max(.04, Math.max(r, gg, b, .0001) * .9 + Y * .1);   // keep hue, lift weak films
    return [gam(clamp(r * k)), gam(clamp(gg * k)), gam(clamp(b * k))];
  }
  function lut(o, steps = 32) {
    const a = o.dMin ?? Math.max(0, (o.d ?? 400) - (o.drel ?? 150)), b = o.dMax ?? (o.d ?? 400) + (o.drel ?? 150), out = [];
    for (let i = 0; i < steps; i++) out.push(color({ ...o, d: a + (b - a) * i / (steps - 1) }));
    return out;
  }
  const hex = c => '#' + c.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
  const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // a CSS gradient of the film over its thickness range, mixed toward a base colour
  function gradient(o, stops = 8, kind = 'conic') {
    const base = o.base ? [1, 3, 5].map(i => parseInt(o.base.slice(i, i + 2), 16) / 255) : null, m = o.mix ?? 0;
    const cs = lut(o, stops).map(c => hex(base ? mixc(c, base, m) : c));
    if (kind === 'conic') return `conic-gradient(from var(--nacre-a,0deg),${cs.join(',')},${cs[0]})`;
    return `linear-gradient(${o.dir ?? '120deg'},${cs.join(',')})`;
  }

  // value noise for the spatially varying thickness
  function noise2(seed) {
    const h = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
    const v = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w; };
    return (x, y) => (v(x, y) * .6 + v(x * 2.3 + 7, y * 2.3) * .3 + v(x * 5.1, y * 5.1 + 3) * .1) * 2 - 1;
  }
  // the film's reflection as it really is: faint at normal incidence, no normalising (for bubbles)
  function raw(o) {
    const d = o.d ?? 400, n = o.n ?? 1.33, sub = o.sub ?? 1.0, cosI = Math.cos((o.angle ?? 0) * Math.PI / 180);
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < L.length; i += 2) { const r = reflect(L[i], d, n, sub, cosI); X += r * W[i][0]; Y += r * W[i][1]; Z += r * W[i][2]; }
    X /= Ysum / 2; Y /= Ysum / 2; Z /= Ysum / 2;
    return [3.2406 * X - 1.5372 * Y - .4986 * Z, -.9689 * X + 1.8758 * Y + .0415 * Z, .0557 * X - .2040 * Y + 1.0570 * Z].map(v => Math.max(0, v));
  }
  /* paint a piece lit by thin film. shape: pearl | shell | bubble | gem
     - pearl: a sphere of nacre, soft orient and a bright lustre ring
     - bubble: a water film (n 1.33) thinning toward the top as it drains, mostly clear,
       colour only in the reflection, strongest at the rim, two window highlights
     - shell: abalone from inside - growth arcs from the spire, respiratory pores, a muscle scar
     - gem: an opal cabochon - patches of spectral colour that change with the angle */
  function paint(ctx, size, shape, o = {}) {
    const S = Math.round(size), img = ctx.createImageData(S, S), px = img.data, N = noise2(o.seed ?? 1);
    const lx = (o.light?.[0] ?? .3) * 2 - 1, ly = (o.light?.[1] ?? .25) * 2 - 1, lz = Math.sqrt(Math.max(.1, 1 - lx * lx - ly * ly));
    const put = (x, y, c, a) => { const i = (y * S + x) * 4; px[i] = clamp(c[0]) * 255; px[i + 1] = clamp(c[1]) * 255; px[i + 2] = clamp(c[2]) * 255; px[i + 3] = clamp(a) * 255; };
    const cache = new Map(), film = (d, ang, n, sub, rawMode) => { const k = Math.round(d / 4) + '|' + Math.round(ang / 6) + '|' + (rawMode ? 1 : 0); if (!cache.has(k)) cache.set(k, rawMode ? raw({ d, angle: ang, n, sub }) : color({ d, angle: ang, n, sub })); return cache.get(k); };
    // opal patches: a jittered grid, each cell its own film
    const cell = (x, y, sc) => { const gx = Math.floor(x * sc), gy = Math.floor(y * sc); let best = 9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = gx + i, cy = gy + j, h = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453, fx = h - Math.floor(h), h2 = Math.sin(cx * 269.5 + cy * 183.3) * 43758.5453, fy = h2 - Math.floor(h2);
        const d = (x * sc - cx - fx) ** 2 + (y * sc - cy - fy) ** 2; if (d < best) { best = d; id = fx * 997 + fy * 113; } } return [id, best]; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x + .5) / S * 2 - 1, ny = (y + .5) / S * 2 - 1;
      if (shape === 'bubble') {
        const r2 = nx * nx + ny * ny; if (r2 > 1) continue; const nz = Math.sqrt(1 - r2), ang = Math.acos(nz) * 57.3;
        const d = 120 + (ny + 1) * .5 * 900 + N(nx * 2.2, ny * 1.4 + Math.sin(nx * 3) * .4) * 160;            // drains: thin on top, thick below
        const fres = .04 + .96 * Math.pow(1 - nz, 5), R = film(d, ang, 1.33, 1, true).map(v => v * (2.2 + fres * 6));
        const win = Math.exp(-((nx + .38) ** 2 * 40 + (ny + .42) ** 2 * 26)) + .6 * Math.exp(-((nx - .3) ** 2 * 60 + (ny - .5) ** 2 * 90));
        const c = R.map(v => v + win), a = clamp(Math.max(...R) * .9 + Math.pow(1 - nz, 3) * .35 + win * .8) * clamp((1 - Math.sqrt(r2)) * S * .6);
        put(x, y, c.map(v => v / Math.max(a, .001)), a); continue;
      }
      if (shape === 'shell') {
        const ex = nx * 1.05, ey = ny * 1.32 + .05, r = Math.hypot(ex, ey); if (r > 1) continue;
        const nz = Math.sqrt(1 - Math.min(1, r * r * .85)), sx = .62, sy = -.55, gr = Math.hypot(ex - sx, ey - sy), ga = Math.atan2(ey - sy, ex - sx);
        const d = 330 + 210 * Math.sin(gr * 11 + N(ex * 2.2, ey * 2.2) * 2.4 + ga * .8) + 90 * N(ex * 3, ey * 3);
        let c = film(d, Math.acos(nz) * 57.3, 1.53, 1.68, false);
        { const m = (c[0] + c[1] + c[2]) / 3; c = c.map((v, i) => clamp(Math.pow(clamp(m + (v - m) * 2.6), 1.5) * [.8, .95, 1.1][i] + [.0, .05, .1][i])); }
        const scar = Math.exp(-((ex + .12) ** 2 * 9 + (ey - .1) ** 2 * 7)); c = c.map((v, i) => v * (1 - scar * .55) + [.75, .72, .68][i] * scar * .45);
        const rim = sstep(.9, 1, r); c = c.map((v, i) => v * (1 - rim) + [.26, .22, .24][i] * rim);
        for (let p = 0; p < 7; p++) { const t = p / 7, qx = .78 - t * 1.25 * .55, qy = -.42 + t * 1.25 * .62, pd = Math.hypot(ex - qx * 1.05 + .02, ey - qy); if (pd < .045) c = [.06, .05, .06]; }   // respiratory pores
        const spec = Math.pow(Math.max(0, nx * lx * .5 + ny * ly * .5 + nz * lz), 60) * .7;
        put(x, y, c.map(v => v * (.62 + .45 * nz) + spec), clamp((1 - r) * S * .5)); continue;
      }
      if (shape === 'gem') {
        const ex = nx * 1.0, ey = ny * 1.3, r2 = ex * ex + ey * ey; if (r2 > 1) continue; const nz = Math.sqrt(1 - r2), ang = Math.acos(nz) * 57.3;
        const [id, dd] = cell(nx + .3 + N(nx * 2, ny * 2) * .15, ny, 4.5), [id2] = cell(nx * 1.7 - .2, ny * 1.7 + .5, 8), d = 260 + (id % 1) * 0 + ((id * 13.37) % 1) * 520 + ang * 3;
        const rid = (id * 7.31) % 1, flash = (rid > .38 ? 1 : 0) * (.55 + .45 * Math.sin(rid * 40 + ang * .08 + (lx + ly) * 3)) * (1 - sstep(.25, .45, dd) * .35), body = [.07, .11, .18];
        const fc = film(d, ang, 1.45, 1, false), fc2 = film(260 + ((id2 * 7.1) % 1) * 600, ang, 1.45, 1, false);
        let c = body.map((v, i) => v * (1 - flash) + (fc[i] * .75 + fc2[i] * .25) * flash);
        c = c.map(v => v * (.68 + .35 * nz)); const spec = Math.pow(Math.max(0, nx * lx * .45 + ny * ly * .45 + nz * lz), 80) * .9;
        put(x, y, c.map(v => v + spec), clamp((1 - Math.sqrt(r2)) * S * .5)); continue;
      }
      // pearl
      const r2 = nx * nx + ny * ny; if (r2 > 1) continue; const nz = Math.sqrt(1 - r2), ang = Math.acos(nz) * 57.3;
      const base = o.base ? [1, 3, 5].map(i => parseInt(o.base.slice(i, i + 2), 16) / 255) : [.95, .93, .9];
      const fc = film((o.d ?? 520) + N(nx * 2.5, ny * 2.5) * (o.drel ?? 90), ang, o.n ?? 1.53, o.sub ?? 1.68, false);
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz), lustre = Math.exp(-Math.pow((nx - lx * .45) ** 2 + (ny - ly * .45) ** 2 - .1, 2) * 160) * .14;
      const orient = .25 + .75 * Math.pow(1 - nz, 1.2);
      let c = base.map((v, i) => v * (1 - (o.mix ?? .62) * 0) * (1 - orient * .7) + fc[i] * orient * .7);
      c = c.map(v => v * (.42 + .5 * ndl) + lustre); const spec = Math.pow(Math.max(0, nx * lx * .5 + ny * ly * .5 + nz * lz * .9), 70) * .55;
      put(x, y, c.map(v => v + spec), clamp((1 - Math.sqrt(r2)) * S * .5));
    }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = S; tmp.getContext('2d').putImageData(img, 0, 0);
    return tmp;
  }
  const PRESETS = {
    'soap bubble': { d: 348, drel: 200, n: 1.33, sub: 1.0, mix: 0, scale: 2 },
    'thick bubble': { d: 635, drel: 220, n: 1.33, sub: 1.0, mix: 0, scale: 2 },
    'oil on water': { d: 216, drel: 120, n: 1.4, sub: 1.33, mix: .1, scale: 3 },
    'pearl': { d: 520, drel: 90, n: 1.53, sub: 1.68, mix: .62, base: '#efe9e2', scale: 2.4 },
    'abalone': { d: 470, drel: 260, n: 1.53, sub: 1.68, mix: .18, base: '#2f6f86', scale: 3.2 },
    'sea glass': { d: 300, drel: 80, n: 1.5, sub: 1.52, mix: .78, base: '#a8e8d4', scale: 2 },
  };
  window.Nacre = { color, raw, lut, gradient, paint, hex, PRESETS };
})();
