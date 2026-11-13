import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../facebook-clone/package.json'));
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', e => console.log('ERR', e.message));
for (const [name, url] of process.argv.slice(2).map(a => a.split('='))) {
  await p.goto('http://localhost:8081' + url, { waitUntil: 'networkidle', timeout: 120000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: join(here, 'app', name + '.png') });
  console.log(name, await p.evaluate(() => document.body.innerText.slice(0, 400).replace(/\n+/g, ' | ')));
}
await b.close();
