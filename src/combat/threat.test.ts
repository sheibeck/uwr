import { describe, expect, it } from 'vitest';
import { threatView, type ThreatViewInput } from './threat';

const XSS = '<img src=x onerror=alert(1)>';

function entry(characterId: bigint, value: bigint, enemyId = 5n) {
  return { enemyId, characterId, value };
}

function input(over: Partial<ThreatViewInput> = {}): ThreatViewInput {
  return {
    entries: [],
    target: { id: 5n, name: 'Rotfang' },
    selfId: 1n,
    characterNames: new Map([
      [1n, 'Mira'],
      [2n, 'Tobren'],
      [3n, 'Ayla'],
    ]),
    applied: true,
    ...over,
  };
}

describe('threatView visibility', () => {
  it('hides the block with no target', () => {
    const view = threatView(input({ target: null, entries: [entry(1n, 10n)] }));
    expect(view.visible).toBe(false);
    expect(view.rows).toEqual([]);
    expect(view.emptyText).toBeNull();
  });

  it('hides the block before the view has applied', () => {
    const view = threatView(input({ applied: false, entries: [entry(1n, 10n)] }));
    expect(view.visible).toBe(false);
    expect(view.emptyText).toBeNull();
  });

  it('shows the empty line when applied with no rows for the target', () => {
    const view = threatView(input({ entries: [entry(1n, 10n, 99n)] }));
    expect(view.visible).toBe(true);
    expect(view.rows).toEqual([]);
    expect(view.emptyText).toBe('No threat yet.');
    expect(view.heading).toBe('Threat on Rotfang');
  });

  it('shows the empty line for no entries at all', () => {
    expect(threatView(input()).emptyText).toBe('No threat yet.');
  });
});

describe('threatView ordering and percent', () => {
  it('ignores entries for another enemy', () => {
    const view = threatView(input({ entries: [entry(1n, 10n), entry(2n, 999n, 6n)] }));
    expect(view.rows.map((r) => r.characterId)).toEqual([1n]);
  });

  it('sorts by value descending, ties by character id ascending', () => {
    const view = threatView(
      input({ entries: [entry(3n, 50n), entry(2n, 100n), entry(1n, 50n), entry(4n, 100n)] }),
    );
    expect(view.rows.map((r) => r.characterId)).toEqual([2n, 4n, 1n, 3n]);
  });

  it('gives the top row 100 percent and scales the rest to it', () => {
    const view = threatView(input({ entries: [entry(2n, 400n), entry(3n, 300n)] }));
    expect(view.rows[0].percent).toBe(100);
    expect(view.rows[0].percentText).toBe('100%');
    expect(view.rows[0].widthPercent).toBe('100%');
    expect(view.rows[1].percent).toBe(75);
    expect(view.rows[1].percentText).toBe('75%');
    expect(view.rows[1].widthPercent).toBe('75%');
  });

  it('rounds half up in bigint math', () => {
    expect(threatView(input({ entries: [entry(2n, 3n), entry(3n, 1n)] })).rows[1].percent).toBe(33);
    expect(threatView(input({ entries: [entry(2n, 200n), entry(3n, 1n)] })).rows[1].percent).toBe(1);
    expect(threatView(input({ entries: [entry(2n, 3n), entry(3n, 2n)] })).rows[1].percent).toBe(67);
  });

  it('handles values beyond the safe integer range', () => {
    const big = 9007199254740993000n;
    const view = threatView(input({ entries: [entry(2n, big), entry(3n, big / 2n)] }));
    expect(view.rows[1].percent).toBe(50);
  });

  it('gives every row 0 percent when all values are 0', () => {
    const view = threatView(input({ entries: [entry(2n, 0n), entry(3n, 0n)] }));
    expect(view.rows.map((r) => r.percent)).toEqual([0, 0]);
    expect(view.rows.map((r) => r.percentText)).toEqual(['0%', '0%']);
    expect(view.emptyText).toBeNull();
  });
});

describe('threatView names', () => {
  it("reads 'You' for the player's own row", () => {
    const view = threatView(input({ entries: [entry(1n, 10n)] }));
    expect(view.rows[0].name).toBe('You');
    expect(view.rows[0].isSelf).toBe(true);
  });

  it('reads the character name for others and Member for unknown ids', () => {
    const view = threatView(input({ entries: [entry(2n, 30n), entry(77n, 20n)] }));
    expect(view.rows[0].name).toBe('Tobren');
    expect(view.rows[0].isSelf).toBe(false);
    expect(view.rows[1].name).toBe('Member');
  });

  it('reads Member for every non-self row when selfId is null and the name is unknown', () => {
    const view = threatView(input({ selfId: null, entries: [entry(1n, 5n)], characterNames: new Map() }));
    expect(view.rows[0].name).toBe('Member');
    expect(view.rows[0].isSelf).toBe(false);
  });

  it('keeps markup-looking names as the same plain strings', () => {
    const view = threatView(
      input({
        target: { id: 5n, name: XSS },
        entries: [entry(2n, 5n)],
        characterNames: new Map([[2n, XSS]]),
      }),
    );
    expect(view.heading).toBe(`Threat on ${XSS}`);
    expect(view.rows[0].name).toBe(XSS);
  });
});
