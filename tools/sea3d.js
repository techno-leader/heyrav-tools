/* Sea3D - the Sunken world's sea, in three dimensions (three.js r128).
   After ABZÛ: low-poly forms, flat-shaded, coloured by the light that is left.
   The camera dives as the page scrolls; distance is fog in the water's own
   colour, so near things are crisp and far things become silhouettes.
   - Reef walls of broken rock down both sides in three planes, each face its
     own tint (lit tops, darker undersides, moss in the shallows); kelp forests
     with many greens that sway; a ledge of seagrass lit by glowing yellow fish;
     hexagonal basalt columns and glowing jellyfish in the deep; the abyssal floor.
   - Schools are flocks (separation, alignment, cohesion): every fish steers by
     its neighbours, wags its own tail, glints, and parts around the pointer.
   - Creatures are lofted from cross-sections after their anatomy and placed at
     the depth they live: turtle and manta, humpbacks that pass when they sing,
     lanternfish, jellyfish and squid with soft tentacles, a siphonophore, anglerfish
     with a lure that lights their face, tripod fish, sea pigs, glass sponges.

   Sea3D.load()                       -> Promise (three.js from cdnjs)
   const s = Sea3D.create(canvas, o)  o: { quality: 0-1 }
   s.frame(t, cam)  cam: { depth 0-1, range [a, b], w, h, pointer, fog [r,g,b], top [r,g,b], whales }
   s.whales()       sends a pod across
   Sea3D.specimens(o) -> { add(type, canvas2d), frame(t) }  one creature per tile
   Sea3D.metres(d), Sea3D.frac(m)                                                           */
(function () {
  const metres = d => d <= 1 / 3 ? d * 600 : d <= 2 / 3 ? 200 + (d - 1 / 3) * 2400 : 1000 + (d - 2 / 3) * 9000;
  const frac = m => m <= 200 ? m / 600 : m <= 1000 ? 1 / 3 + (m - 200) / 2400 : 2 / 3 + (m - 1000) / 9000;
  const DEPTH = 900;                       // world units from the surface to the floor
  const yOf = m => -frac(m) * DEPTH;
  let T = null;
  function load(src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') {
    if (window.THREE) return Promise.resolve(T = window.THREE);
    window.__ppThree = window.__ppThree || new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = () => res(); s.onerror = rej; document.head.append(s); });
    return window.__ppThree.then(() => (T = window.THREE));
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi, s = t => t * t * (3 - 2 * t);
    const u = s(xf), v = s(yf), w = s(zf), L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  const fbm = (x, y, z) => vnoise(x, y, z) * .6 + vnoise(x * 2.1, y * 2.1, z * 2.1) * .28 + vnoise(x * 4.3, y * 4.3, z * 4.3) * .12;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

  /* ---------- geometry kit: triangles with a colour each (flat, faceted, like ABZÛ) ---------- */
  function Tri() {
    const pos = [], col = [];
    return {
      tri(a, b, c, ca, cb = ca, cc = ca) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); col.push(...ca, ...cb, ...cc); },
      quad(a, b, c, d, ca) { this.tri(a, b, c, ca); this.tri(a, c, d, ca); },
      geo() { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g; },
    };
  }
  /* a body lofted along x (tail at -len/2, head at +len/2) from ring cross-sections.
     o: len, seg, rad, top(u) upper half-height, bot(u) lower half-height, w(u) half-width, cy(u),
        back, belly (colours), pattern(u, a, base) -> colour, grain (per-face variation) */
  function loft(o, k = Tri()) {
    const S = o.seg || 14, R = o.rad || 10, L = o.len, r = rng(o.seed || 3), rings = [];
    for (let i = 0; i <= S; i++) {
      const u = i / S, x = -L / 2 + u * L, ring = [];
      for (let j = 0; j < R; j++) { const a = j / R * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        ring.push([x, (o.cy ? o.cy(u) : 0) + (s > 0 ? s * o.top(u) : s * (o.bot ? o.bot(u) : o.top(u))), c * o.w(u)]); }
      rings.push(ring);
    }
    const shade = (u, a) => {
      const t = (Math.sin(a) + 1) / 2, base = mix(o.belly, o.back, sstep(.32, .62, t));
      const c = o.pattern ? o.pattern(u, a, base) : base, g = 1 + (r() - .5) * (o.grain ?? .08);
      return c.map(v => clamp(v * g));
    };
    for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R, a = (j + .5) / R * Math.PI * 2, u = (i + .5) / S, c = shade(u, a);
      k.quad(rings[i][j], rings[i + 1][j], rings[i + 1][j2], rings[i][j2], c);
    }
    // close both ends to a point
    const tip = (ring, x, head) => { const c = shade(head ? 1 : 0, Math.PI / 2), apex = [x, o.cy ? o.cy(head ? 1 : 0) : 0, 0];
      for (let j = 0; j < R; j++) { const j2 = (j + 1) % R; head ? k.tri(ring[j], apex, ring[j2], c) : k.tri(ring[j2], apex, ring[j], c); } };
    tip(rings[0], -L / 2 - (o.tailTip || 0), false); tip(rings[S], L / 2 + (o.noseTip || 0), true);
    return k;
  }
  const fin = (k, pts, c) => { for (let i = 1; i < pts.length - 1; i++) k.tri(pts[0], pts[i], pts[i + 1], c); };

  /* ---------- materials ---------- */
  function swimMat(o = {}) {
    const m = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: o.shine ?? 24, specular: new T.Color(o.spec ?? 0x223038), side: T.DoubleSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, emissive: new T.Color(o.emissive ?? 0x000000) });
    const U = { uTime: { value: 0 }, uAmp: { value: o.amp ?? .06 }, uK: { value: o.k ?? 6 }, uW: { value: o.w ?? 8 }, uLen: { value: o.len ?? 1 }, uHead: { value: (o.len ?? 1) * .35 }, uAxis: { value: o.axis ?? 0 } };
    m.userData.u = U;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'uniform float uTime,uAmp,uK,uW,uLen,uHead,uAxis;\n' + (o.inst ? 'attribute float aPhase;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = ${o.inst ? 'aPhase' : '0.0'};
        float tw = pow(clamp((uHead - position.x) / uLen, 0., 1.), 1.5);
        float sw = sin(position.x * uK - uTime * uW + ph) * uAmp * tw;
        if (uAxis < .5) transformed.z += sw; else transformed.y += sw;`);
    };
    m.customProgramCacheKey = () => 'swim' + (o.inst ? 'i' : '') + (o.axis || 0);
    return m;
  }
  function swayMat(o = {}) {          // kelp and grass: bend more toward the tip
    const m = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 8, side: T.DoubleSide });
    const U = { uTime: { value: 0 }, uSway: { value: o.sway ?? .3 } }; m.userData.u = U;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'uniform float uTime,uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ip = instanceMatrix[3].x * .13 + instanceMatrix[3].z * .07;
        float h = max(0., position.y);
        transformed.x += sin(uTime * .7 + ip + h * 1.8) * uSway * h * h;
        transformed.z += cos(uTime * .5 + ip * 1.3 + h * 1.4) * uSway * .6 * h * h;`);
    };
    m.customProgramCacheKey = () => 'sway'; return m;
  }
  let glowTex = null;
  function glow() {
    if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (glowTex = new T.CanvasTexture(c));
  }
  const glowSprite = (col, s, op = 1) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: glow(), color: new T.Color(col), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: op })); sp.scale.set(s, s, 1); return sp; };
  let shaftTex = null;
  function shaft() {
    if (shaftTex) return shaftTex; const c = document.createElement('canvas'); c.width = 32; c.height = 256; const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(255,255,255,.9)'); v.addColorStop(.6, 'rgba(255,255,255,.25)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 32, 256); g.globalCompositeOperation = 'destination-in'; const h = g.createLinearGradient(0, 0, 32, 0); h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = h; g.fillRect(0, 0, 32, 256);
    return (shaftTex = new T.CanvasTexture(c));
  }

  /* ---------- the creatures and pieces ---------- */
  const B = {
    // a school fish: silver flanks, blue back, a forked tail
    fish(back = '#2c5f78', belly = '#e8f2f2') {
      const k = loft({ len: 1, seg: 7, rad: 6, top: u => .2 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .75) + .01, w: u => .09 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .8) + .005, back: hex(back), belly: hex(belly), grain: .05, seed: 2 });
      const c = hex(back); fin(k, [[-.48, 0, 0], [-.72, .22, 0], [-.62, 0, 0], [-.72, -.22, 0]], c); fin(k, [[.0, .19, 0], [-.2, .3, 0], [-.18, .17, 0]], c);
      const g = k.geo(); g.rotateY(-Math.PI / 2); return g;     // head toward +z, for lookAt
    },
    // a rock: a displaced icosahedron, each face its own tint; tops catch the light, moss in the shallows
    rock(seed, moss = 0) {
      const r = rng(seed), g = new T.IcosahedronGeometry(1, 2).toNonIndexed(), p = g.attributes.position, col = [], v = new T.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3); v.multiplyScalar(.72 + n * .6); v.y *= .8; p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals(); const nrm = g.attributes.normal, base = hex('#3f5b6a');
      for (let i = 0; i < p.count; i += 3) {
        const ny = (nrm.getY(i) + nrm.getY(i + 1) + nrm.getY(i + 2)) / 3, t = (r() - .5) * .16, up = sstep(.2, .9, ny);
        let c = base.map(x => x * (.5 + up * .75 + t)); if (moss && up > .4) c = mix(c, hex('#5f8a4a'), moss * up * .7);
        col.push(...c, ...c, ...c);
      }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return g;
    },
    // a kelp stalk with alternating blades, dark at the holdfast, gold-green where the light reaches
    kelp() {
      const k = Tri(), S = 18, base = hex('#2f5a2b'), tip = hex('#b8c86a');
      for (let i = 0; i < S; i++) {
        const y0 = i / S, y1 = (i + 1) / S, c = mix(base, tip, Math.pow(y1, 1.3)), wv = .012;
        k.quad([-wv, y0, 0], [wv, y0, 0], [wv, y1, 0], [-wv, y1, 0], c);
        if (i % 2 === 1 && i > 1) { const s = i % 4 === 1 ? 1 : -1, lc = mix(c, hex('#d6dc8a'), .18 + (i % 3) * .08), L = .16 + .05 * Math.sin(i);
          k.tri([0, y0, 0], [s * L * .55, y0 + .035, .02], [s * L, y0 + .09, 0], lc); k.tri([0, y0, 0], [s * L, y0 + .09, 0], [s * L * .4, y0 + .07, -.02], mix(lc, base, .25)); }
      }
      return k.geo();
    },
    blade() { const k = Tri(), c0 = hex('#2f6a5a'), c1 = hex('#a9d6a0'); for (let i = 0; i < 4; i++) { const y0 = i / 4, y1 = (i + 1) / 4, w0 = .05 * (1 - y0), w1 = .05 * (1 - y1); k.quad([-w0, y0, 0], [w0, y0, 0], [w1, y1, .02 * i], [-w1, y1, .02 * i], mix(c0, c1, y1)); } return k.geo(); },
    basalt() { const g = new T.CylinderGeometry(1, 1, 1, 6, 1).toNonIndexed(), p = g.attributes.position, col = []; for (let i = 0; i < p.count; i += 3) { const top = p.getY(i) > .49 && p.getY(i + 1) > .49 && p.getY(i + 2) > .49; const c = top ? hex('#9fc6d0') : hex('#3c5866'); col.push(...c, ...c, ...c); } g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g; },
  };

  // creatures are groups; each gets update(t, dt)
  const C = {
    turtle() {
      const g = new T.Group(), shell = hex('#5a5a34'), skin = hex('#8c8a62'), belly = hex('#d8cc8e');
      const k = loft({ len: 2, seg: 12, rad: 12, top: u => .42 * Math.pow(Math.sin(Math.PI * u), .6) + .02, bot: u => .14 * Math.pow(Math.sin(Math.PI * u), .7) + .02, w: u => .75 * Math.pow(Math.sin(Math.PI * u), .55) + .02, back: shell, belly,
        pattern: (u, a, b) => { const s = Math.sin(a); if (s < .1) return b; const cell = Math.floor(u * 5) + Math.floor((a / (Math.PI * 2)) * 10) * 7; return b.map(v => v * (.86 + hash(cell, 1, 2) * .3)); }, grain: .05, seed: 5 });
      const body = new T.Mesh(k.geo(), swimMat({ amp: 0, shine: 18 })); g.add(body);
      const hk = loft({ len: .7, seg: 6, rad: 8, top: u => .17 * Math.pow(Math.sin(Math.PI * (u * .8 + .2)), .6), w: u => .15 * Math.pow(Math.sin(Math.PI * (u * .8 + .2)), .6), back: skin, belly: mix(skin, belly, .5), grain: .1, seed: 6 });
      const head = new T.Mesh(hk.geo(), swimMat({ amp: 0 })); head.position.set(1.22, .02, 0); g.add(head);
      const eye = new T.Mesh(new T.SphereGeometry(.035, 6, 4), new T.MeshBasicMaterial({ color: 0x0b1418 })); eye.position.set(1.42, .08, .12); g.add(eye);
      const flip = (L, W) => { const f = Tri(), c = mix(skin, shell, .35), e = mix(skin, belly, .25); fin(f, [[0, 0, 0], [L * .3, 0, W * .5], [L * .95, 0, W * .2], [L, 0, 0], [L * .5, 0, -W * .2]], c); fin(f, [[0, -.01, 0], [L * .5, -.01, -W * .2], [L, -.01, 0], [L * .95, -.01, W * .2], [L * .3, -.01, W * .5]], e); return new T.Mesh(f.geo(), swimMat({ amp: 0 })); };
      const F = [];
      [[.55, 1], [.55, -1]].forEach(([x, s]) => { const pv = new T.Group(); pv.position.set(x, -.05, s * .55); const m = flip(1.25, .45); m.rotation.y = s * -1.9; pv.add(m); g.add(pv); F.push([pv, s, 0]); });
      [[-.7, 1], [-.7, -1]].forEach(([x, s]) => { const pv = new T.Group(); pv.position.set(x, -.05, s * .5); const m = flip(.45, .3); m.rotation.y = s * -2.6; pv.add(m); g.add(pv); F.push([pv, s, 1]); });
      g.userData.update = t => F.forEach(([pv, s, back]) => { const w = Math.sin(t * 1.1) ; pv.rotation.x = s * (back ? .2 + w * .15 : .35 + w * .55); pv.rotation.z = back ? 0 : -w * .25; });
      return g;
    },
    manta() {      // planform from above: blunt head with cephalic lobes, swept triangular wings, a thin tail
      const g = new T.Group(), top = hex('#1e2a33'), chevron = hex('#c9d4d2'), white = hex('#eef2ef'), k = Tri(), ROWS = 14, CH = 5, SPAN = 2.6;
      const sweep = z => -.5 * Math.pow(z / SPAN, 1.6), chord = z => 1.3 * (1 - Math.pow(z / SPAN, 1.35)) + .02, lead = z => sweep(z) + chord(z) * .5, trail = z => sweep(z) - chord(z) * .5, thick = z => .26 * Math.exp(-z * z * 3) + .018;
      for (const side of [1, -1]) for (let i = 0; i < ROWS; i++) for (let j = 0; j < CH; j++) {
        const z0 = Math.pow(i / ROWS, 1.15) * SPAN, z1 = Math.pow((i + 1) / ROWS, 1.15) * SPAN, P = (z, f, up) => { const L = lead(z), Tt = trail(z), x = Tt + (L - Tt) * f, h = thick(z) * Math.sin(Math.PI * f) * up; return [x, h, z * side]; };
        const f0 = j / CH, f1 = (j + 1) / CH, zz = (z0 + z1) / 2, ff = (f0 + f1) / 2;
        let c = top.map(v => v * (.9 + hash(i, j, side) * .2)); if (zz > .35 && zz < 1.1 && ff > .55 && ff < .9) c = mix(top, chevron, .75);   // the white shoulder chevrons
        const q = side > 0 ? [P(z0, f0, 1), P(z1, f0, 1), P(z1, f1, 1), P(z0, f1, 1)] : [P(z0, f0, 1), P(z0, f1, 1), P(z1, f1, 1), P(z1, f0, 1)];
        k.quad(...q, c);
        const b = side > 0 ? [P(z0, f0, -1), P(z0, f1, -1), P(z1, f1, -1), P(z1, f0, -1)] : [P(z0, f0, -1), P(z1, f0, -1), P(z1, f1, -1), P(z0, f1, -1)];
        k.quad(...b, zz > 2.2 || ff < .12 ? mix(white, top, .55) : white);
      }
      for (const s of [1, -1]) { const lc = mix(top, white, .15); k.tri([.6, .02, .16 * s], [.95, -.06, .26 * s], [.62, -.05, .3 * s], lc); k.tri([.6, .02, .16 * s], [.62, -.05, .3 * s], [.95, -.06, .26 * s], mix(lc, white, .4)); }  // cephalic lobes
      const mat = swimMat({ amp: 0 }); mat.onBeforeCompile = sh => { sh.uniforms.uTime = mat.userData.u.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float zz = abs(position.z) / 2.6; transformed.y += sin(uTime * 1.05 - zz * 1.4) * .85 * zz * zz; transformed.x -= sin(uTime * 1.05 - zz * 1.4 + 1.2) * .08 * zz;'); };
      mat.customProgramCacheKey = () => 'manta2'; g.add(new T.Mesh(k.geo(), mat));
      const tail = new T.Mesh(new T.CylinderGeometry(.008, .03, 1.7, 4), new T.MeshPhongMaterial({ color: 0x1e2a33, flatShading: true })); tail.rotation.z = Math.PI / 2; tail.position.x = -1.45; g.add(tail);
      return g;
    },
    whale() {        // a humpback: flat knobbly head, pleated pale throat, very long white pectorals, notched flukes
      const g = new T.Group(), back = hex('#1d2a3b'), belly = hex('#d5dde2'), L = 14;
      const U = [0, .06, .2, .35, .5, .62, .75, .85, .93, 1], tb = (arr) => u => { let i = 0; while (i < U.length - 2 && u > U[i + 1]) i++; const f = (u - U[i]) / (U[i + 1] - U[i]), e = f * f * (3 - 2 * f); return arr[i] + (arr[i + 1] - arr[i]) * e; };
      const k = loft({ len: L, seg: 30, rad: 14, tailTip: .1,
        top: tb([.06, .3, .48, .82, 1.2, 1.38, 1.3, .95, .5, .1]), bot: tb([.06, .32, .5, .86, 1.28, 1.5, 1.56, 1.38, .95, .16]), w: tb([.05, .14, .28, .6, 1.05, 1.28, 1.3, 1.1, .72, .14]),
        back, belly, grain: .07, seed: 9,
        pattern: (u, a, b) => { const s = Math.sin(a);
          if (s < -.55 && u > .6 && u < .97) return Math.floor(a * 16) % 2 ? mix(b, back, .4) : b;            // ventral pleats
          if (u > .86 && Math.abs(s + .05) < .12) return hex('#0d141c');                                       // the mouth line
          if (s > .2 && u > .82 && hash(Math.floor(u * 40), Math.floor(a * 9), 7) > .7) return mix(b, hex('#4b5d6e'), .6);   // tubercles on the head
          return b; } });
      // flukes: broad, notched in the middle, serrated trailing edge, pale below
      const fl = [], fc = back; for (const s of [1, -1]) { fl.push([[-6.85, 0, 0], [-7.3, .05, 1.2 * s], [-8.1, .1, 2.6 * s], [-8.4, .1, 2.2 * s], [-8.0, .05, 1.4 * s], [-8.2, 0, .9 * s], [-7.9, 0, .45 * s], [-8.05, 0, .1 * s]]); }
      fl.forEach(p => { fin(k, p, fc); fin(k, p.slice().reverse().map(q => [q[0], q[1] - .03, q[2]]), mix(fc, belly, .6)); });
      // pectorals a third of the body long, white, with knobs along the leading edge
      for (const s of [1, -1]) { const base = [3.4, -.9, 1.05 * s], pts = [base]; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([base[0] - t * 4.6 + Math.sin(i * 1.7) * .08, base[1] - t * 1.4, base[2] + s * (.3 + t * 3.9)]); } pts.push([base[0] - 4.9, base[1] - 1.5, base[2] + s * 4.1], [base[0] - .6, base[1] - .2, base[2] + s * .35]);
        fin(k, s > 0 ? pts : pts.slice().reverse(), mix(belly, back, .2)); fin(k, s > 0 ? pts.slice().reverse() : pts, mix(belly, back, .45)); }
      fin(k, [[-3.2, 1.05, 0], [-4.1, 1.5, 0], [-4.4, .95, 0]], back);
      g.add(new T.Mesh(k.geo(), swimMat({ amp: .5, k: .32, w: 1.1, len: L, axis: 1, shine: 26 })));
      const eye = new T.Mesh(new T.SphereGeometry(.09, 6, 4), new T.MeshBasicMaterial({ color: 0x05090d })); eye.position.set(5.2, -.15, .95); g.add(eye);
      return g;
    },
    jelly(col = '#cfeeff', glowCol = null) {
      const g = new T.Group(), pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new T.Vector2(Math.sin(u * Math.PI * .55) * 1 + (u > .85 ? (u - .85) * .8 : 0), Math.cos(u * Math.PI * .5) * .9 - .1)); }
      const bell = new T.Mesh(new T.LatheGeometry(pts, 16), new T.MeshPhongMaterial({ color: new T.Color(col), emissive: new T.Color(glowCol || '#000000'), emissiveIntensity: .7, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false, flatShading: true, shininess: 60 }));
      g.add(bell); const inner = new T.Mesh(new T.SphereGeometry(.35, 8, 6), new T.MeshBasicMaterial({ color: new T.Color(glowCol || '#ffc9e2'), transparent: true, opacity: .35, depthWrite: false })); inner.position.y = .25; g.add(inner);
      if (glowCol) g.add(glowSprite(glowCol, 4.5, .55));
      const arm = Tri(), ac = hex(glowCol ? '#bff6f0' : '#f4c9dd'); for (let i = 0; i < 16; i++) { const y0 = -i * .22, y1 = -(i + 1) * .22, w0 = .16 * (1 - i / 18), w1 = .16 * (1 - (i + 1) / 18), o0 = Math.sin(i * .9) * .08, o1 = Math.sin((i + 1) * .9) * .08; arm.quad([o0 - w0, y0, 0], [o0 + w0, y0, 0], [o1 + w1, y1, 0], [o1 - w1, y1, 0], ac.map(v => v * (.85 + (i % 2) * .15))); }
      const armGeo = arm.geo(), armMat = new T.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: .55, side: T.DoubleSide, depthWrite: false, emissive: new T.Color(glowCol || '#000000'), emissiveIntensity: .35 });
      const arms = []; for (let i = 0; i < 4; i++) { const m = new T.Mesh(armGeo, armMat); m.rotation.y = i * Math.PI / 4; m.position.y = -.1; g.add(m); arms.push(m); }
      const N = 10, S = 14, tents = [], lineMat = new T.LineBasicMaterial({ color: new T.Color(glowCol || col), transparent: true, opacity: .5 });
      for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, geo = new T.BufferGeometry(), arr = new Float32Array(S * 3); geo.setAttribute('position', new T.BufferAttribute(arr, 3));
        const ln = new T.Line(geo, lineMat); ln.frustumCulled = false; g.add(ln); const p = []; for (let s = 0; s < S; s++) p.push({ x: Math.cos(a) * .9, y: -.15 - s * .32, z: Math.sin(a) * .9, px: Math.cos(a) * .9, py: -.15 - s * .32, pz: Math.sin(a) * .9 }); tents.push({ a, p, arr, geo }); }
      g.userData.update = (t, dt) => {
        const beat = Math.max(0, Math.sin(t * 1.6 + g.id)), s = 1 + .14 * Math.sin(t * 1.6 + g.id);
        bell.scale.set(s, 2 - s, s); g.position.y += (Math.pow(beat, 3) * .02 - .004); arms.forEach((m, i) => { m.rotation.z = Math.sin(t * .7 + i) * .12; m.rotation.x = Math.cos(t * .6 + i) * .1; });
        tents.forEach(tn => { const r = .9 * s, ax = Math.cos(tn.a) * r, az = Math.sin(tn.a) * r; tn.p[0].x = ax; tn.p[0].y = -.12; tn.p[0].z = az;
          for (let i = 1; i < S; i++) { const q = tn.p[i], vx = (q.x - q.px) * .94, vy = (q.y - q.py) * .94, vz = (q.z - q.pz) * .94; q.px = q.x; q.py = q.y; q.pz = q.z; q.x += vx + Math.sin(t + i * .4 + tn.a) * .002; q.y += vy - .004 - Math.pow(beat, 3) * .01; q.z += vz; }
          for (let it = 0; it < 2; it++) for (let i = 1; i < S; i++) { const a = tn.p[i - 1], b = tn.p[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1, e = (d - .32) / d; if (i > 1) { a.x += dx * e * .5; a.y += dy * e * .5; a.z += dz * e * .5; } b.x -= dx * e * (i > 1 ? .5 : 1); b.y -= dy * e * (i > 1 ? .5 : 1); b.z -= dz * e * (i > 1 ? .5 : 1); }
          tn.p.forEach((q, i) => { tn.arr[i * 3] = q.x; tn.arr[i * 3 + 1] = q.y; tn.arr[i * 3 + 2] = q.z; }); tn.geo.attributes.position.needsUpdate = true; });
      };
      return g;
    },
    squid() {
      const g = new T.Group(), red = hex('#8e2d34'), pale = hex('#d98a84');
      const k = loft({ len: 2.4, seg: 12, rad: 9, top: u => .3 * Math.pow(Math.sin(Math.PI * (u * .9 + .05)), .7), w: u => .28 * Math.pow(Math.sin(Math.PI * (u * .9 + .05)), .7), back: red, belly: pale, grain: .14, seed: 11,
        pattern: (u, a, b) => hash(Math.floor(u * 10), Math.floor(a * 3), 4) > .82 ? mix(b, hex('#4a0f18'), .5) : b });
      fin(k, [[-1.1, 0, 0], [-.55, .01, .55], [-.25, 0, .1]], red); fin(k, [[-1.1, 0, 0], [-.25, 0, -.1], [-.55, .01, -.55]], red);
      const body = new T.Mesh(k.geo(), swimMat({ amp: .03, len: 2.4 })); body.rotation.y = Math.PI; g.add(body);
      const eye = new T.Mesh(new T.SphereGeometry(.11, 8, 6), new T.MeshPhongMaterial({ color: 0x101820, shininess: 90, specular: 0xffffff })); eye.position.set(-.9, .1, .2); g.add(eye);
      const mat = new T.LineBasicMaterial({ color: new T.Color('#9a3a3c'), transparent: true, opacity: .9 }), arms = [];
      for (let i = 0; i < 10; i++) { const n = i >= 8 ? 14 : 9, geo = new T.BufferGeometry(), arr = new Float32Array(n * 3); geo.setAttribute('position', new T.BufferAttribute(arr, 3)); const ln = new T.Line(geo, mat); ln.frustumCulled = false; g.add(ln);
        const a = i / 10 * Math.PI * 2, p = []; for (let s = 0; s < n; s++) p.push({ x: -1.2 - s * .2, y: Math.sin(a) * .12, z: Math.cos(a) * .12, px: -1.2 - s * .2, py: 0, pz: 0 }); arms.push({ a, p, arr, geo, seg: i >= 8 ? .2 : .14 }); }
      g.userData.update = t => { const jet = Math.pow(Math.max(0, Math.sin(t * .9)), 4);
        arms.forEach(A => { const q0 = A.p[0]; q0.x = -1.25; q0.y = Math.sin(A.a) * .12; q0.z = Math.cos(A.a) * .12;
          for (let i = 1; i < A.p.length; i++) { const q = A.p[i], vx = (q.x - q.px) * .9, vy = (q.y - q.py) * .9, vz = (q.z - q.pz) * .9; q.px = q.x; q.py = q.y; q.pz = q.z; q.x += vx - .01 - jet * .02; q.y += vy + Math.sin(t * 2 + i + A.a) * .003; q.z += vz + Math.cos(A.a) * .002; }
          for (let it = 0; it < 2; it++) for (let i = 1; i < A.p.length; i++) { const a = A.p[i - 1], b = A.p[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1, e = (d - A.seg) / d; b.x -= dx * e; b.y -= dy * e; b.z -= dz * e; }
          A.p.forEach((q, i) => { A.arr[i * 3] = q.x; A.arr[i * 3 + 1] = q.y; A.arr[i * 3 + 2] = q.z; }); A.geo.attributes.position.needsUpdate = true; }); };
      return g;
    },
    // one colony, one stem: swimming bells at the top, glowing feeding polyps down the same stem
    siphon(col = '#7ff5df') {
      const g = new T.Group(), N = 60, arr = new Float32Array(N * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(arr, 3));
      const stem = new T.Line(geo, new T.LineBasicMaterial({ color: new T.Color(col), transparent: true, opacity: .55 })); stem.frustumCulled = false; g.add(stem);
      const bells = []; for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.SphereGeometry(.5, 10, 8), new T.MeshPhongMaterial({ color: 0xcfeff4, transparent: true, opacity: .45, depthWrite: false, shininess: 80, emissive: new T.Color(col), emissiveIntensity: .15 })); b.scale.set(1, .8, 1); g.add(b); bells.push(b); }
      const nodes = []; for (let i = 0; i < 12; i++) { const s = glowSprite(col, 1.2, .8); g.add(s); nodes.push(s); }
      g.userData.update = t => {
        for (let i = 0; i < N; i++) { const u = i / N; arr[i * 3] = Math.sin(t * .4 + u * 5) * .8 * u; arr[i * 3 + 1] = -u * 14; arr[i * 3 + 2] = Math.cos(t * .3 + u * 4) * .5 * u; }
        geo.attributes.position.needsUpdate = true;
        bells.forEach((b, i) => { b.position.set(Math.sin(t * .4) * .05 + (i % 2 ? .22 : -.22), .62 * (6 - i) - .2, 0); const s = 1 + .08 * Math.sin(t * 3 + i); b.scale.set(s, .8 / s, s); });
        nodes.forEach((n, i) => { const k = Math.min(N - 1, 6 + i * 4); n.position.set(arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]); n.material.opacity = .4 + .5 * (.5 + .5 * Math.sin(t * 2 - i * .5)); });
      };
      return g;
    },
    angler() {
      const g = new T.Group(), skin = hex('#20262b'), belly = hex('#3a3a3e');
      const k = loft({ len: 2.6, seg: 12, rad: 10, top: u => .95 * Math.pow(Math.sin(Math.PI * Math.pow(u, .7)), .9) * (u > .9 ? 1 - (u - .9) * 4 : 1) + .03, bot: u => .75 * Math.pow(Math.sin(Math.PI * Math.pow(u, .7)), .9) + .03, w: u => .7 * Math.pow(Math.sin(Math.PI * Math.pow(u, .7)), .9) + .03, back: skin, belly, grain: .22, seed: 13 });
      fin(k, [[-1.25, 0, 0], [-2, .55, 0], [-1.7, 0, 0], [-2, -.55, 0]], skin);
      // the jaw: a lower lip that juts forward, with needle teeth up and down
      const tooth = hex('#e8ece4');
      for (let i = 0; i < 9; i++) { const z = (i / 8 - .5) * 1.1, x = 1.25 - Math.abs(z) * .5; k.tri([x, -.12, z - .05], [x, -.12, z + .05], [x + .02, .18 + hash(i, 1, 1) * .12, z], tooth); k.tri([x - .05, .12, z - .04], [x - .05, .12, z + .04], [x - .03, -.06 - hash(i, 2, 2) * .1, z], tooth); }
      fin(k, [[1.3, -.15, -.6], [1.4, -.2, 0], [1.3, -.15, .6], [.6, -.5, 0]], belly);
      const m = new T.Mesh(k.geo(), swimMat({ amp: .04, len: 2.6, shine: 50, spec: 0x445566 })); g.add(m);
      const eye = new T.Mesh(new T.SphereGeometry(.07, 6, 4), new T.MeshBasicMaterial({ color: 0x9fd6e0 })); eye.position.set(.75, .45, .4); g.add(eye);
      const lp = [[.5, .85, 0], [1.1, 1.6, 0], [1.9, 1.5, 0], [2.2, 1.0, 0]].map(p => new T.Vector3(...p)), curve = new T.CatmullRomCurve3(lp);
      g.add(new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(16)), new T.LineBasicMaterial({ color: 0x5a6670 })));
      const esca = new T.Mesh(new T.SphereGeometry(.12, 8, 6), new T.MeshBasicMaterial({ color: 0xe9fff6 })); esca.position.copy(lp[3]); g.add(esca);
      const halo = glowSprite('#8ff8e4', 3.2, .9); halo.position.copy(lp[3]); g.add(halo);
      const light = new T.PointLight(0x9ff5e6, 2.2, 7, 2); light.position.copy(lp[3]); g.add(light);
      g.userData.update = t => { const f = .8 + .2 * Math.sin(t * 2.3) + .05 * Math.sin(t * 17); light.intensity = 2.2 * f; halo.material.opacity = .8 * f; esca.position.y = lp[3].y + Math.sin(t * 1.3) * .06; halo.position.y = light.position.y = esca.position.y; };
      return g;
    },
    lantern() {    // dark, big-eyed, a line of photophores along the belly
      const g = new T.Group(), k = loft({ len: 1.4, seg: 8, rad: 8, top: u => .22 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .7) + .01, w: u => .1 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .7) + .01, back: hex('#1b2a36'), belly: hex('#6b8492'), grain: .1, seed: 15 });
      fin(k, [[-.68, 0, 0], [-.98, .22, 0], [-.86, 0, 0], [-.98, -.22, 0]], hex('#1b2a36'));
      const m = new T.Mesh(k.geo(), swimMat({ amp: .06, len: 1.4, shine: 70, spec: 0x99aabb })); g.add(m);
      const eye = new T.Mesh(new T.SphereGeometry(.07, 8, 6), new T.MeshPhongMaterial({ color: 0x0a1015, shininess: 120, specular: 0xffffff })); eye.position.set(.5, .05, .08); g.add(eye);
      for (let i = 0; i < 7; i++) { const s = glowSprite('#8ff8e4', .22, .95); s.position.set(.42 - i * .15, -.15 + Math.abs(i - 3) * .01, .07); g.add(s); }
      return g;
    },
    tripod() {
      const g = new T.Group(), k = loft({ len: 2, seg: 10, rad: 8, top: u => .17 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .7) + .01, w: u => .12 * Math.pow(Math.sin(Math.PI * clamp(u * 1.05)), .7) + .01, back: hex('#6d7378'), belly: hex('#b9bec0'), grain: .08, seed: 17 });
      g.add(new T.Mesh(k.geo(), swimMat({ amp: 0 })));
      const fk = Tri(), fc = hex('#c9d2d6');
      for (const z of [.2, -.2]) fin(fk, [[.25, -.1, z], [.55, -1.9, z * 1.4], [.62, -1.9, z * 1.4], [.4, -.1, z]], fc);       // the two pelvic rays it stands on
      fin(fk, [[-.95, -.02, 0], [-2.7, -1.9, 0], [-2.62, -1.9, 0], [-.95, .06, 0]], fc);                                         // the tail ray
      for (let i = 0; i < 4; i++) fin(fk, [[.55, .05, (i - 1.5) * .08], [1.3 + i * .28, 1.35 + i * .2, (i - 1.5) * .14], [1.34 + i * .28, 1.33 + i * .2, (i - 1.5) * .14], [.6, .02, (i - 1.5) * .08]], fc);   // feelers held into the current
      fin(fk, [[.1, .14, 0], [-.6, .42, 0], [-.9, .12, 0]], mix(fc, hex('#6d7378'), .4));
      g.add(new T.Mesh(fk.geo(), new T.MeshPhongMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: .85, flatShading: true, shininess: 40 })));
      g.position.y = 1.9; return g;
    },
    seapig() {
      const g = new T.Group(), k = loft({ len: 1.6, seg: 10, rad: 10, top: u => .42 * Math.pow(Math.sin(Math.PI * u), .5) + .02, bot: u => .22 * Math.pow(Math.sin(Math.PI * u), .5) + .02, w: u => .38 * Math.pow(Math.sin(Math.PI * u), .5) + .02, back: hex('#f8c9d6'), belly: hex('#e09ab4'), grain: .08, seed: 19 });
      g.add(new T.Mesh(k.geo(), swimMat({ amp: 0, opacity: .86, shine: 70, spec: 0xffeef4, emissive: 0x5a2236 })));
      const foot = new T.MeshPhongMaterial({ color: 0xf2b6c8, emissive: 0x4a1c2c, flatShading: true, transparent: true, opacity: .85 });
      for (let i = 0; i < 6; i++) for (const s of [1, -1]) { const f = new T.Mesh(new T.CylinderGeometry(.03, .05, .3, 5), foot); f.position.set(-.55 + i * .22, -.32, s * .2); g.add(f); }
      for (let i = 0; i < 2; i++) { const p = new T.Mesh(new T.CylinderGeometry(.015, .04, .55, 5), foot); p.position.set(.35 - i * .2, .6, (i - .5) * .16); p.rotation.z = -.4; g.add(p); }
      g.position.y = .45; return g;
    },
    sponge() {
      const g = new T.Group(), pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new T.Vector2(.35 + Math.sin(u * Math.PI * .8) * .45 + u * .2, u * 3.2)); }
      const geo = new T.LatheGeometry(pts, 14);
      g.add(new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xdff3f2, wireframe: true, transparent: true, opacity: .55 })));
      g.add(new T.Mesh(geo, new T.MeshPhongMaterial({ color: 0xbfe0e0, transparent: true, opacity: .18, side: T.DoubleSide, depthWrite: false })));
      return g;
    },
    glowfish() { const g = C.lantern(); g.children.forEach(c => { if (c.isMesh && c.material.vertexColors) { c.material = c.material.clone(); c.material.emissive = new T.Color('#c8a414'); c.material.emissiveIntensity = .9; } }); g.add(glowSprite('#ffd84a', 1.6, .55)); return g; },
  };

  /* ---------- a school: a flock, each fish steering by its neighbours ---------- */
  function School(o) {
    const N = o.n, geo = B.fish(o.back, o.belly), mat = swimMat({ inst: true, amp: .07, k: 7, w: 14, len: 1, shine: 90, spec: 0xbfd8e0 });
    const ph = new Float32Array(N); for (let i = 0; i < N; i++) ph[i] = Math.random() * 6.28; geo.setAttribute('aPhase', new T.InstancedBufferAttribute(ph, 1));
    const mesh = new T.InstancedMesh(geo, mat, N); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
    const P = new Float32Array(N * 3), V = new Float32Array(N * 3), S = new Float32Array(N), c = new T.Color(), d = new T.Object3D(), r = rng(o.seed || 1);
    for (let i = 0; i < N; i++) { P[i * 3] = o.c[0] + (r() - .5) * o.r[0]; P[i * 3 + 1] = o.c[1] + (r() - .5) * o.r[1]; P[i * 3 + 2] = o.c[2] + (r() - .5) * o.r[2]; V[i * 3] = (r() - .5) * .2; V[i * 3 + 2] = (r() - .5) * .2; S[i] = (o.size || 1) * (.8 + r() * .4);
      c.setHSL(.55 + (r() - .5) * .04, .2, .82 + r() * .16); mesh.setColorAt(i, c); }
    const goal = new T.Vector3();
    function update(t, dt, avoid) {
      dt = Math.min(dt, .05) * 60;
      goal.set(o.c[0] + Math.sin(t * .13 + o.seed) * o.r[0] * .35, o.c[1] + Math.sin(t * .21) * o.r[1] * .3, o.c[2] + Math.cos(t * .11) * o.r[2] * .35);
      for (let i = 0; i < N; i++) {
        const ix = i * 3; let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
        for (let j = 0; j < N; j++) { if (j === i) continue; const jx = j * 3, dx = P[jx] - P[ix], dy = P[jx + 1] - P[ix + 1], dz = P[jx + 2] - P[ix + 2], dd = dx * dx + dy * dy + dz * dz;
          if (dd < 6) { n++; ax += V[jx]; ay += V[jx + 1]; az += V[jx + 2]; cx += dx; cy += dy; cz += dz; if (dd < .5) { const k = 1 / (dd + .05); sx -= dx * k; sy -= dy * k; sz -= dz * k; } } }
        let vx = V[ix], vy = V[ix + 1], vz = V[ix + 2];
        if (n) { vx += (ax / n - vx) * .05 + cx / n * .004 + sx * .012; vy += (ay / n - vy) * .05 + cy / n * .004 + sy * .012; vz += (az / n - vz) * .05 + cz / n * .004 + sz * .012; }
        vx += (goal.x - P[ix]) * .0006; vy += (goal.y - P[ix + 1]) * .0009; vz += (goal.z - P[ix + 2]) * .0006;
        if (avoid) { const dx = P[ix] - avoid.x, dy = P[ix + 1] - avoid.y, dz = P[ix + 2] - avoid.z, dd = dx * dx + dy * dy + dz * dz; if (dd < 16) { const k = (16 - dd) / 16 * .05; vx += dx * k; vy += dy * k; vz += dz * k; } }
        const sp = Math.hypot(vx, vy, vz) || 1, lim = clamp(sp, .05, .16) / sp; vx *= lim; vy *= lim * .7; vz *= lim;
        V[ix] = vx; V[ix + 1] = vy; V[ix + 2] = vz; P[ix] += vx * dt; P[ix + 1] += vy * dt; P[ix + 2] += vz * dt;
        d.position.set(P[ix], P[ix + 1], P[ix + 2]); d.lookAt(P[ix] + vx, P[ix + 1] + vy, P[ix + 2] + vz); d.scale.setScalar(S[i]); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true; mat.userData.u.uTime.value = t;
    }
    return { mesh, update, center: o.c };
  }

  /* ---------- the world ---------- */
  function create(canvas, opts = {}) {
    T = T || window.THREE;
    const q = opts.quality ?? 1, renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: q > .6, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q > .6 ? 1.25 : 1));
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(50, 1, .5, 260);
    scene.fog = new T.FogExp2(0x2a7f95, .018);
    const hemi = new T.HemisphereLight(0xbff3ec, 0x0a1c26, .9), sun = new T.DirectionalLight(0xfff6df, 1.0); sun.position.set(.3, 1, .25); scene.add(hemi, sun);
    const amb = new T.AmbientLight(0x1a2f3a, .35); scene.add(amb);
    let built = null, W = 0, H = 0, lastT = 0;
    const live = [], schools = [], sway = [], whales = [];
    const add = (o, x, y, z, s = 1, ry = 0) => { o.position.set(x, y + (o.position.y || 0), z); o.scale.setScalar(s); o.rotation.y = ry; scene.add(o); live.push(o); return o; };
    function clear() { live.forEach(o => scene.remove(o)); live.length = 0; schools.length = 0; sway.length = 0; whales.length = 0; }
    function build(a, b, aspect) {
      clear(); const r = rng(11), y0 = -frac(metres(a)) * DEPTH + 25, y1 = -frac(metres(b)) * DEPTH - 25, span = y0 - y1;
      const halfW = z => Math.tan(25 * Math.PI / 180) * (30 - z) * aspect;
      const inRange = m => { const y = yOf(m); return y < y0 + 10 && y > y1 - 10; };
      // reef walls: three planes of broken rock down both sides
      const rockGeo = [B.rock(1), B.rock(2, 1), B.rock(3)], rockMat = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6 });
      [[-16, 1.02, 3], [-40, .95, 5.5], [-85, .9, 9]].forEach(([z, edge, size], li) => {
        const step = size * 1.35, count = Math.ceil(span / step) * 2, im = rockGeo.map(g => new T.InstancedMesh(g, rockMat, count)), n = [0, 0, 0], d = new T.Object3D(), col = new T.Color();
        for (let i = 0; i < count / 2; i++) for (const s of [-1, 1]) {
          const y = y0 - i * step - r() * step * .5, m = metres(clamp(-y / DEPTH, 0, 1)), wob = Math.sin(y * .05 + s * 2 + li) * .12 + Math.sin(y * .013 + li) * .1;
          const x = s * halfW(z) * (edge + wob + r() * .12), k = Math.floor(r() * 3); if (n[k] >= count) continue;
          d.position.set(x, y, z + (r() - .5) * 6); d.rotation.set(r() * 6, r() * 6, r() * 6); d.scale.set(size * (.8 + r() * .8), size * (.7 + r() * .9), size * (.8 + r() * .8)); d.updateMatrix(); im[k].setMatrixAt(n[k], d.matrix);
          const deep = sstep(150, 1500, m); col.setRGB(1 - deep * .35, 1 - deep * .25, 1 - deep * .1); im[k].setColorAt(n[k], col); n[k]++;
        }
        im.forEach((m, k) => { m.count = n[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m); live.push(m); });
      });
      // kelp forests from the walls in the sunlit zone, many greens
      if (inRange(5)) {
        const kg = B.kelp(), km = swayMat({ sway: .02 }), N = Math.round(70 * q), im = new T.InstancedMesh(kg, km, N), d = new T.Object3D(), col = new T.Color();
        for (let i = 0; i < N; i++) { const s = r() < .5 ? -1 : 1, z = -10 - r() * 60, h = 14 + r() * 26, y = yOf(10 + r() * 45);
          d.position.set(s * halfW(z) * (.6 + r() * .35), y, z); d.rotation.set(0, r() * 6, (r() - .5) * .12); d.scale.set(h * .9, h, h * .9); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
          col.setHSL(.24 + (r() - .5) * .08, .45 + r() * .2, .45 + r() * .2); im.setColorAt(i, col); }
        im.instanceMatrix.needsUpdate = true; scene.add(im); live.push(im); sway.push(km);
      }
      // light shafts in the upper water
      if (inRange(0)) for (let i = 0; i < 7; i++) { const m = new T.Mesh(new T.PlaneGeometry(4 + r() * 5, 150), new T.MeshBasicMaterial({ map: shaft(), color: 0xeaffff, transparent: true, opacity: .14 + r() * .1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
        m.position.set((r() - .5) * 60, -60, -20 - r() * 50); m.rotation.z = (r() - .5) * .35; m.userData.shaft = true; scene.add(m); live.push(m); }
      // schools: a bait ball near the surface, jacks a little deeper
      if (inRange(20)) { const sc = School({ n: Math.round(170 * q), c: [8, yOf(25), -12], r: [26, 10, 18], back: '#2c5f78', belly: '#eef6f6', seed: 3, size: 1 }); scene.add(sc.mesh); live.push(sc.mesh); schools.push(sc); }
      if (inRange(120)) { const sc = School({ n: Math.round(70 * q), c: [-10, yOf(120), -22], r: [30, 10, 16], back: '#3b5568', belly: '#cfdde2', seed: 7, size: 2.2 }); scene.add(sc.mesh); live.push(sc.mesh); schools.push(sc); }
      // big animals
      const big = (fn, m, x, z, s, ry, swim) => { if (!inRange(m)) return null; const g = add(C[fn](), x, yOf(m), z, s, ry); g.userData.swim = swim; return g; };
      big('turtle', 18, -8, -9, 1.6, .3, { vx: .9, range: 60 });
      big('manta', 55, 10, -16, 2.4, -.2, { vx: -1.2, range: 70 });
      // a ledge in the twilight with seagrass, lit by a few glowing yellow fish
      if (inRange(300)) {
        const ly = yOf(300), lx = -halfW(-18) * .55; for (let i = 0; i < 6; i++) { const rk = new T.Mesh(B.rock(21 + i, .6), rockMat); rk.position.set(lx - 6 + i * 3.2, ly - 1.5 - Math.abs(i - 3) * .4, -18 + (r() - .5) * 4); rk.scale.set(5 + r() * 3, 2.6 + r(), 5); rk.rotation.y = r() * 6; scene.add(rk); live.push(rk); }
        const bg = B.blade(), bm = swayMat({ sway: .25 }), N = Math.round(260 * q), im = new T.InstancedMesh(bg, bm, N), d = new T.Object3D(), col = new T.Color();
        for (let i = 0; i < N; i++) { const a = r() * 6.28, rr = Math.sqrt(r()) * .9; d.position.set(lx + Math.cos(a) * rr * 10, ly + .8 - rr * rr * 1.4, -18 + Math.sin(a) * rr * 4); d.rotation.y = r() * 6; d.scale.set(2.4, 1.6 + r() * 2.4, 2.4); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
          col.setHSL(.38 + (r() - .5) * .18, .35, .55 + r() * .3); im.setColorAt(i, col); }
        scene.add(im); live.push(im); sway.push(bm);
        for (let i = 0; i < 5; i++) { const f = add(C.glowfish(), lx + 1 + i * 1.6, ly + 2.4 + (i % 2) * .8, -16 + i * .5, 1.3, -.5); f.userData.swim = { bob: true }; }
        const pl = new T.PointLight(0xffd25a, 3.2, 18, 2); pl.position.set(lx + 4, ly + 3.5, -15); scene.add(pl); live.push(pl);
      }
      // the twilight and midnight: lanternfish, jellyfish, squid, the siphonophore, anglerfish
      if (inRange(500)) for (let i = 0; i < Math.round(30 * q); i++) { const f = add(C.lantern(), (r() - .5) * 40, yOf(420 + r() * 300), -4 - r() * 22, 1.6, r() < .5 ? 0 : Math.PI); f.userData.swim = { vx: f.rotation.y ? -.8 : .8, range: 40 }; }
      for (let i = 0; i < Math.round(9 * q); i++) { const m = 280 + r() * 1400; if (!inRange(m)) continue; add(C.jelly('#cfeeff', m > 600 ? '#63f2d6' : null), (r() - .5) * 30, yOf(m), -4 - r() * 18, 1.2 + r() * .9, r() * 6); }
      for (let i = 0; i < 2; i++) { const m = 500 + r() * 700; const g = big('squid', m, (r() - .5) * 30, -12 - r() * 10, 1.6, 0, { vx: i ? .6 : -.6, range: 34 }); if (g && i) g.rotation.y = Math.PI; }
      big('siphon', 1500, -9, -8, 1.1, 0, { bob: true });
      big('angler', 2300, 7, -4, 1.6, -.6, { bob: true }); big('angler', 3300, -8, -5, 1.5, .5, { bob: true });
      if (inRange(2300)) { const l = new T.PointLight(0x3fa7c4, 1.2, 40, 2); l.position.set(0, yOf(2300) + 12, -10); scene.add(l); live.push(l); }
      // the deep cave: hexagonal basalt and glowing jellies
      if (inRange(3600)) { const bg = B.basalt(), bm = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 10 }), N = 90, im = new T.InstancedMesh(bg, bm, N), d = new T.Object3D(), y = yOf(3650);
        for (let i = 0; i < N; i++) { const s = r() < .5 ? -1 : 1, z = -14 - r() * 40, h = 4 + r() * 22; d.position.set(s * halfW(z) * (.62 + r() * .35), y - 8 + h / 2, z); d.rotation.y = r(); d.scale.set(1.2 + r() * 1.4, h, 1.2 + r() * 1.4); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
        scene.add(im); live.push(im); for (let i = 0; i < 7; i++) add(C.jelly('#bff6f6', '#63f2d6'), (r() - .5) * 30, y + 2 + r() * 12, -8 - r() * 16, .9 + r() * .6, 0);
        const cl = new T.PointLight(0x7fe8ff, 2.2, 60, 1.6); cl.position.set(0, y + 22, -20); scene.add(cl); live.push(cl); }
      // the abyssal floor
      if (b > .95) {
        const fy = yOf(4000) - 9, pg = new T.PlaneGeometry(260, 160, 60, 30).toNonIndexed(), p = pg.attributes.position, col = [];
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * .45 + y * .2) * .3 + (fbm(x * .04, y * .04, 3) - .5) * 4 + Math.max(0, -y - 40) * .12); }
        pg.computeVertexNormals(); for (let i = 0; i < p.count; i += 3) { const c = mix(hex('#3d5562'), hex('#8fa9b0'), hash(i, 3, 3) * .25 + .35); col.push(...c, ...c, ...c); }
        pg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); const floor = new T.Mesh(pg, new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4 }));
        floor.rotation.x = -Math.PI / 2; floor.position.set(0, fy, -60); scene.add(floor); live.push(floor);
        add(C.tripod(), -7, fy, -18, 1.6, .5); add(C.tripod(), 8, fy, -26, 1.5, 2.6); add(C.seapig(), -1, fy, -16, 1.8, .8); add(C.seapig(), 3, fy, -19, 1.4, 1.4); add(C.sponge(), 14, fy, -18, 1.5, 0); add(C.sponge(), -16, fy, -26, 2, 0);
        const cr = r; for (let i = 0; i < 10; i++) { const rk = new T.Mesh(B.rock(40 + i), rockMat); rk.position.set((cr() - .5) * 80, fy + .5, -10 - cr() * 50); rk.scale.setScalar(1 + cr() * 3); scene.add(rk); live.push(rk); }
        const lt = new T.PointLight(0x7fe8ff, 1.7, 60, 1.6); lt.position.set(0, fy + 16, -16); scene.add(lt); live.push(lt);
      }
      // marine snow around the camera
      const SN = Math.round(900 * q), sp = new Float32Array(SN * 3); for (let i = 0; i < SN; i++) { sp[i * 3] = (r() - .5) * 90; sp[i * 3 + 1] = (r() - .5) * 60; sp[i * 3 + 2] = -r() * 80 + 10; }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
      const snow = new T.Points(sg, new T.PointsMaterial({ size: .22, map: glow(), color: 0xdff6f2, transparent: true, opacity: .55, depthWrite: false })); snow.frustumCulled = false; scene.add(snow); live.push(snow);
      built = { a, b, aspect, snow, sp, rockMat };
    }
    function sendWhales() {
      const cy = camera.position.y;
      for (let i = 0; i < 3; i++) { const w = C.whale(); w.position.set(-70 - i * 18, cy - 4 + i * 5, -30 - i * 9); w.rotation.set(0, -.15, .22); w.scale.setScalar(1 + i * .1); scene.add(w); live.push(w); whales.push({ w, born: lastT, v: .32 - i * .02 }); }
    }
    const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 0, 1), 12), hit = new T.Vector3(), ndc = new T.Vector2();
    function frame(t, cam) {
      const dt = lastT ? Math.min(.1, t - lastT) : .016; lastT = t;
      if (cam.w !== W || cam.h !== H) { W = cam.w; H = cam.h; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
      const [a, b] = cam.range, aspect = W / H;
      if (!built || Math.abs(built.a - a) > .001 || Math.abs(built.b - b) > .001 || Math.abs(built.aspect - aspect) > .08) build(a, b, aspect);
      const m = metres(cam.depth), cy = yOf(m), dark = sstep(250, 1800, m), lit = Math.pow(1 - cam.depth, 1.5);
      camera.position.set(cam.pointer ? (cam.pointer[0] / W - .5) * 2 : 0, cy + (cam.pointer ? -(cam.pointer[1] / H - .5) * 1.2 : 0), 30); camera.lookAt(camera.position.x * .5, cy - 2, 0);
      const fog = cam.fog || [.16, .5, .58]; scene.fog.color.setRGB(fog[0], fog[1], fog[2]); scene.fog.density = .017 - dark * .005;
      const top = cam.top || [.75, .95, .93]; hemi.color.setRGB(top[0], top[1], top[2]); hemi.intensity = .3 + .7 * lit; sun.intensity = 1.1 * lit; amb.color.setRGB(.1 + dark * .05, .22 + dark * .12, .3 + dark * .2); amb.intensity = .35 + dark * .55;
      // pointer in the water, for the schools to part around
      let avoid = null; if (cam.pointer) { ndc.set(cam.pointer[0] / W * 2 - 1, -(cam.pointer[1] / H) * 2 + 1); ray.setFromCamera(ndc, camera); if (ray.ray.intersectPlane(plane, hit)) avoid = hit; }
      schools.forEach(s => { if (Math.abs(s.center[1] - cy) < 70) { plane.constant = -s.center[2]; if (cam.pointer && ray.ray.intersectPlane(plane, hit)) avoid = hit; s.update(t, dt, avoid); } });
      sway.forEach(mm => mm.userData.u.uTime.value = t);
      live.forEach(o => { if (Math.abs(o.position.y - cy) > 90 && !o.isInstancedMesh && !o.isPoints) { o.visible = false; return; } o.visible = true;
        if (o.userData.update) o.userData.update(t, dt);
        o.traverse && o.children.length && o.children.forEach(c => { if (c.material && c.material.userData && c.material.userData.u) c.material.userData.u.uTime.value = t; });
        const sw = o.userData.swim; if (sw) { if (sw.vx) { o.position.x += sw.vx * dt; if (Math.abs(o.position.x) > sw.range) { sw.vx *= -1; o.rotation.y += Math.PI; } } if (sw.bob) o.position.y += Math.sin(t * .8 + o.id) * .004; }
        if (o.userData.shaft) { o.material.opacity = (.12 + .06 * Math.sin(t * .3 + o.id)) * lit; o.position.x += Math.sin(t * .05 + o.id) * .01; } });
      whales.forEach(wh => { wh.w.position.x += wh.v * 60 * dt * .1; wh.w.position.y += .015; wh.w.children[0].material.userData.u.uTime.value = t; });
      for (let i = whales.length - 1; i >= 0; i--) if (whales[i].w.position.x > 90) { scene.remove(whales[i].w); live.splice(live.indexOf(whales[i].w), 1); whales.splice(i, 1); }
      // marine snow follows the camera, drifting down
      if (built) { const sp = built.sp; for (let i = 0; i < sp.length; i += 3) { sp[i + 1] -= .01; const rel = sp[i + 1] - (cy - 30); if (rel < 0) sp[i + 1] += 60; else if (rel > 60) sp[i + 1] -= 60; }
        built.snow.geometry.attributes.position.needsUpdate = true; built.snow.material.color.setRGB(.86 - dark * .2, .97, .95); }
      if (cam.whales) sendWhales();
      renderer.render(scene, camera);
    }
    return { frame, whales: sendWhales, renderer, dispose() { clear(); renderer.dispose(); } };
  }

  /* ---------- specimens: one creature per tile, all drawn by one renderer ---------- */
  function specimens(opts = {}) {
    T = T || window.THREE;
    const cv = document.createElement('canvas'), renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0, 0); const dpr = Math.min(2, window.devicePixelRatio || 1); renderer.setPixelRatio(1);
    const list = [];
    const FRAME = { school: [0, 0, 16], turtle: [.4, .2, 6.5], manta: [0, .6, 9], whale: [0, 0, 26], lantern: [0, 0, 3.6], jelly: [0, -1.4, 9], squid: [-1, 0, 7], siphon: [0, -5, 17], angler: [.4, .4, 7], tripod: [.4, 1.2, 8], seapig: [0, .5, 4.6], sponge: [0, 1.6, 7.5], kelp: [0, 15, 34], rock: [0, 0, 5], basalt: [0, 3, 14], glowfish: [0, 0, 3.6] };
    function add(type, canvas, o = {}) {
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(36, 1, .1, 200), top = o.top || [.75, .95, .93], deep = o.deep || 0;
      scene.add(new T.HemisphereLight(new T.Color(...top), 0x0a1c26, .75 + (1 - deep) * .35)); const sun = new T.DirectionalLight(0xffffff, 1.1 * (1 - deep * .45)); sun.position.set(.4, 1, .6); scene.add(sun); scene.add(new T.AmbientLight(0x274250, .4 + deep * .3));
      let obj, sch = null;
      if (type === 'school') { sch = School({ n: 60, c: [0, 0, 0], r: [10, 5, 6], back: '#2c5f78', belly: '#eef6f6', seed: 2, size: 1.6 }); obj = sch.mesh; }
      else if (type === 'kelp') { obj = new T.Group(); const km = swayMat({ sway: .02 }), im = new T.InstancedMesh(B.kelp(), km, 7), d = new T.Object3D(), col = new T.Color(), r = rng(4); for (let i = 0; i < 7; i++) { d.position.set((i - 3) * 2.6, 0, (r() - .5) * 6); d.rotation.y = r() * 6; d.scale.set(26, 24 + r() * 12, 26); d.updateMatrix(); im.setMatrixAt(i, d.matrix); col.setHSL(.24 + (r() - .5) * .1, .5, .5 + r() * .2); im.setColorAt(i, col); } obj.add(im); obj.userData.mat = km; }
      else if (type === 'rock') { obj = new T.Mesh(B.rock(7, .8), new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6 })); obj.scale.set(1.8, 1.4, 1.6); }
      else if (type === 'basalt') { obj = new T.Group(); const bm = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true }), r = rng(9); for (let i = 0; i < 9; i++) { const c = new T.Mesh(B.basalt(), bm), h = 2 + r() * 8; c.position.set((i % 3 - 1) * 2.1 + (r() - .5) * .4, h / 2 - 3, (Math.floor(i / 3) - 1) * 2); c.scale.set(1, h, 1); obj.add(c); } }
      else obj = C[type]();
      if (type === 'whale') obj.rotation.set(.1, .5, .12); else if (type === 'turtle') obj.rotation.set(.1, -.35, 0); else if (type === 'manta') { obj.rotation.order = 'ZYX'; obj.rotation.set(1.0, .25, Math.PI / 2 + .12); } else if (/lantern|glowfish|angler|tripod|seapig|squid/.test(type)) obj.rotation.y = -.45;
      scene.add(obj);
      for (let i = 0; i < 40; i++) obj.traverse(o => o.userData.update && o.userData.update(i * .05, .05));
      obj.updateMatrixWorld(true);
      const box = type === 'school' ? new T.Box3(new T.Vector3(-6, -3, -3), new T.Vector3(6, 3, 3)) : type === 'kelp' ? new T.Box3(new T.Vector3(-9, 0, -3), new T.Vector3(9, 32, 3)) : new T.Box3().setFromObject(obj);
      const size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3()), fit = o.fit || 1.08;
      const fitFor = aspect => { const dist = Math.max(size.y, size.x / aspect, .5) / (2 * Math.tan(18 * Math.PI / 180)) * fit + size.z / 2; cam.position.set(ctr.x, ctr.y + dist * .08, ctr.z + dist); cam.lookAt(ctr); cam.far = dist * 4; };
      fitFor(1.4);
      list.push({ type, canvas, ctx: canvas.getContext('2d'), scene, cam, obj, sch, vis: true, fitFor, aspect: 0 });
    }
    function frame(t) {
      for (const s of list) {
        if (!s.vis) continue; const w = s.canvas.clientWidth, h = s.canvas.clientHeight; if (!w || !h) continue;
        const pw = Math.round(w * dpr), ph = Math.round(h * dpr); if (cv.width !== pw || cv.height !== ph) renderer.setSize(pw, ph, false);
        if (s.canvas.width !== pw || s.canvas.height !== ph) { s.canvas.width = pw; s.canvas.height = ph; }
        if (Math.abs(s.aspect - w / h) > .01) { s.aspect = w / h; s.fitFor(s.aspect); } s.cam.aspect = w / h; s.cam.updateProjectionMatrix();
        if (s.sch) s.sch.update(t, .016, null); s.obj.traverse(o => { if (o.material && o.material.userData && o.material.userData.u) o.material.userData.u.uTime.value = t; if (o.userData.update) o.userData.update(t, .016); });
        if (s.obj.userData.mat) s.obj.userData.mat.userData.u.uTime.value = t;
        if (!/school|kelp|rock|basalt|sponge/.test(s.type)) s.obj.position.x = Math.sin(t * .3) * .1;
        renderer.render(s.scene, s.cam); s.ctx.clearRect(0, 0, pw, ph); s.ctx.drawImage(cv, 0, 0);
      }
    }
    return { add, frame, list, dispose() { renderer.dispose(); } };
  }

  window.Sea3D = { load, create, specimens, metres, frac };
})();
