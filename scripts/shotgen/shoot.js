const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'C:/Users/amfmn/Desktop/finance-global-model/docs/screenshots';
const URL = 'http://localhost:3000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickText(page, text, { exact = false } = {}) {
  const handle = await page.evaluateHandle((text, exact) => {
    const sel = 'button, a, [role=button], li, span, div, h1, h2, h3, p';
    const els = Array.from(document.querySelectorAll(sel));
    const matches = els.filter((e) => {
      const t = (e.textContent || '').trim();
      return exact ? t === text : t.includes(text);
    });
    if (!matches.length) return null;
    matches.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    return matches[0];
  }, text, exact);
  const el = handle.asElement();
  if (!el) throw new Error('clickText not found: ' + text);
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(250);
  await el.click();
  return el;
}

async function waitForText(page, text, timeout = 15000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
    return true;
  } catch {
    console.log('  (timeout waiting for:', text, ')');
    return false;
  }
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
    args: ['--hide-scrollbars', '--force-device-scale-factor=2'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // 1. Landing -> select Meridian Group
  await clickText(page, 'Meridian Group');
  await sleep(2500);

  // 2. Dashboard: loadData runs consolidation on mount -> wait for consolidated revenue
  await waitForText(page, '41.5'); // €41.5M consolidated revenue
  await sleep(2000); // let counters settle
  await shot(page, '01-dashboard');

  // 3. Consolidation view (auto-runs on mount, populates entity columns)
  try {
    await clickText(page, 'Consolidation', { exact: true });
    await waitForText(page, 'MERID'); // real entity column appears
    await sleep(2500);
    await shot(page, '02-consolidation');
  } catch (e) { console.log('consolidation fail', e.message); }

  // 4. IC Transactions
  try {
    await clickText(page, 'IC Transactions', { exact: true });
    await sleep(2500);
    await shot(page, '03-ic-transactions');
  } catch (e) { console.log('ic fail', e.message); }

  // 5. Projects (investment appraisal)
  try {
    await clickText(page, 'Projects', { exact: true });
    await sleep(2500);
    await shot(page, '04-projects');
  } catch (e) { console.log('projects fail', e.message); }

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
