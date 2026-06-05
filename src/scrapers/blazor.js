import { launchBrowser, randomDelay } from '../browser.js';
import { matchedBrand, brandGroup } from '../brands.js';

// Disco: https://www.disco.com.uy/productos/keyword/ARTICO
// Intercepta las respuestas de red JSON que hace el browser al renderizar la página
// (bypassa el problema de selectores DOM y Cloudflare JS challenge)
async function searchTermDisco(page, term) {
  const intercepted = [];

  // Capturar respuestas JSON del browser (llamadas internas de la SPA)
  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    if (!/search|product|catalog|keyword|busca/i.test(url)) return;
    try {
      const data = await response.json();
      intercepted.push({ url, data });
    } catch { /* no es JSON válido */ }
  });

  try {
    await page.goto(
      `https://www.disco.com.uy/productos/keyword/${encodeURIComponent(term)}`,
      { waitUntil: 'networkidle', timeout: 45000 }
    );
  } catch { /* timeout parcial — igual procesamos lo interceptado */ }

  await randomDelay(2000, 3000);

  // Procesar datos interceptados
  const products = [];
  for (const { data } of intercepted) {
    // VTEX catalog API: array de productos
    if (Array.isArray(data)) {
      products.push(...data);
    }
    // VTEX Intelligent Search: { products: [...] }
    if (data?.products && Array.isArray(data.products)) {
      products.push(...data.products);
    }
    // VTEX search: { data: { productSearch: { products: [...] } } }
    const ps = data?.data?.productSearch?.products || data?.data?.search?.products?.edges;
    if (Array.isArray(ps)) products.push(...ps);
  }

  // Si no interceptamos nada, intentar scraping DOM con múltiples selectores
  if (products.length === 0) {
    const domItems = await page.evaluate(() => {
      const results = [];
      // VTEX: links terminan en /p
      document.querySelectorAll('a[href$="/p"], a[href*="/p?"]').forEach(link => {
        const card = link.closest('article') || link.closest('li') || link.closest('[class*="product"]') || link.closest('[class*="card"]') || link.parentElement?.parentElement;
        const text = (card?.innerText || '').trim();
        const nameEl = card?.querySelector('span[class*="productName"], h2, h3, h4, [class*="name"], [class*="title"]') || link;
        const name = (nameEl.innerText || link.title || '').trim().replace(/\s+/g, ' ');
        if (!name || name.length < 3) return;
        const prices = (text.match(/\$\s*[\d.,]+/g) || []).map(m => Number(m.replace(/[^\d,]/g, '').replace(',', '.'))).filter(n => n > 0 && n < 100000);
        const sku = link.href.replace(/.*\/([^/]+)\/p.*/, '$1');
        if (sku) results.push({ sku, name, price: prices.length ? Math.min(...prices) : null, listPrice: prices.length > 1 ? Math.max(...prices) : null, url: link.href });
      });
      return results;
    });
    return domItems;
  }

  // Normalizar productos interceptados al formato esperado
  return products.map(p => {
    // VTEX catalog format
    if (p.items) {
      const item = p.items[0];
      const seller = item?.sellers?.find(s => s.sellerDefault) ?? item?.sellers?.[0];
      return {
        sku: item?.itemId ?? p.productId,
        name: item?.nameComplete ?? item?.name ?? p.productName ?? '',
        price: seller?.commertialOffer?.Price ?? null,
        listPrice: seller?.commertialOffer?.ListPrice ?? null,
        url: p.link ?? null,
      };
    }
    // VTEX IS format
    return {
      sku: p.productId ?? p.sku ?? p.id ?? String(Math.random()),
      name: p.productName ?? p.name ?? '',
      price: p.price ?? p.priceRange?.sellingPrice?.lowPrice ?? null,
      listPrice: p.listPrice ?? p.priceRange?.listPrice?.lowPrice ?? null,
      url: p.link ?? p.linkText ?? null,
    };
  }).filter(p => p.name && p.name.length > 2);
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
        if (!i.name || !i.sku || bySku.has(String(i.sku))) continue;
        let brand = matchedBrand(i.name);
        if (!brand) brand = matchedBrand(term);
        if (!brand) continue;
        bySku.set(String(i.sku), {
          super: 'disco',
          sku: String(i.sku),
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
