import { describe, it, expect } from "vitest";
/**
 * Cross-repo fixture check: the fixture bytes mirror the
 * plugin's own test lines. The same fixtures are meant to live in BOTH repos —
 * if either side's format behavior drifts, this fails loudly here.
 *
 * The CRLF variant is generated from the LF fixture at build time (see
 * `crlfText` below) and additionally committed as a real file guarded by
 * .gitattributes `-text`, so editor/git normalization can't silently weaken it.
 */
import * as fs from 'fs';
import * as path from 'path';
import {parseTodoLine} from '../../src/core/parse';
import {serializeTodoLine} from '../../src/core/serialize';
import {statusOf} from '../../src/core/types';
import {indexFileTodos} from '../../src/obsidian/indexLogic';

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'shared');
const lfText = fs.readFileSync(path.join(FIXTURE_DIR, 'project-note.md'), 'utf8');
const crlfOnDisk = fs.readFileSync(
  path.join(FIXTURE_DIR, 'project-note-crlf.md'),
  'utf8',
);

describe('shared fixture: line-level round-trip identity', () => {
  it('the LF fixture is plain LF and the CRLF fixture really is CRLF', () => {
    expect(lfText).not.toContain('\r');
    expect(crlfOnDisk).toContain('\r\n');
    expect(crlfOnDisk.replace(/\r\n/g, '\n')).toBe(lfText);
  });

  it('every todo line in the LF fixture reserializes byte-identically', () => {
    let todoLines = 0;
    for (const line of lfText.split('\n')) {
      const todo = parseTodoLine(line);
      if (!todo) {
        continue;
      }
      todoLines++;
      expect(serializeTodoLine(todo)).toBe(line);
    }
    expect(todoLines).toBe(15);
  });

  it('every todo line in the CRLF fixture reserializes byte-identically (minus \\r)', () => {
    for (const line of crlfOnDisk.split('\n')) {
      const todo = parseTodoLine(line);
      if (!todo) {
        continue;
      }
      expect(serializeTodoLine(todo)).toBe(line.replace(/\r$/, ''));
    }
  });
});

describe('shared fixture: file-level indexing (indexFileTodos)', () => {
  const opts = {projectName: 'Home Renovation'};
  const records = indexFileTodos('Home Renovation.md', lfText, opts);

  it('indexes 15 todos: 11 managed, 4 unmanaged', () => {
    expect(records).toHaveLength(15);
    expect(records.filter(r => r.id !== null)).toHaveLength(11);
  });

  it('CRLF input produces records identical to LF input', () => {
    expect(indexFileTodos('Home Renovation.md', crlfOnDisk, opts)).toEqual(
      records,
    );
  });

  it('maps all six glyphs to statuses (unknown glyph defaults to BACKLOG)', () => {
    const count = (s: string) =>
      records.filter(r => statusOf(r) === s).length;
    expect(count('PROGRESS')).toBe(2);
    expect(count('DONE')).toBe(3);
    expect(count('BACKLOG')).toBe(7); // includes the [?] unknown-glyph todo
    expect(count('WARMING')).toBe(1);
    expect(count('BLOCKED')).toBe(1);
    expect(count('PAUSED')).toBe(1);
    expect(records.find(r => r.id === 'qq')?.glyph).toBe('?');
  });

  it('attaches subproject and status section from the heading stack', () => {
    const bySubproject = (name: string) =>
      records.filter(r => r.subproject === name);
    expect(bySubproject('Kitchen')).toHaveLength(4);
    expect(bySubproject('Bathroom')).toHaveLength(5);
    expect(bySubproject('Loose ends')).toHaveLength(6);

    const demo = records.find(r => r.id === 'a2')!;
    expect(demo.section).toBe('PROGRESS');
    expect(demo.project).toBe('Home Renovation');

    // Loose ends has no status heading — section is null there.
    for (const r of bySubproject('Loose ends')) {
      expect(r.section).toBeNull();
    }
  });

  it('recognizes due/tags/links in place without touching displayText', () => {
    const email = records.find(r => r.displayText.startsWith('Email'))!;
    expect(email.id).toBeNull();
    expect(email.due).toBe('2026-08-15');
    expect(email.tags).toEqual(['budget']);
    expect(email.links).toEqual(['Carol']);
    expect(email.displayText).toBe(
      'Email [[Carol]] re #budget before due @ 2026-08-15',
    );
  });

  it("preserves the app's inline directives and unknown capsule keys verbatim", () => {
    const contractor = records.find(r => r.id === 'n1')!;
    expect(contractor.displayText).toContain('notify @ 2026-03-20 09:00');
    expect(contractor.displayText).toContain('delete-after @ 30d');

    const synced = records.find(r => r.id === 'z9')!;
    expect(synced.priority).toBe('LOW');
    expect(synced.displayText).toContain('done @ 2026-06-01');
    expect(synced.extraTokens).toEqual(['notify=2026-09-01', 'src=app']);
  });
});
