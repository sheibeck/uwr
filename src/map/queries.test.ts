import { describe, expect, it } from 'vitest';
import { mapQueries } from './queries';

const q = mapQueries();

describe('mapQueries', () => {
  it('reads visited places only from the per-sender view, with no WHERE', () => {
    const sql = q.myVisitedLocations;
    expect(sql).toContain('"my_visited_locations"');
    expect(sql).not.toContain('WHERE');
    expect(sql).not.toContain('"visited_location"');
  });

  it('subscribes the whole location_connection table', () => {
    expect(q.connections).toContain('"location_connection"');
    expect(q.connections).not.toContain('WHERE');
  });

  it('chains travel_cooldown on character_id', () => {
    const sql = q.travelCooldowns([1n, 2n]);
    expect(sql).toContain('"travel_cooldown"');
    expect(sql).toContain('"character_id" = 1');
    expect(sql).toContain('"character_id" = 2');
    expect(sql).toContain('OR');
    expect(() => q.travelCooldowns([])).toThrow();
  });

  it('filters npc and character by location_id', () => {
    const npcs = q.npcsAt(5n);
    expect(npcs).toContain('"npc"');
    expect(npcs).toContain('"location_id" = 5');
    const characters = q.charactersAt(5n);
    expect(characters).toContain('"character"');
    expect(characters).toContain('"location_id" = 5');
  });

  it('chains npc on id', () => {
    const sql = q.npcsById([3n, 4n]);
    expect(sql).toContain('"npc"');
    expect(sql).toContain('"id" = 3');
    expect(sql).toContain('"id" = 4');
    expect(sql).toContain('OR');
    expect(() => q.npcsById([])).toThrow();
  });
});
