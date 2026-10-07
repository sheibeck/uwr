import { describe, expect, it } from 'vitest';
import { knownPlaces } from './knownPlaces';

const locations = [
  { id: 1n, regionId: 1n },
  { id: 2n, regionId: 1n },
  { id: 3n, regionId: 1n },
  { id: 4n, regionId: 1n },
  { id: 5n, regionId: 2n },
  { id: 6n, regionId: 2n },
  { id: 7n, regionId: 2n },
];

const both = (a: bigint, b: bigint) => [
  { fromLocationId: a, toLocationId: b },
  { fromLocationId: b, toLocationId: a },
];
const connections = [...both(1n, 2n), ...both(2n, 3n), ...both(3n, 4n), ...both(4n, 5n), ...both(6n, 7n)];

const ids = (set: ReadonlySet<bigint>) => [...set].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));

describe('knownPlaces', () => {
  it('draws the visited place and the places it connects to', () => {
    const k = knownPlaces({ visitedIds: [1n], currentLocationId: 1n, connections, locations });
    expect(ids(k.visited)).toEqual([1n]);
    expect(ids(k.heardOf)).toEqual([2n]);
    expect(k.drawn.map((l) => l.id)).toEqual([1n, 2n]);
    expect(k.edges).toEqual([{ a: 1n, b: 2n }]);
    expect(k.knownRegionIds).toEqual([1n]);
  });

  it('always counts the current place as visited', () => {
    const k = knownPlaces({ visitedIds: [1n, 2n], currentLocationId: 3n, connections, locations });
    expect(ids(k.visited)).toEqual([1n, 2n, 3n]);
    expect(ids(k.heardOf)).toEqual([4n]);
    expect(k.edges).toEqual([
      { a: 1n, b: 2n },
      { a: 2n, b: 3n },
      { a: 3n, b: 4n },
    ]);
  });

  it('does not reveal an edge between two heard-of places', () => {
    const extra = [...both(3n, 4n), ...both(3n, 2n), ...both(2n, 4n)];
    const k = knownPlaces({ visitedIds: [3n], currentLocationId: null, connections: extra, locations });
    expect(ids(k.heardOf)).toEqual([2n, 4n]);
    expect(k.edges).toEqual([
      { a: 2n, b: 3n },
      { a: 3n, b: 4n },
    ]);
  });

  it('drops a visited id with no location row and ignores a connection to a missing location', () => {
    const k = knownPlaces({
      visitedIds: [1n, 99n],
      currentLocationId: 1n,
      connections: [...connections, ...both(1n, 98n), ...both(99n, 2n)],
      locations,
    });
    expect(k.drawn.map((l) => l.id)).toEqual([1n, 2n]);
    expect(ids(k.heardOf)).not.toContain(98n);
    expect(k.edges.every((e) => e.a !== 98n && e.b !== 98n && e.a !== 99n && e.b !== 99n)).toBe(true);
  });

  it('dedupes edges by unordered pair even when only one direction exists', () => {
    const k = knownPlaces({
      visitedIds: [1n, 2n],
      currentLocationId: null,
      connections: [{ fromLocationId: 2n, toLocationId: 1n }, ...both(1n, 2n)],
      locations,
    });
    expect(k.edges).toEqual([{ a: 1n, b: 2n }]);
  });

  it('lists a region once a place of it is drawn, ascending', () => {
    const k = knownPlaces({ visitedIds: [4n, 1n], currentLocationId: null, connections, locations });
    expect(k.drawn.map((l) => l.id)).toEqual([1n, 2n, 3n, 4n, 5n]);
    expect(k.knownRegionIds).toEqual([1n, 2n]);
  });

  it('is empty with no current place and no visited ids', () => {
    const k = knownPlaces({ visitedIds: [], currentLocationId: null, connections, locations });
    expect(k.visited.size).toBe(0);
    expect(k.heardOf.size).toBe(0);
    expect(k.drawn).toEqual([]);
    expect(k.knownRegionIds).toEqual([]);
    expect(k.edges).toEqual([]);
  });

  it('does not reveal a place of an unvisited component', () => {
    const k = knownPlaces({ visitedIds: [1n], currentLocationId: 1n, connections, locations });
    expect(k.drawn.map((l) => l.id)).not.toContain(6n);
  });
});
