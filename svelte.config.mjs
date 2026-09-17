import { sveltePreprocess } from "svelte-preprocess";

// Used by svelte-check (and esbuild-svelte) so `<script lang="ts">` is understood.
export default {
  preprocess: sveltePreprocess(),
};
