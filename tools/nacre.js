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
  const clamp = v => Math.max(0, Math.min(1, v));

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
  /* paint a shape lit by thin film. shape: pearl | shell | bubble | gem | drop
     o: d, drel, n, sub, scale (noise), base (hex), mix, seed, light [x,y] 0-1 */
  function paint(ctx, size, shape, o = {}) {
    const S = Math.round(size), img = ctx.createImageData(S, S), px = img.data, N = noise2(o.seed ?? 1);
    const dAvg = o.d ?? 420, dRel = o.drel ?? 160, sc = o.scale ?? 3, base = o.base ? [1, 3, 5].map(i => parseInt(o.base.slice(i, i + 2), 16) / 255) : [.92, .92, .95];
    const T = 48, A = 6, tab = [];   // thickness × angle table, so each pixel is a lookup
    for (let ai = 0; ai < A; ai++) { const ang = ai / (A - 1) * 75; tab.push(lut({ ...o, angle: ang, dMin: Math.max(20, dAvg - dRel), dMax: dAvg + dRel }, T)); }
    const look = (t, ang) => { const ai = Math.min(A - 1, ang / 75 * (A - 1)), a0 = Math.floor(ai), a1 = Math.min(A - 1, a0 + 1), f = ai - a0, ti = Math.round(clamp(t) * (T - 1)); return mixc(tab[a0][ti], tab[a1][ti], f); };
    const lx = (o.light?.[0] ?? .3) * 2 - 1, ly = (o.light?.[1] ?? .25) * 2 - 1, lz = Math.sqrt(Math.max(.1, 1 - lx * lx - ly * ly));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let nx = (x + .5) / S * 2 - 1, ny = (y + .5) / S * 2 - 1, inside = 0, nz = 0, film = 1, body = base, alpha = 1;
      if (shape === 'shell') {             // an abalone-like ear shell, seen from inside
        const ex = nx * 1.05, ey = ny * 1.3 + .05, r = Math.hypot(ex, ey); if (r > 1) continue;
        inside = 1; nz = Math.sqrt(1 - Math.min(1, r * r * .7)); alpha = clamp((1 - r) * S * .5);
        const sw = Math.atan2(ey, ex) * 1.5 + r * 6; film = .5 + .5 * Math.sin(sw + N(nx * sc, ny * sc) * 2.5);
      } else if (shape === 'gem') {        // a faceted cabochon: flat facets break the film
        const r = Math.max(Math.abs(nx) * .85 + Math.abs(ny) * .55, Math.abs(ny) * 1.1); if (r > 1) continue;
        inside = 1; const f = Math.floor(Math.atan2(ny, nx) / (Math.PI / 4)); nx = Math.cos(f * Math.PI / 4 + .4) * r; ny = Math.sin(f * Math.PI / 4 + .4) * r;
        nz = Math.sqrt(Math.max(0, 1 - r * r * .8)); alpha = clamp((1 - r) * S * .4); film = .5 + .5 * N(f * 1.7, r * 2);
      } else {                             // pearl, bubble, drop: a sphere
        let r2 = nx * nx + ny * ny; if (shape === 'drop') { const t = ny + .35; r2 = nx * nx * (1 + Math.max(0, -t) * 1.6) + t * t * .75; }
        if (r2 > 1) continue; inside = 1; nz = Math.sqrt(1 - r2); alpha = clamp((1 - Math.sqrt(r2)) * S * .5);
        film = .5 + .5 * N(nx * sc + 4, ny * sc);
      }
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz), ang = Math.acos(clamp(nz)) * 180 / Math.PI;
      const fc = look(film, ang), spec = Math.pow(Math.max(0, (nx * lx + ny * ly) * .5 + nz * lz * .9), 40);
      let c;
      if (shape === 'bubble') { const rim = Math.pow(1 - nz, 1.6); c = mixc([0, 0, 0], fc, .25 + rim * .9); alpha *= .25 + rim * .75; }
      else { const m = o.mix ?? .45; c = mixc(fc, body, m).map(v => v * (.55 + .5 * ndl)); }
      c = c.map(v => clamp(v + spec * .9));
      const i = (y * S + x) * 4; px[i] = c[0] * 255; px[i + 1] = c[1] * 255; px[i + 2] = c[2] * 255; px[i + 3] = alpha * 255;
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
  window.Nacre = { color, lut, gradient, paint, hex, PRESETS };
})();
