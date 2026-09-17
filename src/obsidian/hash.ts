/**
 * FNV-1a 32-bit hash (hex). Cheap, non-cryptographic content fingerprint used as
 * a change-detector and self-write guard: if a file's
 * content hash is unchanged we skip re-indexing, and the writer can compare the
 * hash it wrote against the next `changed` event to recognize its own writes.
 */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
