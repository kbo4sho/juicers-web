// Start `npm run dev` first. Synthetic desktop sanity, not a physical phone benchmark.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 650 } });
  await page.goto('http://127.0.0.1:5173/tests/fixtures/fruit-gallery.html');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => cancelAnimationFrame(window.frame));
  const client = await page.context().newCDPSession(page);
  for (const [cpuSlowdown, count] of [[1, 5], [4, 5], [4, 16]]) {
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown });
    const result = await page.evaluate(async (count) => {
      const renderer = window.renderer;
      const ctx = document.querySelector('canvas').getContext('2d');
      const kinds = ['orange', 'lime', 'berry', 'melon', 'pineapple'];
      const items = Array.from({length: count}, (_, id) => ({ id, kind: kinds[id%5], type: 'fruit',
        x: (id%4+0.5)/4, y: 100+Math.floor(id/4)*100, radius: 30, rotation: id }));
      const frames = [], work = [];
      let previous;
      for (let i = 0; i < 150; i++) {
        const now = await new Promise(requestAnimationFrame);
        if (i > 30) frames.push(now-previous);
        previous = now;
        const start = performance.now();
        ctx.clearRect(0,0,1200,530);
        renderer.render(items,now);
        for (const item of items) renderer.draw(ctx,item,1200);
        if (i > 30) work.push(performance.now()-start);
      }
      const summary = values => {
        values.sort((a,b) => a-b);
        return { median: +values[Math.floor(values.length*0.5)].toFixed(2), p95: +values[Math.floor(values.length*0.95)].toFixed(2) };
      };
      const info = renderer.renderer.info;
      const stats = { frameMs: summary(frames), renderAndCompositeMs: summary(work),
        drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries };
      renderer.render([],0);
      return { ...stats, retainedInstancesAfterClear: renderer.instances.size };
    }, count);
    console.log(JSON.stringify({ cpuSlowdown, fruitCount: count, ...result }));
  }
} finally { await browser.close(); }
