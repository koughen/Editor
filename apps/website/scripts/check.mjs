import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const origin = 'https://editor-build.test';
const pages = new Map();
async function visit({ directory: currentDirectory }) {
  for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
    const path = resolve(currentDirectory, entry.name);
    if (entry.isDirectory()) await visit({ directory: path });
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(path, 'utf8');
      pages.set(path, { html, ids: new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])) });
    }
  }
}
await visit({ directory });
let checked = 0;
const problems = [];
for (const [path, { html }] of pages) {
  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) references.push(...match[1].split(',').map((source) => source.trim().split(/\s+/)[0]));
  for (const reference of references) {
    const url = new URL(reference, `${origin}/${relative(directory, path)}`);
    if (url.origin !== origin) continue;
    checked += 1;
    let target = resolve(directory, `.${decodeURIComponent(url.pathname)}`);
    try {
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      await stat(target);
      if (url.hash && pages.has(target) && !pages.get(target).ids.has(decodeURIComponent(url.hash.slice(1)))) throw new Error('Missing anchor');
    } catch {
      problems.push(`${relative(directory, path)} → ${reference}`);
    }
  }
  if (html.includes('__SITE_URL__') || html.includes('__MIT_LICENSE__')) problems.push(`${path}: unresolved template token`);
}
if (problems.length) throw new Error(`Broken website references:\n${problems.join('\n')}`);
console.log(`Checked ${pages.size} pages and ${checked} internal links, anchors, and assets.`);
