/* AuroraSky - a night in Lapland, in one WebGL fragment shader.
   The sky, the aurora, the fells, the spruce and the lake are all drawn by one
   full-screen pass at reduced resolution, so it needs no library and stays
   light enough for phones.
   - The aurora is coloured by height, as the physics says: a sharp lower edge,
     oxygen green above it fading upward, faint oxygen red at the crown, and on
     strong nights a pink-violet nitrogen fringe below the edge. Curtains are
     continuous gradients along their length, folding where they turn, with
     soft rays that travel along them. Seen as a camera sees them: vivid.
   - A night has phases: blue hour, a quiet arc, growth, the breakup, a corona
     overhead, pulsating patches, dawn. `phase` (0..1) runs through them.
   - The land: two ridges of fells with snow and rock gullies that follow the
     slopes, lit by the aurora above; two rows of spruce, each tree its own
     height, lean, tiers and shape, some heavy with snow; a lake, partly
     frozen and snow-covered, reflecting the sky where the ice is clear.

   const s = AuroraSky.create(canvas, { scale: .5 })
   s.frame(P, t)        P: { phase, kp, day, seed, ptr: [x, y, s], burst: [x, y, t0], land, lake, horizon, lakeY, curtains, rays }
   AuroraSky.shape(phase, kp) -> the phase's activity, amplitude, speed, rays, corona, pulse, dawn
   AuroraSky.clock(phase) -> '22:40';  AuroraSky.name(phase) -> 'Breakup'
   AuroraSky.glow(P) -> [r, g, b, k]  the light the aurora casts now (for glass)    */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ss = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const bump = (a, b, x) => ss(a, a + (b - a) * .3, x) * (1 - ss(a + (b - a) * .7, b, x));
  const DEFAULTS = { phase: .3, kp: 4.5, day: 0, seed: 3, ptr: [-1, -1, 0], burst: [0, 0, -99], land: 1, lake: 1, horizon: .3, lakeY: .13, curtains: 0, rays: -1 };
  const PHASES = [[0, 'Blue hour'], [.14, 'Quiet arc'], [.36, 'Growth'], [.47, 'Breakup'], [.58, 'Corona'], [.72, 'Pulsating'], [.9, 'Dawn']];
  const name = ph => { let n = PHASES[0][1]; for (const [a, b] of PHASES) if (ph >= a) n = b; return n; };
  const clock = ph => { const m = Math.round((15.5 + ph * 15.5) * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function shape(ph, kp) {
    const k = clamp(kp / 9), blue = 1 - ss(.04, .15, ph), dawn = ss(.88, .99, ph), brk = bump(.45, .6, ph), cor = bump(.56, .74, ph), pulse = ss(.72, .8, ph) * (1 - dawn);
    return {
      act: (.45 + .6 * k) * (.12 + .88 * (1 - blue)) * (1 - .85 * dawn) * (1 + .9 * brk) * (1 - .55 * pulse),
      amp: .45 + 1.3 * brk + .45 * k, speed: .5 + 2.4 * brk + .6 * cor, rays: .3 + .6 * brk + .5 * cor + .3 * k,
      base: .5 + .16 * cor - .05 * brk, red: .25 + .9 * k + .4 * brk, fringe: clamp((k - .4) * 2) * (.5 + brk),
      curt: Math.max(1, Math.min(3, 1 + Math.round(2 * (k * .7 + brk)))), cor, pulse, dawn, blue, brk, k,
    };
  }
  const G = [.22, 1, .55], RD = [1, .24, .36], VI = [.62, .38, 1];
  function glow(P) { const s = shape(P.phase, P.kp), a = clamp(s.act * (1 - .5 * (P.day || 0)));
    return [G[0] * (1 - .2 * s.fringe) + RD[0] * .15 * s.red, G[1] * (1 - .25 * s.fringe), G[2] + VI[2] * .2 * s.fringe, a]; }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `precision highp float;
  uniform vec2 uRes; uniform float uT, uSeed, uDay, uLand, uLake, uHor, uLakeY, uCurt, uRays, uAspect;
  uniform vec4 uA;   // act, amp, speed, base
  uniform vec4 uB;   // red, fringe, corona, pulse
  uniform vec3 uPtr, uBurst;
  /* hashes without sin(): sin() of large numbers loses precision on many GPUs and shows up as blocks */
  float h1(float n){ n = fract((n + uSeed * 7.13) * .1031); n *= n + 33.33; n *= n + n; return fract(n); }
  float h2(vec2 p){ vec3 q = fract(vec3(p.xyx + uSeed * 3.1) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(h1(i), h1(i + 1.), f); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
  float f1(float x){ return n1(x) * .55 + n1(x * 2.13 + 7.) * .28 + n1(x * 4.37 + 3.) * .17; }
  float f2(vec2 p){ float a = .5, s = 0.; p = mat2(.8, .6, -.6, .8) * p; for (int i = 0; i < 4; i++){ s += a * n2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.; a *= .5; } return s; }
  float rid(float x){ return 1. - abs(n1(x) * 2. - 1.); }
  const vec3 GR = vec3(.22, 1., .55), RD = vec3(1., .24, .36), VI = vec3(.62, .38, 1.), PK = vec3(1., .42, .78);

  /* the aurora: curtains along the sky, coloured by height */
  vec3 aurora(vec2 p){
    float t = uT * uA.z, act = uA.x;
    vec3 col = vec3(0.);
    float bt = uT - uBurst.z, burst = bt > 0. && bt < 16. ? 1. : 0.;
    for (int i = 0; i < 3; i++){
      float fi = float(i); if (fi >= uCurt) break;
      float x = p.x * (.85 + fi * .3) + fi * 3.7 + uSeed;
      float w = f1(x * .6 + t * .025), w2 = f1(x * .6 + .015 + t * .025);
      float yb = uA.w + fi * .075 - fi * fi * .012 + (w - .5) * .24 * uA.y + sin(x * 1.3 + t * .1 + fi) * .035 * uA.y;
      if (uPtr.z > 0.){ float d = (p.x - uPtr.x * uAspect) * 2.4; yb += exp(-d * d) * (uPtr.y - yb) * .16 * uPtr.z; }
      float fold = 1. + 1.1 * smoothstep(.4, 2.2, abs(w2 - w) / .015 * uA.y);
      float H = .26 + .07 * fi + .05 * uA.y;
      float h = (p.y - yb) / H;
      float I = smoothstep(.12, .72, f1(x * .9 - t * .018 + 11. + fi * 4.));
      float r = f1(x * 13. + t * .32 + fi * 5.) * .6 + f1(x * 31. - t * .5 + fi) * .4;
      I *= mix(1., .45 + 1.1 * r, clamp(uRays, 0., 1.)) * fold * act * (1. - fi * .22);
      if (uPtr.z > 0.){ float d = (p.x - uPtr.x * uAspect) * 3.; I *= 1. + .55 * exp(-d * d) * uPtr.z; }
      if (burst > 0.){ float front = bt * .55, d = abs(p.x - uBurst.x * uAspect) - front; I *= 1. + (2.6 * exp(-d * d / .03) + .8) * exp(-bt * .28); }
      float edge = smoothstep(-.018, .014, h);
      float green = edge * exp(-max(h, 0.) * 3.) * (1. + .6 * exp(-max(h, 0.) * 22.));
      float red = smoothstep(.3, .8, h) * exp(-max(h - .7, 0.) * 3.) * .2 * uB.x;
      float fr = exp(-pow((h + .012) / .022, 2.)) * uB.y;
      col += I * (green * GR + red * RD + fr * mix(VI, PK, .55));
      col += GR * I * .03 * exp(-abs(h - .1) * 3.) * step(-.35, h);          // the glow the curtain lays on the sky round it
    }
    /* the corona: rays that seem to burst from one point overhead */
    if (uB.z > .01){ vec2 z = vec2(.5 * uAspect, 1.25), d = p - z; float a = atan(d.x, -d.y), L = length(d);
      float r = f1(a * 16. + t * .08) * .6 + f1(a * 41. - t * .15) * .4;
      float c = smoothstep(1.15, .35, L) * smoothstep(.05, .45, L) * (.35 + 1.1 * r) * uB.z * act;
      col += c * (GR * smoothstep(.95, .55, L) + RD * .5 * smoothstep(.45, .8, L) * uB.x + VI * .3 * uB.y); }
    /* pulsating patches: soft, switching on and off on their own clocks */
    if (uB.w > .01){ vec2 q = p * vec2(3.2, 5.); vec2 c = floor(q);
      float per = 3. + 7. * h2(c + 3.), ph = h2(c + 9.) * 6.28, on = smoothstep(.2, .9, .5 + .5 * sin(uT * 6.28 / per + ph));
      float m = smoothstep(.5, .72, f2(p * vec2(4., 6.) + vec2(uT * .01, 0.))) * smoothstep(.35, .55, p.y);
      col += GR * vec3(.85, 1., .9) * m * on * uB.w * .55 * (.4 + uA.x); }
    return col * .7;
  }
  vec3 sky(vec2 p){
    float y = p.y;
    vec3 night = mix(vec3(.034, .06, .12), vec3(.006, .01, .03), smoothstep(.25, 1., y));
    vec3 blue = mix(mix(vec3(.86, .6, .66), vec3(.56, .64, .82), smoothstep(.28, .42, y)), vec3(.11, .19, .4), smoothstep(.4, 1., y));
    vec3 c = mix(night, blue, uDay);
    /* stars: a few bright, many faint, each twinkling at its own rate */
    vec2 g = floor(gl_FragCoord.xy / 1.5); float s = h2(g);
    float tw = .55 + .45 * sin(uT * (1.5 + h2(g + 5.) * 3.) + s * 60.);
    float star = step(.9955, s) * tw * (.35 + 1.4 * pow(h2(g + 1.7), 6.));
    c += vec3(.92, .95, 1.) * star * (1. - uDay) * smoothstep(.32, .6, y);
    return c;
  }
  /* the fells: far and near ridges, snow and rock, lit from the sky */
  float ridgeFar(float x){ return uHor + .05 + f1(x * 1.2 + 4.) * .08 + pow(rid(x * 3.4), 2.2) * .13 + rid(x * 9.) * .018; }
  float ridgeNear(float x){ return uHor - .045 + f1(x * .9 + 9.) * .08 + pow(rid(x * 2.4 + 1.), 2.4) * .13 + rid(x * 6.3) * .02 + .09 * exp(-pow((x - .72 * uAspect) * 2.1, 2.)); }
  vec3 glowAt(float x){ return GR * uA.x * (.3 + .7 * smoothstep(.15, .7, f1(x * .9 * .85 + uSeed + 11. - uT * uA.z * .018))) + RD * .08 * uB.x * uA.x; }
  vec4 fell(vec2 p, float top, float far){
    if (p.y > top) return vec4(0.);
    float e = .014, sl = (far > .5 ? ridgeFar(p.x + e) - ridgeFar(p.x - e) : ridgeNear(p.x + e) - ridgeNear(p.x - e)) / (2. * e);
    float depth = top - p.y;
    vec3 n = normalize(vec3(-sl, 1., .6));
    float lit = .18 + .82 * clamp(dot(n, normalize(vec3(-.35, 1., .3))), 0., 1.);
    float gully = smoothstep(.44, .68, f2(vec2(p.x * 10., p.y * 30. + p.x * 6.) + far * 30.)) * smoothstep(.03, .35, abs(sl));
    float rock = max(gully, smoothstep(.62, .8, f2(p * vec2(12., 20.) + far * 9.)) * .6);
    vec3 snowN = vec3(.07, .095, .16), snowD = vec3(.58, .64, .8);
    vec3 snow = (mix(snowN, snowD, uDay) * lit + glowAt(p.x) * .09 * lit * smoothstep(.06, 0., depth) * (1. - uDay * .5)) * (.88 + .24 * f2(p * vec2(26., 40.)));
    snow *= 1. - .25 * smoothstep(0., .12, depth);                           // valleys sit in shade
    vec3 rk = mix(vec3(.022, .028, .045), vec3(.26, .29, .38), uDay);
    vec3 c = mix(snow, rk, rock);
    c += glowAt(p.x) * .32 * smoothstep(.014, 0., depth) * (1. - uDay * .6);   // snow on the ridge catches the aurora
    if (far > .5) c = mix(c, sky(vec2(p.x, uHor + .05)), .45);            // distance is haze
    return vec4(c, smoothstep(0., .0035, top - p.y));
  }
  /* spruce: two rows, every tree its own height, lean, tiers and build; some are heavy with snow */
  vec4 trees(vec2 p, float base, float cw, float hmin, float hmax, float row){
    vec4 o = vec4(0.);
    float ci = floor(p.x / cw);
    for (int k = -2; k <= 2; k++){
      float id = ci + float(k) + row * 97.;
      float r0 = h1(id), r1 = h1(id + .37), r2 = h1(id + .71), r3 = h1(id + .13);
      if (r0 < .16) continue;                                               // a gap in the trees
      float tx = (ci + float(k) + .15 + .7 * r1) * cw, th = mix(hmin, hmax, r2 * r2), lean = (r3 - .5) * .12;
      float yy = (p.y - base) / th; if (yy < -.02 || yy > 1.) continue;
      float dx = p.x - tx - lean * yy * th;
      float snowy = step(.72, r3), candle = step(.45, r1);
      float tiers = 5. + floor(r2 * 6.), saw = fract(yy * tiers + r0);
      float w = th * mix(.2, .11, candle) * pow(max(1. - yy, 0.), mix(1.05, .75, candle)) * (.68 + .42 * (1. - saw));
      if (snowy > .5) w = th * .17 * pow(max(1. - yy, 0.), .62) * (.82 + .3 * n1(yy * 9. + id));
      float trunk = step(yy, .06) * step(abs(dx), th * .014);
      float a = max(smoothstep(.0015, -.0015, abs(dx) - w), trunk);
      if (a <= 0.) continue;
      vec3 c = mix(vec3(.01, .016, .026), vec3(.1, .13, .19), uDay);
      float cap = snowy > .5 ? smoothstep(.5, .8, n2(vec2(dx * 90., yy * 9.) + id)) * .85 : step(saw, .16) * smoothstep(.35, .75, n1(dx * 110. + id)) * .55;
      c = mix(c, mix(vec3(.13, .16, .23), vec3(.7, .76, .9), uDay) + glowAt(p.x) * .12, cap * (1. - trunk));
      c = mix(c, sky(vec2(p.x, base + .04)), row * .28);
      o = vec4(mix(o.rgb, c, a), max(o.a, a));
    }
    return o;
  }
  vec3 scene(vec2 p){
    vec3 c = sky(p) + aurora(p) * (1. - uDay * .35);
    if (uLand > .5){
      vec4 f = fell(p, ridgeFar(p.x), 1.); c = mix(c, f.rgb, f.a);
      f = fell(p, ridgeNear(p.x), 0.); c = mix(c, f.rgb, f.a);
      vec4 tr = trees(p, uLakeY + .045, .014, .03, .07, 1.); c = mix(c, tr.rgb, tr.a);
      tr = trees(p, uLakeY + .008, .022, .05, .13, 0.); c = mix(c, tr.rgb, tr.a);
    }
    return c;
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes, p = vec2(uv.x * uAspect, uv.y);
    vec3 c;
    if (uLand > .5 && uLake > .5 && p.y < uLakeY){
      /* the lake: snow on the ice near the shore and in drifts, clear ice and water reflecting the sky */
      float d = uLakeY - p.y;
      float snow = smoothstep(.48, .62, f2(vec2(p.x * 3., p.y * 14.) + 5.) + .25 * smoothstep(.03, 0., d));
      vec2 rp = vec2(p.x + (n1(p.y * 140. + uT * .4) - .5) * .006 * (1. + d * 20.), uLakeY + d * 1.05);
      vec3 refl = scene(rp) * vec3(.62, .72, .82);
      vec3 ice = mix(vec3(.02, .035, .06), vec3(.36, .44, .6), uDay);
      vec3 water = mix(ice, refl, .85);
      vec3 sn = mix(vec3(.08, .1, .16), vec3(.62, .68, .84), uDay) + glowAt(p.x) * .3;
      c = mix(water, sn, snow * .9);
      c *= .9 + .1 * smoothstep(0., .02, d);
    } else c = scene(p);
    c = 1. - exp(-c * 1.35);                                                  // a camera's soft highlight roll-off
    c = pow(c, vec3(.92));
    gl_FragColor = vec4(c, 1.);
  }`;

  function create(canvas, o = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!o.preserve, powerPreference: 'high-performance' });
    if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {}; ['uRes', 'uT', 'uSeed', 'uDay', 'uLand', 'uLake', 'uHor', 'uLakeY', 'uCurt', 'uRays', 'uAspect', 'uA', 'uB', 'uPtr', 'uBurst'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
    let W = 0, H = 0;
    function frame(P, t, w, h) {
      P = Object.assign({}, DEFAULTS, P);
      const scale = o.scale || .5;
      w = Math.max(2, Math.round((w || canvas.clientWidth || 300) * scale)); h = Math.max(2, Math.round((h || canvas.clientHeight || 150) * scale));
      if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; gl.viewport(0, 0, w, h); }
      const s = shape(P.phase, P.kp), day = clamp(Math.max(P.day, s.dawn * .85, s.blue * .55));
      gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uAspect, W / H); gl.uniform1f(U.uT, t); gl.uniform1f(U.uSeed, P.seed);
      gl.uniform1f(U.uDay, day); gl.uniform1f(U.uLand, P.land ? 1 : 0); gl.uniform1f(U.uLake, P.lake ? 1 : 0); gl.uniform1f(U.uHor, P.horizon); gl.uniform1f(U.uLakeY, P.lakeY);
      gl.uniform1f(U.uCurt, P.curtains || s.curt); gl.uniform1f(U.uRays, P.rays >= 0 ? P.rays : s.rays);
      gl.uniform4f(U.uA, s.act, s.amp, s.speed, s.base); gl.uniform4f(U.uB, s.red, s.fringe, s.cor, s.pulse);
      gl.uniform3f(U.uPtr, P.ptr[0], 1 - P.ptr[1], P.ptr[2] || 0); gl.uniform3f(U.uBurst, P.burst[0], 1 - P.burst[1], P.burst[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return s;
    }
    return { frame, gl, dispose() { const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext(); } };
  }
  const PRESETS = {
    'Quiet arc': { phase: .26, kp: 2.5 }, 'Growth': { phase: .4, kp: 4 }, 'Breakup': { phase: .52, kp: 6 }, 'Corona': { phase: .65, kp: 6.5 },
    'Pulsating': { phase: .8, kp: 4 }, 'Strong storm': { phase: .53, kp: 8.6 }, 'Blue hour': { phase: .08, kp: 4, day: 1 }, 'Dawn': { phase: .96, kp: 3 },
  };
  window.AuroraSky = { create, shape, clock, name, glow, DEFAULTS, PRESETS, PHASES };
})();
