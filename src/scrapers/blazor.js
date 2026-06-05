import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

// Disco Uruguay usa VTEX — search en /buscar?q={term}, productos en /{slug}/p
async function searchTermDisco(page, term) {
  const url = `https://www.disco.com.uy/buscar?q=${encodeURIComponent(term)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Espera que aparezcan productos o un mensaje de sin resultados
  await page.waitForFunction(() => {
    return document.querySelectorAll('a[href$="/p"]').length > 0
      || document.body.innerText.includes('No encontramos')
      || document.body.innerText.includes('sin resultado');
  }, { timeout: 20000 }).catch(() => {});

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(600, 1000);
  }
  await randomDelay(1000, 1800);

  return page.evaluate(() => {
    // VTEX: product links terminan en /p
    const links = [...document.querySelectorAll('a[href$="/p"]')];
    const bySku = new Map();

    links.forEach((link) => {
      const href = link.href;
      // SKU en VTEX a veces está en data attributes, sino usar el slug como id
      const skuEl = link.closest('[data-product-id]') || link.closest('[data-sku-id]');
      const sku = skuEl?.dataset?.productId || skuEl?.dataset?.skuId || href.replace(/.*\/([^/]+)\/p$/, '$1');
      if (!sku || bySku.has(sku)) return;

      const card = link.closest('article') || link.closest('li')
        || link.closest('[class*="card"]') || link.closest('[class*="product"]')
        || link.parentElement?.parentElement?.parentElement;
      if (!card) return;

      const text = (card.innerText || '').trim();
      const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"], [class*="nombre"]') || link;
      let name = (nameEl.innerText || link.title || link.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
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
      let items;
      try { items = await searchTermDisco(page, term); }
      catch (e) { console.error(`  WARN disco "${term}": ${e.message}`); continue; }

      for (const i of items) {
        if (!i.name) continue;
        const brand = matchedBrand(i.name);
        if (!brand || bySku.has(i.sku)) continue;
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
