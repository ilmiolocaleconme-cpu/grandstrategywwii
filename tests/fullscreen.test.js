import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enterFullscreenLandscape, exitFullscreenAndUnlock, fullscreenSupport, isFullscreen } from '../src/ui/fullscreen.js';

// ambiente finto (non c'è un browser): solo la logica delle funzioni, non il comportamento reale dei telefoni
function fakeEnv({ fullscreenEnabled = true, displayFullscreen = false, requestRejects = false, lock = 'ok', fsElement = null } = {}) {
  const calls = [];
  const env = {
    calls,
    matchMedia: (q) => ({ matches: displayFullscreen && q === '(display-mode: fullscreen)' }),
    document: {
      fullscreenEnabled,
      fullscreenElement: fsElement,
      documentElement: {
        requestFullscreen: async (opts) => { calls.push(['request', opts]); if (requestRejects) throw new Error('no'); env.document.fullscreenElement = {}; },
      },
      exitFullscreen: async () => { calls.push(['exit']); env.document.fullscreenElement = null; },
    },
    screen: lock === 'absent' ? {} : {
      orientation: {
        lock: async (o) => { calls.push(['lock', o]); if (lock === 'reject') throw new Error('no'); },
        unlock: () => calls.push(['unlock']),
      },
    },
  };
  return env;
}

test('supporto: app installata a schermo intero, API disponibile, non disponibile', () => {
  assert.equal(fullscreenSupport(fakeEnv({ displayFullscreen: true })), 'installed');
  assert.equal(fullscreenSupport(fakeEnv()), 'api');
  assert.equal(fullscreenSupport(fakeEnv({ fullscreenEnabled: false })), 'none');
  assert.equal(fullscreenSupport({}), 'none');
});

test('entra a schermo intero e blocca in orizzontale', async () => {
  const env = fakeEnv();
  const r = await enterFullscreenLandscape(env);
  assert.deepEqual(r, { ok: true, locked: true });
  assert.deepEqual(env.calls, [['request', { navigationUI: 'hide' }], ['lock', 'landscape']]);
  assert.equal(isFullscreen(env), true);
});

test('blocco orizzontale rifiutato o assente: lo schermo intero resta, locked false', async () => {
  const rejected = await enterFullscreenLandscape(fakeEnv({ lock: 'reject' }));
  assert.equal(rejected.ok, true); assert.equal(rejected.locked, false); assert.equal(rejected.reason, 'orientation-refused');
  const absent = await enterFullscreenLandscape(fakeEnv({ lock: 'absent' }));
  assert.equal(absent.ok, true); assert.equal(absent.locked, false); assert.equal(absent.reason, 'orientation-unsupported');
});

test('schermo intero rifiutato: nessun blocco tentato', async () => {
  const env = fakeEnv({ requestRejects: true });
  const r = await enterFullscreenLandscape(env);
  assert.equal(r.ok, false);
  assert.deepEqual(env.calls, [['request', { navigationUI: 'hide' }]]);
});

test('esce dallo schermo intero e sblocca', async () => {
  const env = fakeEnv({ fsElement: {} });
  assert.equal((await exitFullscreenAndUnlock(env)).ok, true);
  assert.deepEqual(env.calls, [['unlock'], ['exit']]);
  assert.equal(isFullscreen(env), false);
});

// Il manifest viene generato da vite.config.js: qui si controlla solo il testo della configurazione.
// Il manifest reale in dist/ si verifica dopo la build (vedi docs/STATO_IMPLEMENTAZIONE.md).
test('configurazione del manifest: schermo intero e orizzontale', () => {
  const cfg = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(cfg, /display:\s*'fullscreen'/);
  assert.match(cfg, /display_override:\s*\['fullscreen',\s*'standalone'\]/);
  assert.match(cfg, /orientation:\s*'landscape'/);
});
