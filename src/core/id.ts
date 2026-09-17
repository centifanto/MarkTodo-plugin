/**
 * Todo id generator.
 *
 * Shared by both programs: the companion app runs this exact file (its copy of
 * `core/`), so ids written from Obsidian and from the phone into the SAME `.md`
 * files have one format — 62-char alphabet, 8 chars. `Math.random()` is used
 * because the app's Hermes runtime lacks `crypto.getRandomValues()`; it's fine
 * for ids that only need to be unique within a vault.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Generate a random id (default 8 chars) from `[A-Za-z0-9]`. */
export function generateId(length = 8): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}
