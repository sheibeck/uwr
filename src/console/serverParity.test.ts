import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIALOGUE_SEGMENT_KIND, KEEPER_LABEL } from './lines';

// The server module pulls server imports, so it is read as text, not imported.
const source = readFileSync(resolve(process.cwd(), 'spacetimedb/src/helpers/segments.ts'), 'utf8');

describe('server segment contract parity', () => {
  it('SEGMENT_KINDS lists exactly narration and dialogue', () => {
    const match = /SEGMENT_KINDS\s*=\s*\[([^\]]*)\]/.exec(source);
    expect(match).not.toBeNull();
    const kinds = (match?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter((s) => s !== '');
    expect(kinds).toEqual(['narration', 'dialogue']);
  });

  it('the dialogue segment kind matches the server', () => {
    expect(DIALOGUE_SEGMENT_KIND).toBe('dialogue');
  });

  it('the Keeper label matches KEEPER_SPEAKER', () => {
    const match = /KEEPER_SPEAKER\s*=\s*'([^']*)'/.exec(source);
    expect(match).not.toBeNull();
    expect(KEEPER_LABEL).toBe(match?.[1]);
  });
});
