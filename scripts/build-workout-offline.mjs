import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) found.push(...await files(join(directory, entry.name), `${name}/`));
    else if (/\.(html|js|css|ttf|woff2?|png|jpe?g|svg|gif|webp|ico|mp3|wav|m4a)$/.test(name) && name !== 'sw.js') found.push(name);
  }
  return found.sort();
}

const resources = await files('dist');
const hash = createHash('sha256');
for (const name of resources) hash.update(name).update(await readFile(join('dist', name)));
const version = hash.digest('hex').slice(0, 16);
const source = `
const CACHE = 'buko-workout-shell-${version}';
const FILES = ${JSON.stringify(resources)};
const ROOT = new URL('./', self.location.href);
const ALLOWED = new Set(FILES.map(file => new URL(file, ROOT).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new URL(file, ROOT).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('buko-workout-shell-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-cache' }).catch(async () => {
      const cached = await caches.open(CACHE);
      const shell = await cached.match(new URL('index.html', ROOT).href);
      return shell || Response.error();
    }));
  } else if (!url.search && ALLOWED.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
`;
await writeFile('dist/sw.js', source);
console.log(`Workout offline shell: ${resources.length} static resources, version ${version}. No API responses are cached.`);
