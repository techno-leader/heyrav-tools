// Screenshots every library entry for the index (thumbs/*.webp via scripts/build.py).
// Run with the library served on :8132.  node scripts/thumbs.js [only-these-shot-names]
const { chromium } = require('/home/my-computer/.npm-global/lib/node_modules/agent-browser/node_modules/playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname), OUT = path.join(ROOT, 'thumbs');
const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'library.json')));
const only = process.argv.slice(2);
const shotName = it => it.shot || it.file.replace(/\.html$/, '').replace(/[\/]/g, '-');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/home/my-computer/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const it of lib.items) {
    const name = shotName(it); if (only.length && !only.includes(name)) continue;
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const c = it.cap || {};
    const url = (it.href || `http://localhost:8132/${it.file}`) + (c.query ? '?' + c.query : '') + (c.state ? '#' + encodeURIComponent(JSON.stringify(c.state)) : '');
    try {
      await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      if (c.click) { await p.waitForTimeout(1500); await p.click(c.click).catch(() => {}); }
      if (c.hash) await p.evaluate(h => { const e = document.getElementById(h); if (e) e.scrollIntoView(); }, c.hash);
      if (c.scroll) await p.evaluate(y => scrollTo(0, y), c.scroll);
      await p.waitForTimeout(c.wait || (it.g === 'hero' || it.href ? 5000 : 2500));
      if (c.eval) { await p.evaluate(c.eval).catch(e => console.log('eval failed', e.message)); await p.waitForTimeout(c.evalWait || 500); }
      if (c.clip === 'stage') await p.evaluate(() => { document.querySelectorAll('.dock,.board-tag,.tl').forEach(e => e.style.visibility = 'hidden'); });
      if (it.hash) { await p.evaluate(h => { const e = document.getElementById(h); if (e) e.scrollIntoView(); }, it.hash); await p.waitForTimeout(2500); }
      const clip = c.clip === 'stage' ? { x: 312, y: Math.round((900 - 1128/1.6)/2), width: 1128, height: Math.round(1128/1.6) } : undefined;
      await p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 150000, clip });
      console.log('ok', name);
    } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); }
    await p.close();
  }
  await b.close();
})();
