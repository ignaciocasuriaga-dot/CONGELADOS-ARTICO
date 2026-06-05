import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

// Disco Uruguay usa VTEX
// Search: https://www.disco.com.uy/productos/keyword/ARTICO
// Producto: https://www.disco.com.uy/{slug}/p  (VTEX — termina en /p)
async function searchTermDisco(page, term) {
  const url = `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(term)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Esperar que carguen productos VTEX (links terminan en /p) o mensaje vacío
  await page.waitForFunction(() => {
    return document.querySelectorAll('a[href$="/p"]').length > 0
      || document.querySelectorAll('[class*="galleryItem"], [class*="product-item"]').length > 0
      || document.body.innerText.includes('No encontramos')
      || document.body.innerText.includes('sin resultado');
  }, { timeout: 25000 }).catch(() => {});

  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(700, 1200);
  }
  await randomDelay(1500, 2500);

  return page.evaluate(() => {
    const bySku = new Map();

    // VTEX product links terminan en /p
    document.querySelectorAll('a[href$="/p"]').forEach((link) => {
      const href = link.href;
      // Extraer SKU o usar slug como identificador
      const skuEl = link.closest('[data-product-id]') || link.closest('[data-sku-id]');
      const sku = skuEl?.dataset?.productId || skuEl?.dataset?.skuId
        || href.replace(/.*\/([^/]+)\/p(\?.*)?$/, '$1');
      if (!sku || bySku.has(sku)) return;

      const card = link.closest('article') || link.closest('li')
        || link.closest('[class*="galleryItem"]') || link.closest('[class*="product"]')
        || link.closest('[class*="card"]') || link.parentElement?.parentElement;
      if (!card) return;

      const text = (card.innerText || '').trim();
      const nameEl = card.querySelector('span[class*="productName"], h2, h3, h4, [class*="name"], [class*="nombre"], [class*="title"]') || link;
      let name = (nameEl.innerText || link.getAttribute('aria-label') || link.title || '').trim().replace(/\s+/g, ' ');
      if (!name || name.length < 3) return;

      const priceMatches = text.match(/\$\s*[\d.,]+/g) || [];
      const prices = priceMatches
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

export async function scrapeDisco(terms) {
  const { browser, context } = await launchBrowser({ headless: true });
  const page = await context.newPage();
  const bySku = new Map();
  try {
    for (const term of terms) {
      let items = [];
      try { items = await searchTermDisco(page, term); }
      catch (e) { console.error(`  WARN disco "${term}": ${e.message}`); continue; }

      for (const i of items) {
        if (!i.name || bySku.has(i.sku)) continue;
        // Intentar detectar marca por nombre; si no, usar el término de búsqueda como pista
        let brand = matchedBrand(i.name);
        if (!brand) brand = matchedBrand(term); // usa el término si el nombre no tiene la marca
        if (!brand) continue;
        bySku.set(i.sku, {
          super: 'disco',
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
  scrapeDisco(SEARCH_TERMS).then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`OK disco: ${items.length} productos`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
