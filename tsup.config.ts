import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ["tree-sitter", "tree-sitter-typescript", "tree-sitter-python"],
  target: "node20",
  minify: false,
  platform: "node",
  bundle: false,
  outDir: "build",
  watch: process.argv.includes("--watch"),
  onSuccess: "node -e \"console.log('✅ Build complete')\""
});
