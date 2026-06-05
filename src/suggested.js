import { existsSync, readFileSync } from 'node:fs';
import { ALL_BRANDS } from './brands.js';

const SUGGESTED_PATH = process.env.SUGGESTED_PATH || 'data/suggested/precios_sugeridos.csv';
const SUPERS = ['tata', 'disco', 'eldorado', 'tiendainglesa'];
const DEFAULT_TOLERANCE_PCT = 0.5;

const STOP_WORDS = new Set([
  'artico', 'lekker', 'congelado', 'congelados', 'producto', 'pack',
  'unidad', 'unidades', 'un', 'u', 'gr', 'g', 'kg', 'ml', 'cc', 'lt', 'lts',
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'sin', 'y', 'al', 'para', 'x',
]);

const STORE_ALIASES = new Map([
  ['tata', 'tata'],
  ['ta ta', 'tata'],
  ['ta-ta', 'tata'],
  ['super tata', 'tata'],
  ['disco', 'disco'],
  ['el dorado', 'eldorado'],
  ['eldorado', 'eldorado'],
  ['super el dorado', 'eldorado'],
  ['tienda inglesa', 'tiendainglesa'],
  ['tiendainglesa', 'tiendainglesa'],
]);

const HEADER_ALIASES = {
  super: ['super', 'cadena', 'supermercado', 'tienda'],
  sku: ['sku', 'codigo', 'cod_sku', 'codigo_sku', 'id_producto', 'id'],
  brand: ['marca', 'brand', 'submarca'],
  product: ['producto', 'nombre', 'descripcion', 'descripcion_producto', 'articulo'],
  suggestedPrice: ['pvp_sugerido', 'pvpSugerido', 'precio_sugerido', 'precioSugerido', 'suggestedPrice', 'pvs', 'pvp', 'precio'],
  source: ['fuente', 'origen', 'lista', 'archivo'],
  note: ['nota', 'observacion', 'comentario'],
};

let cache = null;

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function norm(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerKey(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function csvDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || '';
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
}

function csvRows(text, delimiter = csvDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => String(v).trim() !== '')) rows.push(row);
  return rows;
}

function recordsFromCsv(text) {
  const rows = csvRows(text).filter((row) => row.some((cell) => String(cell).trim() !== ''));
  if (!rows.length) return [];
  const headers = rows[0].map(headerKey);
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}

function pick(record, aliases) {
  for (const alias of aliases) {
    const key = headerKey(alias);
    if (record[key] != null && String(record[key]).trim() !== '') return record[key];
  }
  return '';
}

export function normalizeStore(value) {
  const normalized = norm(value);
  if (!normalized) return null;
  if (['todos', 'todas', 'all', 'global'].includes(normalized)) return 'all';
  return STORE_ALIASES.get(normalized) || null;
}

function normalizeStoreList(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const parts = raw.split(/[;|/]+/).map(normalizeStore).filter(Boolean);
  if (parts.includes('all')) return SUPERS;
  return [...new Set(parts)];
}

function normalizeBrand(value) {
  const normalized = norm(value);
  if (!normalized) return null;
  const custom = new Map([
    ['artico', 'artico'],
    ['congelados artico', 'artico'],
    ['lekker', 'lekker'],
    ['helados lekker', 'lekker'],
  ]);
  if (custom.has(normalized)) return custom.get(normalized);
  for (const brand of ALL_BRANDS) {
    if (norm(brand) === normalized) return brand;
  }
  return null;
}

function tokens(value) {
  return norm(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function extractSize(value) {
  const text = stripAccents(value).toLowerCase().replace(',', '.');
  let m = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilos?)\b/);
  if (m) return { unit: 'g', value: Math.round(Number(m[1]) * 1000) };

  m = text.match(/(\d+(?:\.\d+)?)\s*(g|gr|gramos)\b/);
  if (m) return { unit: 'g', value: Math.round(Number(m[1])) };

  m = text.match(/(\d+(?:\.\d+)?)\s*(l|lt|lts|litros?)\b/);
  if (m) return { unit: 'ml', value: Math.round(Number(m[1]) * 1000) };

  m = text.match(/(\d+(?:\.\d+)?)\s*(ml|cc)\b/);
  if (m) return { unit: 'ml', value: Math.round(Number(m[1])) };

  m = text.match(/\bx\s*(\d+)\b/) || text.match(/(\d+)\s*(u|un|unid|unidades)\b/);
  if (m) return { unit: 'u', value: Number(m[1]) };

  return null;
}

function sizeScore(rowSize, itemSize) {
  if (!rowSize) return 0;
  if (!itemSize || rowSize.unit !== itemSize.unit) return null;
  const ratio = Math.min(rowSize.value, itemSize.value) / Math.max(rowSize.value, itemSize.value);
  if (ratio < 0.85) return null;
  return 30 + Math.round(ratio * 10);
}

function overlapScore(row, item) {
  const wanted = new Set(tokens(row.product));
  const got = new Set(tokens(item.name));
  if (!wanted.size) return 0;
  let overlap = 0;
  for (const token of wanted) if (got.has(token)) overlap += 1;
  const ratio = overlap / wanted.size;
  if (ratio === 0) return null;
  return { score: Math.round(ratio * 30), ratio };
}

function rowFromRecord(record, index) {
  const stores = normalizeStoreList(pick(record, HEADER_ALIASES.super));
  const product = String(pick(record, HEADER_ALIASES.product)).trim();
  const brand = normalizeBrand(pick(record, HEADER_ALIASES.brand));
  const suggestedPrice = numberOrNull(pick(record, HEADER_ALIASES.suggestedPrice));
  const sku = String(pick(record, HEADER_ALIASES.sku)).trim();
  if (suggestedPrice == null || (!sku && !product) || !stores.length) return null;

  return {
    index,
    stores,
    sku,
    brand,
    product,
    productNorm: norm(product),
    size: extractSize(product),
    suggestedPrice,
    source: String(pick(record, HEADER_ALIASES.source)).trim() || SUGGESTED_PATH,
    note: String(pick(record, HEADER_ALIASES.note)).trim(),
  };
}

function loadSuggestedSource() {
  if (cache) return cache;
  if (!existsSync(SUGGESTED_PATH)) {
    cache = {
      sourceFile: null,
      importedAt: null,
      tolerancePct: DEFAULT_TOLERANCE_PCT,
      rows: [],
      rowsWithSuggested: [],
    };
    return cache;
  }

  const text = readFileSync(SUGGESTED_PATH, 'utf8');
  const rows = recordsFromCsv(text)
    .map(rowFromRecord)
    .filter(Boolean);
  cache = {
    sourceFile: SUGGESTED_PATH,
    importedAt: null,
    tolerancePct: DEFAULT_TOLERANCE_PCT,
    rows,
    rowsWithSuggested: rows.filter((row) => row.suggestedPrice != null),
  };
  return cache;
}

function exactSkuMatch(source, item) {
  if (!item?.sku) return null;
  const sku = String(item.sku);
  return source.rowsWithSuggested.find((row) =>
    row.sku && row.sku === sku && row.stores.includes(item.super));
}

function scoreRow(row, item) {
  if (!row.stores.includes(item.super)) return null;
  if (row.brand && row.brand !== item.brand) return null;

  let score = row.brand ? 30 : 8;
  const itemSize = extractSize(item.name);
  const size = sizeScore(row.size, itemSize);
  if (size == null) return null;
  score += size;

  if (row.productNorm && row.productNorm === norm(item.name)) score += 45;
  const overlap = overlapScore(row, item);
  if (overlap == null) return null;
  score += overlap.score;

  if (row.size && overlap.ratio < 0.2) return null;
  if (!row.size && overlap.ratio < 0.45) return null;
  return score;
}

export function matchSuggested(item) {
  if (!item || item.price == null) return null;
  const source = loadSuggestedSource();
  const skuMatch = exactSkuMatch(source, item);
  if (skuMatch) return skuMatch;

  let best = null;
  for (const row of source.rowsWithSuggested) {
    const score = scoreRow(row, item);
    if (score == null) continue;
    if (!best || score > best.score) best = { row, score };
  }
  return best && best.score >= 45 ? best.row : null;
}

export function applySuggestedPrices(items) {
  const source = loadSuggestedSource();
  return (items || []).map((item) => {
    const row = matchSuggested(item);
    if (!row) return item;

    const gap = row.suggestedPrice
      ? ((Number(item.price) - row.suggestedPrice) / row.suggestedPrice) * 100
      : null;
    const gapPct = gap == null ? null : Number(gap.toFixed(2));
    const status = gapPct == null
      ? null
      : gapPct > source.tolerancePct
        ? 'above'
        : gapPct < -source.tolerancePct
          ? 'below'
          : 'ok';

    return {
      ...item,
      suggestedPrice: row.suggestedPrice,
      gapPct,
      suggestedDeviationPct: gapPct,
      suggestedStatus: status,
      suggestedSource: row.source,
      suggestedProduct: row.product,
      suggestedNote: row.note,
    };
  });
}

export function suggestedSummary(items) {
  const source = loadSuggestedSource();
  const matched = (items || []).filter((item) => item.suggestedPrice != null);
  const byStore = {};
  for (const item of matched) {
    const store = item.super || 'sin_cadena';
    byStore[store] ??= { matched: 0, above: 0, ok: 0, below: 0 };
    byStore[store].matched += 1;
    if (item.suggestedStatus) byStore[store][item.suggestedStatus] += 1;
  }
  return {
    sourceFile: source.sourceFile,
    importedAt: source.importedAt,
    tolerancePct: source.tolerancePct,
    totalRows: source.rows.length,
    rowsWithSuggested: source.rowsWithSuggested.length,
    matchedItems: matched.length,
    above: matched.filter((item) => item.suggestedStatus === 'above').length,
    ok: matched.filter((item) => item.suggestedStatus === 'ok').length,
    below: matched.filter((item) => item.suggestedStatus === 'below').length,
    byStore,
  };
}

export function resetSuggestedCacheForTests() {
  cache = null;
}
