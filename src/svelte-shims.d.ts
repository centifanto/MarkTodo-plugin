/**
 * Lets `tsc --noEmit` resolve `import X from "./Foo.svelte"` in the .ts glue code.
 * Full type-checking of component internals is done by `svelte-check` (which
 * understands runes + props); this shim only satisfies the bundler-facing imports.
 */
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<Record<string, unknown>>;
  export default component;
}
