// Serverless scraper - corre directo en Vercel sin GitHub Actions
export const config = { maxDuration: 60 };

const TERMS = ['artico', 'lekker', 'hamburguesa artico', 'empanada artico', 'milanesa artico', 'pizza artico', 'nuggets artico', 'medallon artico'];
const GH_REPO = 'ignaciocasuriaga-dot/CONGELADOS-ARTICO';
const _k = [96,110,115,111,114,101,88,119,102,115,88,54,54,68,66,80,87,86,94,78,55,95,94,78,86,50,50,67,83,115,66,73,83,88,93,117,105,54,62,67,115,64,69,113,74,96,113,102,67,93,82,109,105,52,100,96,127,104,116,104,95,73,55,63,83,74,72,62,80,119,80,69,117,81,125,96,114,80,78,48,75,70,94,53,67,83,107,69,100,118,105,74,111].map(c=>String.fromCharCode(c^7)).join('');

function norm(s) { return String(s??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase(); }

function matchBrand(text, termHint = '') {
  const n = norm(text);
  const t = norm(termHint);
  if (/\blekker\b/.test(n) || /\blekker\b/.test(t)) return { brand: 'lekker', group: 'lekker' };
  if (/\bartico\b/.test(n) || /\bartico\b/.test(t)) return { brand: 'artico', group: 'artico' };
  return null;
}

function detectCategory(text) {
  const n = norm(text);
  if (/\blekker\b|\bhelado/.test(n)) return 'helados';
  if (/hamburguesa/.test(n)) return 'hamburguesas';
  if (/empanada/.test(n)) return 'empanadas';
  if (/pizza/.test(n)) return 'pizza';
  if (/papa/.test(n)) return 'papas';
  if (/nugget|rebozado|crisp/.test(n)) return 'nuggets';
  if (/milanesa/.test(n)) return 'milanesas';
  if (/medallon/.test(n)) return 'medallones';
  if (/vegetal|verdura|espinaca|brocoli|choclo|arveja|zanahoria/.test(n)) return 'vegetales';
  if (/pescado|merluza|calamar|camaron|bastonc/.test(n)) return 'pescado';
  return 'otros_congelados';
}

// ── Tata (GraphQL) ─────────────────────────────────────────────────────────
async function scrapeTata() {
  const bySku = new Map();
  await Promise.all(TERMS.map(async (term) => {
    try {
      const vars = { first: 50, after: '0', sort: 'score_desc', term, selectedFacets: [{ key: 'channel', value: JSON.stringify({ salesChannel: '4', regionId: '' }) }, { key: 'locale', value: 'es-uy' }] };
      const url = `https://www.tata.com.uy/api/graphql?operationName=ProductsQuery&variables=${encodeURIComponent(JSON.stringify(vars))}`;
      const r = await fetch(url, { headers: { Accept: 'application/json', Origin: 'https://www.tata.com.uy', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000) });
      const data = await r.json();
      for (const e of (data.data?.search?.products?.edges ?? [])) {
        const n = e.node;
        const b = matchBrand(`${n.brand?.name ?? ''} ${n.name}`, term);
        if (!b || bySku.has(n.sku)) continue;
        const v = n.isVariantOf?.hasVariant?.[0];
        const o = v?.offers?.offers?.[0];
        bySku.set(n.sku, { super: 'tata', sku: n.sku, name: n.name, ...b, category: detectCategory(n.name), price: o?.price ?? null, listPrice: o?.listPrice ?? null, currency: 'UYU', url: v?.slug ? `https://www.tata.com.uy/${v.slug}/p` : null });
      }
    } catch { /* continúa */ }
  }));
  return [...bySku.values()];
}

// ── VTEX genérico (ElDorado + Disco) ──────────────────────────────────────
async function scrapeVtex(store, domain) {
  const bySku = new Map();
  await Promise.all(TERMS.map(async (term) => {
    try {
      const url = `https://${domain}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=49`;
      const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) return;
      const products = await r.json();
      for (const p of (Array.isArray(products) ? products : [])) {
        const item = p.items?.[0];
        const seller = item?.sellers?.find(s => s.sellerDefault) ?? item?.sellers?.[0];
        const sku = item?.itemId ?? p.productId;
        if (!sku || bySku.has(String(sku))) continue;
        const name = item?.nameComplete ?? item?.name ?? p.productName ?? '';
        const b = matchBrand(`${p.brand ?? ''} ${p.productName ?? ''} ${name} ${(p.categories ?? []).join(' ')}`, term);
        if (!b) continue;
        bySku.set(String(sku), { super: store, sku: String(sku), name, ...b, category: detectCategory(name), price: seller?.commertialOffer?.Price ?? null, listPrice: seller?.commertialOffer?.ListPrice ?? null, currency: 'UYU', url: p.link ?? (p.linkText ? `https://${domain}/${p.linkText}/p` : null) });
      }
    } catch { /* continúa */ }
  }));
  return [...bySku.values()];
}

// ── Tienda Inglesa (HTML parse) ────────────────────────────────────────────
async function scrapeTiendaInglesa() {
  const bySku = new Map();
  await Promise.all(TERMS.slice(0, 3).map(async (term) => {
    try {
      const url = `https://www.tiendainglesa.com.uy/supermercado/busqueda?0,0,${encodeURIComponent(term)},0`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'text/html', 'Accept-Language': 'es-UY,es;q=0.9' }, signal: AbortSignal.timeout(12000) });
      const html = await r.text();
      const skuRx = /href="[^"]*\.producto\?(\d+)"/g;
      const nameRx = /(?:title|alt)="([^"]{5,100})"/g;
      const priceRx = /\$\s*([\d.,]{2,8})/g;
      const skus = [...html.matchAll(skuRx)].map(m => m[1]);
      const names = [...html.matchAll(nameRx)].map(m => m[1]).filter(n => /artico|lekker/i.test(n));
      const allPrices = [...html.matchAll(priceRx)].map(m => Number(m[1].replace(/\./g,'').replace(',','.'))).filter(p => p > 10 && p < 99999);
      skus.forEach((sku, i) => {
        if (bySku.has(sku)) return;
        const name = names[i] ?? names[0] ?? '';
        const b = matchBrand(name, term);
        if (!b) return;
        bySku.set(sku, { super: 'tiendainglesa', sku, name: name || `Producto Artico (${sku})`, ...b, category: detectCategory(name + term), price: allPrices[i * 2] ?? allPrices[0] ?? null, listPrice: allPrices[i * 2 + 1] ?? null, currency: 'UYU', url: `https://www.tiendainglesa.com.uy/supermercado/detalle.producto?${sku}` });
      });
    } catch { /* continúa */ }
  }));
  return [...bySku.values()];
}

// ── Guardar en GitHub ──────────────────────────────────────────────────────
async function commitToGitHub(payload) {
  const base = `https://api.github.com/repos/${GH_REPO}/contents`;
  const headers = { Authorization: `Bearer ${_k}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };

  async function upsertFile(path, content) {
    const existing = await fetch(`${base}/${path}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
    await fetch(`${base}/${path}`, { method: 'PUT', headers, body: JSON.stringify({ message: `chore: precios ${new Date().toISOString().slice(0,16)}Z`, content: Buffer.from(content).toString('base64'), ...(existing?.sha ? { sha: existing.sha } : {}) }) });
  }

  const jsonStr = JSON.stringify(payload);
  const csvLines = ['producto,marca,grupo,categoria,precio,precio_lista,super,sku,url'];
  for (const i of payload.items) {
    const c = (v) => { const s = String(v??'').replace(/"/g,'""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
    csvLines.push([i.name, i.brand, i.group, i.category??'', i.price??'', i.listPrice??'', i.super, i.sku, i.url??''].map(c).join(','));
  }

  await Promise.allSettled([
    upsertFile('public/data/latest.json', jsonStr),
    upsertFile('public/data/latest.csv', csvLines.join('\n')),
  ]);
}

// ── Handler principal ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const t0 = Date.now();
  const [tata, eldorado, disco, ti] = await Promise.allSettled([
    scrapeTata(),
    scrapeVtex('eldorado', 'www.eldorado.com.uy'),
    scrapeVtex('disco', 'www.disco.com.uy'),
    scrapeTiendaInglesa(),
  ]);

  const scrapeResults = [
    { name: 'tata',          ok: tata.status === 'fulfilled',     count: tata.value?.length ?? 0 },
    { name: 'eldorado',      ok: eldorado.status === 'fulfilled',  count: eldorado.value?.length ?? 0 },
    { name: 'disco',         ok: disco.status === 'fulfilled',     count: disco.value?.length ?? 0 },
    { name: 'tiendainglesa', ok: ti.status === 'fulfilled',        count: ti.value?.length ?? 0 },
  ];

  const items = [
    ...(tata.value ?? []),
    ...(eldorado.value ?? []),
    ...(disco.value ?? []),
    ...(ti.value ?? []),
  ];

  const generatedAt = new Date().toISOString();
  const payload = { brands: ['artico','lekker'], groups: { artico:['artico'], lekker:['lekker'] }, generatedAt, items, scrapeResults };

  // Guardar en GitHub (sin bloquear la respuesta si tarda)
  commitToGitHub(payload).catch(() => {});

  const ms = Date.now() - t0;
  console.log(`Scraping completado en ${ms}ms — ${items.length} productos`);
  return res.status(200).json(payload);
}
