import { defineConfig } from "tsup";
import { resolve } from "path";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  shims: true,
  dts: true,
  external: ["@prisma/client"],
  esbuildOptions(options) {
    // Resolve TypeScript path aliases at build time
    options.alias = {
      "@": resolve(__dirname, "./src"),
      "@core": resolve(__dirname, "./src/core"),
      "@modules": resolve(__dirname, "./src/modules"),
      "@plugins": resolve(__dirname, "./src/plugins"),
      "@app/api-contracts": resolve(
        __dirname,
        "../../packages/api-contracts/src/index.ts",
      ),
    };
  },
});
