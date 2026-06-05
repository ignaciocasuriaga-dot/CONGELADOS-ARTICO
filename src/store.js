import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

export async function writeJsonl(path, records) {
  await ensureDir(path);
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await appendFile(path, lines, 'utf8');
}

export async function resetFile(path) {
  await ensureDir(path);
  await writeFile(path, '', 'utf8');
}

export function timestamp() {
  return new Date().toISOString();
}
