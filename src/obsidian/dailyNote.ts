/**
 * Today's daily note, via the Daily Notes core plugin's settings. Obsidian
 * exposes no public API for core-plugin options, so we read
 * them defensively through `Reflect` with runtime shape checks (no casts): if
 * the plugin is off or its shape changes, capture falls back gracefully.
 * Pure path/template logic lives in `dailyNoteLogic.ts`.
 */
import { type App, TFile, normalizePath } from "obsidian";
import {
  applyDailyTemplate,
  dailyNotePath,
  dailyTemplatePath,
  formatMomentLike as formatDate,
  type DailyNoteOptions,
} from "./dailyNoteLogic";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** The Daily Notes core plugin's options when it's enabled, else null. */
export function dailyNoteOptions(app: App): DailyNoteOptions | null {
  const internal: unknown = Reflect.get(app, "internalPlugins");
  if (!isRecord(internal)) return null;
  const getPlugin: unknown = internal.getPluginById;
  if (typeof getPlugin !== "function") return null;
  const plugin: unknown = getPlugin.call(internal, "daily-notes");
  if (!isRecord(plugin) || plugin.enabled !== true) return null;
  const instance = plugin.instance;
  const options = isRecord(instance) ? instance.options : undefined;
  if (!isRecord(options)) return {};
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  return { folder: str(options.folder), format: str(options.format), template: str(options.template) };
}

/** Is the Daily Notes core plugin enabled? (Settings warn when it isn't.) */
export function dailyNotesEnabled(app: App): boolean {
  return dailyNoteOptions(app) !== null;
}

/** Today's daily note path, or null when Daily Notes is off. */
export function todaysDailyNotePath(app: App): string | null {
  const opts = dailyNoteOptions(app);
  return opts === null ? null : normalizePath(dailyNotePath(opts, new Date(), formatDate));
}

/**
 * Today's daily note, created (from its template, if any) when missing, with
 * parent folders. Null when Daily Notes is off or the path isn't a note.
 */
export async function ensureTodaysDailyNote(app: App): Promise<TFile | null> {
  const opts = dailyNoteOptions(app);
  if (opts === null) return null;
  const now = new Date();
  const path = normalizePath(dailyNotePath(opts, now, formatDate));
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return existing;
  if (existing !== null) return null;

  let content = "";
  const templatePath = dailyTemplatePath(opts);
  const template = templatePath ? app.vault.getAbstractFileByPath(normalizePath(templatePath)) : null;
  if (template instanceof TFile) {
    const title = path.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    content = applyDailyTemplate(await app.vault.read(template), title, now, formatDate);
  }
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder && app.vault.getAbstractFileByPath(folder) === null) {
    await app.vault.createFolder(folder);
  }
  return app.vault.create(path, content);
}
