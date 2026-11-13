// node explore.mjs <prefix> '<json steps>'  steps: [["goto","/x"],["click","text"],["role","button","name"],["wait",ms],["shot","name"],["type","text"],["scroll",selectorText,dy]]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../facebook-clone/package.json'));
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles' });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
const steps = JSON.parse(process.argv[2]);
for (const s of steps) {
  const [k, a, c] = s;
  try {
    if (k === 'goto') { await p.goto('http://127.0.0.1:8090' + a, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); }
    else if (k === 'click') { await p.getByText(a, { exact: c !== 'loose' }).first().click(); await p.waitForTimeout(700); }
    else if (k === 'label') { await p.getByLabel(a, { exact: true }).first().click(); await p.waitForTimeout(700); }
    else if (k === 'textlast') { await p.getByText(a, { exact: true }).last().click(); await p.waitForTimeout(700); }
    else if (k === 'rolelast') { await p.getByRole(a, { name: c, exact: true }).last().click(); await p.waitForTimeout(700); }
    else if (k === 'role') { await p.getByRole(a, { name: c }).first().click(); await p.waitForTimeout(700); }
    else if (k === 'fill') { await p.getByPlaceholder(a).first().fill(c); await p.waitForTimeout(300); }
    else if (k === 'press') { await p.keyboard.press(a); await p.waitForTimeout(500); }
    else if (k === 'wait') await p.waitForTimeout(a);
    else if (k === 'clock') await p.clock.install({ time: new Date(a) });
    else if (k === 'ff') { await p.clock.fastForward(a); await p.waitForTimeout(1500); }
    else if (k === 'typeslow') { await p.getByPlaceholder(a).first().click(); await p.keyboard.type(c, { delay: 90 }); }
    else if (k === 'wheel') { await p.mouse.move(195, 500); await p.mouse.wheel(0, a); await p.waitForTimeout(600); }
    else if (k === 'shot') { await p.screenshot({ path: join(here, 'app', a + '.png') }); console.log('--', a, ':', (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 0)); }
    else if (k === 'url') console.log('URL', p.url());
  } catch (e) { console.log('FAIL', JSON.stringify(s), e.message.split('\n')[0]); }
}
await b.close();
