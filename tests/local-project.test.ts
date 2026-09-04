// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { loadConfigFromFile, type PluginOption } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const retiredPackages = ['@openai/sites-vite-plugin', '@cloudflare/vite-plugin', '@cloudflare/workers-types', 'wrangler'];

async function pluginNames(options: PluginOption[]): Promise<string[]> {
  const names: string[] = [];
  for (const option of options) {
    const plugin = await option;
    if (Array.isArray(plugin)) names.push(...await pluginNames(plugin));
    else if (plugin) names.push(plugin.name);
  }
  return names;
}

it.each(['serve', 'build'] as const)('loads the %s configuration without hosted plugins', async command => {
  const loaded = await loadConfigFromFile(
    { command, mode: command === 'build' ? 'production' : 'development' },
    fileURLToPath(new URL('../vite.config.ts', import.meta.url)), root, 'silent',
  );
  expect(loaded).not.toBeNull();
  const names = await pluginNames(loaded!.config.plugins ?? []);
  expect(names.some(name => name.startsWith('vinext:'))).toBe(true);
  // Vinext retains its own inert `vinext:cloudflare-build` compatibility hook;
  // the external Worker/Sites plugins must not be loaded in either mode.
  expect(names.some(name => /^(?:cloudflare:|vite-plugin-cloudflare|sites[:/-])|openai.*sites/i.test(name))).toBe(false);
  expect(loaded!.config.server).toMatchObject({
    host: 'localhost', port: 3001, strictPort: true,
    proxy: {
      '/api/speech': { target: 'http://127.0.0.1:3002', ws: true, changeOrigin: true },
      '/api/operations/events': { target: 'http://127.0.0.1:3002', changeOrigin: true },
    },
  });
});

it('has no Sites metadata or publishing-only dependencies in the manifest and lockfile', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  expect(existsSync(new URL('../.openai/hosting.json', import.meta.url))).toBe(false);
  for (const name of retiredPackages) {
    expect(manifest.dependencies?.[name]).toBeUndefined();
    expect(manifest.devDependencies?.[name]).toBeUndefined();
    expect(lock.packages[''].dependencies?.[name]).toBeUndefined();
    expect(lock.packages[''].devDependencies?.[name]).toBeUndefined();
    expect(lock.packages[`node_modules/${name}`]).toBeUndefined();
  }
});
