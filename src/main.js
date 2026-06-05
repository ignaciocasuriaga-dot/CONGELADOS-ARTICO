import { scrapeTata } from './scrapers/tata.js';
import { scrapeTiendaInglesa } from './scrapers/tiendainglesa.js';
import { scrapeDisco } from './scrapers/blazor.js';
import { scrapeElDorado } from './scrapers/eldorado.js';
import { ALL_BRANDS, BRAND_GROUPS, SEARCH_TERMS } from './brands.js';
import { applySuggestedPrices, suggestedSummary } from './suggested.js';
import { writeFile, mkdir, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SCRAPERS = [
  { name: 'tata',          fn: scrapeTata },
  { name: 'tiendainglesa', fn: scrapeTiendaInglesa },
  { name: 'disco',         fn: scrapeDisco },
  { name: 'eldorado',      fn: scrapeElDorado },
];

async function runOne(name, fn) {
  const t0 = Date.now();
  try {
    const items = await fn(SEARCH_TERMS);
    const ms = Date.now() - t0;
    console.log(`✓ ${name.padEnd(15)} | ${String(items.length).padStart(3)} productos | ${(ms / 1000).toFixed(1)}s`);
    return { name, items, ok: true };
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`✗ ${name.padEnd(15)} | ERROR (${(ms / 1000).toFixed(1)}s): ${err.message}`);
    return { name, items: [], ok: false, error: err.message };
  }
}

console.log(`Buscando ${SEARCH_TERMS.length} terminos de Artico y Lekker (${ALL_BRANDS.length} marcas)\n`);
const results = await Promise.all(SCRAPERS.map((s) => runOne(s.name, s.fn)));
const raw = results.flatMap((r) => r.items).filter(Boolean);
const all = applySuggestedPrices(raw);
const generatedAt = new Date().toISOString();

await mkdir('data/output', { recursive: true });
await mkdir('public/data', { recursive: true });
const stamp = generatedAt.replace(/[:.]/g, '-');
const csvPath = `data/output/artico_${stamp}.csv`;
const jsonPath = `data/output/artico_${stamp}.json`;

function csvCell(value) {
  const s = String(value ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

const headers = [
  'producto',
  'marca',
  'grupo',
  'categoria',
  'precio',
  'precio_lista',
  'pvp_sugerido',
  'gap_pct',
  'estado_sugerido',
  'producto_sugerido',
  'fuente_sugerido',
  'super',
  'sku',
  'url',
];
const csvLines = [headers.join(',')];
const sorted = [...all].sort((a, b) => {
  const k = (x) => `${x.group}|${x.brand}|${x.name.toLowerCase()}|${x.super}`;
  return k(a).localeCompare(k(b), 'es');
});
for (const item of sorted) {
  const row = [
    item.name,
    item.brand,
    item.group,
    item.category ?? '',
    item.price ?? '',
    item.listPrice ?? '',
    item.suggestedPrice ?? '',
    item.gapPct ?? '',
    item.suggestedStatus ?? '',
    item.suggestedProduct ?? '',
    item.suggestedSource ?? '',
    item.super,
    item.sku,
    item.url ?? '',
  ];
  csvLines.push(row.map(csvCell).join(','));
}
await writeFile(csvPath, csvLines.join('\n'));

const payload = {
  brands: ALL_BRANDS,
  groups: BRAND_GROUPS,
  generatedAt,
  items: sorted,
  suggested: suggestedSummary(sorted),
  scrapeResults: results.map(({ name, ok, error, items }) => ({
    name,
    ok,
    error,
    count: items.length,
  })),
};
await writeFile(jsonPath, JSON.stringify(payload, null, 2));

await writeFile('public/data/latest.json', JSON.stringify(payload));
await writeFile('public/data/latest.csv', csvLines.join('\n'));

const historyPath = 'public/data/history.jsonl';
const snapshot = {
  t: generatedAt,
  prices: Object.fromEntries(
    sorted
      .filter((i) => i.price != null)
      .map((i) => [`${i.super}:${i.sku}`, i.price]),
  ),
};
await appendFile(historyPath, JSON.stringify(snapshot) + '\n');

const meta = {};
if (existsSync('public/data/products.json')) {
  try { Object.assign(meta, JSON.parse(await readFile('public/data/products.json', 'utf8'))); } catch {}
}
for (const i of sorted) {
  meta[`${i.super}:${i.sku}`] = {
    name: i.name,
    brand: i.brand,
    group: i.group,
    category: i.category,
    super: i.super,
    sku: i.sku,
    url: i.url,
    suggestedPrice: i.suggestedPrice,
    gapPct: i.gapPct,
    suggestedStatus: i.suggestedStatus,
    suggestedSource: i.suggestedSource,
    suggestedProduct: i.suggestedProduct,
  };
}
await writeFile('public/data/products.json', JSON.stringify(meta));

console.log(`\nTotal: ${all.length} productos`);
console.log(`Archivos: ${csvPath} · ${jsonPath}`);
console.log(`Histórico: ${historyPath} (+1 snapshot)\n`);

console.log('Por grupo:');
const byGroup = {};
for (const i of all) (byGroup[i.group] ??= []).push(i);
for (const [g, items] of Object.entries(byGroup)) {
  console.log(`  ${g.padEnd(12)} | ${String(items.length).padStart(3)} items`);
}

console.log('\nPor marca:');
const byBrand = {};
for (const i of all) (byBrand[i.brand] ??= []).push(i);
for (const [brand, items] of Object.entries(byBrand).sort((a, b) => b[1].length - a[1].length)) {
  const supers = new Set(items.map((x) => x.super));
  console.log(`  ${brand.padEnd(18)} | ${String(items.length).padStart(3)} items | en: ${[...supers].join(', ')}`);
}

console.log('\nPor super:');
for (const r of results) {
  console.log(`  ${r.name.padEnd(15)} | ${String(r.items.length).padStart(3)} items`);
}
