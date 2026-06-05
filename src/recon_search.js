import { launchBrowser, randomDelay } from './browser.js';
import { mkdir, writeFile } from 'node:fs/promises';

const TARGETS = [
  { name: 'tiendainglesa', home: 'https://www.tiendainglesa.com.uy/supermercado', searchInput: 'input[type="search"], input[placeholder*="usca" i], input[name*="search" i], input[name*="q" i]' },
  { name: 'disco',         home: 'https://www.disco.com.uy',                       searchInput: 'input[type="search"], input[placeholder*="usca" i], input[name*="search" i]' },
  { name: 'eldorado',      home: 'https://www.eldorado.com.uy',                    searchInput: 'input[type="search"], input[placeholder*="usca" i], input[name*="search" i]' },
];

const SKIP = [/\.(png|jpe?g|webp|svg|gif|ico|woff2?|ttf|css|js|map)(\?|$)/i, /analytics|googletagmanager|facebook\.net|hotjar|clarity\.ms|doubleclick|pixel/i];

function interesting(url) {
  if (SKIP.some((rx) => rx.test(url))) return false;
  return /\/(api|graphql|search|buscar|catalog|product|sku|price)/i.test(url);
}

async function recon({ name, home, searchInput }) {
  console.log(`\n========== ${name.toUpperCase()} - buscar 'bimbo' ==========`);
  const { browser, context } = await launchBrowser({ headless: true });
  const page = await context.newPage();

  const reqs = [];
  page.on('request', (r) => { if (interesting(r.url())) reqs.push({ method: r.method(), url: r.url(), postData: r.postData()?.slice(0, 400) ?? null }); });

  const resps = [];
  page.on('response', async (r) => {
    if (!interesting(r.url())) return;
    const ct = r.headers()['content-type'] || '';
    if (!/json|graphql/i.test(ct)) return;
    try {
      const body = await r.text();
      resps.push({ url: r.url(), status: r.status(), bodyPreview: body.slice(0, 2000), bodyLength: body.length });
    } catch {}
  });

  try {
    console.log(`  → ir a ${home}`);
    await page.goto(home, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(3500, 5500);

    // Intentar encontrar el input de búsqueda
    console.log('  → localizar buscador');
    const input = page.locator(searchInput).first();
    await input.waitFor({ timeout: 15000 });

    console.log('  → escribir "bimbo"');
    await input.click();
    await page.keyboard.type('bimbo', { delay: 120 });
    await randomDelay(1500, 2500);
    await page.keyboard.press('Enter');
    await randomDelay(5000, 8000);

    // Scroll para forzar carga de productos
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await randomDelay(800, 1500);
    }

    console.log('  → URL final:', page.url());
    console.log(`  ✓ ${reqs.length} requests | ${resps.length} JSON responses`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  } finally {
    const html = await page.content().catch(() => '');
    await mkdir(`data/recon_search`, { recursive: true });
    await writeFile(`data/recon_search/${name}.html`, html);
    await writeFile(`data/recon_search/${name}.json`, JSON.stringify({ requests: reqs, responses: resps, finalUrl: page.url() }, null, 2));
    await browser.close();
  }
}

for (const t of TARGETS) await recon(t);
console.log('\n✓ Recon de búsqueda completo. Mirá data/recon_search/');
