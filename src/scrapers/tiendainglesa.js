import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

// Tienda Inglesa
// Search: https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,artico,0
// Producto: /supermercado/detalle.producto?{sku}
async function searchTermTI(page, term) {
  const url = `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(term)},0`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForFunction(() => {
    return document.querySelectorAll('a[href*=".producto"]').length > 0
      || document.body.innerText.length > 500;
  }, { timeout: 25000 }).catch(() => {});

  // Scroll para cargar lazy-loaded products
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await randomDelay(700, 1100);
  }
  await randomDelay(1500, 2500);

  return page.evaluate(() => {
    const bySku = new Map();

    document.querySelectorAll('a[href*=".producto"]').forEach((link) => {
      const m = link.getAttribute('href')?.match(/\.producto\?(\d+)/);
      if (!m) return;
      const sku = m[1];
      if (bySku.has(sku)) return;

      const card = link.closest('article') || link.closest('li')
        || link.closest('[class*="card"]') || link.closest('[class*="producto"]')
        || link.closest('[class*="item"]') || link.parentElement?.parentElement;
      const text = (card?.innerText || '').trim();

      // Extraer nombre del producto
      let name = link.getAttribute('title') || '';
      if (!name) name = link.querySelector('img')?.getAttribute('alt') || '';
      if (!name && card) {
        const nameEl = card.querySelector('h2, h3, h4, [class*="nombre"], [class*="title"], [class*="name"], [class*="descripcion"]');
        name = nameEl?.innerText || '';
      }
      if (!name && text) {
        // Tomar primera línea no vacía del card
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3 && !/^\$/.test(l));
        name = lines[0] || '';
      }
      name = name.replace(/\s+/g, ' ').trim();
      if (!name || name.length < 3) return;

      const priceMatches = text.match(/\$\s*[\d.]+(?:,\d+)?/g) || [];
      const prices = priceMatches
        .map((m) => Number(m.replace(/\$/g, '').replace(/\./g, '').replace(',', '.').trim()))
        .filter((n) => n > 10 && n < 100000);

      bySku.set(sku, {
        sku, name,
        price: prices.length ? Math.min(...prices) : null,
        listPrice: prices.length > 1 ? Math.max(...prices) : null,
        url: new URL(link.getAttribute('href'), location.origin).toString(),
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
      let items = [];
      try { items = await searchTermTI(page, term); }
      catch (e) { console.error(`  ⚠ ti "${term}": ${e.message}`); continue; }

      for (const i of items) {
        if (!i.name || bySku.has(i.sku)) continue;
        // Detectar marca por nombre; si no, usar el término de búsqueda como pista
        let brand = matchedBrand(i.name);
        if (!brand) brand = matchedBrand(term);
        if (!brand) continue;
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
