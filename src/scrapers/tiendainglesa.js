import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

const SEARCH_URL = (term) => `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(term)},0`;

async function searchTermTI(page, term) {
  await page.goto(SEARCH_URL(term), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('a[href*=".producto"]', { timeout: 25000 }).catch(() => {});
  await randomDelay(1800, 2800);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(600, 1000);
  }

  return page.evaluate(() => {
    const links = document.querySelectorAll('a[href*=".producto"]');
    const bySku = new Map();
    links.forEach((link) => {
      const m = link.getAttribute('href')?.match(/\.producto\?(\d+)/);
      if (!m) return;
      const sku = m[1];
      const card =
        link.closest('article') || link.closest('li') ||
        link.closest('[class*="card"]') || link.closest('[class*="producto"]') ||
        link.closest('[class*="item"]') || link.parentElement?.parentElement;
      if (!card) return;

      const text = (card.innerText || '').trim();
      const existing = bySku.get(sku);
      if (existing && existing.cardText.length >= text.length) return;

      let name = link.getAttribute('title') || link.querySelector('img')?.getAttribute('alt') || '';
      if (!name) {
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        name = lines[0] || '';
      }
      name = name.replace(/\s+/g, ' ').trim();

      const priceMatches = text.match(/\$\s*[\d.]+,?\d*/g) || [];
      const prices = priceMatches
        .map((m) => Number(m.replace(/[^\d,]/g, '').replace(',', '.')))
        .filter((n) => n > 0 && n < 100000);

      const url = new URL(link.getAttribute('href'), location.origin).toString();
      const imgEl = card.querySelector('img');
      const image = imgEl?.src || imgEl?.getAttribute('data-src') || null;

      bySku.set(sku, {
        sku, name,
        price: prices.length ? Math.min(...prices) : null,
        listPrice: prices.length > 1 ? Math.max(...prices) : null,
        url, image, cardText: text,
      });
    });
    return [...bySku.values()].map(({ cardText, ...rest }) => rest);
  });
}

export async function scrapeTiendaInglesa(terms) {
  const { browser, context } = await launchBrowser({ headless: true });
  const page = await context.newPage();
  const bySku = new Map();
  try {
    for (const term of terms) {
      let items;
      try { items = await searchTermTI(page, term); }
      catch (e) { console.error(`  ⚠ ti "${term}": ${e.message}`); continue; }

      for (const i of items) {
        if (!i.name) continue;
        const brand = matchedBrand(i.name);
        if (!brand) continue;
        if (bySku.has(i.sku)) continue;
        bySku.set(i.sku, {
          super: 'tiendainglesa',
          sku: i.sku,
          name: i.name,
          brand,
          group: brandGroup(brand),
          price: i.price,
          listPrice: i.listPrice,
          currency: 'UYU',
          url: i.url,
        });
      }
    }
    return [...bySku.values()];
  } finally {
    await browser.close();
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { SEARCH_TERMS } = await import('../brands.js');
  scrapeTiendaInglesa(SEARCH_TERMS).then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`✓ TI: ${items.length} productos`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
