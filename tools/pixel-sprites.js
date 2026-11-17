/* Pixel sprites - the Pixel world's library of characters, props and tiles.
   A sprite is rows of palette letters ('.' is empty); the renderer adds a
   one-pixel outline round the silhouette, so art is drawn as fill and inner
   detail only. Organic shapes (canopies, bushes, clouds, rocks) are built
   from overlapping circles and shaded from the top left. */
(function (G) {
  'use strict';
  const PAL = {
    K: '#14183d', k: '#2a2f5a', W: '#ffffff', w: '#fff7e1', c: '#d7ecff', s: '#a3daff', b: '#4aa3ff', B: '#2f6fd6', v: '#8a6cf0',
    g: '#9be08a', G: '#5bbf63', h: '#3e9a4b', t: '#2b6f3f', T: '#1f5232',
    d: '#c27c45', D: '#9a5b34', e: '#6e3d22', n: '#a8693c', N: '#6b4024', o: '#f08a3c',
    y: '#ffd23f', Y: '#e0a91a', u: '#fff3b0', r: '#e2453a', R: '#a8281d', p: '#f7a6b8', m: '#e2557a',
    l: '#ffd2a8', L: '#e8a77a', a: '#3b2a2e', A: '#5e4246', x: '#a7b0c4', X: '#6e7894', j: '#d3d9e6',
    z: '#1d1c25', Z: '#3a394a', q: '#ffb02e', Q: '#c47a10', '1': '#ffffff',
  };
  /* night: the same letters, darker and bluer, for scenery only */
  const NIGHT = { g: '#3d6b5a', G: '#2c5548', h: '#1f4037', t: '#173229', T: '#10241d', d: '#5a3d36', D: '#45302c', e: '#33231f', w: '#c9c3e8', c: '#59609a', W: '#d6d3f5', x: '#5f6790', X: '#454d78', j: '#7c84b0', s: '#2a3270' };

  /* ---------- shaped sprites: circles, shaded ---------- */
  function blob(w, h, circles, base, light, dark) {
    const m = Array.from({ length: h }, () => Array(w).fill('.'));
    const inside = (x, y) => circles.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + .5, y + .5)) m[y][x] = base;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m[y][x] === '.') continue;
      const up = y === 0 || m[y - 1][x] === '.' || (y > 1 && m[y - 2][x] === '.'), left = x === 0 || m[y][x - 1] === '.';
      const down = y === h - 1 || m[y + 1][x] === '.' || (y < h - 2 && m[y + 2][x] === '.'), right = x === w - 1 || m[y][x + 1] === '.';
      if (light && (up && (left || (x + y) % 3)) ) m[y][x] = light;
      else if (dark && (down || (right && (x + y) % 2))) m[y][x] = dark;
    }
    return m.map(r => r.join(''));
  }
  const over = (rows, y0, x0, part) => { const out = rows.map(r => [...r]); part.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.' && out[y0 + j] && x0 + i < out[0].length) out[y0 + j][x0 + i] = c; })); return out.map(r => r.join('')); };
  const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
  const flipH = rows => rows.map(r => [...r].reverse().join(''));

  const S = {};
  /* trees, bushes, clouds, rocks */
  S.tree = [over(over(blank(24, 28), 0, 0, blob(24, 20, [[12, 9, 8.5], [6, 12, 6], [18, 12, 6], [12, 14, 7]], 'G', 'g', 'h')), 18, 9, ['nnNNnn', 'nnNnnN', '.nNNn.', '.nNnn.', '.nNnN.', 'nnNnnN', 'nNNnnn', 'NN..NN', '......', '......'].map(r => r))];
  S.pine = [over(blob(16, 26, [[8, 4, 3.2], [8, 9, 5], [8, 15, 6.5], [8, 20, 7.5]], 't', 'h', 'T'), 22, 6, ['nN..', 'nNn.', 'NnN.', 'nNN.'].map(r => r.padEnd(4, '.')))];
  S.bush = [blob(22, 12, [[6, 7, 5.2], [11, 5, 5.5], [16, 7, 5.2], [11, 8.5, 4]], 'G', 'g', 'h')];
  S.bushDark = [blob(18, 10, [[5, 6, 4.4], [9, 4.5, 4.6], [13, 6, 4.4]], 'h', 'G', 't')];
  S.cloud = [blob(34, 14, [[8, 9, 5], [15, 6, 6.5], [23, 7, 6], [28, 10, 4], [16, 10, 5]], 'W', null, 'c')];
  S.cloudSmall = [blob(20, 9, [[5, 6, 3.4], [10, 4, 4.4], [15, 6, 3.6]], 'W', null, 'c')];
  S.rock = [blob(14, 9, [[5, 6, 4], [9, 5, 4.2], [11, 7, 3]], 'x', 'j', 'X')];
  S.stone = [blob(8, 5, [[4, 3.4, 3.4]], 'x', 'j', 'X')];
  S.island = [over(over(blank(34, 18), 4, 0, ['..dDdddDddDdddDdddDddDddDdddDdd..', '.ddDdddDdddeDddddDddDdddeDdDddddd.', '..DdddeDdddDddDdddeDdddDdddDddD..', '....DddDdddeDddDdddDdddDdDdd.....', '......DdddDdddeDdddDddDdd........', '.........DddDdddDdeDdd...........', '............DddDdddD.............', '..............DddD...............', '...............Dd................']), 0, 0,
    ['....gg.g...gg..g..g..gg...g..gg...', '..gGgGggGgGGgGgGGgGgGgGGgGgGgGg...', '.gGGhGGGGhGGGGhGGGhGGGGhGGGhGGGG..', '.hGhhGhhGhhhGhhGhhhGhhGhhhGhhGhh..', '..h..h...h.h...h..h...h..h...h....'])];
  /* small things */
  S.daisy = [['..1.1..', '.11y11.', '..1y1..', '.11.11.', '...G...', '.G.G...', '..GGG..', '...G...']];
  S.blueFlower = [['..b.b..', '.bBwBb.', '..bBb..', '...G.G.', '.G.G...', '..GG...', '...G...']];
  S.pinkFlower = [['.p.p.', 'pmymp', '.ppp.', '..G..', '.GG..', '..G..']];
  S.tuft = [['..g...g...', '.gG..gG.g.', '.GG.gGG.G.', 'hGGhGGhGGh', 'hhGhhGhhGh']];
  S.mushroom = [['..bbbb..', '.bwbbBb.', 'bbbBbwbB', 'BbBBBbBB', '..wwww..', '..wjjw..', '..wjjw..']];
  S.redShroom = [['..rrrr..', '.rwrrRr.', 'rrrRrwrR', 'RrRRRrRR', '..wwww..', '..wjjw..']];
  S.log = [['.nnnnnnnnnnnnnNN.', 'nNnnnNnnnnNnnnduN', 'nnnnNnnnnnnnNnduD', 'NnnnnnnNnnnnnnDdN', '.NNNNNNNNNNNNNNN.']];
  S.sign = [['.nnnnnnnnnnn.', 'nwwwwwwwwwwwn', 'nwKKwKKKwKKwn', 'nwwwwwwwwwwwn', 'nwKKKwKKwKKwn', 'nnnnnnnnnnnnn', '.....nN......', '.....nN......', '.....nN......', '....GnNG.....']];
  S.fence = [['.n....n....n.', 'nNn..nNn..nNn', 'nnnnnnnnnnnnn', 'nNnNNnNnNNnNn', 'nnnnnnnnnnnnn', 'nNn..nNn..nNn', 'nNn..nNn..nNn']];
  S.coin = [['.yyyy.', 'yyuyyY', 'yuyyYY', 'yuyyYY', 'yuyyYY', 'yyyyYY', '.YYYY.'], ['..yy..', '.yuyY.', '.yuyY.', '.yuyY.', '.yuyY.', '.yyYY.', '..YY..'], ['..y...', '..yY..', '..uY..', '..uY..', '..uY..', '..yY..', '..Y...']];
  S.heart = [['.rr.rr.', 'rWrrrrR', 'rrrrrrR', '.rrrrR.', '..rrR..', '...R...']];
  S.star = [['...y...', '..yuy..', 'yyuyyyY', '.yyyyY.', '.yY.yY.', 'yY...YY']];
  S.key = [['.yyy.......', 'yu.yyyyyyyY', 'y..yY..Y.Y.', '.yyY.......']];
  S.egg = [['..ww..', '.wwwj.', 'wwbwwj', 'wwwwbj', 'wbwwwj', '.wwjj.']];
  S.gem = [['..bbb..', '.bWbbB.', 'bWbbbBB', '.bbbBB.', '..bBB..', '...B...']];
  S.bunny = [['.w..w.......', '.wp.wp......', '.ww.ww......', 'wwwwww......', 'wKwwwww.....', 'wwwpwwwww...', '.wwwwwwwwj..', '..wwwwwwwj.w', '..wwjwwjwj..']];
  S.qblock = [['yyyyyyyyyyyyyy', 'yuuuuuuuuuuuuY', 'yuYyKKKKKyyyuY', 'yuyKKyyyKKyyuY', 'yuyyyyyyKKyyuY', 'yuyyyyyKKyyyuY', 'yuyyyyKKyyyyuY', 'yuyyyyKKyyyyuY', 'yuyyyyyyyyyyuY', 'yuyyyyKKyyyyuY', 'yuYyyyyyyyyYuY', 'yYYYYYYYYYYYYY', 'YYYYYYYYYYYYYY']];
  S.brick = [['DdddddDdddddDd', 'DdddddDdddddDd', 'eeeeeeeeeeeeee', 'ddDdddddDddddd', 'ddDdddddDddddd', 'eeeeeeeeeeeeee', 'DdddddDdddddDd', 'DdddddDdddddDd']];
  /* the ground: a tile of grass over earth, repeated */
  S.ground = [['g..g.g..g...g.g.', 'gGgGGgGgGgGGgGgG', 'GGhGGGhGGhGGGhGG', 'hhGhhhhGhhhhGhhh', 'dhdDhdddhdDdhddd', 'dddDddedddDdddde', 'DddddDddDeddddDd', 'ddeDddddddDddedd', 'DdddDdedddddDddd', 'ddDdddddDddeddDd']];

  /* ---------- the explorer: built from parts so frames stay consistent ---------- */
  const HEAD = ['......wwww......', '.....wwwwww.....', '....bbbbbbbb....', '...bbbbbbbbbb...', '..bbBbbbbbbbbb..', '..BBBBBBBBBBBB..', '..aaAllllllaaa..', '.aaAllllllllaaa.', '.aallKllllKllaa.', '.aallKllllKllaa.', '.aalpllllllplaa.', '..aallllRllllaa.', '...LLllllllLL...'];
  const LOOK = ['......wwww......', '.....wwwwww.....', '....bbbbbbbb....', '...bbbbbbbbbb...', '..bbBbbbbbbbbb..', '..BBBBBBBBBBBB..', '..aaaAllllllla..', '.aaaAlllllllll..', '.aaalllKllllKl..', '.aaalllKllllKl..', '.aaallpllllllp..', '..aaallllllRll..', '...aLLlllllLL...'];
  const blink = h => h.map((r, i) => i === 8 ? r.replace(/K/g, 'l') : r);
  const BODY = ['...yyyyyyyyyy...', '..bYyyyyyyyyyYb.', '.bbbbbbbbbbbbbbb', '.bbbBbbbbbbBbbb.', '.lbbbbbbbbbbbbl.', '..BBBBBBBBBBBB..'];
  const WAVE = ['...yyyyyyyyyy.l.', '..bYyyyyyyyyyYb.', '.bbbbbbbbbbbbbb.', '.bbbBbbbbbbBbb..', '.lbbbbbbbbbbbb..', '..BBBBBBBBBBBB..'];
  const UP = ['.l.yyyyyyyyyy.l.', '.bbYyyyyyyyyYbb.', '..bbbbbbbbbbbb..', '..bbBbbbbbbBbb..', '..bbbbbbbbbbbb..', '..BBBBBBBBBBBB..'];
  const LEGS = {
    stand: ['...kkkkkkkkkk...', '...kkkk..kkkk...', '...NNNN..NNNN...'],
    a: ['...kkkkkkkkkk...', '..kkkk....kkk...', '..NNNN....NNN...'],
    b: ['...kkkkkkkkkk...', '...kkk....kkkk..', '...NNN....NNNN..'],
    tuck: ['...kkkkkkkkkk...', '....NNNN.NNNN...', '................'],
  };
  const kid = (head, body, legs, up = 0) => { const f = [...head, ...body, ...legs]; return up ? [...f.slice(up), ...blank(16, up)] : f; };
  S.kid = [
    kid(HEAD, BODY, LEGS.stand), kid(blink(HEAD), BODY, LEGS.stand),            // 0 idle, 1 blink
    kid(LOOK, BODY, LEGS.a), kid(LOOK, BODY, LEGS.stand, 1), kid(LOOK, BODY, LEGS.b), kid(LOOK, BODY, LEGS.stand, 1), // 2-5 walk
    kid(HEAD, UP, LEGS.tuck),                                                  // 6 jump
    over(kid(HEAD, WAVE, LEGS.stand), 11, 14, ['l', 'l']),                     // 7 wave
    kid(blink(HEAD), BODY, LEGS.stand),                                        // 8 sleepy
  ];
  /* ---------- the cat: black, amber eyes ---------- */
  S.cat = [
    ['..........z...z.', '..........zz.zz.', '.z.......zzzzzzz', 'z........zqKzqKz', 'z........zzzzzzz', '.z.......zzzzzz.', '..zzzzzzzzzzzzz.', '..zZZZZZZZZzzzz.', '..zzzzzzzzzzzz..', '..zz.zz...zz.zz.', '..zz.zz...zz.zz.'],
    ['..........z...z.', '..........zz.zz.', '.z.......zzzzzzz', 'z........zqKzqKz', 'z........zzzzzzz', '.z.......zzzzzz.', '..zzzzzzzzzzzzz.', '..zZZZZZZZZzzzz.', '..zzzzzzzzzzzz..', '..zz..z....z..z.', '.zz...z...zz..z.'],
    ['..........z...z.', '..........zz.zz.', 'z........zzzzzzz', '.z.......zqKzqKz', '.z.......zzzzzzz', '..z......zzzzzz.', '..zzzzzzzzzzzzz.', '..zZZZZZZZZzzzz.', '..zzzzzzzzzzzz..', '...z.zz...z.zz..', '...z..zz..z..zz.'],
    ['.........z...z..', '.........zz.zz..', '........zzzzzzz.', '........zqKzqKz.', '........zzzzzzz.', '.........zzzzz..', '........zzzzzz..', '.......zzZZzzz..', '......zzzzzzzz..', 'zzzzzzzzzzzzzz..', '.zzzzzzz.zz.zz..'],
    ['................', '................', '................', '................', '...........z..z.', '..........zzzzz.', '...zzzzzzzzzzzzz', '..zZZZZZZZzQQzQQ', '..zzzzzzzzzzzzz.', '.zzzzzzzzzzzzz..', 'zzzz............'],
  ];
  S.cat = S.cat.map(f => f.map(r => r.padEnd(16, '.').slice(0, 16)));

  /* ---------- rendering ---------- */
  const cache = new Map();
  function canvas(name, frame = 0, opt = {}) {
    const fr = (S[name] || [])[frame % (S[name] || [1]).length]; if (!fr) return null;
    const night = !!opt.night, line = opt.outline === false ? null : (opt.outline || PAL.K), key = name + frame + night + line;
    if (cache.has(key)) return cache.get(key);
    const c = render(fr, opt); cache.set(key, c); return c;
  }
  /* any rows, uncached - for benches */
  function render(fr, opt = {}) {
    const night = !!opt.night, line = opt.outline === false ? null : (opt.outline || PAL.K);
    const h = fr.length, w = Math.max(...fr.map(r => r.length)), pad = line ? 1 : 0;
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2;
    const x = c.getContext('2d'), img = x.createImageData(c.width, c.height), on = (i, j) => fr[j] && fr[j][i] && fr[j][i] !== '.';
    const put = (i, j, hex) => { const o = (j * c.width + i) * 4, n = parseInt(hex.slice(1), 16); img.data[o] = n >> 16; img.data[o + 1] = n >> 8 & 255; img.data[o + 2] = n & 255; img.data[o + 3] = 255; };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = fr[j][i]; if (ch && ch !== '.') put(i + pad, j + pad, (night && NIGHT[ch]) || PAL[ch] || '#ff00ff'); }
    if (line) for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) put(i + pad, j + pad, line);
    x.putImageData(img, 0, 0); return c;
  }
  function draw(ctx, name, frame, x, y, scale = 1, opt = {}) {
    const c = canvas(name, frame, opt); if (!c) return;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (opt.flip) { ctx.translate(x + c.width * scale, y); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0, c.width * scale, c.height * scale); }
    else ctx.drawImage(c, x, y, c.width * scale, c.height * scale);
    ctx.restore();
  }
  const size = (name, frame = 0) => { const fr = S[name] && S[name][frame]; return fr ? { w: Math.max(...fr.map(r => r.length)) + 2, h: fr.length + 2 } : { w: 0, h: 0 }; };
  G.PixelSprites = { PAL, NIGHT, S, canvas, render, draw, size, flipH, names: () => Object.keys(S) };
})(window);
