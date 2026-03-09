import { describe, it, expect, vi } from 'vitest';

// Mock SpacetimeDB server module (events.ts imports SenderError)
vi.mock('spacetimedb/server', () => ({
  SenderError: class SenderError extends Error {
    constructor(msg: string) { super(msg); }
  },
}));

// Mock group dependency -- events.ts imports effectiveGroupId
vi.mock('./group', () => ({
  effectiveGroupId: vi.fn(() => null),
}));

import {
  appendWorldEvent,
  appendLocationEvent,
  appendPrivateEvent,
  appendSystemMessage,
  logPrivateAndGroup,
  appendPrivateAndGroupEvent,
  fail,
  appendNpcDialog,
  appendCreationEvent,
  appendGroupEvent,
} from './events';
import { effectiveGroupId } from './group';
import { createMockCtx } from './test-utils';

describe('appendWorldEvent', () => {
  it('inserts row into event_world table with correct fields', () => {
    const ctx = createMockCtx();
    appendWorldEvent(ctx, 'day_night', 'The sun rises.');
    const rows = ctx.db.event_world._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('day_night');
    expect(rows[0].message).toBe('The sun rises.');
    expect(rows[0].createdAt).toBe(ctx.timestamp);
  });

  it('assigns auto-generated id', () => {
    const ctx = createMockCtx();
    const row = appendWorldEvent(ctx, 'system', 'Server restart.');
    expect(row.id).toBe(1n);
  });
});

describe('appendLocationEvent', () => {
  it('inserts row into event_location with locationId, kind, message', () => {
    const ctx = createMockCtx();
    appendLocationEvent(ctx, 5n, 'movement', 'A traveler arrives.');
    const rows = ctx.db.event_location._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].locationId).toBe(5n);
    expect(rows[0].kind).toBe('movement');
    expect(rows[0].message).toBe('A traveler arrives.');
    expect(rows[0].createdAt).toBe(ctx.timestamp);
  });

  it('supports optional excludeCharacterId', () => {
    const ctx = createMockCtx();
    appendLocationEvent(ctx, 5n, 'combat', 'Swords clash.', 10n);
    const rows = ctx.db.event_location._rows();
    expect(rows[0].excludeCharacterId).toBe(10n);
  });

  it('excludeCharacterId is undefined when not provided', () => {
    const ctx = createMockCtx();
    appendLocationEvent(ctx, 5n, 'emote', 'Someone waves.');
    const rows = ctx.db.event_location._rows();
    expect(rows[0].excludeCharacterId).toBeUndefined();
  });
});

describe('appendPrivateEvent', () => {
  it('inserts row into event_private with characterId, ownerUserId, kind, message', () => {
    const ctx = createMockCtx();
    appendPrivateEvent(ctx, 1n, 2n, 'combat', 'You hit the wolf for 10 damage.');
    const rows = ctx.db.event_private._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].characterId).toBe(1n);
    expect(rows[0].ownerUserId).toBe(2n);
    expect(rows[0].kind).toBe('combat');
    expect(rows[0].message).toBe('You hit the wolf for 10 damage.');
  });

  it('passes through different kind values', () => {
    const ctx = createMockCtx();
    appendPrivateEvent(ctx, 1n, 2n, 'system', 'System message.');
    appendPrivateEvent(ctx, 1n, 2n, 'reward', 'You received 50 gold.');
    appendPrivateEvent(ctx, 1n, 2n, 'combat', 'Critical hit!');
    const rows = ctx.db.event_private._rows();
    expect(rows.map((r: any) => r.kind)).toEqual(['system', 'reward', 'combat']);
  });

  it('handles empty message', () => {
    const ctx = createMockCtx();
    appendPrivateEvent(ctx, 1n, 2n, 'system', '');
    expect(ctx.db.event_private._rows()[0].message).toBe('');
  });
});

describe('appendSystemMessage', () => {
  it('inserts system-kind private event for character', () => {
    const ctx = createMockCtx();
    const character = { id: 5n, ownerUserId: 10n };
    appendSystemMessage(ctx, character, 'You cannot do that.');
    const rows = ctx.db.event_private._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('system');
    expect(rows[0].characterId).toBe(5n);
    expect(rows[0].ownerUserId).toBe(10n);
    expect(rows[0].message).toBe('You cannot do that.');
  });
});

describe('fail', () => {
  it('emits system-kind private event by default', () => {
    const ctx = createMockCtx();
    fail(ctx, { id: 1n, ownerUserId: 2n }, 'Invalid action');
    const rows = ctx.db.event_private._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('system');
    expect(rows[0].message).toBe('Invalid action');
  });

  it('accepts custom kind parameter', () => {
    const ctx = createMockCtx();
    fail(ctx, { id: 1n, ownerUserId: 2n }, 'Error occurred', 'error');
    const rows = ctx.db.event_private._rows();
    expect(rows[0].kind).toBe('error');
  });

  it('routes to correct character and owner', () => {
    const ctx = createMockCtx();
    fail(ctx, { id: 42n, ownerUserId: 99n }, 'Nope');
    const rows = ctx.db.event_private._rows();
    expect(rows[0].characterId).toBe(42n);
    expect(rows[0].ownerUserId).toBe(99n);
  });
});

describe('appendNpcDialog', () => {
  it('inserts row into npc_dialog table', () => {
    const ctx = createMockCtx();
    appendNpcDialog(ctx, 1n, 5n, 'Hello, adventurer!');
    const rows = ctx.db.npc_dialog._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].characterId).toBe(1n);
    expect(rows[0].npcId).toBe(5n);
    expect(rows[0].text).toBe('Hello, adventurer!');
  });

  it('deduplicates identical dialog within 60-second window', () => {
    // Seed an existing dialog that is within the 60s cutoff
    const nowMicros = 1_000_000_000_000n;
    const recentMicros = nowMicros - 30_000_000n; // 30 seconds ago (within 60s window)
    const ctx = createMockCtx({
      seed: {
        npc_dialog: [{
          id: 1n,
          characterId: 1n,
          npcId: 5n,
          text: 'Hello, adventurer!',
          createdAt: { microsSinceUnixEpoch: recentMicros },
        }],
      },
      timestampMicros: nowMicros,
    });

    appendNpcDialog(ctx, 1n, 5n, 'Hello, adventurer!');
    // Should NOT insert a duplicate
    expect(ctx.db.npc_dialog._rows()).toHaveLength(1);
  });

  it('allows same dialog after 60-second window expires', () => {
    const nowMicros = 1_000_000_000_000n;
    const oldMicros = nowMicros - 120_000_000n; // 120 seconds ago (outside 60s window)
    const ctx = createMockCtx({
      seed: {
        npc_dialog: [{
          id: 1n,
          characterId: 1n,
          npcId: 5n,
          text: 'Hello, adventurer!',
          createdAt: { microsSinceUnixEpoch: oldMicros },
        }],
      },
      timestampMicros: nowMicros,
    });

    appendNpcDialog(ctx, 1n, 5n, 'Hello, adventurer!');
    // SHOULD insert because old dialog is outside the dedup window
    expect(ctx.db.npc_dialog._rows()).toHaveLength(2);
  });

  it('allows different text from same NPC within window', () => {
    const nowMicros = 1_000_000_000_000n;
    const ctx = createMockCtx({
      seed: {
        npc_dialog: [{
          id: 1n,
          characterId: 1n,
          npcId: 5n,
          text: 'Hello, adventurer!',
          createdAt: { microsSinceUnixEpoch: nowMicros - 10_000_000n },
        }],
      },
      timestampMicros: nowMicros,
    });

    appendNpcDialog(ctx, 1n, 5n, 'Goodbye, adventurer!');
    expect(ctx.db.npc_dialog._rows()).toHaveLength(2);
  });
});

describe('appendCreationEvent', () => {
  it('inserts row into event_creation table', () => {
    const ctx = createMockCtx();
    appendCreationEvent(ctx, 7n, 'character_created', 'You created a warrior.');
    const rows = ctx.db.event_creation._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe(7n);
    expect(rows[0].kind).toBe('character_created');
    expect(rows[0].message).toBe('You created a warrior.');
    expect(rows[0].createdAt).toBe(ctx.timestamp);
  });
});

describe('appendGroupEvent', () => {
  it('inserts row into event_group table with groupId, characterId, kind, message', () => {
    const ctx = createMockCtx();
    appendGroupEvent(ctx, 3n, 1n, 'combat', 'Party member attacks.');
    const rows = ctx.db.event_group._rows();
    expect(rows).toHaveLength(1);
    expect(rows[0].groupId).toBe(3n);
    expect(rows[0].characterId).toBe(1n);
    expect(rows[0].kind).toBe('combat');
    expect(rows[0].message).toBe('Party member attacks.');
    expect(rows[0].createdAt).toBe(ctx.timestamp);
  });
});

describe('logPrivateAndGroup', () => {
  it('inserts private event when character has no group', () => {
    vi.mocked(effectiveGroupId).mockReturnValue(null);
    const ctx = createMockCtx();
    const character = { id: 1n, ownerUserId: 2n };
    logPrivateAndGroup(ctx, character, 'combat', 'You attack.');
    expect(ctx.db.event_private._rows()).toHaveLength(1);
    expect(ctx.db.event_group._rows()).toHaveLength(0);
  });

  it('inserts both private and group events when character is in a group', () => {
    vi.mocked(effectiveGroupId).mockReturnValue(42n);
    const ctx = createMockCtx();
    const character = { id: 1n, ownerUserId: 2n };
    logPrivateAndGroup(ctx, character, 'combat', 'You attack.');
    expect(ctx.db.event_private._rows()).toHaveLength(1);
    const groupRows = ctx.db.event_group._rows();
    expect(groupRows).toHaveLength(1);
    expect(groupRows[0].groupId).toBe(42n);
    expect(groupRows[0].characterId).toBe(1n);
    expect(groupRows[0].kind).toBe('combat');
  });

  it('uses separate group message when provided', () => {
    vi.mocked(effectiveGroupId).mockReturnValue(42n);
    const ctx = createMockCtx();
    const character = { id: 1n, ownerUserId: 2n };
    logPrivateAndGroup(ctx, character, 'combat', 'You attack.', 'Ally attacks.');
    const privateRows = ctx.db.event_private._rows();
    const groupRows = ctx.db.event_group._rows();
    expect(privateRows[0].message).toBe('You attack.');
    expect(groupRows[0].message).toBe('Ally attacks.');
  });
});

describe('appendPrivateAndGroupEvent', () => {
  it('delegates to logPrivateAndGroup', () => {
    vi.mocked(effectiveGroupId).mockReturnValue(null);
    const ctx = createMockCtx();
    const character = { id: 1n, ownerUserId: 2n };
    appendPrivateAndGroupEvent(ctx, character, 'system', 'Test message');
    expect(ctx.db.event_private._rows()).toHaveLength(1);
    expect(ctx.db.event_private._rows()[0].message).toBe('Test message');
  });
});
