import { describe, expect, it } from 'vitest';
import { adjacencyOf, routeNote, shortestPath, stepsFrom } from './route';

const edge = (a: bigint, b: bigint) => ({ a, b });

describe('adjacencyOf', () => {
  it('lists neighbours in both directions, sorted ascending', () => {
    const adj = adjacencyOf([edge(1n, 3n), edge(1n, 2n), edge(2n, 4n)]);
    expect(adj.get(1n)).toEqual([2n, 3n]);
    expect(adj.get(2n)).toEqual([1n, 4n]);
    expect(adj.get(4n)).toEqual([2n]);
  });
});

describe('shortestPath', () => {
  const line = adjacencyOf([edge(1n, 2n), edge(2n, 3n), edge(3n, 4n)]);

  it('finds the path inclusive of both ends', () => {
    expect(shortestPath(line, 1n, 4n)).toEqual([1n, 2n, 3n, 4n]);
    expect(shortestPath(line, 4n, 1n)).toEqual([4n, 3n, 2n, 1n]);
  });

  it('breaks ties through the lower id', () => {
    const diamond = adjacencyOf([edge(1n, 3n), edge(1n, 2n), edge(2n, 4n), edge(3n, 4n)]);
    expect(shortestPath(diamond, 1n, 4n)).toEqual([1n, 2n, 4n]);
  });

  it('returns null when no known path exists', () => {
    const split = adjacencyOf([edge(1n, 2n), edge(5n, 6n)]);
    expect(shortestPath(split, 1n, 6n)).toBeNull();
    expect(shortestPath(split, 1n, 99n)).toBeNull();
  });

  it('returns the single id when from equals to', () => {
    expect(shortestPath(line, 2n, 2n)).toEqual([2n]);
  });
});

describe('stepsFrom', () => {
  it('maps every reachable place to its step count', () => {
    const adj = adjacencyOf([edge(1n, 2n), edge(2n, 3n), edge(8n, 9n)]);
    const steps = stepsFrom(adj, 1n);
    expect(steps.get(1n)).toBe(0);
    expect(steps.get(2n)).toBe(1);
    expect(steps.get(3n)).toBe(2);
    expect(steps.has(8n)).toBe(false);
  });
});

describe('routeNote', () => {
  const regions = [
    { id: 1n, name: 'Ashfall Wilds' },
    { id: 2n, name: 'Bleakmoor' },
    { id: 3n, name: 'Cinder Reach' },
  ];
  const locations = [
    { id: 1n, regionId: 1n },
    { id: 2n, regionId: 1n },
    { id: 3n, regionId: 1n },
    { id: 4n, regionId: 2n },
    { id: 5n, regionId: 3n },
  ];

  it('reads all within the start region when no border is crossed', () => {
    expect(routeNote([1n, 2n, 3n], locations, regions)).toBe('2 stops · all within Ashfall Wilds');
  });

  it('counts one region crossing', () => {
    expect(routeNote([1n, 2n, 3n, 4n], locations, regions)).toBe('3 stops · 1 region crossing');
  });

  it('counts two region crossings', () => {
    expect(routeNote([1n, 2n, 3n, 4n, 5n], locations, regions)).toBe('4 stops · 2 region crossings');
  });

  it('counts stops as the path length minus one', () => {
    expect(routeNote([1n, 2n], locations, regions)).toBe('1 stop · all within Ashfall Wilds');
  });
});
