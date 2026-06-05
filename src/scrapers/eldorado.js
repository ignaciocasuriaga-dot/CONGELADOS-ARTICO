import { matchedBrand, brandGroup } from '../brands.js';

const ENDPOINT = 'https://www.eldorado.com.uy/api/catalog_system/pub/products/search';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const FALLBACK_TERMS = {
  'artico congelados': ['artico'],
  'helados lekker': ['lekker'],
  'hamburguesa artico': ['artico', 'hamburguesa'],
  'empanadas artico': ['artico', 'empanada'],
  'milanesas artico': ['artico', 'milanesa'],
  'medallones artico': ['artico', 'medallon'],
};

function searchInputsFor(term) {
  const key = String(term ?? '').toLowerCase().trim();
  if (FALLBACK_TERMS[key]) return FALLBACK_TERMS[key];
  if (/\s/.test(key)) return [key.split(/\s+/).sort((a, b) => b.length - a.length)[0]];
  return [key];
}

function offerFrom(product) {
  const item = product.items?.[0];
  const seller = item?.sellers?.find((s) => s.sellerDefault) ?? item?.sellers?.[0];
  return {
    sku: item?.itemId ?? product.productId,
    name: item?.nameComplete ?? item?.name ?? product.productName,
    price: seller?.commertialOffer?.Price ?? null,
    listPrice: seller?.commertialOffer?.ListPrice ?? null,
    url: product.link ?? (product.linkText ? `https://www.eldorado.com.uy/${product.linkText}/p` : null),
  };
}

async function searchTerm(term) {
  const url = new URL(ENDPOINT);
  url.searchParams.set('ft', term);
  url.searchParams.set('_from', '0');
  url.searchParams.set('_to', '49');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeElDorado(terms) {
  const bySku = new Map();
  const searched = new Set();
  for (const rawTerm of terms) {
    const inputs = searchInputsFor(rawTerm);
    for (const term of inputs) {
      if (!term || searched.has(term)) continue;
      searched.add(term);

      let products;
      try { products = await searchTerm(term); }
      catch (e) { console.error(`  WARN eldorado "${term}": ${e.message}`); continue; }

      for (const product of products) {
        const base = offerFrom(product);
        const haystack = `${product.brand ?? ''} ${product.productName ?? ''} ${base.name ?? ''} ${(product.categories ?? []).join(' ')}`;
        const brand = matchedBrand(haystack);
        if (!brand || bySku.has(base.sku)) continue;
        bySku.set(base.sku, {
          super: 'eldorado',
          sku: base.sku,
          name: base.name,
          brand,
          group: brandGroup(brand),
          price: base.price,
          listPrice: base.listPrice,
          currency: 'UYU',
          url: base.url,
        });
      }
    }
  }
  return [...bySku.values()];
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { SEARCH_TERMS } = await import('../brands.js');
  scrapeElDorado(SEARCH_TERMS).then((items) => {
    console.log(JSON.stringify(items, null, 2));
    console.error(`OK El Dorado: ${items.length} productos`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
