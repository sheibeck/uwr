/**
 * Phase 46 (SEG-02): the optional `segments` column exists on exactly the three event tables that
 * narrative routes write, as the LAST column, and nowhere else. Reads the real schema through the
 * recording mock, plus a source check for the single KeeperSegment product type.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { recordedTable, recordedTables } from '../helpers/schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const WITH_SEGMENTS = ['event_private', 'event_location', 'event_creation'];

describe('segments column on event rows (SEG-02)', () => {
  for (const name of WITH_SEGMENTS) {
    it(`${name} ends with an optional array column named segments`, async () => {
      await import('./tables');
      const rec = recordedTable(name);
      expect(rec, name).toBeDefined();
      const keys = Object.keys(rec!.cols);
      expect(keys[keys.length - 1]).toBe('segments');
      expect(rec!.cols.segments.kind).toBe('array');
      expect(rec!.cols.segments.optional).toBe(true);
      expect(rec!.cols.segments.primaryKey).toBe(false);
    });
  }

  it('event_world and event_group have no segments column', async () => {
    await import('./tables');
    for (const name of ['event_world', 'event_group']) {
      const rec = recordedTable(name);
      expect(rec, name).toBeDefined();
      expect('segments' in rec!.cols, name).toBe(false);
    }
  });

  it('no other recorded table has a column named segments', async () => {
    await import('./tables');
    const holders = recordedTables()
      .filter((r) => 'segments' in r.cols)
      .map((r) => r.name)
      .sort();
    expect(holders).toEqual([...WITH_SEGMENTS].sort());
  });

  it('the three tables are event tables (the optional column is only safe there)', async () => {
    await import('./tables');
    for (const name of WITH_SEGMENTS) expect(recordedTable(name)!.opts.event, name).toBe(true);
  });

  it('tables.ts defines KeeperSegment exactly once with its four fields', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const source: string = readFileSync(join(here, 'tables.ts'), 'utf8');
    expect(source.match(/t\.object\('KeeperSegment'/g)).toHaveLength(1);
    const start = source.indexOf("t.object('KeeperSegment'");
    const block = source.slice(start, source.indexOf('});', start));
    for (const field of ['kind: t.string()', 'speaker: t.string()', 'text: t.string()', 'speakerNpcId: t.u64().optional()']) {
      expect(block, field).toContain(field);
    }
    expect(source.match(/segments: t\.array\(KeeperSegment\)\.optional\(\)/g)).toHaveLength(3);
  });
});
