import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { MarkTodoSettings } from "../../src/obsidian/settings";

import { TFile } from "obsidian";
import { Writer } from "../../src/obsidian/writer";
import { indexFileTodos } from "../../src/obsidian/indexLogic";

const source = [
  "## Backlog", "- [ ] Parent <!-- mt id=parent01 -->",
  "    Parent note", "  - [ ] First step", "  - [x] Second step <!-- mt id=legacy01 -->",
  "- [ ] Sibling <!-- mt id=sibling1 -->", "## Done", "",
].join("\r\n");

function fixture(initial = source, cleanup = false, sections = true) {
  const files = new Map([['P.md', Object.assign(new TFile(), { path: 'P.md' })], ['Target.md', Object.assign(new TFile(), { path: 'Target.md' })]]);
  const bytes = new Map([['P.md', initial], ['Target.md', '## Backlog\r\n']]);
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path),
      read: async (file: TFile) => bytes.get(file.path)!,
      process: async (file: TFile, update: (data: string) => string) => {
        bytes.set(file.path, update(bytes.get(file.path)!));
      },
    },
    metadataCache: { getFileCache: () => ({ frontmatter: { marktodo: true, ...(cleanup ? { 'marktodo-cleanup': 'delete' } : {}) } }) },
  } as unknown as App;
  const writer = new Writer(app, () => ({ maintainStatusHeaders: sections } as MarkTodoSettings));
  const records = () => indexFileTodos('P.md', bytes.get('P.md')!, { projectName: 'P' });
  return { writer, bytes, records, file: files.get('P.md')! };
}

beforeEach(() => vi.clearAllMocks());

describe('step writer integration', () => {
  it('adds a plain step after existing steps, reuses their indent and preserves CRLF', async () => {
    const f = fixture();
    expect(await f.writer.addStep(f.records()[0], 'Third @high due @ 2026-1-1')).toBe(true);
    expect(f.bytes.get('P.md')).toContain('  - [x] Second step <!-- mt id=legacy01 -->\r\n  - [ ] Third @high due @ 2026-1-1\r\n- [ ] Sibling');
    expect(f.bytes.get('P.md')!.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('starts a new set of steps after the note with no capsule on the step', async () => {
    const f = fixture('- [ ] Parent <!-- mt id=parent01 -->\n    A note\n');
    await f.writer.addStep(f.records()[0], 'First');
    expect(f.bytes.get('P.md')).toBe('- [ ] Parent <!-- mt id=parent01 -->\n    A note\n    - [ ] First\n');
  });

  it('rejects nested creation and forged or multiline titles', async () => {
    const f = fixture();
    expect(await f.writer.addStep(f.records()[1], 'Nested')).toBe(false);
    expect(await f.writer.addStep(f.records()[0], 'a\n- [ ] b')).toBe(false);
    expect(await f.writer.addStep(f.records()[0], '<!-- mt id=forged -->')).toBe(false);
    expect(f.bytes.get('P.md')).toBe(source);
  });

  it('edits a step without adopting it, stamping dates or moving sections', async () => {
    const f = fixture();
    const parent = f.records()[0];
    expect(await f.writer.editStep(parent, parent.steps[0], { done: true })).toBe(true);
    expect(f.bytes.get('P.md')).toBe(source.replace('  - [ ] First step', '  - [x] First step'));
  });

  it('refuses dates, priority, adoption, status and direct moves on steps', async () => {
    const f = fixture();
    const step = f.records()[1];
    expect(await f.writer.setDue(step, '2026-12-01')).toBe(false);
    expect(await f.writer.setPriority(step, 'HIGH')).toBe(false);
    expect(await f.writer.adopt(step)).toBe(false);
    expect(await f.writer.setStatus(step, 'PROGRESS')).toBe(false);
    expect(await f.writer.moveTodo(step, 'Target.md')).toBe(false);
    expect(f.bytes.get('P.md')).toBe(source);
  });

  it('adopts parent checkboxes only when adopting a note', async () => {
    const f = fixture('- [ ] Parent\n    - [ ] Step\n- [ ] Other\n');
    expect(await f.writer.adoptNote(f.file)).toBe(2);
    expect(f.bytes.get('P.md')).toContain('\n    - [ ] Step\n');
  });

  it('moves a parent and all its steps without leaving duplicates in the source', async () => {
    const f = fixture();
    expect(await f.writer.moveTodo(f.records()[0], 'Target.md')).toBe(true);
    expect(f.bytes.get('P.md')).not.toContain('Parent');
    expect(f.bytes.get('P.md')).not.toContain('First step');
    expect(f.bytes.get('P.md')).toContain('Sibling');
    expect(f.bytes.get('Target.md')).toContain('    Parent note\r\n  - [ ] First step\r\n  - [x] Second step <!-- mt id=legacy01 -->');
  });

  it('deletes the explicitly selected parent span while preserving neighbors', async () => {
    const f = fixture();
    expect(await f.writer.deleteTodo(f.records()[0])).toBe(true);
    expect(f.bytes.get('P.md')).toBe('## Backlog\r\n- [ ] Sibling <!-- mt id=sibling1 -->\r\n## Done\r\n');
  });

  it('completes every step while moving its whole indented block under Done', async () => {
    const initial = source.replace('  - [ ] First step', '  - [ ] First step\r\n      * [ ] Nested step');
    const f = fixture(initial);
    expect(await f.writer.setStatus(f.records()[0], 'DONE')).toBe(true);
    const text = f.bytes.get('P.md')!;
    expect(text).toContain('    Parent note\r\n  - [x] First step\r\n      * [x] Nested step\r\n  - [x] Second step <!-- mt id=legacy01 -->');
    const parent = f.records().find((r) => r.id === 'parent01')!;
    expect(parent.section).toBe('DONE');
    expect(parent.steps).toHaveLength(3);
    expect(parent.steps.every((s) => s.done)).toBe(true);
    expect(f.records().find((r) => r.id === 'sibling1')?.glyph).toBe(' ');
    expect(text.split('done @')).toHaveLength(2); // only the parent receives a stamp
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
    expect(await f.writer.setStatus(parent, 'BACKLOG')).toBe(true);
    expect(f.records().find((r) => r.id === 'parent01')!.steps.every((s) => s.done)).toBe(true);
  });

  it('checks steps in place when status header maintenance is disabled', async () => {
    const f = fixture(source, false, false);
    await f.writer.setStatus(f.records()[0], 'DONE');
    expect(f.bytes.get('P.md')).toContain('  - [x] First step');
    expect(f.records().find((r) => r.id === 'parent01')?.line).toBe(1);
  });

  it.each(['glyph-wins', 'section-wins'] as const)('manual %s completion checks steps and preserves their parent', async (action) => {
    const initial = action === 'glyph-wins'
      ? source.replace('[ ] Parent', '[x] Parent')
      : source.replace('## Backlog', '## Done');
    const f = fixture(initial);
    await f.writer.applyHeal(f.file, [{ id: 'parent01', action, toStatus: 'DONE' }]);
    const parent = f.records().find((r) => r.id === 'parent01')!;
    expect(parent.glyph).toBe('x');
    expect(parent.section).toBe('DONE');
    expect(parent.steps).toHaveLength(2);
    expect(parent.steps.every((s) => s.done)).toBe(true);
    expect(f.bytes.get('P.md')).toContain('    Parent note\r\n  - [x] First step\r\n  - [x] Second step <!-- mt id=legacy01 -->');
  });

  it('cleanup deletes the parent span, including legacy managed steps', async () => {
    const f = fixture(source, true);
    expect(await f.writer.setStatus(f.records()[0], 'DONE')).toBe(true);
    expect(f.bytes.get('P.md')).not.toContain('parent01');
    expect(f.bytes.get('P.md')).not.toContain('legacy01');
    expect(f.bytes.get('P.md')).toContain('sibling1');
  });

  it('moving completed parents to the bottom preserves steps, and never extracts done steps', async () => {
    const f = fixture();
    expect(await f.writer.moveCompletedToBottom(f.file)).toBe(0);
    const completed = fixture(source.replace('[ ] Parent', '[x] Parent'));
    expect(await completed.writer.moveCompletedToBottom(completed.file)).toBe(1);
    expect(completed.bytes.get('P.md')).toContain('Parent <!-- mt id=parent01 -->\r\n    Parent note\r\n  - [ ] First step\r\n  - [x] Second step');
  });
});
