import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

// Disco: https://www.disco.com.uy/productos/keyword/ARTICO
// Producto links: /product/{nombre}/{id}
async function searchTermDisco(page, term) {
  const url = `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(term)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Esperar que aparezcan precios o productos
  await page.waitForFunction(() => {
    const text = document.body.innerText || '';
    const prices = text.match(/\$\s*\d+[.,]?\d*/g) || [];
    return prices.filter(p => !/\$\s*0(\D|$)/.test(p)).length >= 2
      || document.querySelectorAll('a[href*="/product/"]').length > 0;
  }, { timeout: 25000 }).catch(() => {});

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(700, 1200);
  }
  await randomDelay(1500, 2500);

  return page.evaluate(() => {
    const bySku = new Map();
    const links = document.querySelectorAll('a[href*="/product/"]');

    links.forEach((link) => {
      const href = link.href;
      const skuMatch = href.match(/\/product\/[^/]+\/(\d+)/);
      if (!skuMatch) return;
      const sku = skuMatch[1];
      if (bySku.has(sku)) return;

      const card =
        link.closest('article') || link.closest('li') ||
        link.closest('[class*="card"]') || link.closest('[class*="product"]') ||
        link.parentElement?.parentElement?.parentElement;
      if (!card) return;

      const text = (card.innerText || '').trim();
      const existing = bySku.get(sku);
      if (existing && existing.cardText?.length >= text.length) return;

      const nameEl = card.querySelector('h2, h3, h4, [class*="nombre"], [class*="title"], [class*="name"]') || link;
      let name = (nameEl.innerText || link.title || link.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      if (!name || name.length < 3) return;

      const priceMatches = text.match(/\$\s*[\d.,]+/g) || [];
      const prices = priceMatches
        .map(m => Number(m.replace(/[^\d,]/g, '').replace(',', '.')))
        .filter(n => n > 0 && n < 100000);

      bySku.set(sku, {
        sku, name,
        price: prices.length ? Math.min(...prices) : null,
        listPrice: prices.length > 1 ? Math.max(...prices) : null,
        url: href,
        cardText: text,
      });
    });

    return [...bySku.values()].map(({ cardText, ...rest }) => rest);
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
        if (!i.name || !i.sku || bySku.has(i.sku)) continue;
        let brand = matchedBrand(i.name);
        if (!brand) brand = matchedBrand(term);
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
