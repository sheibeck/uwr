/**
 * bind_location through the real handler on the strict mock db (Phase 51 client-rest review
 * WR-06): like the typed `bind` intent, the reducer refuses while the character is in an active
 * fight, with the same wording, and binds as before otherwise.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let bindLocation: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('bind_location');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('bind_location') is not a function: STOP and report; never edit production code to fix this.");
  }
  bindLocation = h;
}, 120_000);

const encounter = (state: string) => ({
  id: 1n,
  locationId: 10n,
  state,
  addCount: 0n,
  pendingAddCount: 0n,
  createdAt: { microsSinceUnixEpoch: T0 },
});

function newCtx(seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{ id: 1n, ownerUserId: 7n, name: 'Mirel', locationId: 10n, boundLocationId: 5n }],
      location: [{ id: 10n, name: 'The Crossing', regionId: 1n, bindStone: true, terrainType: 'town' }],
      ...seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const boundOf = (ctx: any) => ctx.db._tables.character[0].boundLocationId;
const messages = (ctx: any): string[] => (ctx.db._tables.event_private ?? []).map((r: any) => r.message);

describe('bind_location (real handler)', () => {
  it('refuses during an active fight with the intent wording and keeps the old bind point', () => {
    const ctx = newCtx({
      combat_encounter: [encounter('active')],
      combat_participant: [{ id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n }],
    });
    bindLocation(ctx, { characterId: 1n });
    expect(boundOf(ctx)).toBe(5n);
    expect(messages(ctx)).toEqual(['You cannot bind while in combat.']);
  });

  it('binds when the character is not in a fight', () => {
    const ctx = newCtx();
    bindLocation(ctx, { characterId: 1n });
    expect(boundOf(ctx)).toBe(10n);
    expect(messages(ctx)).toEqual(['You are now bound to The Crossing.']);
  });

  it('a finished fight does not block binding', () => {
    const ctx = newCtx({
      combat_encounter: [encounter('resolved')],
      combat_participant: [{ id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n }],
    });
    bindLocation(ctx, { characterId: 1n });
    expect(boundOf(ctx)).toBe(10n);
  });
});
