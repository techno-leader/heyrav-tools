/* AuroraSky - a night in Lapland, in WebGL, with no library.
   - The aurora is a volume: soft sheets of light in a slab of sky, raymarched
     from below in perspective, so curtains fold, overlap and recede to the
     horizon, and never read as threads. Their shape comes from a noise
     texture baked once (as a game engine would use a NoiseTexture), so each
     step of the march is one texture read. Coloured by height, as the physics
     says: a sharp lower edge, oxygen green above it fading upward, faint
     oxygen red at the crown, and on strong nights a pink-violet nitrogen
     fringe below the edge. Seen the way a camera sees it: vivid.
   - A night has phases: blue hour, a quiet arc, growth, the breakup, a corona
     overhead, pulsating patches, dawn. `phase` (0..1) runs through them, and
     the drift of the curtains is integrated over time, so a sudden jump in
     phase never makes them race.
   - The treeline is a photograph (two rows of spruce and pine, cut from the
     sky into masks), mirrored along the shore and reflected in the lake.
   - The land is real terrain: an erosion-style height field raymarched once
     into a texture when the canvas is sized (normal, snow cover, distance),
     then lit every frame: snow where it settles, rock on the steep faces,
     distance fading into the air, the aurora's light on the snow. Spruce and
     a lake in front.
   - The light: night with a faint airglow on the horizon; the blue hour with
     the Earth's shadow and the pink band above it, alpenglow on the peaks;
     dawn warming from the east.

   const s = AuroraSky.create(canvas, { scale: .5, trees: 'aurora-treeline.webp' })
   s.frame(P, t, w, h)   P: { phase, kp, day, seed, ptr: [x, y, s], burst: [x, y, t0], land, lake }
   AuroraSky.shape(phase, kp), .clock(phase), .name(phase), .glow(P), .PRESETS        */
(function () {
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ss = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const bump = (a, b, x) => ss(a, a + (b - a) * .3, x) * (1 - ss(a + (b - a) * .7, b, x));
  const DEFAULTS = { phase: .3, kp: 4.5, day: 0, seed: 3, ptr: [-1, -1, 0], burst: [0, 0, -99], land: 1, lake: 1 };
  const PHASES = [[0, 'Blue hour'], [.14, 'Quiet arc'], [.36, 'Growth'], [.47, 'Breakup'], [.58, 'Corona'], [.72, 'Pulsating'], [.9, 'Dawn']];
  const name = ph => { let n = PHASES[0][1]; for (const [a, b] of PHASES) if (ph >= a) n = b; return n; };
  const clock = ph => { const m = Math.round((15.5 + ph * 15.5) * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  function shape(ph, kp) {
    const k = clamp(kp / 9), blue = 1 - ss(.04, .15, ph), dawn = ss(.86, .99, ph), brk = bump(.45, .6, ph), cor = bump(.56, .74, ph), pulse = ss(.72, .8, ph) * (1 - dawn);
    return {
      act: (.45 + .6 * k) * (.12 + .88 * (1 - blue)) * (1 - .85 * dawn) * (1 + .8 * brk) * (1 - .5 * pulse),
      speed: .35 + 1.6 * brk + .5 * cor, width: .5 + .5 * k + .7 * brk, rays: .35 + .45 * brk + .3 * k,
      red: .25 + .9 * k + .4 * brk, fringe: clamp((k - .4) * 2) * (.5 + brk), near: cor,
      cor, pulse, dawn, blue, brk, k,
    };
  }
  const G = [.22, 1, .55], RD = [1, .24, .36], VI = [.62, .38, 1];
  function glow(P) { const s = shape(P.phase, P.kp), a = clamp(s.act * (1 - .5 * (P.day || 0)));
    return [G[0] * (1 - .2 * s.fringe) + RD[0] * .15 * s.red, G[1] * (1 - .25 * s.fringe), G[2] + VI[2] * .2 * s.fringe, a]; }

  /* a tileable noise texture, baked once: four octaves of value noise per channel, each a different field */
  function noiseTex(N = 256, seed = 7) {
    const out = new Uint8Array(N * N * 4);
    const field = (per, s) => { const g = new Float32Array(per * per); let x = s * 9301 + 49297; for (let i = 0; i < g.length; i++) { x = (x * 233280 + 49297) % 2147483647; g[i] = (x % 10000) / 10000; } return g; };
    for (let c = 0; c < 4; c++) {
      const oct = [[4, 1], [8, .5], [16, .25], [32, .125]].map(([per, a], o) => ({ per, a, g: field(per, seed + c * 17 + o * 5) }));
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let v = 0, tot = 0;
        for (const o of oct) { const fx = x / N * o.per, fy = y / N * o.per, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const at = (i, j) => o.g[((j % o.per) * o.per) + (i % o.per)];
          v += o.a * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy); tot += o.a; }
        out[(y * N + x) * 4 + c] = Math.round(v / tot * 255);
      }
    }
    return out;
  }

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const COMMON = `precision highp float;
  uniform vec2 uRes; uniform float uAspect, uHorY, uSeed;
  float h2(vec2 p){ vec3 q = fract(vec3(p.xyx + uSeed * 3.1) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float h1(float n){ return h2(vec2(n, n * .37 + 1.7)); }
  vec3 rayDir(vec2 uv){ return normalize(vec3((uv.x - .5) * uAspect * 1.15, (uv.y - uHorY) * 1.15, 1.)); }
  const vec3 CAM = vec3(0., 1.6, 0.);
  `;
  /* the terrain, raymarched once into a texture: r = how much it faces up, g = snow, b = distance (1 = sky), a = how much it faces east */
  const BAKE = COMMON + `
  vec3 noised(vec2 x){ vec2 p = floor(x), f = fract(x), u = f * f * (3. - 2. * f), du = 6. * f * (1. - f);
    float a = h2(p), b = h2(p + vec2(1, 0)), c = h2(p + vec2(0, 1)), d = h2(p + vec2(1, 1));
    return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y, du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx)); }
  float terrain(vec2 x, int oct){
    vec2 p = x * .028; float a = 0., b = 1.; vec2 d = vec2(0.);
    for (int i = 0; i < 8; i++){ if (i >= oct) break; vec3 n = noised(p); d += n.yz; a += b * n.x / (1. + dot(d, d)); b *= .5; p = mat2(1.6, -1.2, 1.2, 1.6) * p; }
    float r = length(x - CAM.xz);
    float massif = noised(x * .0065 + 3.1).x;                       /* some peaks stand tall, some saddles fall away */
    return 19. * pow(max(a, 0.), 1.5) * (.35 + .95 * massif * massif) * smoothstep(30., 80., r) - 1.5;   /* flat near: the lake and the forest; the range from about 30 units out */
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes; vec3 rd = rayDir(uv);
    if (rd.y > .5){ gl_FragColor = vec4(0., 0., 1., .5); return; }
    float t = 1.5, h = 0.; bool hit = false; vec3 p;
    for (int i = 0; i < 140; i++){ p = CAM + rd * t; h = p.y - max(terrain(p.xz, 5), 0.); if (h < .002 * t){ hit = true; break; } t += max(.08, h * .5); if (t > 320.) break; }
    if (!hit){ gl_FragColor = vec4(0., 0., 1., .5); return; }
    float e = .02 * t; vec2 q = p.xz;
    float hc = max(terrain(q, 8), 0.);
    vec3 n = normalize(vec3(max(terrain(q - vec2(e, 0.), 8), 0.) - max(terrain(q + vec2(e, 0.), 8), 0.), 2. * e, max(terrain(q - vec2(0., e), 8), 0.) - max(terrain(q + vec2(0., e), 8), 0.)));
    float snow = smoothstep(.32, .66, n.y + .12 * (h2(floor(q * 3.)) - .5)) + .45 * smoothstep(7., 13., hc) * smoothstep(.15, .4, n.y);
    float fog = 1. - exp(-t * .0075);
    gl_FragColor = vec4(n.y * .5 + .5, clamp(snow, 0., 1.), min(fog, .985), n.x * .5 + .5);
  }`;
  const MAIN = COMMON + `
  uniform float uT, uTa, uLand, uLake, uLakeY, uBlue, uDawn, uQ;
  uniform vec4 uA;   // act, width, rays, red
  uniform vec4 uB;   // fringe, corona, pulse, near
  uniform vec3 uPtr, uBurst;
  uniform sampler2D uNoise, uTerr, uTreeTex;
  uniform float uHasTrees;
  const vec3 GR = vec3(.22, 1., .55), RD = vec3(1., .24, .36), VI = vec3(.62, .38, 1.), PK = vec3(1., .42, .78);
  vec4 nz(vec2 p){ return texture2D(uNoise, p); }
  /* the aurora: a slab of sky from 4 to 9 units up, marched from the eye */
  vec3 aurora(vec2 uv, vec3 rd){
    if (rd.y < .015) return vec3(0.);
    float y0 = 7., y1 = 16., t0 = (y0 - CAM.y) / rd.y, t1 = min((y1 - CAM.y) / rd.y, 220.);
    if (t0 > 220.) return vec3(0.);
    vec2 drift = vec2(uTa * .006, uTa * .0025 - uB.w * .12);
    float steps = uQ > .5 ? 26. : 16., dt = (t1 - t0) / steps, j = fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(.06711, .00584))));   // interleaved gradient noise: an even dither, not grain
    vec3 col = vec3(0.);
    for (int i = 0; i < 26; i++){
      if (float(i) >= steps) break;
      vec3 p = CAM + rd * (t0 + (float(i) + j) * dt);
      vec2 q = p.xz * .016 + drift;
      vec4 a = nz(q), b = nz(q * .31 + vec2(.37, .61) + drift * .4);
      float w = .028 + .03 * uA.y * b.g;
      float sheet = 1. - smoothstep(0., w, abs(a.r - .5 + .12 * (b.r - .5)));
      if (uA.y > .9) sheet = max(sheet, .7 * (1. - smoothstep(0., w * .8, abs(a.a - .46))));   // a second family of curtains on active nights
      if (sheet < .01) continue;
      float base = .05 + .16 * b.b;                                     // the lower edge wanders in height along the curtain
      float hh = (p.y - y0) / (y1 - y0) - base;
      float green = smoothstep(-.025, .01, hh) * exp(-max(hh, 0.) * 3.6);
      float red = smoothstep(.22, .55, hh) * exp(-max(hh - .55, 0.) * 3.) * .26 * uA.w;
      float fr = exp(-pow((hh + .018) / .028, 2.)) * uB.x;
      float along = smoothstep(.18, .72, b.g) * (.55 + .45 * b.a);
      float ray = nz(q * 7.3 + vec2(uTa * .004, 0.)).b;                    // soft streaks: the same along the height, so they are vertical
      float I = sheet * along * mix(1., .45 + 1.1 * ray, uA.z * .7);
      col += I * (green * GR + red * RD + fr * mix(VI, PK, .55)) * dt;
    }
    col *= uA.x / (1. + .6 * uA.x) * .42;                                 // strong nights brighten, but never wash out
    if (uPtr.z > 0.){ float d = (uv.x - uPtr.x) * 3.2; col *= 1. + .5 * exp(-d * d) * uPtr.z; }
    float bt = uT - uBurst.z; if (bt > 0. && bt < 16.){ float d = abs(uv.x - uBurst.x) - bt * .09; col *= 1. + (2.4 * exp(-d * d / .004) + .7) * exp(-bt * .28); }
    /* the corona: rays that seem to burst from overhead */
    if (uB.y > .01){ vec2 z = vec2(.5 * uAspect, 1.35), d = vec2(uv.x * uAspect, uv.y) - z; float an = atan(d.x, -d.y), L = length(d);
      float r = nz(vec2(an * .9, uTa * .002)).b * .6 + nz(vec2(an * 2.3, .5)).r * .4;
      col += smoothstep(1.2, .4, L) * smoothstep(.1, .5, L) * (.3 + 1.1 * r) * uB.y * uA.x * (GR * smoothstep(1.05, .6, L) * .55 + RD * .25 * smoothstep(.5, .85, L) * uA.w); }
    /* pulsating patches */
    if (uB.z > .01){ vec2 c = floor(uv * vec2(6., 5.)); float per = 3. + 7. * h2(c + 3.), on = smoothstep(.2, .9, .5 + .5 * sin(uT * 6.283 / per + h2(c + 9.) * 6.28));
      col += GR * vec3(.85, 1., .9) * smoothstep(.55, .72, nz(uv * vec2(.8, .5) + .2).a) * smoothstep(.36, .6, uv.y) * on * uB.z * .5 * (.4 + uA.x); }
    return col;
  }
  vec3 sky(vec2 uv, vec3 rd){
    float e = rd.y;                                                       // height above the horizon
    vec3 night = mix(vec3(.04, .065, .11), vec3(.004, .008, .022), smoothstep(0., .6, e)) + vec3(.02, .06, .03) * exp(-abs(e) * 28.) * .6;   // a faint airglow on the horizon
    /* the blue hour: the Earth's shadow on the horizon, the pink band above it, then deepening blue */
    vec3 blue = mix(vec3(.26, .3, .5), vec3(.94, .6, .64), smoothstep(.05, .17, e));
    blue = mix(blue, vec3(.66, .56, .82), smoothstep(.17, .27, e));
    blue = mix(blue, vec3(.22, .28, .6), smoothstep(.25, .48, e));
    blue = mix(blue, vec3(.05, .08, .24), smoothstep(.45, .85, e));
    /* dawn: warm from the east (right), the rest still blue */
    float east = smoothstep(.2, 1., uv.x);
    vec3 dawn = mix(mix(vec3(1., .7, .4), vec3(1., .56, .5), smoothstep(.06, .17, e)), vec3(.42, .5, .78), smoothstep(.15, .38, e));
    dawn = mix(dawn, vec3(.1, .17, .42), smoothstep(.36, .85, e));
    dawn = mix(blue, dawn, .35 + .65 * east);
    vec3 c = mix(night, blue, uBlue); c = mix(c, dawn, uDawn);
    /* stars, each at its own rate, fading with the light */
    vec2 g = floor(gl_FragCoord.xy / 1.5); float s = h2(g), tw = .55 + .45 * sin(uT * (1.5 + h2(g + 5.) * 3.) + s * 60.);
    c += vec3(.92, .95, 1.) * step(.9955, s) * tw * (.35 + 1.4 * pow(h2(g + 1.7), 6.)) * (1. - max(uBlue, uDawn) * .85) * smoothstep(.02, .2, e);
    return c;
  }
  vec3 horizonCol(vec2 uv){ return sky(uv, normalize(vec3(0., .03, 1.))); }
  vec3 glowAt(float x){ return GR * uA.x * .35 * (.5 + .5 * nz(vec2(x * .4 + uTa * .002, .3)).g); }
  /* spruce in front: two rows, every tree its own height, lean, tiers and build; some heavy with snow */
  vec4 trees(vec2 p, float base, float cw, float hmin, float hmax, float row){
    vec4 o = vec4(0.); float ci = floor(p.x / cw);
    for (int k = -2; k <= 2; k++){
      float id = ci + float(k) + row * 97., r0 = h1(id), r1 = h1(id + .37), r2 = h1(id + .71), r3 = h1(id + .13);
      if (r0 < .16) continue;
      float tx = (ci + float(k) + .15 + .7 * r1) * cw, th = mix(hmin, hmax, r2 * r2), lean = (r3 - .5) * .1;
      float yy = (p.y - base) / th; if (yy < -.02 || yy > 1.) continue;
      float dx = p.x - tx - lean * yy * th, snowy = step(.72, r3), candle = step(.45, r1);
      float tiers = 5. + floor(r2 * 6.), saw = fract(yy * tiers + r0);
      float w = th * mix(.2, .11, candle) * pow(max(1. - yy, 0.), mix(1.05, .75, candle)) * (.7 + .38 * (1. - saw));
      if (snowy > .5) w = th * .17 * pow(max(1. - yy, 0.), .62) * (.84 + .26 * nz(vec2(yy * .9, id * .13)).r);
      float trunk = step(yy, .06) * step(abs(dx), th * .014), a = max(smoothstep(.0015, -.0015, abs(dx) - w), trunk);
      if (a <= 0.) continue;
      vec3 c = mix(vec3(.008, .013, .022), vec3(.08, .1, .16), max(uBlue, uDawn));
      float cap = snowy > .5 ? smoothstep(.45, .75, nz(vec2(dx * 9., yy * 1.1) + id * .1).r) * .8 : step(saw, .16) * smoothstep(.4, .7, nz(vec2(dx * 12., id * .1)).g) * .5;
      c = mix(c, mix(vec3(.1, .12, .18), vec3(.62, .66, .82), max(uBlue, uDawn)) + glowAt(p.x / uAspect) * .25, cap * (1. - trunk));
      c = mix(c, horizonCol(vec2(p.x / uAspect, .3)), row * .3);
      o = vec4(mix(o.rgb, c, a), max(o.a, a));
    }
    return o;
  }
  /* the land, from the baked terrain, lit now */
  vec4 land(vec2 uv){
    vec4 T = texture2D(uTerr, uv); if (T.b > .99) return vec4(0.);
    float up = T.r * 2. - 1., snow = T.g, fog = T.b, east = T.a * 2. - 1.;
    float day = max(uBlue, uDawn);
    vec3 sn = mix(vec3(.06, .08, .135), mix(vec3(.5, .55, .74), vec3(.62, .6, .72), uDawn), max(uBlue, uDawn * .85)) * (.4 + .6 * up);
    sn += vec3(1., .6, .68) * .34 * uBlue * smoothstep(0., .6, up) * (1. - uDawn) * (1. - fog);   // alpenglow under the pink band
    sn += vec3(1., .74, .55) * .45 * uDawn * max(east + .2, 0.) * (1. - fog);                         // dawn light from the east
    sn += glowAt(uv.x) * (.22 * up) * (1. - day * .6);                            // the aurora's light on the snow
    vec3 rk = mix(vec3(.018, .022, .035), vec3(.2, .22, .3), day) * (.6 + .4 * up);
    vec3 c = mix(rk, sn, snow);
    c = mix(c, horizonCol(uv), fog * .9);                                         // distance is air
    return vec4(c, 1.);
  }
  /* the treeline, from a photograph: two rows of real spruce and pine (r = near row, g = far ridge row, b = bark and needle detail),
     mirrored along the shore so it never visibly repeats */
  vec4 treeline(vec2 uv){
    float y0 = uLakeY - .006, h = .17; if (uv.y < y0 || uv.y > y0 + h) return vec4(0.);
    float tx = uv.x * uAspect / (h * 4.18) + .37, m = abs(mod(tx, 2.) - 1.);
    vec4 T = texture2D(uTreeTex, vec2(m, 1. - (uv.y - y0) / h));
    float day = max(uBlue, uDawn);
    vec3 farC = mix(mix(vec3(.014, .022, .036), vec3(.16, .19, .29), day), horizonCol(uv), .34 * (1. - T.r));
    vec3 nearC = mix(vec3(.006, .01, .018), vec3(.07, .085, .13), day) + (T.b - .5) * .03 * (1. + day * 2.) + glowAt(uv.x) * .05 * T.b;
    vec3 c = mix(farC, nearC, T.r); float a = max(T.g, T.r);
    return vec4(c, a);
  }
  vec3 scene(vec2 uv){
    vec3 rd = rayDir(uv), c = sky(uv, rd) + aurora(uv, rd) * (1. - max(uBlue, uDawn) * .35);
    if (uLand > .5){
      vec4 l = land(uv); c = mix(c, l.rgb, l.a);
      vec2 p = vec2(uv.x * uAspect, uv.y);
      if (uHasTrees > .5){ vec4 tl = treeline(uv); c = mix(c, tl.rgb, tl.a); }
      else { vec4 tr = trees(p, uLakeY + .05, .013, .025, .06, 1.); c = mix(c, tr.rgb, tr.a); tr = trees(p, uLakeY + .008, .021, .045, .12, 0.); c = mix(c, tr.rgb, tr.a); }
    }
    return c;
  }
  void main(){
    vec2 uv = gl_FragCoord.xy / uRes; vec3 c;
    if (uLand > .5 && uLake > .5 && uv.y < uLakeY){
      /* the lake: snow on the ice near the shore and in drifts; clear ice and water reflect the sky, mirrored at the horizon */
      float d = uLakeY - uv.y;
      float snow = smoothstep(.5, .66, nz(vec2(uv.x * 1.6, uv.y * 5.) + .3).r + .25 * smoothstep(.03, 0., d));
      vec2 rp = vec2(uv.x + (nz(vec2(uv.y * 9., uT * .02)).g - .5) * .01 * (1. + d * 16.), 2. * uHorY - uv.y);
      vec3 refl = scene(rp) * vec3(.6, .7, .82);
      vec3 ice = mix(vec3(.015, .03, .05), vec3(.34, .4, .58), max(uBlue, uDawn));
      vec3 sn = mix(vec3(.07, .09, .15), vec3(.6, .65, .82), max(uBlue, uDawn)) + glowAt(uv.x) * .25;
      vec3 water = mix(ice, refl, .85);
      if (uHasTrees > .5){ vec4 tl = treeline(vec2(rp.x, 2. * uLakeY - uv.y)); water = mix(water, tl.rgb * .8, tl.a * .85); }   // the trees in the water
      c = mix(water, sn, snow * .9);
    } else c = scene(uv);
    c = 1. - exp(-c * 1.35); c = pow(c, vec3(.92));
    gl_FragColor = vec4(c, 1.);
  }`;

  function create(canvas, o = {}) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: !!o.preserve, powerPreference: 'high-performance' });
    if (!gl) return null;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p; };
    const PB = prog(BAKE), PM = prog(MAIN);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = (w, h, data, filter, wrap) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap); return t; };
    const NT = tex(256, 256, noiseTex(256, 7), gl.LINEAR, gl.REPEAT);
    let TRT = null;
    if (o.trees) { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { TRT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, TRT); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR)); [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)); }; im.src = o.trees; }
    let TT = null, FB = null, W = 0, H = 0, baked = 0, bakeKey = '', ta = 0, sp = .4, lastT = null;
    const U = (p, n) => gl.getUniformLocation(p, n);
    const UM = {}; ['uRes', 'uAspect', 'uHorY', 'uSeed', 'uT', 'uTa', 'uLand', 'uLake', 'uLakeY', 'uBlue', 'uDawn', 'uQ', 'uA', 'uB', 'uPtr', 'uBurst', 'uNoise', 'uTerr', 'uTreeTex', 'uHasTrees'].forEach(n => UM[n] = U(PM, n));
    const UB = {}; ['uRes', 'uAspect', 'uHorY', 'uSeed'].forEach(n => UB[n] = U(PB, n));
    const HOR = .3, LAKE = .12, STRIPS = 6;
    function bakeStep(seed) {
      if (baked >= STRIPS) return;
      gl.useProgram(PB); gl.bindFramebuffer(gl.FRAMEBUFFER, FB); gl.viewport(0, 0, W, H);
      gl.uniform2f(UB.uRes, W, H); gl.uniform1f(UB.uAspect, W / H); gl.uniform1f(UB.uHorY, HOR); gl.uniform1f(UB.uSeed, seed);
      const y0 = Math.floor(H * (LAKE - .01)), y1 = Math.ceil(H * .82), a = y0 + Math.floor((y1 - y0) * baked / STRIPS), b = y0 + Math.floor((y1 - y0) * (baked + 1) / STRIPS);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, a, W, b - a); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); baked++;
    }
    function frame(P, t, w, h) {
      P = Object.assign({}, DEFAULTS, P);
      const scale = o.scale || .5;
      w = Math.max(2, Math.round((w || canvas.clientWidth || 300) * scale)); h = Math.max(2, Math.round((h || canvas.clientHeight || 150) * scale));
      if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; }
      const key = W + 'x' + H + ':' + P.seed;
      if (key !== bakeKey) { bakeKey = key; baked = 0; if (TT) gl.deleteTexture(TT); if (FB) gl.deleteFramebuffer(FB);
        const blank = new Uint8Array(W * H * 4); for (let i = 2; i < blank.length; i += 4) blank[i] = 255;    // sky until baked
        TT = tex(W, H, blank, gl.NEAREST, gl.CLAMP_TO_EDGE); FB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, FB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, TT, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      if (P.land) { if (o.bakeAll) while (baked < STRIPS) bakeStep(P.seed); else bakeStep(P.seed); }
      const s = shape(P.phase, P.kp);
      /* the drift is integrated, and its speed eases, so the curtains never jump */
      const dt = lastT == null ? 0 : clamp(t - lastT, 0, .1); lastT = t; sp += (s.speed - sp) * (1 - Math.exp(-dt * .6)); ta += dt * sp * 60;
      gl.useProgram(PM); gl.viewport(0, 0, W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, NT); gl.uniform1i(UM.uNoise, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, TT); gl.uniform1i(UM.uTerr, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, TRT || NT); gl.uniform1i(UM.uTreeTex, 2); gl.uniform1f(UM.uHasTrees, TRT ? 1 : 0); gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(UM.uRes, W, H); gl.uniform1f(UM.uAspect, W / H); gl.uniform1f(UM.uHorY, HOR); gl.uniform1f(UM.uSeed, P.seed); gl.uniform1f(UM.uLakeY, LAKE);
      gl.uniform1f(UM.uT, t); gl.uniform1f(UM.uTa, ta + P.seed * 97); gl.uniform1f(UM.uLand, P.land ? 1 : 0); gl.uniform1f(UM.uLake, P.lake ? 1 : 0); gl.uniform1f(UM.uQ, o.low ? 0 : 1);
      gl.uniform1f(UM.uBlue, clamp(Math.max(P.day, s.blue * .9))); gl.uniform1f(UM.uDawn, s.dawn);
      gl.uniform4f(UM.uA, s.act, s.width, s.rays, s.red); gl.uniform4f(UM.uB, s.fringe, s.cor, s.pulse, s.near);
      gl.uniform3f(UM.uPtr, P.ptr[0], 1 - P.ptr[1], P.ptr[2] || 0); gl.uniform3f(UM.uBurst, P.burst[0], 1 - P.burst[1], P.burst[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return s;
    }
    return { frame, gl, dispose() { const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext(); } };
  }
  const PRESETS = {
    'Quiet arc': { phase: .26, kp: 3 }, 'Growth': { phase: .4, kp: 4.5 }, 'Breakup': { phase: .52, kp: 6 }, 'Corona': { phase: .65, kp: 6.5 },
    'Pulsating': { phase: .8, kp: 4 }, 'Strong storm': { phase: .53, kp: 8.6 }, 'Blue hour': { phase: .2, kp: 4.5, day: 1 }, 'Dawn': { phase: .95, kp: 3 },
  };
  window.AuroraSky = { create, shape, clock, name, glow, DEFAULTS, PRESETS, PHASES };
})();
