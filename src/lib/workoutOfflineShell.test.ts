import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

test('workout offline shell caches static assets only and handles scoped offline navigation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'buko-workout-shell-'));
  try {
    mkdirSync(join(directory, 'dist', '_expo'), { recursive: true });
    writeFileSync(join(directory, 'dist', 'index.html'), '<html>Buko</html>');
    writeFileSync(join(directory, 'dist', '_expo', 'app.js'), 'console.log("workout");');
    const buildScript = new URL('../../scripts/build-workout-offline.mjs', import.meta.url);
    execFileSync(process.execPath, [buildScript.pathname], { cwd: directory });
    const code = readFileSync(join(directory, 'dist', 'sw.js'), 'utf8');
    const handlers: Record<string, (event: { request: { method: string; url: string; mode: string }; respondWith(value: unknown): void }) => void> = {};
    const context = {
      URL, Set, Response,
      self: { location: { href: 'https://example.com/buko/sw.js' }, addEventListener: (name: string, handler: typeof handlers[string]) => { handlers[name] = handler; } },
      caches: { open: async () => ({ match: async () => null }) }, fetch: async () => new Response('network'),
    };
    vm.runInNewContext(code, context);
    const intercept = (url: string, mode = 'cors', method = 'GET') => {
      let handled = false;
      handlers.fetch({ request: { url, mode, method }, respondWith() { handled = true; } });
      return handled;
    };
    assert.equal(intercept('https://example.com/buko/_expo/app.js'), true);
    assert.equal(intercept('https://example.com/buko/workout/active', 'navigate'), true);
    assert.equal(intercept('https://example.com/buko/?access_token=private'), false);
    assert.equal(intercept('https://project.supabase.co/rest/v1/workouts'), false);
    assert.equal(intercept('https://example.com/buko/api/workouts'), false);
    assert.equal(intercept('https://example.com/buko/_expo/app.js', 'cors', 'POST'), false);
    assert.equal(intercept('https://example.com/other', 'navigate'), false);
    const oldVersion = code.match(/buko-workout-shell-([a-f0-9]+)/)?.[1];
    writeFileSync(join(directory, 'dist', '_expo', 'app.js'), 'console.log("updated");');
    execFileSync(process.execPath, [buildScript.pathname], { cwd: directory });
    assert.notEqual(readFileSync(join(directory, 'dist', 'sw.js'), 'utf8').match(/buko-workout-shell-([a-f0-9]+)/)?.[1], oldVersion);
  } finally { rmSync(directory, { recursive: true }); }
});
