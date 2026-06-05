import { launchBrowser, randomDelay } from './browser.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const TARGETS = [
  { name: 'tata',           home: 'https://www.tata.com.uy',           explore: 'https://www.tata.com.uy/almacen' },
  { name: 'disco',          home: 'https://www.disco.com.uy',          explore: 'https://www.disco.com.uy/almacen' },
  { name: 'eldorado',       home: 'https://www.eldorado.com.uy',       explore: 'https://www.eldorado.com.uy' },
  { name: 'tiendainglesa',  home: 'https://www.tiendainglesa.com.uy',  explore: 'https://www.tiendainglesa.com.uy/supermercado' },
];

const SKIP_PATTERNS = [
  /\.(png|jpe?g|webp|svg|gif|ico|woff2?|ttf|css|js|map)(\?|$)/i,
  /google-analytics|googletagmanager|facebook\.net|hotjar|clarity\.ms|doubleclick/i,
];

function isInteresting(url) {
  if (SKIP_PATTERNS.some((rx) => rx.test(url))) return false;
  return /\/(api|graphql|catalog|search|products?|sku|price)/i.test(url);
}

async function reconSite({ name, home, explore }) {
  console.log(`\n========== ${name.toUpperCase()} ==========`);
  const { browser, context } = await launchBrowser({ headless: true });
  const page = await context.newPage();

  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (!isInteresting(url)) return;
    requests.push({
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      postData: req.postData()?.slice(0, 500) ?? null,
    });
  });

  const responses = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!isInteresting(url)) return;
    const ct = res.headers()['content-type'] || '';
    if (!/json|graphql/i.test(ct)) return;
    try {
      const body = await res.text();
      responses.push({
        url,
        status: res.status(),
        contentType: ct,
        bodyPreview: body.slice(0, 1500),
        bodyLength: body.length,
      });
    } catch {}
  });

  try {
    console.log(`  → home: ${home}`);
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(2500, 4500);

    console.log(`  → explore: ${explore}`);
    await page.goto(explore, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(3500, 6000);

    // Scrolling to trigger lazy-loaded products
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await randomDelay(800, 1600);
    }

    console.log(`  ✓ captured ${requests.length} requests, ${responses.length} JSON responses`);
  } catch (err) {
    console.error(`  ✗ error on ${name}:`, err.message);
  } finally {
    await browser.close();
  }

  const reportPath = `data/recon/${name}.json`;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ requests, responses }, null, 2));
  console.log(`  → saved ${reportPath}`);

  // Quick summary
  const apiUrls = new Set(requests.filter((r) => /\/(api|graphql)/i.test(r.url)).map((r) => new URL(r.url).pathname));
  if (apiUrls.size) {
    console.log(`  endpoints únicos:`);
    for (const p of [...apiUrls].slice(0, 15)) console.log(`    ${p}`);
  }
}

for (const target of TARGETS) {
  await reconSite(target);
}

console.log('\n✓ Recon completo. Revisá data/recon/*.json para ver las APIs reales.');
