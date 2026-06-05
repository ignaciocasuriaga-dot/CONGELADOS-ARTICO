// Monitor de precios - Congelados Artico y Helados Lekker en supermercados uruguayos.

export const CATEGORY_LABEL = {
  hamburguesas: 'Hamburguesas',
  empanadas: 'Empanadas',
  pizza: 'Pizza Congelada',
  papas: 'Papas Fritas Congeladas',
  nuggets: 'Nuggets / Rebozados',
  milanesas: 'Milanesas Congeladas',
  medallones: 'Medallones',
  vegetales: 'Vegetales Congelados',
  pescado: 'Pescado / Mariscos',
  otros_congelados: 'Otros Congelados',
  helados: 'Helados Lekker',
};

export const OWNER_LABEL = {
  artico: 'Artico',
  lekker: 'Lekker',
};

export const COMPANY_LABEL = {
  artico: 'Congelados Artico',
  lekker: 'Helados Lekker',
};

export const STORE_LABEL = {
  tata: 'Ta-Ta',
  disco: 'Disco',
  eldorado: 'El Dorado',
  tiendainglesa: 'Tienda Inglesa',
};

const BRAND_DEFINITIONS = [
  {
    name: 'artico',
    label: 'Artico',
    owner: 'artico',
    company: 'artico',
    categories: ['hamburguesas', 'empanadas', 'pizza', 'papas', 'nuggets', 'milanesas', 'medallones', 'vegetales', 'pescado', 'otros_congelados'],
    aliases: ['artico', 'ártico'],
  },
  {
    name: 'lekker',
    label: 'Lekker',
    owner: 'lekker',
    company: 'lekker',
    categories: ['helados'],
    aliases: ['lekker'],
  },
];

const articoBrands = BRAND_DEFINITIONS.filter((b) => b.owner === 'artico').map((b) => b.name);
const lekkerBrands = BRAND_DEFINITIONS.filter((b) => b.owner === 'lekker').map((b) => b.name);

export const BRAND_GROUPS = {
  artico: articoBrands,
  lekker: lekkerBrands,
};

export const ALL_BRANDS = [...articoBrands, ...lekkerBrands];

export const SEARCH_TERMS = [
  // Marca principal
  'artico',
  'artico congelados',
  // Helados Lekker
  'lekker',
  'helado lekker',
  'helados lekker',
  // Productos congelados Artico por tipo
  'hamburguesa artico',
  'hamburguesas artico',
  'empanada artico',
  'empanadas artico',
  'pizza artico',
  'papas artico',
  'nuggets artico',
  'milanesa artico',
  'milanesas artico',
  'medallon artico',
  'medallones artico',
  'vegetales artico',
  'pescado artico',
  'rebozado artico',
];

const CATEGORY_KEYWORDS = [
  { category: 'helados', patterns: [/\blekker\b/i, /\bhelado/i] },
  { category: 'hamburguesas', patterns: [/hamburguesa/i] },
  { category: 'empanadas', patterns: [/empanada/i] },
  { category: 'pizza', patterns: [/pizza/i] },
  { category: 'papas', patterns: [/papa[s]?\s*(frita|cong)/i, /\bpapas\b/i] },
  { category: 'nuggets', patterns: [/nugget/i, /rebozado/i, /\bcrispeta/i] },
  { category: 'milanesas', patterns: [/milanesa/i] },
  { category: 'medallones', patterns: [/medallon/i, /medallón/i] },
  { category: 'vegetales', patterns: [/vegetal/i, /verdura/i, /espinaca/i, /brocoli/i, /choclo/i, /arveja/i, /zanahoria/i] },
  { category: 'pescado', patterns: [/pescado/i, /merluza/i, /calamar/i, /camarones?/i, /mariscos?/i, /bast[oó]n\s*de\s*pescado/i] },
];

function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias) {
  return stripAccents(alias)
    .toLowerCase()
    .split(/\s+/)
    .map(escapeRegex)
    .join('[\\s-]+');
}

const MATCHERS = BRAND_DEFINITIONS.flatMap((brand) =>
  brand.aliases.map((alias) => ({
    brand: brand.name,
    length: alias.length,
    rx: new RegExp(`\\b${aliasPattern(alias)}\\b`, 'i'),
  })),
).sort((a, b) => b.length - a.length);

export function matchedPortfolio(text) {
  if (!text) return null;
  const norm = stripAccents(text).toLowerCase();
  const match = MATCHERS.find((m) => m.rx.test(norm));
  return match?.brand ?? null;
}

export const matchedBrand = matchedPortfolio;

function detectCategory(norm) {
  for (const { category, patterns } of CATEGORY_KEYWORDS) {
    if (patterns.some((rx) => rx.test(norm))) return category;
  }
  return null;
}

export function enrichProduct(item, text) {
  const norm = stripAccents(String(text ?? item.name ?? '')).toLowerCase();
  const brand = matchedPortfolio(norm);
  if (!brand) return item;
  const def = BRAND_DEFINITIONS.find((b) => b.name === brand);
  const category = detectCategory(norm);
  return {
    ...item,
    brand,
    group: def?.owner ?? 'artico',
    company: def?.company ?? brand,
    category: category ?? undefined,
  };
}

export function brandGroup(brand) {
  if (articoBrands.includes(brand)) return 'artico';
  if (lekkerBrands.includes(brand)) return 'lekker';
  return null;
}

export const CATEGORY_GROUPS = Object.fromEntries(
  Object.keys(CATEGORY_LABEL).map((cat) => [
    cat,
    BRAND_DEFINITIONS.filter((b) => b.categories.includes(cat)).map((b) => b.name),
  ]),
);
