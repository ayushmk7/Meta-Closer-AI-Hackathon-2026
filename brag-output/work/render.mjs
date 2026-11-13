// Usage:
//   node render.mjs stills 1.5 12 40.2 ...   -> work/stills/t_<time>.jpg
//   node render.mjs video                    -> work/video.mp4 (silent) + work/sfx.json
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../facebook-clone/package.json'));
const { chromium } = require('playwright-core');

const FPS = 30, DUR = 150;
const page_url = pathToFileURL(join(here, '../composition/index.html')).href;

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto(page_url);
await page.evaluate(() => document.fonts.ready);

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'stills') {
  mkdirSync(join(here, 'stills'), { recursive: true });
  for (const t of rest.map(Number)) {
    // replay from a little earlier so stateful bits (none expected) settle
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: join(here, 'stills', `t_${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 85 });
  }
} else if (mode === 'video') {
  writeFileSync(join(here, 'sfx.json'), JSON.stringify(await page.evaluate(() => window.SFX), null, 1));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(here, 'video.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(FPS * DUR);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('done');
}
await browser.close();
