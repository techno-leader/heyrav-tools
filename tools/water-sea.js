/* Water Sea - the sea behind the Sunken world, as one engine the Water Lab
   tunes and the world loads. Colour comes from light: four depth zones each
   give a surface and a floor colour, and the depth (0 = lagoon, 1 = abyss)
   mixes between them. Sun rays and caustics fade as you go down; marine snow
   drifts everywhere; plankton glow only in the dark. One draw call.

   WaterSea.create(canvas) -> { draw(P, t, w, h, lantern) , sample(x, y) }
   P is a preset: WaterSea.DEFAULTS shows every key. */
(function () {
  const DEFAULTS = {
    depth: 0, sun: .62, rays: .55, rayCount: 14, raySpeed: .25, raySpread: .4,
    caustic: .32, causticScale: 7.5, causticSpeed: .6, causticSharp: .09,
    absorb: .55, haze: .25, snow: .5, snowSpeed: 1, glow: .6, glowCol: '#63f2d6',
    lantern: .5, lanternSize: .22,
    z0top: '#bff3ec', z0bot: '#2aa1b0', z1top: '#5cc2c6', z1bot: '#16506e',
    z2top: '#0f3d5c', z2bot: '#04162a', z3top: '#06182a', z3bot: '#01060d',
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  // the four zones sit at 0, 1/3, 2/3 and 1 of the depth
  function zone(P, d) {
    const f = Math.max(0, Math.min(.9999, d)) * 3, i = Math.floor(f), t = f - i;
    const top = [hex(P.z0top), hex(P.z1top), hex(P.z2top), hex(P.z3top)], bot = [hex(P.z0bot), hex(P.z1bot), hex(P.z2bot), hex(P.z3bot)];
    const s = t * t * (3 - 2 * t);
    return { top: lerp(top[i], top[Math.min(3, i + 1)], s), bot: lerp(bot[i], bot[Math.min(3, i + 1)], s) };
  }

  const FS = `precision highp float;
  uniform vec2 R,L;uniform float T,Dp,Sun,Ray,RayN,RayV,RaySp,Ca,CaS,CaV,CaK,Ab,Hz,Sn,SnV,Gl,Ln,LnR;uniform vec3 Top,Bot,GlC;
  float h1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  vec2 h2(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
  float cell(vec2 p,float t){vec2 i=floor(p),f=fract(p);float a=8.,b=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=.5+.45*sin(t+6.2831*h2(i+g));vec2 r=g+o-f;float d=dot(r,r);if(d<a){b=a;a=d;}else if(d<b)b=d;}return sqrt(b)-sqrt(a);}
  float caustic(vec2 p,float t){return pow(1.-smoothstep(0.,CaK,cell(p,t)),2.)*.7+pow(1.-smoothstep(0.,CaK*.8,cell(p*1.7+3.1,t*1.3)),2.)*.45;}
  void main(){
    vec2 uv=gl_FragCoord.xy/R;float y=uv.y,asp=R.x/R.y;
    float lit=pow(1.-Dp,1.6);                       // how much sun reaches this depth
    vec3 c=mix(Bot,Top,pow(y,1.1));
    // absorption: the lower on screen, the more the water eats the light
    c*=mix(1.,exp(-Ab*(1.-y)*1.6),.85);
    // the sun's glow at the surface
    vec2 sp=vec2((uv.x-Sun)*asp,1.-y);
    c+=mix(Top,vec3(1.),.4)*exp(-dot(sp,sp)*7.)*.35*lit;
    // rays: angle around a point above the surface
    vec2 o=vec2(Sun+RaySp*.25,1.35);float a=atan((uv.x-o.x)*asp,o.y-y);
    float r=(.5+.5*sin(a*RayN+T*RayV+sin(a*RayN*.43-T*RayV*.7)*2.))*(.5+.5*sin(a*RayN*2.7-T*RayV*.83));
    c+=vec3(1.,.98,.9)*r*smoothstep(.0,1.,y)*Ray*.32*lit*smoothstep(1.4,.2,abs(a));
    // caustics fall on everything below the surface
    c+=vec3(.85,1.,1.)*caustic(gl_FragCoord.xy/R.y*CaS+vec2(T*.03,0.),T*CaV)*Ca*.28*lit*(.25+.75*y);
    // haze: distant water flattens toward the mid colour
    c=mix(c,mix(Bot,Top,.5),Hz*.35*(1.-y));
    // marine snow drifting down
    vec2 g=gl_FragCoord.xy/R.y*70.+vec2(sin(T*.2+uv.y*3.)*.6,T*SnV*1.5);vec2 gi=floor(g);
    if(h1(gi)>1.-.012*Sn){c+=mix(vec3(.9),GlC,Dp*.4)*(.25+.35*lit)*smoothstep(.35,0.,length(fract(g)-.5-.25*(h2(gi)-.5)));}
    // plankton glow, only in the dark
    float dark=smoothstep(.35,.95,Dp);
    vec2 q=gl_FragCoord.xy/R.y*24.+vec2(T*.05,T*.08);vec2 qi=floor(q);float pk=h1(qi+7.);
    if(pk>.93){float tw=.5+.5*sin(T*(1.5+pk*3.)+pk*40.);c+=GlC*Gl*dark*tw*tw*smoothstep(.45,0.,length(fract(q)-.5-.3*(h2(qi)-.5)))*1.4;}
    // the visitor's lantern
    vec2 m=(gl_FragCoord.xy-L)/R.y;c+=mix(Top,GlC,dark)*exp(-dot(m,m)/(LnR*LnR))*Ln*(.25+.55*dark);
    c+=(h1(gl_FragCoord.xy+T)-.5)/160.;            // dither against banding
    gl_FragColor=vec4(c,1.);}`;

  function create(cv) {
    const g = cv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!g) return null;
    const sh = (t, s) => { const o = g.createShader(t); g.shaderSource(o, s); g.compileShader(o); if (!g.getShaderParameter(o, g.COMPILE_STATUS)) console.warn(g.getShaderInfoLog(o)); return o; };
    const p = g.createProgram();
    g.attachShader(p, sh(g.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    g.attachShader(p, sh(g.FRAGMENT_SHADER, FS)); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)) { console.warn(g.getProgramInfoLog(p)); return null; }
    g.useProgram(p); g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(p, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    const U = {}, u = n => (n in U ? U[n] : (U[n] = g.getUniformLocation(p, n)));
    return {
      gl: g,
      // lantern: [x, y] in canvas pixels from the top left, or null
      draw(P, t, w, h, lantern) {
        P = Object.assign({}, DEFAULTS, P);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        g.viewport(0, 0, w, h);
        const z = zone(P, P.depth);
        g.uniform2f(u('R'), w, h); g.uniform1f(u('T'), t); g.uniform1f(u('Dp'), P.depth);
        g.uniform3fv(u('Top'), z.top); g.uniform3fv(u('Bot'), z.bot); g.uniform3fv(u('GlC'), hex(P.glowCol));
        g.uniform1f(u('Sun'), P.sun); g.uniform1f(u('Ray'), P.rays); g.uniform1f(u('RayN'), P.rayCount); g.uniform1f(u('RayV'), P.raySpeed); g.uniform1f(u('RaySp'), P.raySpread);
        g.uniform1f(u('Ca'), P.caustic); g.uniform1f(u('CaS'), P.causticScale); g.uniform1f(u('CaV'), P.causticSpeed); g.uniform1f(u('CaK'), P.causticSharp);
        g.uniform1f(u('Ab'), P.absorb); g.uniform1f(u('Hz'), P.haze); g.uniform1f(u('Sn'), P.snow); g.uniform1f(u('SnV'), P.snowSpeed); g.uniform1f(u('Gl'), P.glow);
        const L = lantern || [-9999, -9999];
        g.uniform2f(u('L'), L[0], h - L[1]); g.uniform1f(u('Ln'), lantern ? P.lantern : 0); g.uniform1f(u('LnR'), P.lanternSize);
        g.drawArrays(g.TRIANGLES, 0, 3);
      },
      // the colour drawn at (x, y), top-left origin, as [r, g, b] 0-255
      sample(x, y) { const px = new Uint8Array(4); g.readPixels(Math.round(x), Math.round(cv.height - 1 - y), 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]]; },
      lose() { const e = g.getExtension('WEBGL_lose_context'); e && e.loseContext(); },
    };
  }
  window.WaterSea = { DEFAULTS, zone, create };
})();
