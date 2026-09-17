import esbuild from "esbuild";
import process from "process";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import esbuildSvelte from "esbuild-svelte";
import { sveltePreprocess } from "svelte-preprocess";

// The third-party notices ride in the bundle's header: Obsidian installs only
// main.js, manifest.json and styles.css, and the MIT licenses ask for the notice
// in every copy.
const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8").replaceAll("*/", "* /");
const banner = `/*
MarkTodo — generated bundle. Do not edit directly.
Source: https://github.com/centifanto/MarkTodo-plugin (src/ + main.ts)

Copyright (C) 2026 Isaiah Centifanto
Licensed under the GNU General Public License, version 3 or (at your option) any
later version. See LICENSE in the source repository.

${notices}*/`;

const prod = process.argv[2] === "production";

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  plugins: [
    esbuildSvelte({
      compilerOptions: { css: "injected" },
      preprocess: sveltePreprocess(),
    }),
  ],
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
