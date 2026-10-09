import { describe, expect, it } from 'vitest';
import {
  actionRowKeys,
  actionProgress,
  actionStartMicros,
  actionSummary,
  actionTimeText,
  currentAction,
} from './actionProgress';
import type { ActionSources } from './actionProgress';
import { createServerClock } from '../game/serverClock';

const S = 1_000_000;
const T = 1_700_000_000 * S;

function sources(over: Partial<ActionSources> = {}): ActionSources {
  return {
    characterId: 5n,
    gathers: [],
    casts: [],
    nodes: [{ id: 3n, name: 'Ironwood' }],
    abilities: [{ id: 20n, name: 'Mend', kind: 'heal', castSeconds: 2n }],
    ...over,
  };
}

const gather = (id: bigint, over: Record<string, unknown> = {}) => ({
  id,
  characterId: 5n,
  nodeId: 3n,
  endsAtMicros: BigInt(T + 8 * S),
  ...over,
});

const cast = (id: bigint, over: Record<string, unknown> = {}) => ({
  id,
  characterId: 5n,
  abilityTemplateId: 20n,
  endsAtMicros: BigInt(T + 2 * S),
  ...over,
});

describe('currentAction', () => {
  it('is null without a character id or rows', () => {
    expect(currentAction(sources({ characterId: null, gathers: [gather(1n)] }))).toBeNull();
    expect(currentAction(sources())).toBeNull();
  });

  it('labels a gather with the node name', () => {
    const view = currentAction(sources({ gathers: [gather(1n)] }));
    expect(view).toEqual({
      kind: 'gather',
      key: 'gather:1',
      label: 'Gathering Ironwood',
      endsAtMicros: BigInt(T + 8 * S),
      knownTotalMicros: 0,
      abilityKind: null,
    });
  });

  it('falls back to Gathering for an unknown or blank node', () => {
    expect(currentAction(sources({ gathers: [gather(1n, { nodeId: 99n })] }))?.label).toBe('Gathering');
    expect(
      currentAction(sources({ gathers: [gather(1n)], nodes: [{ id: 3n, name: '  ' }] }))?.label,
    ).toBe('Gathering');
  });

  it("labels a gather with the row's own label first (a pool gather, review C IN-09)", () => {
    expect(currentAction(sources({ gathers: [gather(1n, { nodeId: 0n, label: 'Panlight Salt' })] }))?.label).toBe(
      'Gathering Panlight Salt',
    );
    // The label wins over a node row; a blank label falls back to the node name.
    expect(currentAction(sources({ gathers: [gather(1n, { label: 'Panlight Salt' })] }))?.label).toBe(
      'Gathering Panlight Salt',
    );
    expect(currentAction(sources({ gathers: [gather(1n, { label: '  ' })] }))?.label).toBe('Gathering Ironwood');
  });

  it('labels a cast with the ability name and its total', () => {
    const view = currentAction(sources({ casts: [cast(2n)] }));
    expect(view?.kind).toBe('cast');
    expect(view?.key).toBe('cast:2');
    expect(view?.label).toBe('Casting Mend');
    expect(view?.knownTotalMicros).toBe(2 * S);
    expect(view?.abilityKind).toBe('heal');
  });

  it('falls back to Casting for a zero or unknown ability id', () => {
    for (const id of [0n, 77n]) {
      const view = currentAction(sources({ casts: [cast(2n, { abilityTemplateId: id })] }));
      expect(view?.label).toBe('Casting');
      expect(view?.knownTotalMicros).toBe(0);
      expect(view?.abilityKind).toBeNull();
    }
  });

  it('ignores rows of another character', () => {
    expect(
      currentAction(sources({ gathers: [gather(1n, { characterId: 6n })], casts: [cast(2n, { characterId: 6n })] })),
    ).toBeNull();
  });

  it('prefers a cast over a gather and the later end among rows of one kind', () => {
    expect(currentAction(sources({ gathers: [gather(1n)], casts: [cast(2n)] }))?.kind).toBe('cast');
    const later = BigInt(T + 9 * S);
    expect(currentAction(sources({ gathers: [gather(1n), gather(2n, { endsAtMicros: later })] }))?.key).toBe('gather:2');
    expect(currentAction(sources({ gathers: [gather(1n), gather(4n)] }))?.key).toBe('gather:4');
    expect(currentAction(sources({ gathers: [gather(4n), gather(1n)] }))?.key).toBe('gather:4');
  });
});

describe('actionRowKeys', () => {
  it('lists every row, gathers then casts', () => {
    expect(actionRowKeys([gather(1n), gather(2n)], [cast(3n)])).toEqual(['gather:1', 'gather:2', 'cast:3']);
    expect(actionRowKeys([], [])).toEqual([]);
  });
});

describe('actionStartMicros', () => {
  const view = (known: number, endsAt: number) => ({
    kind: 'cast' as const,
    key: 'cast:1',
    label: 'Casting Mend',
    endsAtMicros: BigInt(endsAt),
    knownTotalMicros: known,
    abilityKind: 'heal',
  });

  it('starts a gather at the first-seen time', () => {
    const g = currentAction(sources({ gathers: [gather(1n)] }))!;
    expect(actionStartMicros(g, T)).toBe(T);
  });

  it('measures a cast seen mid-cast from its true start', () => {
    expect(actionStartMicros(view(2 * S, T + 1 * S), T)).toBe(T + 1 * S - 2 * S);
  });

  it('measures a floored cast from the first-seen time', () => {
    expect(actionStartMicros(view(2 * S, T + 3 * S), T)).toBe(T);
  });

  it('uses the first-seen time when the total is unknown', () => {
    expect(actionStartMicros(view(0, T + 3 * S), T)).toBe(T);
  });
});

describe('actionProgress', () => {
  const end = BigInt(T + 8 * S);

  it('starts empty with the full time left', () => {
    expect(actionProgress(end, T, T)).toEqual({
      finishing: false,
      seconds: 8,
      fraction: 0,
      percent: 0,
    });
  });

  it('fills as time passes', () => {
    const p = actionProgress(end, T, T + 3 * S);
    expect(p.seconds).toBe(5);
    expect(p.fraction).toBe(0.375);
    expect(p.percent).toBe(38);
  });

  it('rounds the seconds up and never shows 0s while time is left', () => {
    expect(actionProgress(end, T, T + 7.2 * S).seconds).toBe(1);
    expect(actionProgress(end, T, T + 7.99 * S).seconds).toBe(1);
  });

  it('is finishing at and after the end', () => {
    for (const now of [T + 8 * S, T + 9 * S]) {
      const p = actionProgress(end, T, now);
      expect(p.finishing).toBe(true);
      expect(p.seconds).toBe(0);
      expect(p.fraction).toBe(1);
      expect(p.percent).toBe(100);
    }
  });

  it('clamps a now before the start to 0', () => {
    expect(actionProgress(end, T, T - 2 * S).fraction).toBe(0);
  });

  it('gives fraction 0 when the start is not before the end', () => {
    const p = actionProgress(end, T + 8 * S, T);
    expect(p.fraction).toBe(0);
    expect(actionProgress(end, T + 9 * S, T).fraction).toBe(0);
  });

  it('treats a non-finite now as finishing', () => {
    expect(actionProgress(end, T, Number.NaN).finishing).toBe(true);
  });

  it('follows the server clock skew', () => {
    const client = T / 1000;
    const clock = createServerClock(() => client);
    const raw = actionProgress(end, T, clock.nowMicros());
    clock.sample(BigInt(T + 2 * S));
    const skewed = actionProgress(end, T, clock.nowMicros());
    expect(raw.seconds - skewed.seconds).toBe(2);
  });
});

describe('copy', () => {
  it('formats the time text', () => {
    expect(actionTimeText({ finishing: false, seconds: 5, fraction: 0, percent: 0 })).toBe('5s');
    expect(actionTimeText({ finishing: true, seconds: 0, fraction: 1, percent: 100 })).toBe(
      'Finishing…',
    );
  });

  it('formats the summary', () => {
    expect(
      actionSummary('Gathering Ironwood', { finishing: false, seconds: 3, fraction: 0, percent: 0 }),
    ).toBe('Gathering Ironwood · 3s');
    expect(
      actionSummary('Casting Mend', { finishing: true, seconds: 0, fraction: 1, percent: 100 }),
    ).toBe('Casting Mend · Finishing…');
  });
});
