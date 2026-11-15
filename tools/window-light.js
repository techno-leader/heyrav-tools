/* window-light.js - light falling through something onto the page.

   Four casts: a window with leaves moving outside it, a jharokha (a carved
   stone balcony window with a jali lattice), a forest canopy and blinds.
   The jharokha is built from parts - arch, cusps, frame, sill, a row of
   openings, a jali - and any cast can pass through clear, stained, rainbow
   or tinted glass, split into colour fringes, bloom, throw shafts back
   toward the sun and pick up the texture of the stone it lands on.
   The sun follows the time of day: morning light arrives from the left,
   evening light from the right, low sun stretches every shape and warms the
   colour, noon is short, sharp and neutral, night is a cool moon.

   Sizes are measured against the viewport (0.6 of its short side + 0.4 of
   its long side), so a phone gets a smaller jharokha that still fits the
   screen rather than a corner of a desktop-sized one.

   On a light page the canvas multiplies: shade cools the paper, sun warms
   it. On a dark page it screens, so only the light arrives.

   One file serves two uses:
   - the site:  <script src="window-light.js" data-mount defer></script>
                settings from window.windowLightConfig, set before it loads
   - a tool:    WindowLight.create(canvas) -> { draw(settings, t, w, h) }  */
(() => {
  const DEF = {
    pattern: 'window',          // window | jharokha | canopy | blinds
    time: 'live',               // live (visitor's clock) | manual | cycle
    hour: 16.5, cycle: 60,      // manual hour; seconds per day in cycle mode
    palette: 'natural',         // natural | mono | custom
    sun: '#ffd9a0', shade: '#a3b0c8',
    depth: .42, tint: .3, soft: .5, size: 1, turn: 0,
    x: .62, y: .4,              // where the cast is centred, as a share of the viewport
    wind: 1, leaves: 0, density: .5, slats: 12,
    // the jharokha: arch, openings, frame, sill and jali
    arch: 'pointed',            // pointed | round | flat
    jw: .2, jh: .46, rise: .28, // half width, height below the spring, arch rise
    cusps: 4, cusp: .046,       // lobes per side and their radius; 0 lobes is a plain arch
    frame: .018, sill: true,    // solid stone round the jali; the row of gaps below
    openings: 1, gap: .08,      // a row of arches and the pillars between them
    jali: 'stars',              // stars | hex | circles | lattice | open
    lattice: 1, hole: 1, jrot: 0,
    // glass, for every cast
    glass: 'clear',             // clear | stained | rainbow | tinted
    sat: .85, hue: 0, band: 1.5, glassC: '#ff7a45',
    // the light itself
    disp: 0, bloom: .15, shafts: 0, shaftLen: 1, grain: 0, grainScale: 60, warp: 0, flicker: 0,
    res: .5                     // render scale; the light is soft, so half is plenty
  };

  /* ---- the sky: hour -> direction, length, softness and colour ---- */
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const KEYS = [ // hour, sun, shade, strength
    [0, '#8fa6e8', '#55618f', .55],
    [4.5, '#9aa3e0', '#5d6394', .55],
    [5.75, '#d6a6c8', '#77709f', .7],
    [6.75, '#ffb08a', '#8a83b4', .85],
    [8.5, '#ffd8a3', '#9eaac4', .95],
    [12, '#fff6e8', '#b4bfcc', 1],
    [15.5, '#ffe6ba', '#a8b0c4', 1],
    [17.25, '#ffb75e', '#9088b0', .95],
    [18.25, '#ff8e6a', '#7c6c9c', .85],
    [19.25, '#b98ad6', '#5f5a8c', .7],
    [20.5, '#8fa6e8', '#55618f', .55],
    [24, '#8fa6e8', '#55618f', .55]
  ];
  const PHASES = [[4.5, 'night'], [5.75, 'before dawn'], [7, 'sunrise'], [10.5, 'morning'], [14, 'midday'], [16.75, 'afternoon'], [18, 'golden hour'], [19, 'sunset'], [20.5, 'dusk'], [24, 'night']];
  const lerp = (a, b, k) => a + (b - a) * k;
  const mix3 = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  function sky(hour, s = DEF) {
    hour = ((hour % 24) + 24) % 24;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
    const [h0, s0, d0, k0] = KEYS[i], [h1, s1, d1, k1] = KEYS[i + 1];
    const k = (hour - h0) / (h1 - h0 || 1), e = k * k * (3 - 2 * k);
    let sun = mix3(hex(s0), hex(s1), e), shade = mix3(hex(d0), hex(d1), e);
    if (s.palette === 'mono') { const g = v => .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; sun = [1, 1, 1].map(() => lerp(g(sun), 1, .6)); shade = [1, 1, 1].map(() => g(shade)); }
    if (s.palette === 'custom') { sun = hex(s.sun); shade = hex(s.shade); }
    const day = hour >= 6 && hour <= 18.5, dt = (hour - 6) / 12.5;
    const elev = day ? Math.sin(Math.PI * Math.min(1, Math.max(0, dt))) : .35;  // the moon sits fairly low
    return {
      hour, sun, shade, strength: lerp(k0, k1, e),
      az: day ? lerp(-.75, .75, dt) : .3,                   // radians: left in the morning, right in the evening
      stretch: Math.min(1.9, 1 / (.45 + .55 * elev)),        // low sun throws long shapes
      softMul: lerp(1.5, 1, elev),
      phase: PHASES.find(p => hour < p[0])[1]
    };
  }
  const clockHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
  const hourFor = (s, t) => s.time === 'live' ? clockHour() : s.time === 'cycle' ? (s.hour + t / Math.max(1, s.cycle) * 24) % 24 : s.hour;

  /* ---- the shader ---- */
  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes,uPos;
uniform float uRef,uT,uPat,uAz,uStretch,uSoft,uWind,uDepth,uTint,uDark,uDens,uSlat,uLeaves;
uniform vec3 uSun,uShade,uGlassC;
uniform vec4 uJ0,uJ1,uJ2,uJ3,uG0,uFx,uFx2;
/* uJ0 width, height, rise, lobe radius | uJ1 lobes, frame, sill, arch style
   uJ2 openings, gap, jali pattern, jali cell | uJ3 hole size, jali turn
   uG0 glass mode, saturation, hue, band size
   uFx dispersion, bloom, shafts, texture | uFx2 warp, flicker, shaft length, texture scale */
#define PI 3.14159265
float gSoft;   /* softness for this pass - bloom and shafts re-run the cast much softer */
vec2 gId;      /* which pane the light came through, for stained glass */
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float hexd(vec2 p,float r){const vec3 k=vec3(-.8660254,.5,.57735);p=abs(p);p-=2.*min(dot(k.xy,p),0.)*k.xy;p-=vec2(clamp(p.x,-k.z*r,k.z*r),r);return length(p)*sign(p.y);}
vec3 hueRot(vec3 c,float a){const vec3 k=vec3(.57735);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca);}

/* leaves outside the opening: warped noise nudged by a two-speed breeze */
float leafShade(vec2 q,float t,float dens){
  vec2 br=(vec2(sin(t*.35+q.y*1.7),cos(t*.29+q.x*1.3))*.05+vec2(sin(t*1.1+q.x*5.),cos(t*.9+q.y*5.))*.012)*uWind;
  vec2 w=vec2(fbm(q*1.2+vec2(0.,t*.02)),fbm(q*1.2+vec2(5.2,1.3)-vec2(t*.017,0.)));
  float lf=fbm(q*2.6+w*1.4+br*2.4);
  float th=mix(.62,.4,dens),b=.03+gSoft*.12;
  return smoothstep(th-b,th+b,lf);
}

/* 1 - the window: mullions, a transom and leaves, mostly lit */
float castWindow(vec2 q,vec2 u,float t){
  gId=floor(vec2(q.x*.8+.18,q.y*2.));
  float e=.5-abs(fract(q.x*.8+.18)-.5);
  float bar=1.-smoothstep(.022,.022+gSoft*.06,e);
  float tr=1.-smoothstep(.02,.02+gSoft*.06,abs(q.y-.1));
  float frame=max(bar,tr*.7)*.75;
  float tl=smoothstep(1.25,.1,length(u*vec2(1.,1.2)));
  float tr2=smoothstep(.5,1.05,u.x)*smoothstep(1.05,.2,u.y)*.85;
  float reach=clamp(max(tl,tr2)*(.55+.9*n2(q*.9+3.7)),0.,1.);
  float band=smoothstep(.32,0.,abs(q.y+.55+.03*sin(t*.2)))*.4;
  return (1.-leafShade(q,t,uDens)*reach)*(1.-frame*.7)*(1.-band);
}

/* 2 - the jharokha. One opening, spring line at y = 0, y up. A pointed arch is
   two circles crossing, a round one an ellipse; cusps are lobes strung along
   the inside of the arch, over the arch shrunk by most of a lobe. */
float archOpen(vec2 a){
  float w=uJ0.x,h=uJ0.y,r=uJ0.z,rho=uJ0.w,N=uJ1.x,sty=uJ1.w;
  float rect=box(a-vec2(0.,-h*.5+w*.02),vec2(w,h*.5+w*.02));
  if(sty>1.5) return rect;
  float arch,lobes=1e3;
  if(sty<.5){
    float rr=max(r,w*1.02),c=(rr*rr-w*w)/(2.*w),R=w+c;
    arch=max(length(a-vec2(c,0.))-R,length(a-vec2(-c,0.))-R);
    float apex=atan(rr,-c);
    for(int k=0;k<8;k++){ if(float(k)>=N) break;
      float ang=mix(PI,apex,(float(k)+.5)/N);
      vec2 o=vec2(c,0.)+(R-rho)*vec2(cos(ang),sin(ang));
      lobes=min(lobes,min(length(a-o),length(a-vec2(-o.x,o.y)))-rho);
    }
  }else{
    arch=(length(a/vec2(w,r))-1.)*min(w,r);
    for(int k=0;k<8;k++){ if(float(k)>=N) break;
      float ang=mix(PI,PI*.5,(float(k)+.5)/N);
      vec2 o=vec2(cos(ang)*(w-rho),sin(ang)*(r-rho));
      lobes=min(lobes,min(length(a-o),length(a-vec2(-o.x,o.y)))-rho);
    }
  }
  if(N>.5) arch=min(arch+rho*.8,lobes);
  arch=max(arch,-a.y-h);
  return min(rect,arch);
}
/* the jali: stone between holes. Negative inside a hole. */
float jali(vec2 a){
  float pat=uJ2.z,L=uJ2.w,hs=uJ3.x;
  vec2 g=rot(uJ3.y)*a/L;
  if(pat>3.5){ gId=floor(a*6.); return -1.; }
  if(pat>2.5){ vec2 c=fract(g)-.5; gId=floor(g); return box(c,vec2(.4*hs))*L; }
  if(pat>1.5){ vec2 c=fract(g)-.5,cc=fract(g+.5)-.5; gId=floor(g); return min(length(c)-.38*hs,length(cc)-.13*hs)*L; }
  if(pat>.5){
    const vec2 s=vec2(1.,1.7320508);
    vec2 A=mod(g,s)-s*.5,B=mod(g-s*.5,s)-s*.5,hc=dot(A,A)<dot(B,B)?A:B;
    gId=floor((g-hc)*2.+.5);
    return hexd(hc,.42*hs)*L;
  }
  vec2 c=fract(g)-.5,cc=fract(g+.5)-.5; gId=floor(g);
  float star=min(box(c,vec2(.3*hs)),box(rot(PI/4.)*c,vec2(.3*hs)))-.02;
  return min(star,box(rot(PI/4.)*cc,vec2(.1*hs)))*L;
}
float castJharokha(vec2 q){
  vec2 a=vec2(q.x,-q.y)*1.25;
  a.y+=(uJ0.z-uJ0.y)*.5;                         /* centre the whole opening on the anchor */
  float N=uJ2.x,w=uJ0.x,h=uJ0.y,P=2.*w+uJ2.y;
  float ox=a.x+N*P*.5,idx=clamp(floor(ox/P),0.,N-1.);
  vec2 lc=vec2(ox-(idx+.5)*P,a.y);
  float d=max(archOpen(lc)+uJ1.y,jali(a));
  if(uJ1.z>.5){                                 /* the sill, with its row of small gaps */
    vec2 sp=lc-vec2(0.,-h-.05);
    float sill=box(sp,vec2(w+.035,.024));
    vec2 gp=vec2(mod(sp.x+.018,.036)-.018,sp.y);
    d=min(d,max(box(gp,vec2(.009,.014)),sill));
  }
  gId+=idx*17.;
  float b=.002+gSoft*.016;
  return smoothstep(b,-b,d);
}

/* 3 - the canopy: pinhole images of the sun through a moving crown. Spots
   gather where the crown is thin, so they come in clusters, not as snow. */
float spots(vec2 x,float t,float seed,float f){
  vec2 id=floor(x),fr=fract(x);float m=0.;
  float k=clamp(.12+gSoft*.75,.08,.95);
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j)),cid=id+o;
    vec2 r=vec2(h21(cid+seed),h21(cid+seed+3.7));
    vec2 c=o+.2+.6*r+uWind*.07*vec2(sin(t*.7+r.x*6.3),cos(t*.6+r.y*6.3));
    float rad=.16+.26*h21(cid+seed+7.1);
    vec2 w=(cid+.5)/f;
    float thin=.65*n2(w*1.3+vec2(t*.03,-t*.02)*uWind)+.35*n2(w*3.1-vec2(t*.05,t*.04)*uWind);
    float gate=smoothstep(.56-uDens*.22,.7-uDens*.22,thin);
    m=max(m,gate*(.5+.5*h21(cid+seed+2.3))*smoothstep(rad,rad*(1.-k),length(fr-c)));
  }
  return m;
}
float castCanopy(vec2 q,float t){
  gId=floor(q*3.);
  vec2 sw=uWind*.03*vec2(sin(t*.3),cos(t*.23));
  float big=spots(q*4.2+sw,t,0.,4.2),small=spots(q*9.+sw*1.7,t*1.3,5.,9.)*.8;
  float gap=fbm(q*1.1+sw*3.+vec2(t*.01,0.));
  float open=smoothstep(.68-uDens*.12,.84-uDens*.12,gap);
  return clamp(max(max(big,small),open),0.,1.);
}

/* 4 - blinds: slats inside a window, a cross frame through them */
float castBlinds(vec2 q){
  gId=vec2(floor(q.x*1.6),floor(q.y*uSlat));
  float open=box(q,vec2(.62,.48));
  float s=fract(q.y*uSlat);
  float b=.02+gSoft*.22;
  float gap=smoothstep(.42-b,.42+b,s)*smoothstep(.98,.98-b,s);
  float frame=min(abs(q.x)-.012,abs(q.y+.06)-.012);
  float bw=.004+gSoft*.03;
  return smoothstep(bw,-bw,open)*gap*smoothstep(-bw,bw,frame);
}

/* the glass the light passed through */
vec3 glass(vec2 q){
  float m=uG0.x;
  if(m<.5) return vec3(1.);
  vec3 c;
  if(m<1.5){                                      /* stained: jewel colours, one per pane */
    float k=floor(h21(gId+.37)*6.);
    c=k<1.?vec3(.16,.34,.98):k<2.?vec3(.95,.16,.34):k<3.?vec3(1.,.66,.1):k<4.?vec3(.16,.74,.42):k<5.?vec3(.64,.26,.9):vec3(.2,.78,.98);
    c=clamp(hueRot(c,uG0.z*2.*PI),0.,1.);
  }else if(m<2.5){                                /* rainbow: spectral bands across the cast */
    c=.5+.5*cos(2.*PI*(uG0.z+dot(q,vec2(.6,.8))*uG0.w+vec3(0.,.33,.67)));
  }else c=uGlassC;
  c/=max(max(c.r,c.g),max(c.b,.001));             /* keep the brightest channel at full */
  return mix(vec3(1.),c,uG0.y);
}
float castAny(vec2 q,vec2 u,float t){
  if(uPat<.5) return castWindow(q,u,t);
  if(uPat<1.5) return castJharokha(q);
  if(uPat<2.5) return castCanopy(q,t);
  return castBlinds(q);
}
vec3 castC(vec2 q,vec2 u,float t){ float s=castAny(q,u,t); return s*glass(q); }

void main(){
  vec2 frag=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 u=frag/uRes;
  vec2 p=(frag-uPos*uRes)/uRef;
  vec2 q=rot(uAz)*p; q.y/=uStretch;              /* light space: long shadows run along y */
  if(uFx2.x>0.) q+=(vec2(n2(q*2.3),n2(q*2.3+5.))-.5)*uFx2.x*.15;   /* an uneven wall */
  float t=uT;
  gSoft=uSoft;
  vec3 T;
  if(uFx.x>0.){                                   /* dispersion: red, green and blue land apart */
    vec2 D=vec2(0.,uFx.x*.025);
    T=vec3(castC(q-D,u,t).r,castC(q,u,t).g,castC(q+D,u,t).b);
  }else T=castC(q,u,t);
  if(uFx.y>0.){                                   /* bloom: the same cast, far softer, as a halo */
    gSoft=uSoft+4.;
    T+=castC(q,u,t)*uFx.y*(1.-T);
  }
  if(uFx.z>0.){                                   /* shafts: the cast smeared back toward the sun */
    gSoft=uSoft+2.5;
    vec3 sh=vec3(0.);float ws=0.;
    for(int i=1;i<=6;i++){ float k=float(i),wk=pow(.78,k); sh+=castC(q+vec2(0.,k*.045*uFx2.z),u,t)*wk; ws+=wk; }
    T+=sh/ws*uFx.z*.75*(1.-T);
  }
  gSoft=uSoft;
  if(uLeaves>0.&&(uPat>.5&&uPat<1.5||uPat>2.5)) T*=1.-uLeaves*leafShade(q*.8+7.,t,.5);
  if(uFx2.y>0.) T*=1.-uFx2.y*.7*smoothstep(.35,.75,n2(vec2(t*.12,7.3)));   /* clouds passing */
  if(uFx.w>0.){                                   /* the stone the light lands on */
    float g=.55*n2(p*uFx2.w)+.3*n2(p*uFx2.w*2.3)+.15*n2(p*uFx2.w*5.1);
    T*=mix(1.,.45+g*1.1,uFx.w);
  }
  /* light pages keep some room light outside the cast; a dark page stays dark */
  float room=uDark>.5?0.:uPat<.5?0.:uPat<1.5?.55:uPat<2.5?.35:.5;
  T=mix(vec3(room),vec3(1.),clamp(T,0.,1.));
  vec3 col;
  if(uDark<.5){
    vec3 shade=mix(vec3(1.),uShade,uDepth),sun=mix(vec3(1.),uSun,uDepth*uTint);
    col=mix(shade,sun,T);
  }else col=uSun*T*uDepth*.8+uShade*(1.-T)*uDepth*.05;
  gl_FragColor=vec4(col,1.);
}`;
  const PAT = { window: 0, jharokha: 1, canopy: 2, blinds: 3 };
  const ARCH = { pointed: 0, round: 1, flat: 2 };
  const JALI = { stars: 0, hex: 1, circles: 2, lattice: 3, open: 4 };
  const GLASS = { clear: 0, stained: 1, rainbow: 2, tinted: 3 };

  function create(cv) {
    const gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uRes', 'uPos', 'uRef', 'uT', 'uPat', 'uAz', 'uStretch', 'uSoft', 'uWind', 'uDepth', 'uTint', 'uDark', 'uDens', 'uSlat', 'uLeaves', 'uSun', 'uShade', 'uGlassC', 'uJ0', 'uJ1', 'uJ2', 'uJ3', 'uG0', 'uFx', 'uFx2']
      .forEach(k => U[k] = gl.getUniformLocation(prog, k));

    /* s: settings; t: seconds of motion; w, h: the viewport in CSS px; dark: page tone */
    function draw(s, t, w, h, dark) {
      s = Object.assign({}, DEF, s);
      const pw = Math.max(2, Math.round(w * s.res)), ph = Math.max(2, Math.round(h * s.res));
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
      gl.viewport(0, 0, pw, ph);
      const k = sky(hourFor(s, t), s);
      const ref = (.6 * Math.min(w, h) + .4 * Math.max(w, h)) * s.res * s.size;
      gl.uniform2f(U.uRes, pw, ph);
      // on a tall, narrow screen the cast drifts toward the middle so it is not cut off at the edge
      const fit = Math.min(1, w / h * 1.2);
      gl.uniform2f(U.uPos, .5 + (s.x - .5) * fit, s.y);
      gl.uniform1f(U.uRef, ref);
      gl.uniform1f(U.uT, t);
      gl.uniform1f(U.uPat, PAT[s.pattern] ?? 0);
      gl.uniform1f(U.uAz, k.az + s.turn * Math.PI / 180);
      gl.uniform1f(U.uStretch, k.stretch);
      gl.uniform1f(U.uSoft, s.soft * k.softMul);
      gl.uniform1f(U.uWind, s.wind);
      gl.uniform1f(U.uDepth, s.depth * k.strength);
      gl.uniform1f(U.uTint, s.tint);
      gl.uniform1f(U.uDark, dark ? 1 : 0);
      gl.uniform1f(U.uDens, s.density);
      gl.uniform1f(U.uSlat, s.slats);
      gl.uniform1f(U.uLeaves, s.leaves);
      gl.uniform3fv(U.uSun, k.sun);
      gl.uniform3fv(U.uShade, k.shade);
      gl.uniform3fv(U.uGlassC, hex(s.glassC));
      gl.uniform4f(U.uJ0, s.jw, s.jh, s.rise, s.cusp);
      gl.uniform4f(U.uJ1, s.cusps, s.frame, s.sill ? 1 : 0, ARCH[s.arch] ?? 0);
      gl.uniform4f(U.uJ2, s.openings, s.gap, JALI[s.jali] ?? 0, .042 * s.lattice);
      gl.uniform4f(U.uJ3, s.hole, s.jrot * Math.PI / 180, 0, 0);
      gl.uniform4f(U.uG0, GLASS[s.glass] ?? 0, s.sat, s.hue, s.band);
      gl.uniform4f(U.uFx, s.disp, s.bloom, s.shafts, s.grain);
      gl.uniform4f(U.uFx2, s.warp, s.flicker, s.shaftLen, s.grainScale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return k;
    }
    return { draw, gl };
  }

  /* ---- the site: one fixed canvas over the page ---- */
  function mount(opts) {
    const cfg = Object.assign({}, DEF, opts);
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const cv = document.createElement('canvas');
    cv.className = 'window-light';
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '55', pointerEvents: 'none', mixBlendMode: 'multiply' });
    const r = create(cv);
    if (!r) return null;

    let dark = false;
    const lum = c => { const m = c.match(/[\d.]+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return null; return (.2126 * m[0] + .7152 * m[1] + .0722 * m[2]) / 255; };
    const tone = () => {
      const l = lum(getComputedStyle(document.body).backgroundColor) ?? lum(getComputedStyle(document.documentElement).backgroundColor) ?? 1;
      dark = l < .4;
      cv.style.mixBlendMode = dark ? 'screen' : 'multiply';
    };
    let t = 0, last = 0, raf = 0;
    const paint = () => r.draw(cfg, t, innerWidth, innerHeight, dark);
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 30 - 2) return;
      const rate = window.heyrav?.speed?.() ?? 1;
      t += Math.min(.1, (now - (last || now)) / 1000) * rate;
      last = now; paint();
    };
    const run = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (still.matches || document.hidden) paint(); else raf = requestAnimationFrame(loop);
    };
    document.body.append(cv);
    tone(); run();
    addEventListener('resize', paint);
    document.addEventListener('visibilitychange', run);
    still.addEventListener?.('change', run);
    // a still page still follows the clock
    setInterval(() => { if (!raf && cfg.time === 'live') paint(); }, 60000);
    new MutationObserver(() => { tone(); paint(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return {
      get: () => Object.assign({}, cfg),
      set(o) { Object.assign(cfg, o); paint(); return Object.assign({}, cfg); }
    };
  }

  window.WindowLight = { DEF, sky, create, mount, hourFor };
  const me = document.currentScript;
  if (me && me.hasAttribute('data-mount')) {
    const go = () => { window.windowLight = mount(window.windowLightConfig || {}); };
    document.body ? go() : addEventListener('DOMContentLoaded', go);
  }
})();
