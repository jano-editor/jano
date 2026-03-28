import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["packages/**/src/__tests__/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
  build: {
    outDir: "packages/editor/dist",
    lib: {
      entry: "packages/editor/src/cli.ts",
      formats: ["es"],
      fileName: "jano",
    },
    rollupOptions: {
      external: [/^node:/, "adm-zip"],
    },
    target: "node22",
    ssr: true,
    emptyOutDir: true,
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignore: ["packages/test-large.yml", "packages/test.*"],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["packages/test-large.yml", "packages/test.*"],
  },
});
