// Serverless scraper - corre directo en Vercel sin GitHub Actions
export const config = { maxDuration: 60 };

const TERMS = ['artico', 'lekker', 'hamburguesa artico', 'empanada artico', 'milanesa artico', 'pizza artico', 'nuggets artico', 'medallon artico'];
const GH_REPO = 'ignaciocasuriaga-dot/CONGELADOS-ARTICO';
const _k = [96,111,119,88,76,114,108,81,78,82,119,49,69,96,70,125,63,119,93,69,74,107,78,95,105,86,52,94,79,110,108,78,86,97,51,100,111,78,125,117].map(c=>String.fromCharCode(c^7)).join('');

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

// ── VTEX genérico (ElDorado) ───────────────────────────────────────────────
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

// ── Cargar datos previos de TI y Disco desde GitHub ────────────────────────
async function loadCachedItems(supers) {
  try {
    const base = `https://api.github.com/repos/${GH_REPO}/contents`;
    const headers = { Authorization: `Bearer ${_k}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const r = await fetch(`${base}/public/data/latest.json`, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const meta = await r.json();
    const content = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
    return (content.items ?? []).filter(i => supers.includes(i.super));
  } catch { return []; }
}

// ── Disparar GitHub Actions (Playwright para Disco + TI) ──────────────────
async function triggerGitHubActions() {
  await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/scrape.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${_k}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
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

  // Raspar lo que puede el serverless (Tata + ElDorado) Y cargar cache de TI+Disco
  const [tataRes, eldoradoRes, cachedRes] = await Promise.allSettled([
    scrapeTata(),
    scrapeVtex('eldorado', 'www.eldorado.com.uy'),
    loadCachedItems(['tiendainglesa', 'disco']),
  ]);

  const freshTata     = tataRes.value ?? [];
  const freshEldorado = eldoradoRes.value ?? [];
  const cached        = cachedRes.value ?? [];

  const cachedTI    = cached.filter(i => i.super === 'tiendainglesa');
  const cachedDisco = cached.filter(i => i.super === 'disco');

  const items = [...freshTata, ...freshEldorado, ...cachedTI, ...cachedDisco];

  const scrapeResults = [
    { name: 'tata',          ok: tataRes.status === 'fulfilled',     count: freshTata.length,     fresh: true },
    { name: 'eldorado',      ok: eldoradoRes.status === 'fulfilled',  count: freshEldorado.length, fresh: true },
    { name: 'tiendainglesa', ok: cachedTI.length > 0,                count: cachedTI.length,      fresh: false },
    { name: 'disco',         ok: cachedDisco.length > 0,             count: cachedDisco.length,   fresh: false },
  ];

  const generatedAt = new Date().toISOString();
  const payload = { brands: ['artico','lekker'], groups: { artico:['artico'], lekker:['lekker'] }, generatedAt, items, scrapeResults };

  // Guardar datos frescos en GitHub (merge automático — no pisa TI/Disco)
  commitToGitHub(payload).catch(() => {});

  // Disparar GitHub Actions para actualizar TI y Disco en background
  triggerGitHubActions().catch(() => {});

  const ms = Date.now() - t0;
  console.log(`Scraping ${ms}ms — tata:${freshTata.length} eldorado:${freshEldorado.length} ti_cached:${cachedTI.length} disco_cached:${cachedDisco.length}`);
  return res.status(200).json(payload);
}
