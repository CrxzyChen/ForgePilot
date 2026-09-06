import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(process.cwd());
const outputRoot = resolve(root, 'dist', 'electron');
const external = (id) =>
  id === 'electron' || id === 'typescript' || id.startsWith('node:');

rmSync(outputRoot, { recursive: true, force: true });

await build({
  configFile: false,
  build: {
    outDir: resolve(outputRoot, 'main'),
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'studio', 'electron', 'main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rolldownOptions: { external },
  },
});

await build({
  configFile: false,
  build: {
    outDir: resolve(outputRoot, 'engine-mcp'),
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'studio', 'server', 'engine-mcp-server.ts'),
      formats: ['es'],
      fileName: () => 'server.js',
    },
    rolldownOptions: { external },
  },
});

await build({
  configFile: false,
  build: {
    outDir: resolve(outputRoot, 'preload'),
    emptyOutDir: true,
    target: 'node22',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'studio', 'electron', 'preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rolldownOptions: { external },
  },
});

await build({
  configFile: false,
  root: resolve(root, 'studio', 'electron', 'renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(outputRoot, 'renderer'),
    emptyOutDir: true,
    target: 'chrome142',
    sourcemap: true,
  },
});

console.log(`[electron] built ${outputRoot}`);
