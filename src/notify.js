// Compares the last two history snapshots and sends Telegram alerts
// when meaningful price changes are detected. If Telegram is not
// configured, the script exits successfully.
import { promises as fs } from 'node:fs';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const THRESHOLD_PCT = Number(process.env.ALERT_THRESHOLD_PCT || 5);

const HISTORY = 'public/data/history.jsonl';
const PRODUCTS = 'public/data/products.json';
const SUPER_LABEL = { tata: 'Tata', disco: 'Disco', eldorado: 'El Dorado', tiendainglesa: 'Tienda Inglesa' };

if (!TOKEN || !CHAT) {
  console.log('Telegram not configured. Skip.');
  process.exit(0);
}

let history;
try {
  history = (await fs.readFile(HISTORY, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
} catch {
  console.log('No history.jsonl found. Skip.');
  process.exit(0);
}

if (history.length < 2) {
  console.log(`Only ${history.length} snapshot(s). Need at least 2 to compare. Skip.`);
  process.exit(0);
}

let products = {};
try {
  products = JSON.parse(await fs.readFile(PRODUCTS, 'utf8'));
} catch {}

const [prev, curr] = history.slice(-2);
const changes = [];

for (const key of Object.keys(curr.prices)) {
  const newP = curr.prices[key];
  const oldP = prev.prices[key];
  if (oldP == null || newP == null || oldP === newP) continue;

  const diff = newP - oldP;
  const pct = (diff / oldP) * 100;
  if (Math.abs(pct) < THRESHOLD_PCT) continue;

  const meta = products[key] || {};
  changes.push({
    key,
    name: meta.name || key,
    brand: meta.brand,
    super: meta.super,
    group: meta.group,
    oldP,
    newP,
    diff,
    pct,
    url: meta.url,
  });
}

const newProducts = Object.keys(curr.prices).filter((key) => !(key in prev.prices));
const removedProducts = Object.keys(prev.prices).filter((key) => !(key in curr.prices));

if (!changes.length && !newProducts.length && !removedProducts.length) {
  console.log(`No significant changes (threshold: ${THRESHOLD_PCT}%). Skip.`);
  process.exit(0);
}

const drops = changes.filter((change) => change.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 8);
const rises = changes.filter((change) => change.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 8);

const fmtChange = (change) => {
  const superName = SUPER_LABEL[change.super] || change.super;
  const arrow = change.pct < 0 ? 'DOWN' : 'UP';
  const sign = change.pct > 0 ? '+' : '';
  return `${arrow} ${change.name.slice(0, 50)}\n   ${superName} - $${change.oldP.toLocaleString('es-UY')} -> $${change.newP.toLocaleString('es-UY')} (${sign}${change.pct.toFixed(1)}%)`;
};

const fmtDate = new Date(curr.t).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' });
let msg = `Precios Bimbo - ${fmtDate}\n\n`;

if (drops.length) {
  msg += `Bajadas (top ${drops.length}):\n${drops.map(fmtChange).join('\n')}\n\n`;
}
if (rises.length) {
  msg += `Subidas (top ${rises.length}):\n${rises.map(fmtChange).join('\n')}\n\n`;
}
if (newProducts.length) {
  msg += `Productos nuevos: ${newProducts.length}\n`;
}
if (removedProducts.length) {
  msg += `Productos que ya no aparecen: ${removedProducts.length}\n`;
}
msg += '\nVer todo: https://precios-bimbo.vercel.app';

const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: CHAT,
    text: msg,
    disable_web_page_preview: true,
  }),
});

const result = await resp.json();
if (resp.ok && result.ok) {
  console.log(`Telegram sent: ${drops.length} drops, ${rises.length} rises, ${newProducts.length} new, ${removedProducts.length} removed`);
} else {
  console.error('Telegram error:', result);
  process.exit(1);
}
