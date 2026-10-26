# Steps: companion app handoff

The plugin and companion app use the Steps terminology: `addStep`, `editStep`,
`TodoStep`, and `steps`. The app calls its editor `StepsEditor`; the plugin builds
the Steps section inside the todo modal with `buildSteps`.

The notes below describe the feature's original implementation handoff. The naming
alignment requires no data migration and does not change Markdown or capsules.

## Product contract

- A project is one Markdown note. Project groups organize those notes.
- Project workflow uses the existing six status headings. Other headings are ordinary Markdown; they do not create another project tier.
- An indented checkbox owned by a todo is a step. New steps use `- [ ]` and `- [x]`, with no capsule or ID.
- Steps have text and a checked state only. No priority, due date, reminder, independent status workflow, or separate editor.
- Completing all steps does not automatically complete the parent. Completing the parent checks every owned step in the same atomic write that moves the whole indented block into Done. Reopening the parent leaves its steps checked.
- Steps are absent from boards, ordinary lists, Agenda, Inbox, filter options, reminders, and project/focus counts. A parent may show `2 of 4 steps done`.
- Search includes steps. A matching step appears indented beneath its parent; unmatched ancestors are included for context. Opening a step opens the parent's steps and focuses that step.
- Existing deeper step lists remain readable and searchable. The UI creates only steps directly under the parent, with no nested-step creation control.

```markdown
## Doing
- [/] Install sink <!-- mt id=parent01 -->
    Contractor arrives Tuesday.
    - [x] Measure cabinet
    - [ ] Buy fittings
```

## Port together

1. Copy the plugin's pure `src/core/types.ts`, `span.ts`, and `query.ts` changes, adapting the app's Todo/Task naming only where its source differs. Update callers of `groupTodos`, which now accepts only records.
2. Port `src/obsidian/indexLogic.ts` to the app's vault indexer. Records derive `parentLine`, `depth`, `parentText`, and `steps` from Markdown. Ordinary headings no longer attach organizational context.
3. Port `src/obsidian/writeLogic.ts` to the app's vault writer logic. `placeTodoInProject` now takes `(lines, fromIndex, newStatus, newLine, subLines?)`. Remove the retired heading-scoped placement APIs and record/database fields. Preserve legacy status-label handling.
4. Add writer operations equivalent to `addStep` and `editStep`. Generic todo mutations must reject step records using current file bytes, not a potentially stale database flag. Step toggles replace only the checkbox glyph: no adoption, timestamp, cleanup, or heading move. Port `completeStepsOf` into parent completion and both manual status-heal paths before relocating the block.
5. Port the view exclusion boundaries and search ancestor expansion. Querying only managed tasks is insufficient: new steps intentionally have no managed ID.

## App storage and UI

The app currently stores indexed records in SQLite. It needs an additive derived parent-line/depth representation (or a separate derived steps table keyed by file and line), followed by a full index rebuild. Persist file ownership and parent context without treating steps as independent scheduled tasks. Derive step previews/progress from the same snapshot as the parent.

Remove the retired heading grouping column and UI via a schema migration appropriate to the app's existing migration strategy. Update repository mappings, SQL queries, search, notifications, widgets, filters and aggregate counts. The app's existing schema/migration files must be inspected before choosing exact DDL; this document does not prescribe an unverified schema version.

Add the Steps section to the parent's editor pane: checkbox, editable step text, remove control, and an Add step input. Show only the parent's scheduling controls. Route search results for steps back to this pane.

## File safety and compatibility

- Ownership uses the existing item-span rule: blank lines or dedented content end the parent. Notes remain the indented non-checkbox lines before the first step. Keep these boundaries identical in both programs.
- Parent moves/reorders carry their entire note and steps. Cross-note moves protect every ID outside the transferred span and retain the source if it changes during transfer.
- Parent deletion and opt-in cleanup deletion remove the owned steps too; explicit deletion confirmation mentions the todo and all its steps. Legacy managed step IDs inside that span may be removed, while IDs outside it remain protected.
- Existing managed step capsules are preserved when checking or renaming a step. No bulk rewrite is needed. Text that resembles date/priority syntax remains literal step text and has no scheduling meaning.
- Use current source bytes inside the atomic write. If a step's line/text/checked state changed, refuse the stale edit and reload the steps. Preserve LF/CRLF.
- An older app may still expose steps as independent tasks or move them on status changes. Ship the app port before claiming cross-device feature parity.

## Validation to port

Use `tests/obsidian/steps.test.ts` and `stepWriter.test.ts` as regression cases, plus existing span/status/move tests. Check search-only child matches, completed and unmanaged steps, archived notes, notes before steps, legacy capsules, CRLF, parent deletion/cleanup, cross-note moves, and stale-edit refusal. Exercise the editor and search on a device after the pure tests pass.
