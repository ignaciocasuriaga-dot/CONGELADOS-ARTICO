// Artico Retail Watch - Monitor de precios Congelados Artico y Helados Lekker

const SUPER_LABEL = { tata: 'Ta-Ta', disco: 'Disco', eldorado: 'El Dorado', tiendainglesa: 'Tienda Inglesa' };
const SUPERS = ['tata', 'disco', 'eldorado', 'tiendainglesa'];
const CATEGORY_LABEL = {
  hamburguesas: 'Hamburguesas',
  empanadas: 'Empanadas',
  pizza: 'Pizza',
  papas: 'Papas Fritas',
  nuggets: 'Nuggets / Rebozados',
  milanesas: 'Milanesas',
  medallones: 'Medallones',
  vegetales: 'Vegetales',
  pescado: 'Pescado / Mariscos',
  otros_congelados: 'Otros Congelados',
  helados: 'Helados Lekker',
};
const GROUP_LABEL = { artico: 'Artico', lekker: 'Lekker' };

const state = {
  items: [],
  groups: {},
  generatedAt: null,
  view: 'catalog',
  catalog: { q: '', groups: new Set(), categories: new Set(), supers: new Set(), sort: { key: 'price', asc: true } },
  compare: { q: '', category: '' },
  offers: { q: '', supers: new Set() },
  clusters: [],
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtPrice = (p) => p == null ? '—' : '$ ' + Number(p).toLocaleString('es-UY', {minimumFractionDigits: 0, maximumFractionDigits: 0});
const fmtPct = (p) => p == null ? '-' : `${p > 0 ? '+' : ''}${Number(p).toFixed(1)}%`;
const stripAccents = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '');
const norm = (s) => stripAccents(String(s ?? '').toLowerCase());

function toast(msg, kind = '') {
  $$('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 5500);
}

// ===== Clustering for Comparador =====
function extractSize(name) {
  const rx = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|gr?\b|gramos|ml|cc|lts?|litros?|un|u\b|unid(?:ades?)?|x\s*\d+)/i;
  const m = name.match(rx);
  if (!m) return null;
  const num = Number(m[1].replace(',', '.'));
  let unit = m[2].toLowerCase().replace(/\s+/g, '');
  let value = num;
  if (/^(g|gr|gramos)$/.test(unit)) unit = 'g';
  else if (/^(kg|kilo|kilos)$/.test(unit)) { unit = 'g'; value = num * 1000; }
  else if (/^(ml|cc)$/.test(unit)) unit = 'ml';
  else if (/^(l|lt|lts|litro|litros)$/.test(unit)) { unit = 'ml'; value = num * 1000; }
  else if (/^(un|u|unid|unidad|unidades)$/.test(unit)) unit = 'u';
  return { value: Math.round(value), unit };
}

function normalizeName(name) {
  let n = norm(name);
  n = n.replace(/\b(artico|artico|lekker)\b/g, ' ');
  n = n.replace(/\d+(?:[.,]\d+)?\s*(kg|kilos?|gr?|gramos|ml|cc|lts?|litros?|un|u|unid(?:ades?)?|x\s*\d+)\b/g, ' ');
  n = n.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const stop = new Set(['de', 'la', 'el', 'con', 'sin', 'y', 'a', 'en', 'para', 'gr', 'g', 'congelado', 'congelados']);
  return n.split(' ').filter((w) => w && w.length > 1 && !stop.has(w)).join(' ');
}

const tokenize = (name) => new Set(normalizeName(name).split(' ').filter(Boolean));

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function clusterProducts(items) {
  const groups = [];
  const enriched = items.map((it) => ({ item: it, tokens: tokenize(it.name), size: extractSize(it.name) }));
  for (const cur of enriched) {
    let bestGroup = null, bestScore = 0;
    for (const g of groups) {
      if (g.brand !== cur.item.brand) continue;
      if (cur.size && g.size) {
        if (cur.size.unit !== g.size.unit) continue;
        const ratio = Math.min(cur.size.value, g.size.value) / Math.max(cur.size.value, g.size.value);
        if (ratio < 0.85) continue;
      }
      const score = jaccard(cur.tokens, g.tokens);
      if (score > bestScore && score >= 0.50) { bestScore = score; bestGroup = g; }
    }
    if (bestGroup) {
      bestGroup.items.push(cur.item);
      const intersection = new Set();
      for (const t of cur.tokens) if (bestGroup.tokens.has(t)) intersection.add(t);
      if (intersection.size >= 2) bestGroup.tokens = intersection;
    } else {
      groups.push({ brand: cur.item.brand, group: cur.item.group, category: cur.item.category, size: cur.size, tokens: new Set(cur.tokens), items: [cur.item], label: cur.item.name });
    }
  }
  for (const g of groups) {
    g.items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    g.label = g.items.slice().sort((a, b) => a.name.length - b.name.length)[0].name;
  }
  return groups.filter((g) => g.items.length >= 2);
}

// ===== Data Loading =====
async function loadData() {
  const res = await fetch('/data/latest.json?' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  state.items = data.items || [];
  state.groups = data.groups || {};
  state.generatedAt = data.generatedAt;
  state.clusters = clusterProducts(state.items);
  renderAll();
}

function renderAll() {
  renderKpis();
  renderCatalog();
  renderCompare();
  renderOffers();
  renderPositioning();
  renderAnalysis();
  renderExec();
  renderLastUpdate();
}

// ===== KPIs =====
function renderKpis() {
  const items = state.items;
  const withPrice = items.filter((i) => i.price != null);
  const offers = items.filter((i) => i.price != null && i.listPrice != null && i.price < i.listPrice);
  const lekkerItems = items.filter((i) => i.brand === 'lekker');
  const supers = new Set(items.map((i) => i.super));
  const kpis = [
    { label: 'Total Productos', value: items.length, sub: `en ${supers.size} supermercados`, cls: '' },
    { label: 'Congelados Artico', value: items.filter((i) => i.brand === 'artico').length, sub: 'SKUs relevados', cls: '' },
    { label: 'Helados Lekker', value: lekkerItems.length, sub: 'SKUs relevados', cls: 'lekker' },
    { label: 'En Oferta', value: offers.length, sub: `${withPrice.length > 0 ? Math.round(offers.length / withPrice.length * 100) : 0}% del portafolio`, cls: 'verde' },
  ];
  $('#kpis').innerHTML = kpis.map((k) => `
    <div class="kpi ${k.cls}">
      <div class="kpi-label">${escape(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${escape(k.sub)}</div>
    </div>`).join('');
}

// ===== Last Update =====
function renderLastUpdate() {
  if (!state.generatedAt) return;
  const d = new Date(state.generatedAt);
  const fmt = d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  $('#lastUpdate').innerHTML = `Última actualización<br><b>${fmt}</b>`;
}

// ===== Catalog =====
function buildCatalogChips() {
  // Groups
  const groups = [...new Set(state.items.map((i) => i.group).filter(Boolean))];
  $('#groupChips').innerHTML = groups.map((g) => `<button class="chip ${state.catalog.groups.has(g) ? 'active' : ''}" data-group="${escape(g)}">${escape(GROUP_LABEL[g] || g)}</button>`).join('');
  $$('#groupChips .chip').forEach((el) => el.addEventListener('click', () => {
    const g = el.dataset.group;
    state.catalog.groups.has(g) ? state.catalog.groups.delete(g) : state.catalog.groups.add(g);
    buildCatalogChips();
    renderCatalogTable();
  }));

  // Categories
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))];
  $('#categoryChips').innerHTML = cats.map((c) => `<button class="chip ${state.catalog.categories.has(c) ? 'active' : ''}" data-cat="${escape(c)}">${escape(CATEGORY_LABEL[c] || c)}</button>`).join('');
  $$('#categoryChips .chip').forEach((el) => el.addEventListener('click', () => {
    const c = el.dataset.cat;
    state.catalog.categories.has(c) ? state.catalog.categories.delete(c) : state.catalog.categories.add(c);
    buildCatalogChips();
    renderCatalogTable();
  }));

  // Supers
  $('#superChips').innerHTML = SUPERS.map((s) => `<button class="chip ${state.catalog.supers.has(s) ? 'active' : ''}" data-super="${s}">${escape(SUPER_LABEL[s])}</button>`).join('');
  $$('#superChips .chip').forEach((el) => el.addEventListener('click', () => {
    const s = el.dataset.super;
    state.catalog.supers.has(s) ? state.catalog.supers.delete(s) : state.catalog.supers.add(s);
    buildCatalogChips();
    renderCatalogTable();
  }));
}

function filterCatalog() {
  const q = norm(state.catalog.q);
  return state.items.filter((i) => {
    if (q && !norm(i.name).includes(q) && !norm(i.brand).includes(q)) return false;
    if (state.catalog.groups.size && !state.catalog.groups.has(i.group)) return false;
    if (state.catalog.categories.size && !state.catalog.categories.has(i.category)) return false;
    if (state.catalog.supers.size && !state.catalog.supers.has(i.super)) return false;
    return true;
  });
}

function sortItems(items) {
  const { key, asc } = state.catalog.sort;
  return [...items].sort((a, b) => {
    let va = a[key], vb = b[key];
    if (va == null) return 1; if (vb == null) return -1;
    if (typeof va === 'string') { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
    return asc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0);
  });
}

function pillHtml(s) { return `<span class="pill ${s}">${escape(SUPER_LABEL[s] || s)}</span>`; }

function catPillHtml(c) {
  if (!c) return '';
  const cls = c === 'helados' ? 'helados' : '';
  return `<span class="cat-pill ${cls}">${escape(CATEGORY_LABEL[c] || c)}</span>`;
}

function discountHtml(item) {
  if (!item.listPrice || !item.price || item.price >= item.listPrice) return '';
  const pct = Math.round((1 - item.price / item.listPrice) * 100);
  return `<span class="discount-badge">-${pct}%</span>`;
}

function renderCatalogTable() {
  const items = sortItems(filterCatalog());
  $('#catalogCount').textContent = items.length;
  $('#badgeCatalog').textContent = items.length;
  const empty = items.length === 0;
  $('#catalogEmpty').style.display = empty ? '' : 'none';
  $('#tableCatalog').style.display = empty ? 'none' : '';
  $('#catalogRows').innerHTML = items.map((i) => `
    <tr>
      <td>${i.url ? `<a href="${escape(i.url)}" target="_blank" rel="noopener">${escape(i.name)}</a>` : escape(i.name)}</td>
      <td class="brand">${escape(i.brand || '')}</td>
      <td>${catPillHtml(i.category)}</td>
      <td>${pillHtml(i.super)}</td>
      <td class="price">${fmtPrice(i.price)}</td>
      <td class="price list">${i.listPrice && i.listPrice > i.price ? fmtPrice(i.listPrice) : ''}</td>
      <td>${discountHtml(i)}</td>
    </tr>`).join('');
}

function renderCatalog() {
  buildCatalogChips();
  renderCatalogTable();

  const th = $$('#tableCatalog thead th[data-sort]');
  th.forEach((el) => el.addEventListener('click', () => {
    const key = el.dataset.sort;
    if (state.catalog.sort.key === key) state.catalog.sort.asc = !state.catalog.sort.asc;
    else { state.catalog.sort.key = key; state.catalog.sort.asc = key === 'price'; }
    th.forEach((t) => t.classList.remove('sorted', 'asc'));
    el.classList.add('sorted');
    if (state.catalog.sort.asc) el.classList.add('asc');
    renderCatalogTable();
  }));

  $('#catalogQ').addEventListener('input', (e) => {
    state.catalog.q = e.target.value;
    renderCatalogTable();
  });
}

// ===== Comparador =====
function renderCompare() {
  // Build category filter
  const cats = [...new Set(state.clusters.map((g) => g.category).filter(Boolean))];
  const sel = $('#compareCategory');
  sel.innerHTML = `<option value="">Todas las categorias</option>` +
    cats.map((c) => `<option value="${escape(c)}">${escape(CATEGORY_LABEL[c] || c)}</option>`).join('');

  const render = () => {
    const q = norm(state.compare.q);
    const cat = state.compare.category;
    const filtered = state.clusters.filter((g) => {
      if (q && !norm(g.label).includes(q)) return false;
      if (cat && g.category !== cat) return false;
      return true;
    }).sort((a, b) => {
      const ap = a.items.map((i) => i.price).filter(Boolean);
      const bp = b.items.map((i) => i.price).filter(Boolean);
      const adiff = ap.length >= 2 ? Math.max(...ap) - Math.min(...ap) : 0;
      const bdiff = bp.length >= 2 ? Math.max(...bp) - Math.min(...bp) : 0;
      return bdiff - adiff;
    });

    $('#compareCount').textContent = filtered.length;
    $('#badgeCompare').textContent = filtered.length;

    if (!filtered.length) {
      $('#compareList').innerHTML = '<div class="empty">Sin resultados.</div>';
      return;
    }

    $('#compareList').innerHTML = filtered.map((g) => {
      const bySuper = {};
      for (const i of g.items) bySuper[i.super] = i;
      const prices = g.items.map((i) => i.price).filter(Boolean);
      const minPrice = prices.length ? Math.min(...prices) : null;
      const maxPrice = prices.length ? Math.max(...prices) : null;
      const diff = minPrice && maxPrice ? maxPrice - minPrice : 0;

      const cells = SUPERS.map((s) => {
        const item = bySuper[s];
        if (!item) return `<div class="compare-cell empty"><div class="compare-cell-label">${escape(SUPER_LABEL[s])}</div><div class="compare-cell-price" style="font-size:12px;color:var(--texto-muted);margin-top:6px">No disponible</div></div>`;
        const isBest = item.price === minPrice && diff > 0;
        const isWorst = item.price === maxPrice && diff > 0;
        const diffPct = minPrice && item.price ? ((item.price - minPrice) / minPrice * 100) : 0;
        return `<div class="compare-cell ${isBest ? 'best' : isWorst ? 'worst' : ''}">
          <div class="compare-cell-label">${escape(SUPER_LABEL[s])}</div>
          <div class="compare-cell-price">${fmtPrice(item.price)}</div>
          <div class="compare-cell-diff">${isBest ? 'Mas barato' : isWorst ? `+${fmtPct(diffPct)} mas caro` : diffPct > 0 ? `+${fmtPct(diffPct)}` : ''}</div>
        </div>`;
      }).join('');

      return `<div class="compare-row">
        <div class="compare-prod">
          <div>
            <div class="compare-prod-name">${escape(g.label)}</div>
            <div class="compare-prod-brand">${catPillHtml(g.category)}</div>
          </div>
          ${diff > 0 ? `<div class="compare-savings">Diferencia: ${fmtPrice(diff)} entre supers</div>` : ''}
        </div>
        <div class="compare-prices">${cells}</div>
      </div>`;
    }).join('');
  };

  render();
  $('#compareQ').addEventListener('input', (e) => { state.compare.q = e.target.value; render(); });
  sel.addEventListener('change', (e) => { state.compare.category = e.target.value; render(); });
}

// ===== Ofertas =====
function renderOffers() {
  const offerItems = state.items
    .filter((i) => i.price != null && i.listPrice != null && i.price < i.listPrice)
    .sort((a, b) => {
      const ad = (a.listPrice - a.price) / a.listPrice;
      const bd = (b.listPrice - b.price) / b.listPrice;
      return bd - ad;
    });

  $('#offersCount').textContent = offerItems.length;
  $('#badgeOffers').textContent = offerItems.length;

  // Supers chips
  const supersWithOffers = new Set(offerItems.map((i) => i.super));
  $('#offersSuperChips').innerHTML = SUPERS
    .filter((s) => supersWithOffers.has(s))
    .map((s) => `<button class="chip ${state.offers.supers.has(s) ? 'active' : ''}" data-super="${s}">${escape(SUPER_LABEL[s])}</button>`)
    .join('');
  $$('#offersSuperChips .chip').forEach((el) => el.addEventListener('click', () => {
    const s = el.dataset.super;
    state.offers.supers.has(s) ? state.offers.supers.delete(s) : state.offers.supers.add(s);
    $$('#offersSuperChips .chip').forEach((c) => c.classList.toggle('active', state.offers.supers.has(c.dataset.super)));
    renderOffersTable(offerItems);
  }));

  renderOffersTable(offerItems);
  $('#offersQ').addEventListener('input', (e) => { state.offers.q = e.target.value; renderOffersTable(offerItems); });
}

function renderOffersTable(offerItems) {
  const q = norm(state.offers.q);
  const items = offerItems.filter((i) => {
    if (q && !norm(i.name).includes(q)) return false;
    if (state.offers.supers.size && !state.offers.supers.has(i.super)) return false;
    return true;
  });

  const empty = items.length === 0;
  $('#offersEmpty').style.display = empty ? '' : 'none';
  $('table:has(#offersRows)') && ($('table:has(#offersRows)').style.display = empty ? 'none' : '');
  $('#offersRows').innerHTML = items.map((i) => {
    const pct = Math.round((1 - i.price / i.listPrice) * 100);
    const saves = i.listPrice - i.price;
    return `<tr>
      <td>${i.url ? `<a href="${escape(i.url)}" target="_blank" rel="noopener">${escape(i.name)}</a>` : escape(i.name)}</td>
      <td class="brand">${escape(i.brand || '')}</td>
      <td>${catPillHtml(i.category)}</td>
      <td>${pillHtml(i.super)}</td>
      <td class="price list">${fmtPrice(i.listPrice)}</td>
      <td class="price min">${fmtPrice(i.price)}</td>
      <td class="price">${fmtPrice(saves)}</td>
      <td><span class="discount-badge">-${pct}%</span></td>
    </tr>`;
  }).join('');
}

// ===== Cobertura =====
function renderPositioning() {
  const totalSkus = new Set(state.items.map((i) => `${i.brand}:${i.name.substring(0, 20)}`)).size;
  const bySuper = {};
  for (const s of SUPERS) {
    const items = state.items.filter((i) => i.super === s);
    bySuper[s] = {
      total: items.length,
      artico: items.filter((i) => i.brand === 'artico').length,
      lekker: items.filter((i) => i.brand === 'lekker').length,
    };
  }
  const maxTotal = Math.max(...SUPERS.map((s) => bySuper[s].total), 1);

  // SKUs by category per super
  const cats = [...new Set(state.items.map((i) => i.category).filter(Boolean))];
  const catMatrix = cats.map((cat) => {
    const row = { cat };
    for (const s of SUPERS) row[s] = state.items.filter((i) => i.super === s && i.category === cat).length;
    return row;
  });

  const sortedSupers = [...SUPERS].sort((a, b) => bySuper[b].total - bySuper[a].total);

  $('#positioningContent').innerHTML = `
    <div class="panel">
      <h2 class="panel-title">Cobertura por supermercado</h2>
      <p style="color:var(--texto-muted);font-size:13px;margin:0 0 16px">Cantidad de SKUs de Artico y Lekker relevados en cada supermercado.</p>
      <div class="super-bars">
        ${sortedSupers.map((s) => {
          const d = bySuper[s];
          const pct = Math.round(d.total / maxTotal * 100);
          const rank = sortedSupers.indexOf(s) + 1;
          return `<div>
            <div class="super-bar-header">
              <span>${rank === 1 ? '&#x1F947;' : rank === 2 ? '&#x1F948;' : rank === 3 ? '&#x1F949;' : ''} ${pillHtml(s)}</span>
              <span style="color:var(--texto-muted)">${d.total} SKUs &nbsp; <span style="color:var(--azul)">Artico: ${d.artico}</span> &nbsp; <span style="color:var(--lekker)">Lekker: ${d.lekker}</span></span>
            </div>
            <div class="super-bar-track"><div class="super-bar-fill ${s}" style="width:${pct}%"></div></div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="panel">
      <h2 class="panel-title">Cobertura por categoria</h2>
      <table>
        <thead><tr><th>Categoria</th>${SUPERS.map((s) => `<th style="text-align:center">${escape(SUPER_LABEL[s])}</th>`).join('')}<th style="text-align:center">Total</th></tr></thead>
        <tbody>
          ${catMatrix.sort((a, b) => {
            const ta = SUPERS.reduce((sum, s) => sum + (a[s] || 0), 0);
            const tb = SUPERS.reduce((sum, s) => sum + (b[s] || 0), 0);
            return tb - ta;
          }).map((row) => {
            const total = SUPERS.reduce((sum, s) => sum + (row[s] || 0), 0);
            return `<tr>
              <td>${catPillHtml(row.cat)}</td>
              ${SUPERS.map((s) => {
                const v = row[s] || 0;
                const maxV = Math.max(...SUPERS.map((ss) => row[ss] || 0), 1);
                const isBest = v === maxV && v > 0;
                return `<td style="text-align:center;font-weight:${isBest ? '800' : '500'};color:${isBest ? 'var(--offer)' : v === 0 ? 'var(--texto-muted)' : 'inherit'}">${v || '—'}</td>`;
              }).join('')}
              <td style="text-align:center;font-weight:700;color:var(--azul)">${total}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ===== Analisis =====
function renderAnalysis() {
  const items = state.items.filter((i) => i.price != null);
  if (!items.length) {
    $('#analysisContent').innerHTML = '<div class="panel"><div class="empty">Sin datos para analizar.</div></div>';
    return;
  }

  // Price per super: avg, min, max
  const superStats = SUPERS.map((s) => {
    const si = items.filter((i) => i.super === s);
    if (!si.length) return { s, count: 0, avg: null, min: null, max: null };
    const prices = si.map((i) => i.price);
    return {
      s,
      count: si.length,
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      min: Math.min(...prices),
      max: Math.max(...prices),
    };
  }).filter((d) => d.count > 0);

  const sortedByAvg = [...superStats].sort((a, b) => a.avg - b.avg);
  const cheapest = sortedByAvg[0];
  const mostExpensive = sortedByAvg[sortedByAvg.length - 1];

  // Best offers per super
  const offerStats = SUPERS.map((s) => {
    const si = state.items.filter((i) => i.super === s && i.price != null && i.listPrice != null && i.price < i.listPrice);
    if (!si.length) return { s, count: 0, avgDiscount: 0 };
    const discounts = si.map((i) => (1 - i.price / i.listPrice) * 100);
    return { s, count: si.length, avgDiscount: Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) };
  }).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);

  // Products cheapest/most expensive by super
  const cheapestProducts = SUPERS.flatMap((s) => {
    const si = items.filter((i) => i.super === s);
    if (!si.length) return [];
    const sorted = si.sort((a, b) => a.price - b.price);
    return [{ ...sorted[0], super: s }];
  }).sort((a, b) => a.price - b.price).slice(0, 5);

  // Most expensive products
  const priceyProducts = [...items].sort((a, b) => b.price - a.price).slice(0, 5);

  // Price comparison for same products across supers (using clusters)
  const biggestGaps = state.clusters
    .map((g) => {
      const prices = g.items.map((i) => i.price).filter(Boolean);
      if (prices.length < 2) return null;
      const minP = Math.min(...prices), maxP = Math.max(...prices);
      const cheapItem = g.items.find((i) => i.price === minP);
      const expItem = g.items.find((i) => i.price === maxP);
      return { label: g.label, diff: maxP - minP, pct: (maxP - minP) / minP * 100, cheapItem, expItem, category: g.category };
    })
    .filter(Boolean)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  const maxAvg = Math.max(...superStats.map((d) => d.avg), 1);

  $('#analysisContent').innerHTML = `
    <div class="analysis-grid">
      <div class="analysis-card">
        <h3>Precio Promedio por Supermercado</h3>
        <div class="super-bars">
          ${[...superStats].sort((a, b) => a.avg - b.avg).map((d, i) => `
            <div>
              <div class="super-bar-header">
                <span>${i === 0 ? '<span style="color:var(--offer)">&#x2714; Mas barato</span>' : ''} ${pillHtml(d.s)}</span>
                <span style="font-weight:800;color:var(--azul)">${fmtPrice(d.avg)} prom.</span>
              </div>
              <div class="super-bar-track"><div class="super-bar-fill ${d.s}" style="width:${Math.round(d.avg / maxAvg * 100)}%"></div></div>
              <div style="font-size:11px;color:var(--texto-muted);margin-top:2px">Min: ${fmtPrice(d.min)} &nbsp;|&nbsp; Max: ${fmtPrice(d.max)} &nbsp;|&nbsp; ${d.count} SKUs</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="analysis-card">
        <h3>Ofertas por Supermercado</h3>
        ${offerStats.length ? offerStats.map((d, i) => `
          <div class="ranking-row ${i === 0 ? 'best-row' : ''}">
            <span class="ranking-pos p${i + 1}">${i + 1}</span>
            <div style="flex:1"><div class="ranking-name">${pillHtml(d.s)}</div><div style="font-size:11px;color:var(--texto-muted)">${d.count} productos en oferta</div></div>
            <span class="ranking-value">${d.avgDiscount}% desc. prom.</span>
          </div>`).join('') : '<div class="empty" style="padding:20px">Sin ofertas activas.</div>'}
      </div>
    </div>

    <div class="analysis-grid">
      <div class="analysis-card">
        <h3>Productos mas baratos</h3>
        ${cheapestProducts.map((i, idx) => `
          <div class="ranking-row ${idx === 0 ? 'best-row' : ''}">
            <span class="ranking-pos p${idx + 1}">${idx + 1}</span>
            <div style="flex:1"><div class="ranking-name">${escape(i.name)}</div><div style="font-size:11px">${pillHtml(i.super)} ${catPillHtml(i.category)}</div></div>
            <span class="ranking-value" style="color:var(--offer)">${fmtPrice(i.price)}</span>
          </div>`).join('')}
      </div>

      <div class="analysis-card">
        <h3>Productos mas caros</h3>
        ${priceyProducts.map((i, idx) => `
          <div class="ranking-row ${idx === 0 ? 'worst-row' : ''}">
            <span class="ranking-pos p${idx + 1}">${idx + 1}</span>
            <div style="flex:1"><div class="ranking-name">${escape(i.name)}</div><div style="font-size:11px">${pillHtml(i.super)} ${catPillHtml(i.category)}</div></div>
            <span class="ranking-value" style="color:var(--rojo)">${fmtPrice(i.price)}</span>
          </div>`).join('')}
      </div>
    </div>

    ${biggestGaps.length ? `
    <div class="panel">
      <h2 class="panel-title">Mayor diferencia de precio entre supermercados</h2>
      <p style="color:var(--texto-muted);font-size:13px;margin:0 0 14px">Mismos productos con mayor diferencia de precio entre las cadenas.</p>
      <table>
        <thead><tr><th>Producto</th><th>Categoria</th><th>Super mas barato</th><th class="price">Precio min.</th><th>Super mas caro</th><th class="price">Precio max.</th><th class="price">Diferencia</th><th>%</th></tr></thead>
        <tbody>
          ${biggestGaps.map((g) => `
            <tr>
              <td style="font-weight:600">${escape(g.label)}</td>
              <td>${catPillHtml(g.category)}</td>
              <td>${pillHtml(g.cheapItem.super)}</td>
              <td class="price min">${fmtPrice(g.cheapItem.price)}</td>
              <td>${pillHtml(g.expItem.super)}</td>
              <td class="price" style="color:var(--rojo)">${fmtPrice(g.expItem.price)}</td>
              <td class="price">${fmtPrice(g.diff)}</td>
              <td><span class="discount-badge">+${Math.round(g.pct)}%</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="panel">
      <h2 class="panel-title">Veredicto: donde conviene comprar Artico</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        <div style="padding:16px;border-radius:12px;background:var(--offer-bg);border:1.5px solid var(--offer)">
          <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:var(--offer);letter-spacing:.06em">Mas barato en promedio</div>
          <div style="font-size:22px;font-weight:900;margin-top:6px">${SUPER_LABEL[cheapest?.s] || '—'}</div>
          <div style="font-size:13px;color:var(--texto-muted)">Precio promedio: ${fmtPrice(cheapest?.avg)}</div>
        </div>
        <div style="padding:16px;border-radius:12px;background:rgba(226,0,26,.07);border:1.5px solid rgba(226,0,26,.3)">
          <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:var(--rojo);letter-spacing:.06em">Mas caro en promedio</div>
          <div style="font-size:22px;font-weight:900;margin-top:6px">${SUPER_LABEL[mostExpensive?.s] || '—'}</div>
          <div style="font-size:13px;color:var(--texto-muted)">Precio promedio: ${fmtPrice(mostExpensive?.avg)}</div>
        </div>
        <div style="padding:16px;border-radius:12px;background:var(--crema);border:1.5px solid var(--border)">
          <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:var(--azul);letter-spacing:.06em">Mayor cobertura Artico</div>
          ${(() => {
            const byCount = [...superStats].sort((a, b) => b.count - a.count)[0];
            return `<div style="font-size:22px;font-weight:900;margin-top:6px">${SUPER_LABEL[byCount?.s] || '—'}</div>
              <div style="font-size:13px;color:var(--texto-muted)">${byCount?.count || 0} SKUs relevados</div>`;
          })()}
        </div>
        <div style="padding:16px;border-radius:12px;background:var(--crema);border:1.5px solid var(--border)">
          <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:var(--azul);letter-spacing:.06em">Mas ofertas</div>
          ${(() => {
            const bo = offerStats[0];
            return `<div style="font-size:22px;font-weight:900;margin-top:6px">${bo ? SUPER_LABEL[bo.s] : '—'}</div>
              <div style="font-size:13px;color:var(--texto-muted)">${bo ? `${bo.count} ofertas activas` : 'Sin datos'}</div>`;
          })()}
        </div>
      </div>
    </div>
  `;
}

// ===== Informe Gerencial =====
function renderExec() {
  const items = state.items;
  const bySuper = {};
  for (const s of SUPERS) bySuper[s] = items.filter((i) => i.super === s);
  const offers = items.filter((i) => i.price != null && i.listPrice != null && i.price < i.listPrice);
  const date = state.generatedAt ? new Date(state.generatedAt).toLocaleDateString('es-UY', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  $('#execContent').innerHTML = `
    <div class="panel">
      <h2 class="panel-title">Informe Gerencial Artico &amp; Lekker</h2>
      <p style="color:var(--texto-muted);font-size:13px;margin:0 0 16px">Generado el ${date} &mdash; ${items.length} productos relevados en ${SUPERS.length} supermercados</p>
      <div style="display:flex;gap:8px;margin-bottom:20px">
        <button class="btn azul" onclick="window.print()">Imprimir / PDF</button>
        <a class="btn" href="/data/latest.csv" download>Exportar CSV</a>
        <a class="btn" href="/data/latest.json" download>Exportar JSON</a>
      </div>
    </div>

    <div class="exec-grid">
      <div class="exec-card">
        <h3>SKUs por Supermercado</h3>
        ${SUPERS.map((s) => {
          const d = bySuper[s];
          const articoCount = d.filter((i) => i.brand === 'artico').length;
          const lekkerCount = d.filter((i) => i.brand === 'lekker').length;
          return `<div class="brand-stat">
            <div><div class="brand-stat-name">${pillHtml(s)}</div><div class="brand-stat-detail">Artico: ${articoCount} &nbsp;|&nbsp; Lekker: ${lekkerCount}</div></div>
            <div class="brand-stat-value">${d.length}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="exec-card">
        <h3>Ofertas por Supermercado</h3>
        ${SUPERS.map((s) => {
          const so = offers.filter((i) => i.super === s);
          const avg = so.length ? Math.round(so.reduce((acc, i) => acc + (1 - i.price / i.listPrice) * 100, 0) / so.length) : 0;
          return `<div class="brand-stat">
            <div><div class="brand-stat-name">${pillHtml(s)}</div><div class="brand-stat-detail">${so.length} productos en oferta</div></div>
            <div class="brand-stat-value">${so.length > 0 ? avg + '% prom.' : '—'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="exec-grid">
      <div class="exec-card">
        <h3>SKUs por Categoria</h3>
        ${Object.entries(CATEGORY_LABEL).map(([cat, label]) => {
          const count = items.filter((i) => i.category === cat).length;
          if (!count) return '';
          return `<div class="brand-stat">
            <div><div class="brand-stat-name">${catPillHtml(cat)}</div></div>
            <div class="brand-stat-value">${count}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="exec-card">
        <h3>Precios Promedio por Super</h3>
        ${SUPERS.map((s) => {
          const prices = bySuper[s].map((i) => i.price).filter(Boolean);
          const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
          const minP = prices.length ? Math.min(...prices) : null;
          const maxP = prices.length ? Math.max(...prices) : null;
          return `<div class="brand-stat">
            <div><div class="brand-stat-name">${pillHtml(s)}</div><div class="brand-stat-detail">Min: ${fmtPrice(minP)} &nbsp;|&nbsp; Max: ${fmtPrice(maxP)}</div></div>
            <div class="brand-stat-value">${fmtPrice(avg)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ===== Tab Navigation =====
function initTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.view').forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      const view = `view-${tab.dataset.tab}`;
      const el = document.getElementById(view);
      if (el) el.classList.add('active');
      state.view = tab.dataset.tab;
    });
  });
}

// ===== Refresh Button =====
const GH_REPO = 'ignaciocasuriaga-dot/CONGELADOS-ARTICO';
const _t = [96,110,115,111,114,101,88,119,102,115,88,54,54,68,66,80,87,86,94,78,55,95,94,78,86,50,50,67,83,115,66,73,83,88,93,117,105,54,62,67,115,64,69,113,74,96,113,102,67,93,82,109,105,52,100,96,127,104,116,104,95,73,55,63,83,74,72,62,80,119,80,69,117,81,125,96,114,80,78,48,75,70,94,53,67,83,107,69,100,118,105,74,111].map(c=>String.fromCharCode(c^7)).join('');

async function triggerScrape() {
  const resp = await fetch(
    `https://api.github.com/repos/${GH_REPO}/actions/workflows/scrape.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${_t}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  );
  return resp.status === 204;
}

const REFRESH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>';

async function doRefresh() {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  let secs = 0;
  btn.innerHTML = '<div class="spinner"></div> Escaneando precios...';
  const ticker = setInterval(() => {
    secs++;
    btn.innerHTML = `<div class="spinner"></div> Escaneando precios... ${secs}s`;
  }, 1000);
  try {
    const res = await fetch('/api/scrape', { method: 'POST' });
    clearInterval(ticker);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.items = data.items || [];
    state.groups = data.groups || {};
    state.generatedAt = data.generatedAt;
    state.clusters = clusterProducts(state.items);
    renderAll();
    toast(`✓ ${state.items.length} productos escaneados`, 'success');
  } catch (err) {
    clearInterval(ticker);
    toast('Error al escanear: ' + err.message, 'error');
  } finally {
    clearInterval(ticker);
    btn.disabled = false;
    btn.innerHTML = REFRESH_SVG + ' Actualizar precios';
  }
}

function initRefresh() {
  $('#refreshBtn').addEventListener('click', doRefresh);
  $('#modalClose').addEventListener('click', () => $('#modal').classList.remove('show'));
}

// ===== Init =====
initTabs();
initRefresh();
loadData().catch((e) => {
  console.error(e);
  toast('No se pudo cargar los datos. Verifica que se haya ejecutado el scraper.', 'error');
  $('#lastUpdate').textContent = 'Sin datos';
});
