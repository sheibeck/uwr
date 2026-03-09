import { describe, it, expect } from 'vitest';
import { createMockDb, createMockCtx } from './test-utils';

describe('createMockDb', () => {
  it('auto-creates tables on first access', () => {
    const db = createMockDb();
    const row = db.some_table.insert({ id: 0n, name: 'test' });
    expect(row.id).toBe(1n);
    expect(row.name).toBe('test');
    expect(db.some_table._rows()).toHaveLength(1);
  });

  it('supports pre-seeding with data', () => {
    const db = createMockDb({
      character: [{ id: 5n, name: 'Hero' }, { id: 10n, name: 'Villain' }],
    });
    expect(db.character._rows()).toHaveLength(2);
    expect(db.character.id.find(5n)).toEqual({ id: 5n, name: 'Hero' });
  });

  it('auto-increments from highest seeded ID', () => {
    const db = createMockDb({
      item: [{ id: 50n, name: 'Sword' }],
    });
    const row = db.item.insert({ id: 0n, name: 'Shield' });
    expect(row.id).toBe(51n);
  });

  it('handles scheduledId auto-increment', () => {
    const db = createMockDb();
    const row = db.timer.insert({ scheduledId: 0n, data: 'tick' });
    expect(row.scheduledId).toBe(1n);
  });

  it('supports iter() returning table contents', () => {
    const db = createMockDb({ npc: [{ id: 1n, name: 'Bob' }] });
    const items = [...db.npc.iter()];
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Bob');
  });

  it('supports id.find, id.update, id.delete', () => {
    const db = createMockDb({ player: [{ id: 1n, score: 100n }] });

    // find
    expect(db.player.id.find(1n)?.score).toBe(100n);

    // update
    db.player.id.update({ id: 1n, score: 200n });
    expect(db.player.id.find(1n)?.score).toBe(200n);

    // delete
    db.player.id.delete(1n);
    expect(db.player.id.find(1n)).toBeUndefined();
    expect(db.player._rows()).toHaveLength(0);
  });

  it('supports identity accessor', () => {
    const identity = { toHexString: () => 'abc123' };
    const db = createMockDb({ player: [{ identity, name: 'Me' }] });
    expect(db.player.identity.find(identity)?.name).toBe('Me');
  });

  it('supports named index by_location with filter', () => {
    const db = createMockDb({
      npc: [
        { id: 1n, locationId: 10n, name: 'Guard' },
        { id: 2n, locationId: 20n, name: 'Merchant' },
        { id: 3n, locationId: 10n, name: 'Innkeeper' },
      ],
    });
    const atLocation10 = db.npc.by_location.filter(10n);
    expect(atLocation10).toHaveLength(2);
    expect(atLocation10.map((n: any) => n.name)).toEqual(['Guard', 'Innkeeper']);
  });

  it('supports named index by_character', () => {
    const db = createMockDb({
      event_private: [
        { id: 1n, characterId: 5n, message: 'hello' },
        { id: 2n, characterId: 9n, message: 'world' },
      ],
    });
    const events = db.event_private.by_character.filter(5n);
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('hello');
  });

  it('supports named index by_from and by_to', () => {
    const db = createMockDb({
      location_connection: [
        { id: 1n, fromLocationId: 1n, toLocationId: 2n },
        { id: 2n, fromLocationId: 2n, toLocationId: 1n },
      ],
    });
    expect(db.location_connection.by_from.filter(1n)).toHaveLength(1);
    expect(db.location_connection.by_to.filter(1n)).toHaveLength(1);
  });

  it('supports named index by_owner', () => {
    const db = createMockDb({
      item: [
        { id: 1n, ownerId: 10n },
        { id: 2n, ownerId: 20n },
      ],
    });
    expect(db.item.by_owner.filter(10n)).toHaveLength(1);
  });

  it('supports scheduledId accessor for scheduled tables', () => {
    const db = createMockDb({
      round_timer_tick: [{ scheduledId: 5n, data: 'tick' }],
    });
    expect(db.round_timer_tick.scheduledId.find(5n)?.data).toBe('tick');
    db.round_timer_tick.scheduledId.delete(5n);
    expect(db.round_timer_tick._rows()).toHaveLength(0);
  });

  it('fallback index: by_X maps to XId column', () => {
    const db = createMockDb({
      quest: [{ id: 1n, zoneId: 42n }],
    });
    // by_zone is not in INDEX_TO_COLUMN, should fallback to zoneId
    expect(db.quest.by_zone.filter(42n)).toHaveLength(1);
  });

  it('insert returns the row with resolved ID', () => {
    const db = createMockDb();
    const row = db.task.insert({ id: 0n, title: 'Do stuff' });
    expect(row.id).toBe(1n);
    expect(row.title).toBe('Do stuff');
  });

  it('returns empty array for unseeded tables', () => {
    const db = createMockDb();
    expect(db.nonexistent._rows()).toHaveLength(0);
    expect(db.nonexistent.iter()).toHaveLength(0);
    expect(db.nonexistent.by_location.filter(1n)).toHaveLength(0);
  });
});

describe('createMockCtx', () => {
  it('provides default db, timestamp, and sender', () => {
    const ctx = createMockCtx();
    expect(ctx.db).toBeDefined();
    expect(ctx.timestamp.microsSinceUnixEpoch).toBe(1_000_000_000_000n);
    expect(ctx.sender.toHexString()).toBe('mock-identity-hex');
  });

  it('accepts seed data for db', () => {
    const ctx = createMockCtx({
      seed: { player: [{ id: 1n, name: 'Test' }] },
    });
    expect(ctx.db.player._rows()).toHaveLength(1);
  });

  it('accepts custom sender', () => {
    const sender = { toHexString: () => 'custom-hex' };
    const ctx = createMockCtx({ sender });
    expect(ctx.sender.toHexString()).toBe('custom-hex');
  });

  it('accepts custom timestamp', () => {
    const ctx = createMockCtx({ timestampMicros: 5_000_000n });
    expect(ctx.timestamp.microsSinceUnixEpoch).toBe(5_000_000n);
  });
});
