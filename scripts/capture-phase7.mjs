// Phase 7 local visual review capture. Renders the public and signed-out
// screens from the built app without any database or account access.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const APP = process.env.REVIEW_APP_URL || 'http://localhost:4173';
const OUT = process.env.REVIEW_OUT || '.hallmark/review/phase7';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function capture(label, viewport, routes) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const [path, name, fullPage = true] of routes) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /close/i }).click();
      await dialog.waitFor({ state: 'hidden' }).catch(() => {});
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage });
  }
  await context.close();
}

const routes = [
  ['/', 'home'],
  ['/#how-works', 'home-how-it-works', false],
  ['/#materials', 'home-materials', false],
  ['/signin', 'signin'],
  ['/signup', 'signup'],
  ['/forgot-password', 'forgot-password'],
];

await capture('desktop', { width: 1440, height: 900 }, routes);
await capture('phone', { width: 390, height: 844 }, routes);
await capture('tablet', { width: 768, height: 1024 }, [
  ['/', 'home'],
  ['/signin', 'signin'],
]);

await browser.close();
console.log('Phase 7 screenshots written to', OUT);
