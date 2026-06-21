// Regenerates the README screenshots from the live app (Meridian Group demo).
// Usage: dev server on :3000, then `node scripts/screenshots.mjs`.
// Captures at 1600x1000 @2x to match the existing 3200x2000 assets.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');

const shots = [
  { view: 'Consolidation', file: '02-consolidation.png' },
  { view: 'IC Transactions', file: '03-ic-transactions.png' },
  { view: 'Projects', file: '04-projects.png' },
];

const settle = (page, ms = 3500) => page.waitForTimeout(ms);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const page = await context.newPage();

  // Landing → load the Meridian Group demo.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Hide the Next.js dev indicator / build overlay so it never lands in a shot.
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
  await page.getByText('Meridian Group', { exact: false }).first().click();

  // Dashboard: the KPI card labels only render once the live consolidation has
  // resolved (loading skeletons are replaced), so gate on one of them.
  await page.getByText('Total Revenue', { exact: false }).first().waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await settle(page, 4500);
  await page.screenshot({ path: path.join(OUT, '01-dashboard.png') });
  console.log('captured 01-dashboard.png');

  for (const { view, file } of shots) {
    await page.locator(`aside nav button:has-text("${view}")`).first().click();
    await page.waitForLoadState('networkidle');
    await settle(page, 3500);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log('captured', file);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
