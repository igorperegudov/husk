import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Bundle the workspace core (and its deps) so the published @elisym/husk is
  // self-contained and does not require @elisym/husk-core from the registry.
  noExternal: ['@elisym/husk-core', 'yaml'],
  banner: { js: '#!/usr/bin/env bun' },
});
