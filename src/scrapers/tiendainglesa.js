import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

async function searchTermTI(page, term) {
  // Tienda Inglesa — probamos dos patrones de URL
  const urls = [
    `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(term)},0`,
    `https://www.tiendainglesa.com.uy/busqueda?q=${encodeURIComponent(term)}`,
  ];

  let loaded = false;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // Espera productos o mensaje vacío
      await page.waitForFunction(() => {
        return document.querySelectorAll('a[href*=".producto"], a[href*="/product"]').length > 0
          || document.body.innerText.length > 500;
      }, { timeout: 15000 }).catch(() => {});
      loaded = true;
      break;
    } catch { /* intenta siguiente URL */ }
  }
  if (!loaded) return [];

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(600, 1000);
  }
  await randomDelay(1000, 2000);

  return page.evaluate(() => {
    const bySku = new Map();

    // Selector 1: URL con .producto?{sku}
    document.querySelectorAll('a[href*=".producto"]').forEach((link) => {
      const m = link.getAttribute('href')?.match(/\.producto\?(\d+)/);
      if (!m) return;
      const sku = m[1];
      if (bySku.has(sku)) return;

      const card = link.closest('article') || link.closest('li')
        || link.closest('[class*="card"]') || link.closest('[class*="producto"]')
        || link.closest('[class*="item"]') || link.parentElement?.parentElement;
      const text = (card?.innerText || link.innerText || '').trim();

      let name = link.getAttribute('title') || link.querySelector('img')?.getAttribute('alt') || '';
      if (!name) {
        const nameEl = card?.querySelector('h2, h3, h4, [class*="nombre"], [class*="title"], [class*="name"]');
        name = (nameEl?.innerText || text.split('\n')[0] || '').trim();
      }
      name = name.replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3) return;

      const priceMatches = text.match(/\$\s*[\d.]+,?\d*/g) || [];
      const prices = priceMatches
        .map((m) => Number(m.replace(/[^\d,]/g, '').replace(',', '.')))
        .filter((n) => n > 0 && n < 100000);

      bySku.set(sku, {
        sku, name,
        price: prices.length ? Math.min(...prices) : null,
        listPrice: prices.length > 1 ? Math.max(...prices) : null,
        url: new URL(link.getAttribute('href'), location.origin).toString(),
      });
    });

    // Selector 2: si TI tiene URLs tipo /product/
    document.querySelectorAll('a[href*="/product"]').forEach((link) => {
      const href = link.href;
      const skuMatch = href.match(/\/product[s]?\/[^/]+\/(\d+)/);
      if (!skuMatch) return;
      const sku = skuMatch[1];
      if (bySku.has(sku)) return;

      const card = link.closest('article') || link.closest('li')
        || link.closest('[class*="card"]') || link.parentElement?.parentElement;
      const text = (card?.innerText || '').trim();
      const nameEl = card?.querySelector('h2, h3, h4, [class*="name"], [class*="title"]') || link;
      const name = (nameEl.innerText || '').trim().replace(/\s+/g, ' ');
      if (!name || name.length < 3) return;

      const prices = (text.match(/\$\s*[\d.,]+/g) || [])
        .map((m) => Number(m.replace(/[^\d,]/g, '').replace(',', '.')))
        .filter((n) => n > 0 && n < 100000);

      bySku.set(sku, {
        sku, name,
        price: prices.length ? Math.min(...prices) : null,
        listPrice: prices.length > 1 ? Math.max(...prices) : null,
        url: href,
      });
    });

    return [...bySku.values()];
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
        if (!brand || bySku.has(i.sku)) continue;
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
