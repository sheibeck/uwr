import { describe, it, expect } from 'vitest';
import { TimeDuration } from 'spacetimedb';
import { createMockDb, createMockCtx, createMockProcCtx, makeSyncResponse } from './test-utils';

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

  it('exposes a default module databaseIdentity and accepts a distinct one', () => {
    expect(createMockCtx().databaseIdentity.toHexString()).toBe('module-identity-hex');
    const sender = { toHexString: () => 'sender-hex' };
    const module = { toHexString: () => 'module-hex' };
    const ctx = createMockCtx({ sender, databaseIdentity: module });
    expect(ctx.sender).toBe(sender);
    expect(ctx.databaseIdentity).toBe(module);
  });
});

describe('createMockDb new index mappings', () => {
  const seed = {
    llm_job: [{ id: 1n, dedupeKey: 'k1', status: 'pending', jobId: 0n }],
    llm_call_log: [{ id: 1n, jobId: 1n }],
  };

  it('by_dedupe_key finds a seeded row (positive control) and nothing for a miss', () => {
    const db = createMockDb(seed);
    expect(db.llm_job.by_dedupe_key.filter('k1')).toHaveLength(1);
    expect(db.llm_job.by_dedupe_key.find('k1')?.id).toBe(1n);
    expect(db.llm_job.by_dedupe_key.filter('nope')).toEqual([]);
  });

  it('by_status finds a seeded row (positive control) and nothing for a miss', () => {
    const db = createMockDb(seed);
    expect(db.llm_job.by_status.filter('pending')).toHaveLength(1);
    expect(db.llm_job.by_status.filter('done')).toEqual([]);
  });

  it('by_job finds a seeded row (positive control) and nothing for a miss', () => {
    const db = createMockDb(seed);
    expect(db.llm_call_log.by_job.filter(1n)).toHaveLength(1);
    expect(db.llm_call_log.by_job.filter(2n)).toEqual([]);
  });
});

describe('makeSyncResponse', () => {
  it('ok is true only for 2xx', () => {
    expect(makeSyncResponse({ status: 200 }).ok).toBe(true);
    expect(makeSyncResponse({ status: 204 }).ok).toBe(true);
    expect(makeSyncResponse({ status: 199 }).ok).toBe(false);
    expect(makeSyncResponse({ status: 300 }).ok).toBe(false);
    expect(makeSyncResponse({ status: 429 }).ok).toBe(false);
    expect(makeSyncResponse({ status: 500 }).ok).toBe(false);
  });

  it('text() returns the body string; object bodies are JSON-stringified', () => {
    expect(makeSyncResponse({ status: 200, body: 'hello' }).text()).toBe('hello');
    expect(makeSyncResponse({ status: 200, body: { a: 1 } }).text()).toBe('{"a":1}');
    expect(makeSyncResponse({ status: 200 }).text()).toBe('');
  });

  it('json() parses valid JSON and throws on invalid JSON', () => {
    expect(makeSyncResponse({ status: 200, body: { a: 1 } }).json()).toEqual({ a: 1 });
    expect(() => makeSyncResponse({ status: 200, body: '{not json' }).json()).toThrow();
  });

  it('headers.get is case-insensitive', () => {
    const r = makeSyncResponse({ status: 429, headers: { 'Retry-After': '7' } });
    expect(r.headers.get('retry-after')).toBe('7');
    expect(r.headers.get('RETRY-AFTER')).toBe('7');
  });
});

describe('createMockProcCtx', () => {
  it('ctx has no db, a module-identity sender and a controllable clock', () => {
    const p = createMockProcCtx({ timestampMicros: 100n });
    expect((p.ctx as any).db).toBeUndefined();
    expect(p.ctx.sender.toHexString()).toBe('module-identity-hex');
    expect(p.ctx.timestamp.microsSinceUnixEpoch).toBe(100n);
    let seen = 0n;
    p.clock.advance(5n);
    p.ctx.withTx((tx) => {
      seen = tx.timestamp.microsSinceUnixEpoch;
    });
    expect(seen).toBe(105n);
    expect(p.clock.now()).toBe(105n);
  });

  it('databaseIdentity defaults to the sender and can differ from it', () => {
    const plain = createMockProcCtx();
    expect(plain.ctx.databaseIdentity).toBe(plain.ctx.sender);
    const a = { toHexString: () => 'a' };
    const b = { toHexString: () => 'b' };
    const forged = createMockProcCtx({ sender: a, databaseIdentity: b });
    expect(forged.ctx.sender).toBe(a);
    expect(forged.ctx.databaseIdentity).toBe(b);
    expect(forged.ctx.identity).toBe(a);
  });

  it('a reply with advanceMicros moves the clock forward by exactly that much by the time fetch returns', () => {
    const p = createMockProcCtx({
      timestampMicros: 1_000n,
      responses: [{ status: 200, body: 'ok', advanceMicros: 5_000_000n }, { status: 200, body: 'ok' }],
    });
    p.ctx.http.fetch('https://x/1');
    expect(p.clock.now()).toBe(1_000n + 5_000_000n);
    let seen = 0n;
    p.ctx.withTx((tx) => {
      seen = tx.timestamp.microsSinceUnixEpoch;
    });
    expect(seen).toBe(1_000n + 5_000_000n);
    // A reply without the field leaves the clock unchanged.
    p.ctx.http.fetch('https://x/2');
    expect(p.clock.now()).toBe(1_000n + 5_000_000n);
  });

  it('a throw with advanceMicros advances the clock before it throws', () => {
    const p = createMockProcCtx({
      timestampMicros: 0n,
      responses: [{ throw: 'timeout', advanceMicros: 30_000_000n }, { throw: 'timeout' }],
    });
    expect(() => p.ctx.http.fetch('https://x')).toThrow(/timed out/);
    expect(p.clock.now()).toBe(30_000_000n);
    expect(() => p.ctx.http.fetch('https://x')).toThrow(/timed out/);
    expect(p.clock.now()).toBe(30_000_000n);
  });

  it('fetch with no scripted responses throws "no scripted response"', () => {
    const p = createMockProcCtx();
    expect(() => p.ctx.http.fetch('https://x')).toThrow(/no scripted response/);
  });

  it('consumes scripted responses FIFO, then throws once exhausted', () => {
    const p = createMockProcCtx({
      responses: [
        { status: 200, headers: { 'X-Thing': 'a' }, body: { n: 1 } },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '3' }, body: 'slow down' },
        { status: 500, body: 'boom' },
      ],
    });
    const r1 = p.ctx.http.fetch('https://x/1');
    expect(r1.status).toBe(200);
    expect(r1.headers.get('x-thing')).toBe('a');
    expect(r1.json()).toEqual({ n: 1 });
    const r2 = p.ctx.http.fetch('https://x/2');
    expect(r2.status).toBe(429);
    expect(r2.statusText).toBe('Too Many');
    expect(r2.headers.get('retry-after')).toBe('3');
    expect(r2.text()).toBe('slow down');
    expect(p.http.remaining()).toBe(1);
    expect(p.ctx.http.fetch('https://x/3').status).toBe(500);
    expect(p.http.remaining()).toBe(0);
    expect(() => p.ctx.http.fetch('https://x/4')).toThrow(/no scripted response/);
  });

  it("{ throw: 'timeout' } throws /timed out/i and a given Error is rethrown", () => {
    const err = new Error('dns');
    const p = createMockProcCtx({ responses: [{ throw: 'timeout' }, { throw: err }] });
    expect(() => p.ctx.http.fetch('https://x')).toThrow(/timed out/i);
    expect(() => p.ctx.http.fetch('https://x')).toThrow(err);
  });

  it('records calls with url, method default, headers, body and timeoutMs', () => {
    const p = createMockProcCtx({ responses: [{ status: 200 }, { status: 200 }] });
    const headers = { 'x-api-key': 'k' };
    p.ctx.http.fetch('https://x/a');
    p.ctx.http.fetch('https://x/b', {
      method: 'POST',
      headers,
      body: '{"q":1}',
      timeout: TimeDuration.fromMillis(1500),
    });
    expect(p.http.calls).toHaveLength(2);
    expect(p.http.calls[0]).toEqual({
      url: 'https://x/a',
      method: 'GET',
      headers: {},
      body: undefined,
      timeoutMs: undefined,
    });
    expect(p.http.calls[1]).toEqual({
      url: 'https://x/b',
      method: 'POST',
      headers: { 'x-api-key': 'k' },
      body: '{"q":1}',
      timeoutMs: 1500,
    });
    expect(p.http.calls[1].headers).not.toBe(headers);
  });

  it('withTx returns the callback value and runs it 1 + withTxReinvoke times', () => {
    for (const n of [0, 1, 2]) {
      const p = createMockProcCtx({ withTxReinvoke: n });
      let count = 0;
      const out = p.ctx.withTx(() => {
        count++;
        return 'v';
      });
      expect(out).toBe('v');
      expect(count).toBe(1 + n);
    }
  });

  it('withTxReinvoke: 1 with an insert-once callback ends with exactly one row', () => {
    const p = createMockProcCtx({ withTxReinvoke: 1 });
    let count = 0;
    p.ctx.withTx((tx) => {
      count++;
      tx.db.llm_job.insert({ id: 0n, dedupeKey: 'k' });
    });
    expect(count).toBe(2);
    expect(p.db.llm_job._rows()).toHaveLength(1);
  });

  it('withTx keeps updates to pre-existing rows across re-invocation', () => {
    const p = createMockProcCtx({
      seed: { llm_job: [{ id: 1n, status: 'pending' }] },
      withTxReinvoke: 1,
    });
    p.ctx.withTx((tx) => {
      const row = tx.db.llm_job.id.find(1n);
      tx.db.llm_job.id.update({ ...row, status: 'done' });
    });
    expect(p.db.llm_job.id.find(1n)?.status).toBe('done');
    expect(p.db.llm_job._rows()).toHaveLength(1);
  });

  it('withTx callback returning a Promise throws and leaves no writes', () => {
    const p = createMockProcCtx();
    expect(() =>
      p.ctx.withTx((tx) => {
        tx.db.llm_job.insert({ id: 0n, dedupeKey: 'k' });
        return Promise.resolve(1) as any;
      }),
    ).toThrow(/must be synchronous/);
    expect(p.db.llm_job._rows()).toHaveLength(0);
  });

  it('withTx callback that throws rolls back every write', () => {
    const p = createMockProcCtx({ seed: { llm_job: [{ id: 1n }] } });
    expect(() =>
      p.ctx.withTx((tx) => {
        tx.db.llm_job.insert({ id: 0n, dedupeKey: 'k' });
        tx.db.other.insert({ id: 0n });
        throw new Error('nope');
      }),
    ).toThrow('nope');
    expect(p.db.llm_job._rows()).toHaveLength(1);
    expect(p.db.other._rows()).toHaveLength(0);
  });
});
