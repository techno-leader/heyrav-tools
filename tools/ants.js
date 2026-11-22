/* Ants: a small foraging colony for a 2D canvas.

   Each ant has a head, a thorax and a gaster joined at a narrow waist, six legs and two elbowed
   antennae. Legs move in an alternating tripod gait: front-left, middle-right and hind-left
   step together while the other three hold the ground, and a leg steps only when its foot has
   fallen too far behind where it rests. Feet stay planted on the floor between steps, so the
   body glides over still feet the way real ants do.

   Behaviour: a scout leaves the nest and wanders until it reaches food, leaving a trail. Others
   follow that trail with a slight weave, feed along the line with stop-and-go pauses, and carry
   crumbs home along the same trail, then come back. Meeting another ant head-on, both pause and
   touch antennae. dismiss() sends everyone home.

   Ants.create({ nest: [x, y], food: { pts: [[x, y]...], take(i, dt) }, size, count, rnd })
     .update(dt) .draw(ctx) .dismiss() .reset() .stats()                                       */
(function (G) {
  'use strict';
  const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  // leg layout in body lengths (x forward, y to the right): hip on the thorax, resting foot
  const LEGS = [
    { hip: [.20, -.04], rest: [.50, -.30], g: 0 }, { hip: [.13, -.05], rest: [.12, -.42], g: 1 }, { hip: [.05, -.05], rest: [-.34, -.36], g: 0 },
    { hip: [.20, .04], rest: [.50, .30], g: 1 }, { hip: [.13, .05], rest: [.12, .42], g: 0 }, { hip: [.05, .05], rest: [-.34, .36], g: 1 },
  ];
  const FEMUR = .27, TIBIA = .36;

  function create(opt = {}) {
    const rnd = opt.rnd || Math.random, L = opt.size || 10, col = opt.color || '#1b120c';
    let nest = opt.nest || [0, 0], food = opt.food || { pts: [], take() {} };
    let ants = [], trail = null, scoutOut = false, gone = false, spawnT = 0, max = opt.count || 14;
    const world = (a, p) => { const c = Math.cos(a.h), s = Math.sin(a.h); return [a.x + (p[0] * c - p[1] * s) * L, a.y + (p[0] * s + p[1] * c) * L]; };

    function make(scout) {
      const a = { x: nest[0], y: nest[1], h: Math.atan2(food.pts.length ? food.pts[0][1] - nest[1] : 0, food.pts.length ? food.pts[0][0] - nest[0] : 1) + (rnd() - .5),
        v: 0, vmax: (3.6 + rnd() * 1.4) * L, mode: scout ? 'scout' : 'out', ti: 0, pause: 0, carry: false, phase: rnd() * TAU, weave: rnd() * TAU, wander: 0, target: null, eatI: -1, eatLeft: 0, path: scout ? [[nest[0], nest[1]]] : null, meet: 0 };
      a.legs = LEGS.map(l => { const f = world(a, l.rest); return { foot: f, from: f, to: f, t: 1, g: l.g }; });
      return a;
    }
    function reset(n) { if (n) { nest = n.nest || nest; food = n.food || food; } ants = []; trail = null; scoutOut = false; gone = false; spawnT = 0; }

    function steerTo(a, tx, ty, dt, turn = 5) { const want = Math.atan2(ty - a.y, tx - a.x); a.h += clamp(angDiff(a.h, want), -turn * dt, turn * dt); }
    function nearestFood(a) { let best = -1, bd = 1e9; for (let i = 0; i < food.pts.length; i += 3) { const p = food.pts[i], d = (p[0] - a.x) ** 2 + (p[1] - a.y) ** 2; if (d < bd) { bd = d; best = i; } } return [best, Math.sqrt(bd)]; }

    function think(a, dt) {
      let go = 1;
      if (a.pause > 0) { a.pause -= dt; go = 0; }
      if (a.meet > 0) { a.meet -= dt; go = 0; }
      const weave = Math.sin(a.weave += dt * 5) * .35;
      if (a.mode === 'scout') { // a random walk that drifts toward the food, laying the trail
        a.wander += (rnd() - .5) * 6 * dt; a.wander = clamp(a.wander, -.8, .8);
        const [i, d] = nearestFood(a); if (i >= 0) { const p = food.pts[i]; steerTo(a, p[0], p[1], dt, 2.8); }
        a.h += a.wander * dt * 1.6;
        if (!a.path.length || Math.hypot(a.x - a.path[a.path.length - 1][0], a.y - a.path[a.path.length - 1][1]) > L * .8) a.path.push([a.x, a.y]);
        if (i >= 0 && d < L * .6) { a.path.push([food.pts[i][0], food.pts[i][1]]); trail = a.path.slice(); a.mode = 'eat'; a.eatI = i; a.eatLeft = 1.5 + rnd() * 2; }
        if (rnd() < dt * .25) a.pause = .2 + rnd() * .5;
      } else if (a.mode === 'out' || a.mode === 'home') { // follow the trail, weaving a little
        if (!trail) { a.mode = 'scout'; a.path = [[a.x, a.y]]; return go; }
        const n = trail.length, k = a.mode === 'out' ? a.ti : n - 1 - a.ti, p = trail[clamp(k, 0, n - 1)];
        const q = trail[clamp(k + (a.mode === 'out' ? 1 : -1), 0, n - 1)], tx = q[0] - p[0], ty = q[1] - p[1], tl = Math.hypot(tx, ty) || 1;
        const ox = -ty / tl * weave * L * .45, oy = tx / tl * weave * L * .45;
        steerTo(a, p[0] + ox, p[1] + oy, dt, 6);
        if (Math.hypot(p[0] - a.x, p[1] - a.y) < L * .7) a.ti++;
        if (a.ti >= n) { if (a.mode === 'out') { const [i] = nearestFood(a), N = food.pts.length; a.mode = 'eat'; a.eatI = ((i + Math.round((rnd() - .5) * N * .5)) % N + N) % N; a.eatLeft = 2 + rnd() * 3; } else { a.mode = gone ? 'done' : 'out'; a.ti = 0; a.carry = false; } }
        if (rnd() < dt * .18) a.pause = .15 + rnd() * .4;
      } else if (a.mode === 'eat') { // walk along the line, stop to bite, then take a crumb home
        const p = food.pts[a.eatI] || food.pts[0]; if (!p) { a.mode = 'home'; a.ti = 0; return go; }
        steerTo(a, p[0], p[1], dt, 7);
        if (Math.hypot(p[0] - a.x, p[1] - a.y) < L * .45) { if (a.pause <= 0 && rnd() < dt * 2.5) a.pause = .5 + rnd() * 1.2; a.eatI = ((a.eatI + (rnd() < .5 ? -1 : 1) * 4) % food.pts.length + food.pts.length) % food.pts.length; }
        if (a.pause > 0) { food.take(a.eatI, dt); a.eatLeft -= dt; }
        if (a.eatLeft <= 0) { a.carry = true; a.mode = 'home'; a.ti = 0; if (trail) { let bi = 0, bd = 1e9; trail.forEach((t, j) => { const d = (t[0] - a.x) ** 2 + (t[1] - a.y) ** 2; if (d < bd) { bd = d; bi = j; } }); a.ti = trail.length - 1 - bi; } }
      } else if (a.mode === 'leave') { steerTo(a, nest[0], nest[1], dt, 6); if (Math.hypot(nest[0] - a.x, nest[1] - a.y) < L) a.mode = 'done'; }
      return go;
    }

    function legs(a, dt, moving) {
      const sp = Math.max(.25, a.v / (4 * L)), stepT = Math.min(.14, .06 / sp + .02);
      for (const lg of a.legs) if (lg.t < 1) { lg.t = Math.min(1, lg.t + dt / stepT); const e = lg.t * lg.t * (3 - 2 * lg.t); lg.foot = [lg.from[0] + (lg.to[0] - lg.from[0]) * e, lg.from[1] + (lg.to[1] - lg.from[1]) * e]; }
      const swinging = g => a.legs.some(l => l.g === g && l.t < 1);
      a.legs.forEach((lg, i) => {
        if (lg.t < 1) return; const rest = world(a, LEGS[i].rest), d = Math.hypot(lg.foot[0] - rest[0], lg.foot[1] - rest[1]);
        if (d > L * .55) { lg.foot = lg.from = lg.to = [rest[0], rest[1]]; lg.t = 1; return; } // fell too far behind: replant
        if (d > L * (moving ? .2 : .32) && !swinging(1 - lg.g)) { const c = Math.cos(a.h), s = Math.sin(a.h), lead = moving ? L * .13 : 0; lg.from = lg.foot; lg.to = [rest[0] + c * lead, rest[1] + s * lead]; lg.t = 0; }
      });
    }

    function update(dt) {
      dt = Math.min(dt, .05);
      spawnT -= dt;
      if (!gone && food.pts.length) {
        if (!scoutOut) { ants.push(make(true)); scoutOut = true; }
        else if (trail && ants.length < max && spawnT <= 0) { ants.push(make(false)); spawnT = .5 + rnd() * 1.4; } // recruits follow once a trail exists
      }
      for (const a of ants) {
        if (a.mode === 'done') continue;
        const go = think(a, dt);
        const target = go ? a.vmax * (a.mode === 'eat' ? .45 : a.carry ? .9 : 1) : 0;
        a.v += (target - a.v) * Math.min(1, dt * 8);
        a.x += Math.cos(a.h) * a.v * dt; a.y += Math.sin(a.h) * a.v * dt; a.phase += dt * (6 + a.v / L);
        legs(a, dt, a.v > L * .3);
      }
      // head-on meetings: both stop briefly and touch antennae
      for (let i = 0; i < ants.length; i++) for (let j = i + 1; j < ants.length; j++) {
        const a = ants[i], b = ants[j]; if (a.mode === 'done' || b.mode === 'done' || a.meet > 0 || b.meet > 0) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < L * 1.1 && Math.abs(angDiff(a.h, b.h)) > 2.4 && rnd() < .5) { a.meet = b.meet = .35 + rnd() * .3; }
      }
      ants = ants.filter(a => a.mode !== 'done');
    }

    function ik(a, hip, foot, side) { // two-bone leg; of the two possible knees take the one further out from the body
      const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = clamp(Math.hypot(dx, dy), .001, (FEMUR + TIBIA) * L * .999), ang = Math.atan2(dy, dx);
      const cosA = clamp((FEMUR * FEMUR * L * L + d * d - TIBIA * TIBIA * L * L) / (2 * FEMUR * L * d), -1, 1), off = Math.acos(cosA);
      const k1 = [hip[0] + Math.cos(ang + off) * FEMUR * L, hip[1] + Math.sin(ang + off) * FEMUR * L], k2 = [hip[0] + Math.cos(ang - off) * FEMUR * L, hip[1] + Math.sin(ang - off) * FEMUR * L];
      const lat = k => (-(k[0] - a.x) * Math.sin(a.h) + (k[1] - a.y) * Math.cos(a.h)) * side; // signed distance to the body's right
      return lat(k1) > lat(k2) ? k1 : k2;
    }
    function drawAnt(ctx, a) {
      const c = Math.cos(a.h), s = Math.sin(a.h), W = p => [a.x + (p[0] * c - p[1] * s) * L, a.y + (p[0] * s + p[1] * c) * L];
      const ell = (p, rx, ry, fill) => { const q = W(p); ctx.beginPath(); ctx.ellipse(q[0], q[1], rx * L, ry * L, a.h, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };
      // shadow
      ctx.save(); ctx.translate(L * .06, L * .1); ctx.globalAlpha *= .18; ell([.12, 0], .2, .08, '#000'); ell([-.27, 0], .21, .14, '#000'); ell([.38, 0], .12, .1, '#000'); ctx.restore();
      // legs
      ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(.6, L * .045);
      a.legs.forEach((lg, i) => { const hip = W(LEGS[i].hip), side = LEGS[i].hip[1] < 0 ? -1 : 1, kn = ik(a, hip, lg.foot, side);
        const fx = lg.foot[0] - kn[0], fy = lg.foot[1] - kn[1], fl = Math.hypot(fx, fy) || 1, ft = Math.min(fl, TIBIA * L); ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(kn[0], kn[1]); ctx.lineTo(kn[0] + fx / fl * ft, kn[1] + fy / fl * ft); ctx.stroke(); });
      // antennae: elbowed, sweeping, tapping
      ctx.lineWidth = Math.max(.5, L * .035);
      [-1, 1].forEach(sd => { const sw = Math.sin(a.phase * (a.meet > 0 ? 2.4 : 1.1) + sd * 1.3) * .35, base = W([.47, sd * .035]);
        const e = [base[0] + Math.cos(a.h + sd * (.75 + sw)) * L * .2, base[1] + Math.sin(a.h + sd * (.75 + sw)) * L * .2], tipA = a.h + sd * (.15 + sw * .6);
        const t = [e[0] + Math.cos(tipA) * L * .26, e[1] + Math.sin(tipA) * L * .26]; ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(e[0], e[1]); ctx.lineTo(t[0], t[1]); ctx.stroke(); });
      // body: gaster, waist, thorax, head
      const breathe = 1 + Math.sin(a.phase * .7) * .02;
      ell([-.27, 0], .21 * breathe, .145 * breathe, col); ell([-.04, 0], .045, .035, col); ell([.13, 0], .16, .068, col); ell([.39, 0], .115, .1, col);
      ell([-.33, -.05], .07, .04, 'rgba(255,240,220,.16)'); ell([.4, -.03], .04, .025, 'rgba(255,240,220,.14)');
      // mandibles, and a crumb when carrying
      ctx.lineWidth = Math.max(.5, L * .04); [-1, 1].forEach(sd => { const m0 = W([.48, sd * .04]), m1 = W([.55, sd * .015]); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.stroke(); });
      if (a.carry) { const q = W([.6, 0]); ctx.beginPath(); ctx.arc(q[0], q[1], L * .085, 0, TAU); ctx.fillStyle = opt.crumb || '#fbf6ea'; ctx.fill(); }
    }
    function draw(ctx) { ants.forEach(a => drawAnt(ctx, a)); }
    function dismiss() { gone = true; ants.forEach(a => { if (a.mode === 'eat') a.carry = true; a.mode = 'leave'; a.pause = 0; a.meet = 0; }); }
    function stats() { return { ants: ants.length, trail: !!trail }; }
    return { update, draw, dismiss, reset, stats, get ants() { return ants; } };
  }
  G.Ants = { create };
})(typeof window !== 'undefined' ? window : globalThis);
