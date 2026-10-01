/**
 * /llm admin commands through the REAL submit_command handler captured from
 * `spacetimedb/src/index.ts` (Phase 43, Plan 43-07). The mock db is strict, and one
 * shared identity object per person is used for seeding and as the sender (the mock
 * compares identities with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { LLM_ADMIN_REFUSAL_LINE } from '../helpers/llm_admin_commands';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const adminIdentity = { toHexString: () => CLI_HEX };
const strangerIdentity = { toHexString: () => 'b'.repeat(64) };
const PLAYER_HEX = 'd'.repeat(64);

let submitCommand: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_command');
  if (typeof h !== 'function') {
    throw new Error(
      "capturedReducer('submit_command') is not a function: the schema recorder could not capture the " +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  submitCommand = h;
}, 120_000);

type Seed = Record<string, any[]>;

const baseSeed = (): Seed => ({
  player: [
    { id: adminIdentity, userId: 7n, activeCharacterId: 1n },
    { id: strangerIdentity, userId: 8n, activeCharacterId: 2n },
  ],
  character: [
    { id: 1n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver', locationId: 10n },
    { id: 2n, ownerUserId: 8n, name: 'Brin', race: 'Kobold', className: 'Ashweaver', locationId: 10n },
  ],
  llm_call_log: [
    {
      id: 1n,
      jobId: 1n,
      playerId: { toHexString: () => PLAYER_HEX },
      route: 'world_gen_start',
      model: 'm',
      outcome: 'ok',
      attempt: 1n,
      httpStatus: 200n,
      latencyMs: 5100n,
      errorMessage: '[Click me] <b>',
      inputTokens: 1n,
      outputTokens: 1n,
      cacheWriteTokens: 0n,
      cacheReadTokens: 0n,
      createdAt: { microsSinceUnixEpoch: T0 - 1_000_000n },
      costMicroUsd: 17_800n,
      dispatchLateMs: 0n,
    },
    {
      id: 2n,
      jobId: 2n,
      playerId: { toHexString: () => PLAYER_HEX },
      route: 'npc_reply',
      model: 'm',
      outcome: 'ok',
      attempt: 1n,
      httpStatus: 200n,
      latencyMs: 2000n,
      inputTokens: 1n,
      outputTokens: 1n,
      cacheWriteTokens: 0n,
      cacheReadTokens: 0n,
      createdAt: { microsSinceUnixEpoch: T0 - 90_000_000_000n },
      costMicroUsd: 500n,
      dispatchLateMs: 0n,
    },
  ],
});

const newCtx = (sender: any, seed: Seed = baseSeed()) =>
  createMockCtx({ seed, sender, timestampMicros: T0, strict: true });

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);

describe('submit_command /llm', () => {
  it('/llm off by the admin turns calls off, posts one system line and inserts no command row', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/llm off' });
    expect(rows(ctx, 'llm_admin_state')[0].llmEnabled).toBe(false);
    expect(systemLines(ctx)).toEqual([
      'LLM calls are off. Players see the resting line; calls already in flight finish.',
    ]);
    expect(rows(ctx, 'command')).toHaveLength(0);
    expect(rows(ctx, 'event_private').filter((e: any) => e.kind === 'command')).toHaveLength(0);
  });

  it('/llm on and /llm ceiling work through the reducer', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/llm off' });
    submitCommand(ctx, { characterId: 1n, text: '/llm on' });
    submitCommand(ctx, { characterId: 1n, text: '/llm ceiling 12.50' });
    const state = rows(ctx, 'llm_admin_state')[0];
    expect(state.llmEnabled).toBe(true);
    expect(state.dailyCeilingMicroUsd).toBe(12_500_000n);
    expect(systemLines(ctx).slice(-2)).toEqual(['LLM calls are on.', 'Daily LLM ceiling set to $12.5000.']);
    expect(rows(ctx, 'command')).toHaveLength(0);
  });

  it('/llm stats by the admin posts one plain system line with the route names and no markup', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/llm stats' });
    const lines = systemLines(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('world_gen_start');
    expect(lines[0]).toContain('Ledger:');
    expect(lines[0]).not.toMatch(/[[<]/);
    expect(lines[0]).not.toMatch(/[0-9a-f]{64}/i);
    expect(lines[0]).not.toContain('Click me');
    expect(rows(ctx, 'command')).toHaveLength(0);
  });

  it('a non-admin owner of the character gets exactly the refusal and nothing changes', () => {
    for (const text of ['/llm off', '/llm stats', '/llm ceiling 5']) {
      const ctx = newCtx(strangerIdentity);
      submitCommand(ctx, { characterId: 2n, text });
      expect(systemLines(ctx)).toEqual([LLM_ADMIN_REFUSAL_LINE]);
      const state = rows(ctx, 'llm_admin_state')[0];
      expect(state.llmEnabled).toBe(true);
      expect(state.dailyCeilingMicroUsd).toBe(10_000_000n);
      expect(rows(ctx, 'command')).toHaveLength(0);
    }
  });

  it('the stranger cannot use the admin character either (ownership still enforced)', () => {
    const ctx = newCtx(strangerIdentity);
    expect(() => submitCommand(ctx, { characterId: 1n, text: '/llm off' })).toThrow('Not your character');
    expect(rows(ctx, 'llm_admin_state')[0].llmEnabled).toBe(true);
  });

  it('other slash text still inserts its command row as before', () => {
    const ctx = newCtx(strangerIdentity);
    submitCommand(ctx, { characterId: 2n, text: '/foo bar' });
    const commands = rows(ctx, 'command');
    expect(commands).toHaveLength(1);
    expect(commands[0].text).toBe('/foo bar');
    expect(systemLines(ctx)).toEqual([]);
    // "/llmx" is not an /llm command.
    submitCommand(ctx, { characterId: 2n, text: '/llmx' });
    expect(rows(ctx, 'command')).toHaveLength(2);
  });

  it('/unlockrace is still admin-gated by its own branch (a stranger is thrown out)', () => {
    const ctx = newCtx(strangerIdentity);
    expect(() => submitCommand(ctx, { characterId: 2n, text: '/unlockrace Kobold' })).toThrow('Admin only');
    expect(rows(ctx, 'command')).toHaveLength(0);
  });
});
