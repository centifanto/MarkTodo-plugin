// Obsidian's own review rules (the community directory's automated review uses
// eslint-plugin-obsidianmd). `pnpm lint` before submitting a release.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Proper nouns the sentence-case rule must not lowercase: "MarkTodo" and
// "Kanban" and "Lightweight" (MarkTodo's device mode) are ours, "Obsidian" and
// "Daily notes" (the core plugin) and "Markdown" and "Google Play" are not.
// "cursor" is in the rule's own brand list as the editor; every use here is the
// text cursor, so it stays lowercase.
const sentenceCase = {
  enforceCamelCaseLower: true,
  brands: ["MarkTodo", "Google Play", "Kanban", "Markdown", "Obsidian", "Daily notes", "Lightweight"],
  ignoreWords: ["cursor"],
};

export default defineConfig([
  { ignores: ["node_modules/**", "main.js", "tests/**", "*.config.{mjs,ts}"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["eslint.config.mjs"] } },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", sentenceCase],
    },
  },
]);
