// Obsidian's own review rules (the community directory's automated review uses
// eslint-plugin-obsidianmd). `pnpm lint` before submitting a release.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["node_modules/**", "main.js", "tests/**", "*.config.{mjs,ts}"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["eslint.config.mjs"] } },
    },
  },
]);
