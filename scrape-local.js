#!/usr/bin/env node
// Corre este script desde tu propia PC para scrapear Disco y Tienda Inglesa
// (requiere IP residencial — los servidores en la nube son bloqueados por esos sitios)
//
// Uso:
//   node scrape-local.js          → scrape todos los supers
//   node scrape-local.js disco    → solo Disco
//   node scrape-local.js ti       → solo Tienda Inglesa
//
// Requiere: npm install + npx playwright install chromium

import { scrapeTiendaInglesa } from './src/scrapers/tiendainglesa.js';
import { scrapeDisco } from './src/scrapers/blazor.js';
import { scrapeTata } from './src/scrapers/tata.js';
import { scrapeElDorado } from './src/scrapers/eldorado.js';
import { ALL_BRANDS, BRAND_GROUPS, SEARCH_TERMS } from './src/brands.js';
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const arg = process.argv[2];
const runAll  = !arg;
const runDisco = runAll || arg === 'disco';
const runTI    = runAll || arg === 'ti';
const runTata  = runAll || arg === 'tata';
const runEd    = runAll || arg === 'eldorado';

async function run(name, fn, active) {
  if (!active) return [];
  const t0 = Date.now();
  try {
    const items = await fn(SEARCH_TERMS);
    console.log(`✓ ${name.padEnd(15)} ${items.length} productos (${((Date.now()-t0)/1000).toFixed(1)}s)`);
    return items;
  } catch(e) {
    console.error(`✗ ${name.padEnd(15)} ERROR: ${e.message}`);
    return [];
  }
}

console.log('── Scraping Artico ──────────────────────────');
const [tata, ti, disco, ed] = await Promise.all([
  run('tata',          scrapeTata,           runTata),
  run('tiendainglesa', scrapeTiendaInglesa,  runTI),
  run('disco',         scrapeDisco,          runDisco),
  run('eldorado',      scrapeElDorado,       runEd),
]);

const newItems = [...tata, ...ti, ...disco, ...ed];

// Si es scrape parcial, mergear con latest.json existente
let merged = newItems;
if (!runAll && existsSync('public/data/latest.json')) {
  try {
    const prev = JSON.parse(await readFile('public/data/latest.json', 'utf8'));
    const prevFiltered = (prev.items || []).filter(i => {
      if (runDisco && i.super === 'disco') return false;
      if (runTI && i.super === 'tiendainglesa') return false;
      if (runTata && i.super === 'tata') return false;
      if (runEd && i.super === 'eldorado') return false;
      return true;
    });
    merged = [...prevFiltered, ...newItems];
    console.log(`\nMerge: ${prevFiltered.length} prev + ${newItems.length} nuevos = ${merged.length} total`);
  } catch { /* usa solo los nuevos */ }
}

const payload = {
  brands: ALL_BRANDS,
  groups: BRAND_GROUPS,
  generatedAt: new Date().toISOString(),
  items: merged,
  scrapeResults: [
    { name: 'tata',          count: tata.length },
    { name: 'tiendainglesa', count: ti.length },
    { name: 'disco',         count: disco.length },
    { name: 'eldorado',      count: ed.length },
  ],
};

await writeFile('public/data/latest.json', JSON.stringify(payload));

// CSV
const csvLines = ['producto,marca,grupo,categoria,precio,precio_lista,super,sku,url'];
for (const i of merged) {
  const c = v => { const s = String(v??'').replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };
  csvLines.push([i.name,i.brand,i.group,i.category??'',i.price??'',i.listPrice??'',i.super,i.sku,i.url??''].map(c).join(','));
}
await writeFile('public/data/latest.csv', csvLines.join('\n'));

console.log(`\n✓ Guardado en public/data/latest.json (${merged.length} productos)`);
console.log('\nPara subir al sitio:');
console.log('  git add public/data && git commit -m "chore: actualizar precios" && git push');
