import { describe, expect, it } from 'vitest';
import { trackedQuests } from './quests';

const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });

function quest(id: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    characterId: 1n,
    questTemplateId: 100n,
    progress: 0n,
    completed: false,
    acceptedAt: at(1),
    ...over,
  };
}

const templates = [
  { id: 100n, name: 'Wolves at the Gate', requiredCount: 5n, description: 'Cull the pack.' },
  { id: 101n, name: 'Deliver the Letter', requiredCount: 1n, description: 'Take it to the ferryman.' },
  { id: 102n, name: 'Nameless Errand', requiredCount: 0n },
];

describe('trackedQuests', () => {
  it('shows a bar and a count when more than one is required', () => {
    const [q] = trackedQuests([quest(1n, { progress: 2n })], templates, 1n);
    expect(q).toMatchObject({
      name: 'Wolves at the Gate',
      countText: '2/5',
      showBar: true,
      ready: false,
      description: null,
    });
    expect(q.fraction).toBeCloseTo(0.4, 6);
  });

  it('shows the description instead of a bar when one or fewer is required', () => {
    const [q] = trackedQuests([quest(1n, { questTemplateId: 101n })], templates, 1n);
    expect(q).toMatchObject({ showBar: false, description: 'Take it to the ferryman.', countText: '0/1' });
  });

  it('has a null description when the template has none', () => {
    const [q] = trackedQuests([quest(1n, { questTemplateId: 102n })], templates, 1n);
    expect(q.description).toBeNull();
    expect(q.showBar).toBe(false);
  });

  it('reads Ready for a completed row awaiting turn-in', () => {
    const [q] = trackedQuests([quest(1n, { completed: true, progress: 5n })], templates, 1n);
    expect(q).toMatchObject({ ready: true, countText: 'Ready', showBar: false });
  });

  it('drops finished rows (completedAt set)', () => {
    const rows = [quest(1n, { completed: true, completedAt: at(9) }), quest(2n)];
    expect(trackedQuests(rows, templates, 1n).map((q) => q.id)).toEqual([2n]);
  });

  it('drops other characters and rows whose template is missing', () => {
    const rows = [quest(1n, { characterId: 2n }), quest(2n, { questTemplateId: 999n }), quest(3n)];
    expect(trackedQuests(rows, templates, 1n).map((q) => q.id)).toEqual([3n]);
  });

  it('orders by acceptedAt then id', () => {
    const rows = [
      quest(5n, { acceptedAt: at(2) }),
      quest(3n, { acceptedAt: at(2) }),
      quest(9n, { acceptedAt: at(1) }),
    ];
    expect(trackedQuests(rows, templates, 1n).map((q) => q.id)).toEqual([9n, 3n, 5n]);
  });

  it('clamps progress beyond the requirement', () => {
    const [q] = trackedQuests([quest(1n, { progress: 50n })], templates, 1n);
    expect(q.fraction).toBe(1);
  });

  it('returns [] for no character, no rows or no templates', () => {
    expect(trackedQuests([quest(1n)], templates, null)).toEqual([]);
    expect(trackedQuests([], templates, 1n)).toEqual([]);
    expect(trackedQuests([quest(1n)], [], 1n)).toEqual([]);
  });
});
