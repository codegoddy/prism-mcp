import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  bundle: false,
  external: ['tree-sitter', 'tree-sitter-typescript', 'tree-sitter-python'],
  noExternal: [/^@modelcontextprotocol\/sdk/],
  target: 'node20',
  platform: 'node',
  outDir: 'build',
  watch: process.argv.includes('--watch'),
  onSuccess: 'node -e "console.log(\'✅ Build complete\')"',
  esbuildOptions: (options) => {
    options.logOverride = { 'empty-glob': 'silent' };
    return options;
  },
});
