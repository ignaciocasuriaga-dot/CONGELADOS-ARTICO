import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-extra';

const SUPER_LABEL = { tata: 'Tata', disco: 'Disco', eldorado: 'El Dorado', tiendainglesa: 'Tienda Inglesa' };
const SUPERS = ['tata', 'disco', 'eldorado', 'tiendainglesa'];

async function latestJson() {
  const dir = 'data/output';
  const files = existsSync(dir)
    ? (await readdir(dir)).filter((f) => f.endsWith('.json')).sort().reverse()
    : [];
  if (files.length) return join(dir, files[0]);
  if (existsSync('public/data/latest.json')) return 'public/data/latest.json';
  throw new Error('No JSON data found. Run "node src/main.js" first.');
}

const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPrice = (p) => (p == null ? '-' : '$ ' + p.toLocaleString('es-UY'));
const fmtPct = (p) => (p == null ? '-' : `${p > 0 ? '+' : ''}${Number(p).toFixed(1)}%`);
const cap = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());

async function loadLogoDataUri() {
  const logoPath = 'public/logo.jpg';
  if (!existsSync(logoPath)) return null;
  const logo = await readFile(logoPath);
  return `data:image/jpeg;base64,${logo.toString('base64')}`;
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeName(name) {
  return stripAccents(name.toLowerCase())
    .replace(/\b(bimbo|los\s*sorchantes|sorchantes|maestro\s*cubano|nutra\s*bien|nutrabien|tia\s*rosa|rapiditas|merienda\s*hit|merienda\s*xl|takis|salmas|artesano)\b/g, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(kg|kilos?|gr?|gramos|ml|cc|lts?|litros?|un|u|unid(?:ades?)?)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSize(name) {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|gr?|gramos|ml|cc|lts?|un|u|unidades?)/i);
  if (!m) return null;
  let value = Number(m[1].replace(',', '.'));
  let unit = m[2].toLowerCase();
  if (/^(g|gr|gramos)$/.test(unit)) unit = 'g';
  else if (unit === 'kg') { unit = 'g'; value *= 1000; }
  else if (/^(ml|cc)$/.test(unit)) unit = 'ml';
  else if (/^(l|lt|lts)$/.test(unit)) { unit = 'ml'; value *= 1000; }
  else unit = 'u';
  return { value: Math.round(value), unit };
}

function clusterProducts(items) {
  const tokens = (name) => new Set(normalizeName(name).split(' ').filter((w) => w.length > 1));
  const jaccard = (a, b) => {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter);
  };

  const groups = [];
  for (const item of items) {
    const itemTokens = tokens(item.name);
    const size = extractSize(item.name);
    let best = null;
    let bestScore = 0;
    for (const group of groups) {
      if (group.brand !== item.brand) continue;
      if (size && group.size) {
        if (size.unit !== group.size.unit) continue;
        const ratio = Math.min(size.value, group.size.value) / Math.max(size.value, group.size.value);
        if (ratio < 0.85) continue;
      }
      const score = jaccard(itemTokens, group.tokens);
      if (score >= 0.55 && score > bestScore) {
        best = group;
        bestScore = score;
      }
    }
    if (best) best.items.push(item);
    else groups.push({ brand: item.brand, size, tokens: itemTokens, items: [item] });
  }

  for (const group of groups) {
    group.items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    group.label = group.items.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
  }
  return groups;
}

function avg(values) {
  const nums = values.filter((v) => v != null);
  return nums.length ? Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length) : null;
}

function buildHtml({ items, generatedAt, brands = [], logoDataUri = null }) {
  const date = new Date(generatedAt);
  const fmtDate = date.toLocaleString('es-UY', { dateStyle: 'long', timeStyle: 'short' });
  const bimboItems = items.filter((i) => i.group === 'bimbo');
  const offers = bimboItems.filter((i) => i.listPrice && i.price && i.listPrice > i.price);
  const prices = bimboItems.map((i) => i.price).filter((p) => p != null);
  const clusters = clusterProducts(bimboItems).filter((g) => g.items.length >= 2);

  const byBrand = Object.entries(bimboItems.reduce((acc, item) => {
    (acc[item.brand] ??= []).push(item);
    return acc;
  }, {})).map(([brand, arr]) => ({
    brand,
    count: arr.length,
    avg: avg(arr.map((x) => x.price)),
    supers: new Set(arr.map((x) => x.super)).size,
    offers: arr.filter((i) => i.listPrice && i.price && i.listPrice > i.price).length,
  })).sort((a, b) => b.count - a.count);

  const bySuper = SUPERS.map((superName) => {
    const arr = bimboItems.filter((i) => i.super === superName);
    const superPrices = arr.map((x) => x.price).filter((p) => p != null);
    return {
      super: superName,
      count: arr.length,
      avg: avg(superPrices),
      min: superPrices.length ? Math.min(...superPrices) : null,
      max: superPrices.length ? Math.max(...superPrices) : null,
      offers: arr.filter((i) => i.listPrice && i.price && i.listPrice > i.price).length,
    };
  }).filter((s) => s.count);

  const topSpread = clusters.map((group) => {
    const groupPrices = group.items.map((x) => x.price).filter((p) => p != null);
    const min = groupPrices.length ? Math.min(...groupPrices) : null;
    const max = groupPrices.length ? Math.max(...groupPrices) : null;
    return {
      ...group,
      spread: min != null && max != null ? max - min : 0,
      pct: min != null && max ? (1 - min / max) * 100 : 0,
    };
  }).filter((g) => g.spread > 0).sort((a, b) => b.pct - a.pct).slice(0, 8);

  const topDiscounts = offers
    .map((o) => ({ ...o, pct: (1 - o.price / o.listPrice) * 100, savings: o.listPrice - o.price }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  const suggested = bimboItems.filter((i) => i.suggestedPrice != null);
  const suggestedAbove = suggested.filter((i) => i.suggestedStatus === 'above').length;
  const suggestedRows = suggested
    .slice()
    .sort((a, b) => Math.abs(b.gapPct ?? b.suggestedDeviationPct ?? 0) - Math.abs(a.gapPct ?? a.suggestedDeviationPct ?? 0))
    .slice(0, 12);

  const summary = `Se relevaron ${bimboItems.length} productos del Grupo Bimbo en ${new Set(bimboItems.map((i) => i.super)).size}/4 supermercados. Se detectaron ${byBrand.length} submarcas con precio promedio ${fmtPrice(avg(prices))}. Control PVP: ${suggested.length} productos cruzados.`;
  const logo = logoDataUri ? `<img class="report-logo" src="${logoDataUri}" alt="Grupo Bimbo">` : '';
  const headerLogo = logoDataUri ? `<img class="page-logo" src="${logoDataUri}" alt="Grupo Bimbo">` : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Grupo Bimbo Uruguay</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 10.5px; margin: 0; line-height: 1.5; }
  .cover { page-break-after: always; min-height: 95vh; display: flex; flex-direction: column; justify-content: space-between; padding: 30px 10px; }
  .cover-top { border-left: 6px solid #E1251B; padding-left: 22px; }
  .report-logo { width: 170px; height: auto; display: block; margin: 0 0 24px; border-radius: 6px; }
  .cover-eyebrow { font-size: 11px; color: #002E6D; text-transform: uppercase; letter-spacing: .15em; font-weight: 700; margin-bottom: 8px; }
  h1 { font-size: 38px; margin: 0 0 8px; line-height: 1.15; font-weight: 800; }
  h2 { font-size: 14px; margin: 0 0 12px; padding: 7px 14px; background: #002E6D; color: #fff; border-radius: 4px; display: inline-block; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #002E6D; margin: 0 0 8px; }
  .cover h2 { font-size: 18px; margin: 12px 0 0; color: #555; background: none; padding: 0; font-weight: 500; display: block; }
  .cover-meta { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; line-height: 1.9; }
  .cover-bottom { text-align: center; color: #999; font-size: 10px; }
  .page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #E1251B; padding-bottom: 8px; margin-bottom: 18px; }
  .page-brand { display: flex; align-items: center; gap: 10px; }
  .page-logo { height: 34px; width: auto; border-radius: 4px; display: block; }
  .page-header .title { font-size: 14px; font-weight: 800; color: #E1251B; }
  .page-header .meta { font-size: 10px; color: #888; }
  section { page-break-inside: avoid; margin-bottom: 22px; }
  .lead { font-size: 12px; line-height: 1.7; padding: 14px 18px; background: #fff8e7; border-left: 4px solid #E1251B; border-radius: 4px; margin-bottom: 18px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
  .kpi { padding: 12px 14px; border: 1px solid #e8dfc8; border-radius: 8px; border-left: 4px solid #E1251B; }
  .kpi-label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; }
  .kpi-value { font-size: 20px; font-weight: 800; margin-top: 3px; }
  .kpi-sub { font-size: 9px; color: #888; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #fff8e7; padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #002E6D; border-bottom: 2px solid #e8dfc8; }
  td { padding: 6px 8px; border-bottom: 1px solid #f0e8d0; vertical-align: top; }
  td.price, th.price { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  td.brand { color: #666; text-transform: capitalize; }
  .gap.above { color: #E1251B; }
  .gap.ok { color: #2e7d32; }
  .gap.below { color: #002E6D; }
  .pill { display: inline-block; padding: 1.5px 7px; border-radius: 8px; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .pill.tata { background: #e5002b; }
  .pill.disco { background: #0070d2; }
  .pill.eldorado { background: #c8102e; }
  .pill.tiendainglesa { background: #19744a; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 8.5px; }
</style>
</head>
<body>
<div class="cover">
  <div>
    <div class="cover-top">
      ${logo}
      <div class="cover-eyebrow">Informe Ejecutivo</div>
      <h1>Precios Grupo Bimbo<br>Uruguay</h1>
      <h2>Relevamiento en supermercados online</h2>
    </div>
    <div class="cover-meta">
      <b>Fecha:</b> ${escape(fmtDate)}<br>
      <b>Supermercados:</b> Tata · Disco · El Dorado · Tienda Inglesa<br>
      <b>SKUs analizados:</b> ${bimboItems.length}<br>
      <b>Submarcas configuradas:</b> ${brands.length || byBrand.length}<br>
      <b>Control PVP:</b> ${suggested.length} productos cruzados
    </div>
  </div>
  <div class="cover-bottom">Generado automaticamente con datos relevados de los sitios oficiales.</div>
</div>

<div class="page-header">
  <div class="page-brand">${headerLogo}<div class="title">Resumen Ejecutivo</div></div>
  <div class="meta">${escape(fmtDate)}</div>
</div>

<section>
  <p class="lead">${escape(summary)}</p>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">SKUs</div><div class="kpi-value">${bimboItems.length}</div><div class="kpi-sub">Grupo Bimbo</div></div>
    <div class="kpi"><div class="kpi-label">Submarcas</div><div class="kpi-value">${byBrand.length}</div><div class="kpi-sub">detectadas</div></div>
    <div class="kpi"><div class="kpi-label">Promedio</div><div class="kpi-value">${fmtPrice(avg(prices))}</div><div class="kpi-sub">precio actual</div></div>
    <div class="kpi"><div class="kpi-label">Ofertas</div><div class="kpi-value">${offers.length}</div><div class="kpi-sub">${bimboItems.length ? Math.round(offers.length / bimboItems.length * 100) : 0}% del catalogo</div></div>
    <div class="kpi"><div class="kpi-label">PVP cruzados</div><div class="kpi-value">${suggested.length}</div><div class="kpi-sub">${suggestedAbove} sobre PVP</div></div>
  </div>
</section>

<section>
  <h2>Cobertura por submarca</h2>
  <table>
    <thead><tr><th>Submarca</th><th class="price">SKUs</th><th class="price">Supers</th><th class="price">Precio prom.</th><th class="price">Ofertas</th></tr></thead>
    <tbody>${byBrand.map((b) => `<tr><td><b>${escape(cap(b.brand))}</b></td><td class="price">${b.count}</td><td class="price">${b.supers}/4</td><td class="price">${fmtPrice(b.avg)}</td><td class="price">${b.offers}</td></tr>`).join('')}</tbody>
  </table>
</section>

<section>
  <h2>Cobertura por supermercado</h2>
  <table>
    <thead><tr><th>Super</th><th class="price">SKUs</th><th class="price">Prom.</th><th class="price">Rango</th><th class="price">Ofertas</th></tr></thead>
    <tbody>${bySuper.map((s) => `<tr><td><span class="pill ${s.super}">${SUPER_LABEL[s.super]}</span></td><td class="price">${s.count}</td><td class="price">${fmtPrice(s.avg)}</td><td class="price">${fmtPrice(s.min)} - ${fmtPrice(s.max)}</td><td class="price">${s.offers}</td></tr>`).join('')}</tbody>
  </table>
</section>

<section style="page-break-before:always">
  <div class="page-header"><div class="page-brand">${headerLogo}<div class="title">Oportunidades</div></div><div class="meta">${escape(fmtDate)}</div></div>
  <h2>Diferencias entre supermercados</h2>
  <table>
    <thead><tr><th>Producto</th><th>Submarca</th><th class="price">Mas barato</th><th class="price">Mas caro</th><th class="price">Diferencia</th></tr></thead>
    <tbody>${topSpread.map((g) => {
      const groupPrices = g.items.map((x) => x.price).filter((p) => p != null);
      const minIt = g.items.find((x) => x.price === Math.min(...groupPrices));
      const maxIt = g.items.find((x) => x.price === Math.max(...groupPrices));
      return `<tr><td>${escape(g.label)}</td><td class="brand">${escape(g.brand)}</td><td class="price"><span class="pill ${minIt.super}">${SUPER_LABEL[minIt.super]}</span> ${fmtPrice(minIt.price)}</td><td class="price"><span class="pill ${maxIt.super}">${SUPER_LABEL[maxIt.super]}</span> ${fmtPrice(maxIt.price)}</td><td class="price" style="color:#E1251B">$ ${g.spread.toLocaleString('es-UY')} · ${g.pct.toFixed(1)}%</td></tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:#999">No hay productos comparables.</td></tr>'}</tbody>
  </table>
</section>

<section>
  <h2>Top descuentos detectados</h2>
  <table>
    <thead><tr><th>Producto</th><th>Submarca</th><th>Super</th><th class="price">Lista</th><th class="price">Oferta</th><th class="price">Ahorra</th><th class="price">%</th></tr></thead>
    <tbody>${topDiscounts.map((o) => `<tr><td>${escape(o.name)}</td><td class="brand">${escape(o.brand)}</td><td><span class="pill ${o.super}">${SUPER_LABEL[o.super]}</span></td><td class="price">${fmtPrice(o.listPrice)}</td><td class="price">${fmtPrice(o.price)}</td><td class="price">${fmtPrice(o.savings)}</td><td class="price">${Math.round(o.pct)}%</td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#999">No hay ofertas activas.</td></tr>'}</tbody>
  </table>
</section>

<section>
  <h2>Control PVP sugerido</h2>
  <table>
    <thead><tr><th>Producto</th><th>Submarca</th><th>Super</th><th class="price">Precio</th><th class="price">PVP</th><th class="price">GAP</th></tr></thead>
    <tbody>${suggestedRows.map((i) => {
      const gap = i.gapPct ?? i.suggestedDeviationPct;
      const status = i.suggestedStatus || '';
      return `<tr><td>${escape(i.name)}<br><span style="color:#888;font-size:8.5px">${escape(i.suggestedProduct || '')}</span></td><td class="brand">${escape(i.brand)}</td><td><span class="pill ${i.super}">${SUPER_LABEL[i.super]}</span></td><td class="price">${fmtPrice(i.price)}</td><td class="price">${fmtPrice(i.suggestedPrice)}</td><td class="price gap ${escape(status)}">${fmtPct(gap)}</td></tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:#999">Sin PVP cruzado.</td></tr>'}</tbody>
  </table>
</section>

<footer>Informe generado automaticamente · Datos relevados de Tata, Disco, El Dorado y Tienda Inglesa · Uso interno.</footer>
</body>
</html>`;
}

async function main() {
  const jsonPath = process.argv[2] || (await latestJson());
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  console.log(`Input: ${jsonPath} (${data.items.length} productos)`);

  const logoDataUri = await loadLogoDataUri();
  const html = buildHtml({ ...data, logoDataUri });
  const htmlPath = jsonPath.replace(/\.json$/, '.html');
  const pdfPath = jsonPath.replace(/\.json$/, '.pdf');
  await writeFile(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  });
  await browser.close();

  await mkdir('public/data', { recursive: true });
  await writeFile('public/data/latest.pdf', await readFile(pdfPath));

  console.log(`OK HTML: ${htmlPath}`);
  console.log(`OK PDF:  ${pdfPath}`);
  console.log('OK Copiado a public/data/latest.pdf');
}

main().catch((e) => { console.error(e); process.exit(1); });
