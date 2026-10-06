/**
 * Player-authored free text stays on one line (quick 261006-a3d, CR-02). The console renders
 * server-kind lines with pre-wrap, so a newline stored inside a player message could draw a fake
 * second line that reads like a system notice. These tests run the REAL reducer handlers captured
 * from index.ts on the strict mock db and read back what each path stored.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { flattenLineBreaks } from '../helpers/chat_text';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['submit_intent', 'submit_command', 'say', 'group_message', 'whisper', 'create_group']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const NEL = String.fromCharCode(0x85);

const FAKE = 'You have been removed from the group.';
const SPOOF = `ok${LF}${FAKE}`;

function newCtx(extra: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Mirel', locationId: 10n, groupId: 5n },
        { id: 2n, ownerUserId: 8n, name: 'Tamsin', locationId: 10n },
      ],
      npc: [],
      npc_dialogue_option: [],
      ...extra,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

function noBreaks(text: string): boolean {
  for (const ch of [LF, CR, LS, PS, NEL, String.fromCharCode(11), String.fromCharCode(12)]) {
    if (text.includes(ch)) return false;
  }
  return true;
}

describe('flattenLineBreaks', () => {
  it('turns each run of line breaks into one space and trims the ends', () => {
    expect(flattenLineBreaks(`  a${LF}b${CR}${LF}${LF}c${LS}d${PS}e${NEL}f  `)).toBe('a b c d e f');
  });

  it('leaves other spacing alone', () => {
    expect(flattenLineBreaks('a  b   c')).toBe('a  b   c');
  });

  it('turns a break-only string into an empty string', () => {
    expect(flattenLineBreaks(`${LF}${CR}${LS}`)).toBe('');
  });
});

describe('player chat reducers keep one line', () => {
  it('group_message stores a single line', () => {
    const ctx = newCtx();
    handlers.group_message(ctx, { characterId: 1n, message: SPOOF });
    const stored = rows(ctx, 'event_group');
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe(`Mirel: ok ${FAKE}`);
    expect(noBreaks(stored[0].message)).toBe(true);
  });

  it('group_message with only line breaks fails with the group-kind empty message line', () => {
    const ctx = newCtx();
    handlers.group_message(ctx, { characterId: 1n, message: `${LF}${CR}` });
    expect(rows(ctx, 'event_group')).toHaveLength(0);
    const failed = rows(ctx, 'event_private');
    expect(failed).toHaveLength(1);
    expect(failed[0].message).toBe('Message is empty');
    expect(failed[0].kind).toBe('group');
  });

  it('say reducer broadcasts a single line', () => {
    const ctx = newCtx();
    handlers.say(ctx, { characterId: 1n, message: SPOOF });
    const stored = rows(ctx, 'event_location');
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe(`Mirel says, "ok ${FAKE}"`);
  });

  it('say reducer with only line breaks fails with the empty message line', () => {
    const ctx = newCtx();
    handlers.say(ctx, { characterId: 1n, message: `   ${LF}  ` });
    expect(rows(ctx, 'event_location')).toHaveLength(0);
    expect(rows(ctx, 'event_private')[0].message).toBe('Message is empty');
  });

  it('whisper reducer stores a single line on both sides', () => {
    const ctx = newCtx();
    handlers.whisper(ctx, { characterId: 1n, targetName: 'Tamsin', message: SPOOF });
    const stored = rows(ctx, 'event_private');
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(noBreaks(row.message)).toBe(true);
      expect(row.message).toContain(`ok ${FAKE}`);
    }
  });

  it('submit_intent say stores a single line', () => {
    // Without flattening, the say pattern (which does not match across a newline) would fall
    // through to the Keeper fallback and echo the raw text. Flattened, it is a normal say.
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: `say ${SPOOF}` });
    const stored = rows(ctx, 'event_location');
    expect(stored).toHaveLength(1);
    expect(stored[0].kind).toBe('say');
    expect(stored[0].message).toBe(`Mirel says, "ok ${FAKE}"`);
  });

  it('submit_intent whisper stores a single line on both sides', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: `whisper Tamsin ${SPOOF}` });
    const stored = rows(ctx, 'event_private');
    expect(stored).toHaveLength(2);
    for (const row of stored) expect(noBreaks(row.message)).toBe(true);
  });

  it('submit_intent fallback echo of unknown text stays on one line', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: `xyzzy${LF}${FAKE}` });
    const stored = rows(ctx, 'event_private');
    expect(stored).toHaveLength(1);
    expect(noBreaks(stored[0].message)).toBe(true);
    expect(stored[0].message).toContain(`xyzzy ${FAKE}`);
  });

  it('submit_intent slash echo stays on one line', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: `/foo${LF}${FAKE}` });
    const echo = rows(ctx, 'event_private').find((r) => r.kind === 'command');
    expect(echo).toBeDefined();
    expect(noBreaks(echo!.message)).toBe(true);
    expect(echo!.message).toBe(`> /foo ${FAKE}`);
    expect(noBreaks(rows(ctx, 'command')[0].text)).toBe(true);
  });

  it('submit_command echo stays on one line', () => {
    const ctx = newCtx();
    handlers.submit_command(ctx, { characterId: 1n, text: `look${LF}${FAKE}` });
    const echo = rows(ctx, 'event_private').find((r) => r.kind === 'command');
    expect(echo).toBeDefined();
    expect(echo!.message).toBe(`> look ${FAKE}`);
    expect(noBreaks(rows(ctx, 'command')[0].text)).toBe(true);
  });

  it('create_group stores a single-line group name', () => {
    const ctx = newCtx();
    ctx.db._tables.character[0].groupId = undefined;
    handlers.create_group(ctx, { characterId: 1n, name: `Raiders${LF}${FAKE}` });
    const stored = rows(ctx, 'group');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe(`Raiders ${FAKE}`);
  });
});
