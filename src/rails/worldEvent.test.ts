import { describe, expect, it } from 'vitest';
import { eventCard, eventSplit, formatTimeLeft } from './worldEvent';

const MIN = 60_000_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000_000;
const at = (offsetMicros: number) => BigInt(NOW + offsetMicros);

describe('formatTimeLeft', () => {
  it('is null without a deadline', () => {
    expect(formatTimeLeft(0n, NOW)).toBeNull();
  });

  it('reads Ending at or past the deadline', () => {
    expect(formatTimeLeft(at(0), NOW)).toBe('Ending');
    expect(formatTimeLeft(at(-5 * MIN), NOW)).toBe('Ending');
  });

  it('reads Under 1m below a minute', () => {
    expect(formatTimeLeft(at(30_000_000), NOW)).toBe('Under 1m');
    expect(formatTimeLeft(at(MIN - 1), NOW)).toBe('Under 1m');
  });

  it('shows the two largest units', () => {
    expect(formatTimeLeft(at(MIN), NOW)).toBe('1m');
    expect(formatTimeLeft(at(14 * MIN), NOW)).toBe('14m');
    expect(formatTimeLeft(at(2 * HOUR + 14 * MIN), NOW)).toBe('2h 14m');
    expect(formatTimeLeft(at(HOUR), NOW)).toBe('1h 0m');
    expect(formatTimeLeft(at(3 * DAY + 4 * HOUR), NOW)).toBe('3d 4h');
  });
});

describe('eventSplit', () => {
  it('is null while both counters are 0 (no implied progress)', () => {
    expect(eventSplit(0n, 0n)).toBeNull();
    expect(eventSplit(-3n, 0n)).toBeNull();
  });

  it('derives the second side as 100 minus the first', () => {
    expect(eventSplit(62n, 38n)).toMatchObject({ forPct: 62, againstPct: 38 });
    expect(eventSplit(1n, 2n)).toMatchObject({ forPct: 33, againstPct: 67 });
    expect(eventSplit(1n, 0n)).toMatchObject({ forPct: 100, againstPct: 0, forFraction: 1 });
    expect(eventSplit(0n, 4n)).toMatchObject({ forPct: 0, againstPct: 100, forFraction: 0 });
  });

  it('never exceeds 100 in total', () => {
    const s = eventSplit(1n, 6n)!;
    expect(s.forPct + s.againstPct).toBe(100);
  });
});

describe('eventCard', () => {
  const ev = (id: bigint, over: Record<string, unknown> = {}) => ({
    id,
    name: `Event ${id}`,
    regionId: 1n,
    status: 'active',
    deadlineAtMicros: at(HOUR),
    successCounter: 0n,
    failureCounter: 0n,
    ...over,
  });
  const base = { objectives: [], contributions: [], characterId: 7n, nowMicros: NOW };

  it('is null for no region, no events, or no active event in the region', () => {
    expect(eventCard({ ...base, events: [ev(1n)], regionId: null })).toBeNull();
    expect(eventCard({ ...base, events: [], regionId: 1n })).toBeNull();
    expect(eventCard({ ...base, events: [ev(1n, { status: 'resolved' })], regionId: 1n })).toBeNull();
    expect(eventCard({ ...base, events: [ev(1n, { regionId: 2n })], regionId: 1n })).toBeNull();
  });

  it('shows the soonest-ending event and counts the rest', () => {
    const card = eventCard({
      ...base,
      events: [ev(1n, { deadlineAtMicros: at(3 * HOUR) }), ev(2n, { deadlineAtMicros: at(HOUR) }), ev(3n, { deadlineAtMicros: at(2 * HOUR) })],
      regionId: 1n,
    })!;
    expect(card.id).toBe(2n);
    expect(card.more).toBe(2);
    expect(card.timeLeft).toBe('1h 0m');
  });

  it('sorts a deadline of 0 last and breaks ties by id', () => {
    const noDeadline = eventCard({ ...base, events: [ev(1n, { deadlineAtMicros: 0n }), ev(2n)], regionId: 1n })!;
    expect(noDeadline.id).toBe(2n);
    const tie = eventCard({ ...base, events: [ev(9n), ev(4n)], regionId: 1n })!;
    expect(tie.id).toBe(4n);
    const onlyNone = eventCard({ ...base, events: [ev(1n, { deadlineAtMicros: 0n })], regionId: 1n })!;
    expect(onlyNone.timeLeft).toBeNull();
    expect(onlyNone.more).toBe(0);
  });

  it('lists objectives with progress text and clamped fraction', () => {
    const card = eventCard({
      ...base,
      events: [ev(1n)],
      regionId: 1n,
      objectives: [
        { id: 12n, eventId: 1n, name: 'Protect the Villagers', currentCount: 3n, targetCount: 10n },
        { id: 11n, eventId: 1n, name: 'Defeat the Invaders', currentCount: 12n, targetCount: 20n },
        { id: 13n, eventId: 2n, name: 'Other event', currentCount: 1n, targetCount: 1n },
        { id: 14n, eventId: 1n, name: 'Overshoot', currentCount: 30n, targetCount: 20n },
        { id: 15n, eventId: 1n, name: 'Empty target', currentCount: 1n, targetCount: 0n },
      ],
    })!;
    expect(card.objectives.map((o) => o.text)).toEqual([
      'Defeat the Invaders 12/20',
      'Protect the Villagers 3/10',
      'Overshoot 30/20',
      'Empty target 1/0',
    ]);
    expect(card.objectives[0].fraction).toBeCloseTo(0.6, 6);
    expect(card.objectives[2].fraction).toBe(1);
    expect(card.objectives[3].fraction).toBe(0);
  });

  it('shows the split only once a counter has moved', () => {
    expect(eventCard({ ...base, events: [ev(1n)], regionId: 1n })!.split).toBeNull();
    const moved = eventCard({ ...base, events: [ev(1n, { successCounter: 3n, failureCounter: 1n })], regionId: 1n })!;
    expect(moved.split).toMatchObject({ forPct: 75, againstPct: 25 });
  });

  it('reports the character contribution, null when 0 or missing', () => {
    const contributions = [
      { eventId: 1n, characterId: 7n, count: 5n },
      { eventId: 1n, characterId: 8n, count: 9n },
      { eventId: 2n, characterId: 7n, count: 2n },
    ];
    const events = [ev(1n)];
    expect(eventCard({ ...base, events, regionId: 1n, contributions })!.contribution).toBe(5n);
    expect(eventCard({ ...base, events, regionId: 1n, contributions, characterId: 99n })!.contribution).toBeNull();
    expect(eventCard({ ...base, events, regionId: 1n, contributions, characterId: null })!.contribution).toBeNull();
    expect(
      eventCard({ ...base, events, regionId: 1n, contributions: [{ eventId: 1n, characterId: 7n, count: 0n }] })!.contribution,
    ).toBeNull();
  });
});
