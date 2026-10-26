/** Minimal runtime for file-writer tests; Obsidian itself supplies these in the plugin. */
export class TFile {
  path = "";
}
export class Notice {
  constructor(message: string) { void message; }
}
export function normalizePath(path: string): string { return path; }
