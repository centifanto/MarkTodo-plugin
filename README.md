# MarkTodo

> Plain text that levels up only when you ask it to.

An Obsidian plugin for todo and project management on top of plain Markdown. A
todo is a normal checkbox — `- [ ] Buy milk` — and reads like you typed it.
Power (status, priority, due dates, reminders, stable identity) attaches only
to the todos that use it. The `.md` files are always the source of truth.

It pairs with a companion MarkTodo mobile app; both read and write the same
files and agree on one grammar.

## The format

The checkbox glyph is the canonical status:

| Glyph | Status | Section heading |
|-------|--------|-----------------|
| `[ ]` | Backlog | `## Backlog` |
| `[>]` | Warming | `## Warming` |
| `[/]` | Doing | `## Doing` |
| `[!]` | Blocked | `## Blocked` |
| `[-]` | Paused | `## Paused` |
| `[x]` | Done | `## Done` |

The six statuses and their names are fixed: a heading means the same thing in
every vault, on every device, in the plugin and in the app.

Everything else is optional, inline text appended to the todo:

- `due @ 2026-09-20` — a due date
- `done @ 2026-09-17` — set automatically when a todo is marked done
- `notify @ 2026-09-19 09:00` — a reminder
- `@high` (or `@ph`) — inline priority

Dates are normalized on save (`due @ 2026-9-1` becomes `due @ 2026-09-01`),
and every write is round-trip safe — a todo's surrounding text is never
touched, and a write aborts rather than risk dropping a todo.

## Projects

Every todo belongs to a project. Any todo not filed under a project shows up in
the Inbox, which is a view, not a note — there's nothing to create or clean
up. Projects, in-progress work, priorities and due dates are all just
different views over the same Markdown.

## Making todos

A plain checkbox is already a todo. A **managed** todo also carries a hidden
`<!-- mt id=… -->` tag, so MarkTodo can track it through edits and moves and
give it any of the six statuses.

- **Type `mtodo`** at the end of any line, after a space (`Buy milk mtodo`).
  A pop-up offers **Create todo here** (Enter picks it), **Open todo editor**
  and, if you set a catch-all note, **Send to catch-all note**. A plain line or
  list item becomes a managed todo; an existing checkbox keeps its status.
  Change the trigger in Settings → Inline todo trigger.
- **Commands** (Command palette):
  - **Convert current line to managed todo**
  - **Adopt all todos in current note**: manages every plain checkbox in it
  - **Insert managed todo at cursor**
  - **Edit todo at cursor**, also in the editor's right-click menu
  - **Add todo…** opens the todo editor

MarkTodo sets no default hotkeys, so it never clashes with yours. Assign any of
these in Settings → Hotkeys.

## Phones, tablets and the companion app

On phones and tablets MarkTodo starts in **Lightweight mode**: managed
checkboxes, the todo trigger and archive filing keep working, while the
dashboard and boards are off so Obsidian stays quick. The first time, a pop-up
offers the MarkTodo app for Android on Google Play. In Lightweight mode,
opening the dashboard shows that pop-up instead. Settings also has "Get it on
Google Play" buttons. To use the full plugin on a device, go to Settings →
MarkTodo → On this device.

## Privacy

- **It reads your notes.** To find todos and projects, MarkTodo goes through
  every Markdown note in the vault. Folders listed under Settings → Excluded
  folders are skipped when it looks for todos.
- **It edits notes in response to you**: the todos you change, the projects
  you create, and the upkeep you turn on in Settings (keeping a project's
  status sections in step with its checkboxes, filing archived projects into
  the Archive folder). Changes that touch many notes, like renaming a status
  label, ask first.
- **No network.** No accounts, telemetry or network requests. The Contact and
  Google Play buttons open links in your browser.

## Status

Early beta (0.0.1), not yet published to Community Plugins.

## Development

```bash
pnpm install
pnpm dev     # watch build
pnpm build   # production build (type-checks first)
pnpm test    # unit tests
pnpm check   # TypeScript
pnpm lint    # Obsidian's community-plugin review rules
```

To release, bump the version in `manifest.json`, `package.json` and
`versions.json`, then push a tag with the bare version (`0.0.2`). The Release
workflow builds, attests and publishes `main.js`, `manifest.json` and
`styles.css`.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[GNU General Public License, version 3 or later](LICENSE).
