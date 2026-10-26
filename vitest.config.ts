import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { obsidian: new URL("./tests/mocks/obsidian.ts", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
