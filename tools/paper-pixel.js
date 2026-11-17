/* Paper Pixel - pixel sprites cut from card and folded into 3D.

   An asset is plain JSON: a palette and a list of pieces. Each piece is a
   pixel grid (rows of characters, '.' for empty, '1'..'9' then 'a'..'z' for
   palette colours) that becomes a sheet of card - or, extruded, a block -
   placed and folded around the plant's stem:

     { "v": 1, "name": "Tulip", "kind": "plant", "tilt": 24,
       "palette": ["#f25a52", "#4f9a3f"],
       "pieces": [ { "name": "petal", "rows": ["1.1", "111"], "ax": 1, "ay": 0,
                     "x": 0, "y": 20, "z": 0, "rx": 0, "ry": 0, "rz": 0,
                     "repeat": 3, "step": 60, "depth": 0.55, "extrude": 1,
                     "shell": false, "open": false, "grow": "fold", "delay": 0.5,
                     "flex": 0.3, "role": "petal" } ] }

   ax/ay is the pivot cell (from the left, from the bottom). repeat copies the
   piece around the vertical axis, step degrees apart. grow is how it arrives:
   stem (rises), fold (opens from flat), scale (pops), none. flex is how much
   it sways. role: petal (opens wider on a bloom), seed (blows away), flap
   (folds between "open" rx and "closed" rxc).

   One WebGL renderer draws every model into ordinary 2D canvases, so a page
   can show many small pieces with a single GL context. Needs THREE r128+. */
(function (G) {
  'use strict';
  const CH = '123456789abcdefghijklmnopqrstuvwxyz';
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeBack = t => { const c = 1.6; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  const DEF = { ax: null, ay: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rxc: 0, order: 'XYZ', repeat: 1, step: 60, depth: 0.55, extrude: 1, shell: false, open: false, grow: 'scale', delay: 0, dur: 0.6, flex: 0, role: '' };
  const piece = p => Object.assign({}, DEF, p);
  /* cells of a piece, relative to its pivot: [x, y, colourIndex] */
  function cells(p) {
    const rows = p.rows || [], H = rows.length, W = Math.max(0, ...rows.map(r => r.length));
    const ax = p.ax == null ? Math.floor(W / 2) : p.ax, ay = p.ay || 0, out = [];
    rows.forEach((r, ri) => { for (let x = 0; x < r.length; x++) { const k = CH.indexOf(r[x]); if (k >= 0) out.push([x - ax, H - 1 - ri - ay, k]); } });
    return out;
  }
  function size(p) { const rows = p.rows || []; return { w: Math.max(0, ...rows.map(r => r.length)), h: rows.length }; }

  function create(T3, opt = {}) {
    if (!T3) throw new Error('Paper Pixel needs THREE');
    const R = new T3.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: !!opt.preserve });
    R.setPixelRatio(1); R.setClearColor(0x000000, 0);
    const SCENE = new T3.Scene();
    const CAM = new T3.OrthographicCamera(-1, 1, 1, -1, -500, 500); CAM.position.z = 250;
    const BOX = new T3.BoxGeometry(1, 1, 1);
    const MAT = new T3.ShaderMaterial({
      uniforms: { uL: { value: new T3.Vector3(-0.45, 0.72, 0.55).normalize() }, uLight: { value: 1 } },
      vertexShader: `
        varying vec3 vC; varying vec3 vN; varying vec2 vP;
        void main(){
          vec4 lp = instanceMatrix * vec4(position, 1.0);
          vP = lp.xy + lp.z * 0.37;
          #ifdef USE_INSTANCING_COLOR
            vC = instanceColor;
          #else
            vC = vec3(1.0);
          #endif
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * lp;
        }`,
      fragmentShader: `
        varying vec3 vC; varying vec3 vN; varying vec2 vP;
        uniform vec3 uL; uniform float uLight;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1.0,0.0)), f.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), f.x), f.y); }
        void main(){
          vec3 N = normalize(vN);
          float lam = max(dot(N, uL), 0.0);
          float face = smoothstep(0.35, 0.75, abs(N.z));
          vec3 c = vC * mix(1.0, 0.8 + 0.34 * lam, uLight);
          float w = n(vP * 0.23) * 0.6 + n(vP * 0.61 + 7.0) * 0.4;
          c *= 0.9 + 0.2 * w;
          c *= 0.955 + 0.08 * h(floor(gl_FragCoord.xy * 0.5));
          c = mix(c * 0.8, c, face);
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    let BW = 0, BH = 0;

    function meshOf(p, palette) {
      const cs = cells(p), ext = Math.max(1, p.extrude | 0), list = [];
      const set = new Set(cs.map(c => c[0] + ',' + c[1]));
      let minY = Infinity, maxY = -Infinity; cs.forEach(c => { minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
      for (const [x, y, k] of cs) {
        const edge = !set.has((x - 1) + ',' + y) || !set.has((x + 1) + ',' + y) || !set.has(x + ',' + (y + 1)) || !set.has(x + ',' + (y - 1));
        if (ext === 1) { list.push([x, y, 0, p.depth, k, edge ? 0.88 : 1]); continue; }
        for (let l = 0; l < ext; l++) {
          const z = l - (ext - 1) / 2, side = l === 0 || l === ext - 1;
          const top = y === maxY, bottom = y === minY;
          const lr = !set.has((x - 1) + ',' + y) || !set.has((x + 1) + ',' + y);
          if (p.shell && !side && !edge) continue;                  // hollow inside
          if (p.open && top && !side && !lr) continue;              // no lid
          let shade = 1;
          if (p.shell && p.open && (l === 0 || (bottom && !side && !lr))) shade = 0.72; // the far wall and the floor sit in shadow
          list.push([x, y, z, 1, k, shade]);
        }
      }
      const m = new T3.InstancedMesh(BOX, MAT, Math.max(1, list.length));
      const M = new T3.Matrix4(), col = new T3.Color();
      list.forEach(([x, y, z, d, k, shade], i) => {
        M.makeScale(1, 1, d); M.setPosition(x, y + 0.5, z);
        m.setMatrixAt(i, M);
        col.set(palette[k] || '#ff00ff');
        const j = shade * (0.93 + 0.11 * hash2(x * 7 + i, y * 13 + Math.round(z * 3)));
        col.r *= j; col.g *= j; col.b *= j;
        m.setColorAt(i, col);
      });
      if (!list.length) m.count = 0;
      m.frustumCulled = false;
      return m;
    }

    /* a model is the asset built once; pose and draw it as often as you like */
    function model(asset) {
      const outer = new T3.Object3D(), inner = new T3.Object3D(); outer.add(inner);
      const pal = asset.palette || [], parts = [];
      let Rr = 1, Hh = 1, low = 0;
      (asset.pieces || []).forEach((raw, pi) => {
        const p = piece(raw), n = Math.max(1, p.repeat | 0);
        const cs = cells(p);
        let r0 = 0, h0 = 0, l0 = 0;
        cs.forEach(([x, y]) => { r0 = Math.max(r0, Math.abs(x) + 1); h0 = Math.max(h0, y + 1); l0 = Math.min(l0, y); });
        r0 = Math.max(r0, (p.extrude | 0) / 2 + 1);
        Rr = Math.max(Rr, r0 + Math.hypot(p.x, p.z)); Hh = Math.max(Hh, h0 + p.y); low = Math.min(low, l0 + p.y);
        for (let i = 0; i < n; i++) {
          const pivot = new T3.Object3D(); pivot.rotation.order = p.order || 'XYZ';
          pivot.add(meshOf(p, pal));
          pivot.position.set(p.x, p.y, p.z);
          inner.add(pivot);
          parts.push({ pivot, p, i, pi, seed: hash2(pi * 31 + i, 7) });
        }
      });
      return { asset, outer, inner, parts, R: Rr, H: Hh, low, tilt: (asset.tilt == null ? 24 : asset.tilt) * D2R };
    }

    /* st: prog 0..1 (arrival), t seconds, yaw, lean, sway (0..1), rustle,
       bloom 0..1, blow 0..(seeds fly), flap 0..1 (1 = open), shake */
    function pose(m, st = {}) {
      const g = st.prog == null ? 1 : st.prog, t = st.t || 0, still = !!st.still;
      m.outer.rotation.x = st.tilt == null ? m.tilt : st.tilt * D2R;
      m.inner.rotation.y = (st.yaw || 0) * D2R;
      m.inner.rotation.z = (st.lean || 0) + (st.shake ? Math.sin(t * 46) * 0.06 * st.shake : 0);
      m.inner.position.x = st.shake ? Math.sin(t * 61) * 0.4 * st.shake : 0;
      const a = st.rustle || 0, sway = st.sway == null ? 1 : st.sway;
      m.parts.forEach((o, i) => {
        const p = o.p;
        const k = still ? 1 : clamp((g * 1.6 - p.delay) / (p.dur || 0.6), 0, 1);
        const e = easeBack(k), lin = easeOut(k);
        const flap = a * p.flex * 1.4 + (still ? 0 : Math.sin(t * 1.3 + i * 1.7 + o.seed * 9) * 0.04 * p.flex * sway);
        const ry0 = (p.ry + o.i * p.step) * D2R;
        let ry = ry0, rx = p.rx * D2R, sx = 1, sy = 1;
        if (p.grow === 'stem') sy = lin;
        else if (p.grow === 'fold') { ry = lerp(0, ry0, e); sx = sy = lerp(0.2, 1, lin); }
        else if (p.grow === 'scale') sx = sy = e;
        if (p.role === 'petal') { if (ry0) ry += Math.sign(Math.sin(ry0) || 1) * 0.25 * (st.bloom || 0); rx -= 0.2 * (st.bloom || 0); }
        if (p.role === 'flap') rx = lerp(p.rxc * D2R, p.rx * D2R, st.flap == null ? 1 : st.flap) + (st.shake ? Math.sin(t * 38 + i) * 0.25 * st.shake : 0);
        o.pivot.rotation.set(rx, ry + flap, p.rz * D2R + flap * 0.4);
        o.pivot.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sx));
        if (p.role === 'seed') {
          const d = Math.max(0, (st.blow || 0) - o.seed * 0.4);
          o.pivot.position.set(p.x + d * 70, p.y + d * 40 + Math.sin(d * 9 + i) * d * 6, p.z);
          o.pivot.visible = d < 1;
        }
      });
    }

    /* how big a canvas a model needs, in cells */
    function bounds(m, pad = 4) { return { w: (m.R + pad) * 2, h: m.H - Math.min(0, m.low) + pad * 2.5, base: pad + Math.max(0, -m.low) }; }

    /* draw into a 2D context: w x h device pixels at u pixels per cell, the
       model's base `base` cells above the bottom, placed at (x, y) and scaled
       to dw x dh in the context's own units */
    function draw(m, ctx, st = {}) {
      const W = Math.round(st.w || ctx.canvas.width), H = Math.round(st.h || ctx.canvas.height);
      if (W < 1 || H < 1) return;
      if (W > BW || H > BH) { BW = Math.max(BW, W); BH = Math.max(BH, H); R.setSize(BW, BH, false); }
      const u = st.u || 4, hw = W / 2 / u, hh = H / 2 / u;
      CAM.left = -hw; CAM.right = hw; CAM.top = hh; CAM.bottom = -hh; CAM.updateProjectionMatrix();
      while (SCENE.children.length) SCENE.remove(SCENE.children[0]);
      SCENE.add(m.outer);
      m.outer.position.set((st.ox || 0), -hh + (st.base == null ? 4 : st.base), 0);
      MAT.uniforms.uLight.value = st.flat ? 0 : 1;
      pose(m, st);
      R.setViewport(0, 0, W, H); R.setScissor(0, 0, W, H); R.setScissorTest(true);
      R.clear();
      R.render(SCENE, CAM);
      const dw = st.dw || W, dh = st.dh || H;
      if (st.clear !== false) ctx.clearRect(st.x || 0, st.y || 0, dw, dh);
      ctx.drawImage(R.domElement, 0, BH - H, W, H, st.x || 0, st.y || 0, dw, dh);
    }
    function dispose(m) { m.outer.traverse(o => { if (o.isInstancedMesh) o.dispose && o.dispose(); }); }
    return { model, pose, draw, bounds, dispose, renderer: R, lost: () => R.getContext().isContextLost() };
  }

  /* ---- editing helpers for benches ---- */
  const blankPiece = (w = 8, h = 8, name = 'piece') => piece({ name, rows: Array.from({ length: h }, () => '.'.repeat(w)), ax: Math.floor(w / 2), ay: 0 });
  function resize(p, w, h) {
    const old = p.rows || [], H0 = old.length;
    // keep the bottom rows: plants grow up from their base
    const rows = [];
    for (let r = 0; r < h; r++) { const src = old[H0 - h + r] || ''; rows.push((src + '.'.repeat(w)).slice(0, w)); }
    return Object.assign({}, p, { rows });
  }
  function setCell(p, x, y, ch) {
    const rows = p.rows.slice(); const r = rows[y]; if (r == null || x < 0 || x >= r.length) return p;
    rows[y] = r.slice(0, x) + ch + r.slice(x + 1); return Object.assign({}, p, { rows });
  }
  function fill(p, x, y, ch) {
    const rows = p.rows.map(r => [...r]), H = rows.length, from = rows[y] && rows[y][x];
    if (from == null || from === ch) return p;
    const st = [[x, y]];
    while (st.length) { const [cx, cy] = st.pop(); if (cy < 0 || cy >= H || cx < 0 || cx >= rows[cy].length || rows[cy][cx] !== from) continue; rows[cy][cx] = ch; st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]); }
    return Object.assign({}, p, { rows: rows.map(r => r.join('')) });
  }
  /* the smallest JSON for an asset: defaults left out */
  function tidy(asset) {
    const pieces = (asset.pieces || []).map(p => { const o = {}; for (const k in p) if (k === 'rows' || k === 'name' || JSON.stringify(p[k]) !== JSON.stringify(DEF[k])) o[k] = p[k]; return o; });
    return Object.assign({ v: 1 }, asset, { pieces });
  }

  G.PaperPixel = { create, cells, size, piece, blankPiece, resize, setCell, fill, tidy, CH, DEF, hash2 };
})(typeof window !== 'undefined' ? window : globalThis);
