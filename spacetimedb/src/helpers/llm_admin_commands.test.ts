import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import {
  LLM_ADMIN_REFUSAL_LINE,
  LLM_COMMAND_USAGE,
  buildLlmStatsText,
  handleLlmAdminCommand,
  parseDollarsToMicroUsd,
  parseLlmCommand,
} from './llm_admin_commands';
import { LLM_ROUTE_NAMES } from '../data/llm_routes';
import { ADMIN_IDENTITIES } from '../data/admin';
import { utcDay } from './llm_budget';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n; // 2023-11-14T22:13:20Z
const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const admin = { toHexString: () => CLI_HEX };
const stranger = { toHexString: () => 'b'.repeat(64) };
const character = { id: 1n, ownerUserId: 7n };

type Seed = Record<string, any[]>;
const ctxFor = (sender: any, seed: Seed = {}) =>
  createLenientMockCtx({ sender, seed, timestampMicros: T0, strict: true } as any);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);
const adminState = (ctx: any) => rows(ctx, 'llm_admin_state')[0];

const PLAYER_HEX = 'd'.repeat(64);
const logRow = (over: Record<string, unknown>) => ({
  id: 1n,
  jobId: 1n,
  playerId: { toHexString: () => PLAYER_HEX },
  route: 'world_gen_start',
  model: 'm',
  outcome: 'ok',
  attempt: 1n,
  httpStatus: 200n,
  latencyMs: 5100n,
  inputTokens: 1n,
  outputTokens: 1n,
  cacheWriteTokens: 0n,
  cacheReadTokens: 0n,
  createdAt: { microsSinceUnixEpoch: T0 - 1_000_000n },
  costMicroUsd: 17_800n,
  dispatchLateMs: 0n,
  ...over,
});

describe('the admin identity used by these tests', () => {
  it('is the CLI admin identity pinned in data/admin.ts', () => {
    expect(ADMIN_IDENTITIES.has(CLI_HEX)).toBe(true);
    expect(ADMIN_IDENTITIES.has(stranger.toHexString())).toBe(false);
  });
});

describe('parseLlmCommand', () => {
  it('returns null for text that is not /llm', () => {
    for (const text of ['/llmx', 'llm stats', '/unlockrace x', '', '/synccontent', 'hello /llm stats']) {
      expect(parseLlmCommand(text), text).toBeNull();
    }
  });

  it('parses stats, on, off and ceiling (case and spacing insensitive)', () => {
    expect(parseLlmCommand('/llm stats')).toEqual({ verb: 'stats' });
    expect(parseLlmCommand('/LLM  Stats ')).toEqual({ verb: 'stats' });
    expect(parseLlmCommand('/llm on')).toEqual({ verb: 'on' });
    expect(parseLlmCommand('/llm OFF')).toEqual({ verb: 'off' });
    expect(parseLlmCommand('/llm ceiling 12.50')).toEqual({ verb: 'ceiling', arg: '12.50' });
  });

  it('answers help for a bare /llm, an unknown verb or a malformed form', () => {
    expect(parseLlmCommand('/llm')).toEqual({ verb: 'help' });
    expect(parseLlmCommand('/llm something-else')).toEqual({ verb: 'help' });
    expect(parseLlmCommand('/llm ceiling')).toEqual({ verb: 'help' });
    expect(parseLlmCommand('/llm off now please')).toEqual({ verb: 'help' });
  });
});

describe('parseDollarsToMicroUsd', () => {
  it('converts whole dollars and cents by string math', () => {
    expect(parseDollarsToMicroUsd('0.01')).toBe(10_000n);
    expect(parseDollarsToMicroUsd('12.5')).toBe(12_500_000n);
    expect(parseDollarsToMicroUsd('12.50')).toBe(12_500_000n);
    expect(parseDollarsToMicroUsd('1000')).toBe(1_000_000_000n);
    expect(parseDollarsToMicroUsd('0')).toBe(0n);
  });

  it('refuses anything else', () => {
    for (const text of ['1e3', '-1', '12.345', '', ' ', 'abc', '10000', '12.', '.5', '+5', '1,000']) {
      expect(parseDollarsToMicroUsd(text), JSON.stringify(text)).toBeNull();
    }
  });
});

describe('handleLlmAdminCommand: non-/llm text', () => {
  it('returns false and writes nothing', () => {
    const ctx = ctxFor(admin);
    for (const text of ['/llmx', 'look', '/unlockrace Kobold']) {
      expect(handleLlmAdminCommand(ctx, character, text)).toBe(false);
    }
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

describe('handleLlmAdminCommand: a non-admin', () => {
  it.each(['/llm stats', '/llm on', '/llm off', '/llm ceiling 12.50', '/llm', '/llm huh'])(
    '%s gets the refusal and changes nothing',
    (text) => {
      const ctx = ctxFor(stranger, {
        llm_admin_state: [
          { id: 1n, keySet: false, keyLength: 0n, keyLastCheckOk: false, lastSmokeJson: '{}', llmEnabled: true, dailyCeilingMicroUsd: 10_000_000n },
        ],
        llm_call_log: [logRow({})],
      });
      const before = JSON.stringify(rows(ctx, 'llm_admin_state'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(handleLlmAdminCommand(ctx, character, text)).toBe(true);
      expect(systemLines(ctx)).toEqual([LLM_ADMIN_REFUSAL_LINE]);
      expect(JSON.stringify(rows(ctx, 'llm_admin_state'), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(before);
    },
  );

  it('the refusal is in the Keeper voice (he/his) and plain text', () => {
    expect(LLM_ADMIN_REFUSAL_LINE).toBe('The Keeper does not discuss his accounts with you.');
    expect(LLM_ADMIN_REFUSAL_LINE).not.toMatch(/[[<]/);
  });
});

describe('handleLlmAdminCommand: an admin', () => {
  it('/llm off turns calls off', () => {
    const ctx = ctxFor(admin);
    expect(handleLlmAdminCommand(ctx, character, '/llm off')).toBe(true);
    expect(adminState(ctx).llmEnabled).toBe(false);
    expect(systemLines(ctx)).toEqual([
      'LLM calls are off. Players see the resting line; calls already in flight finish.',
    ]);
  });

  it('/llm on turns calls on', () => {
    const ctx = ctxFor(admin, {
      llm_admin_state: [
        { id: 1n, keySet: false, keyLength: 0n, keyLastCheckOk: false, lastSmokeJson: '{}', llmEnabled: false, dailyCeilingMicroUsd: 10_000_000n },
      ],
    });
    expect(handleLlmAdminCommand(ctx, character, '/llm on')).toBe(true);
    expect(adminState(ctx).llmEnabled).toBe(true);
    expect(systemLines(ctx)).toEqual(['LLM calls are on.']);
  });

  it('/llm ceiling 12.50 sets the ceiling and confirms it', () => {
    const ctx = ctxFor(admin);
    expect(handleLlmAdminCommand(ctx, character, '/llm ceiling 12.50')).toBe(true);
    expect(adminState(ctx).dailyCeilingMicroUsd).toBe(12_500_000n);
    expect(systemLines(ctx)).toEqual(['Daily LLM ceiling set to $12.5000.']);
  });

  it('accepts the bounds $0.01 and $1000', () => {
    const lo = ctxFor(admin);
    handleLlmAdminCommand(lo, character, '/llm ceiling 0.01');
    expect(adminState(lo).dailyCeilingMicroUsd).toBe(10_000n);
    const hi = ctxFor(admin);
    handleLlmAdminCommand(hi, character, '/llm ceiling 1000');
    expect(adminState(hi).dailyCeilingMicroUsd).toBe(1_000_000_000n);
  });

  it.each(['/llm ceiling 0', '/llm ceiling 5000', '/llm ceiling abc', '/llm ceiling 12.345', '/llm ceiling 1e3', '/llm ceiling'])(
    '%s writes nothing and says why',
    (text) => {
      const ctx = ctxFor(admin);
      expect(handleLlmAdminCommand(ctx, character, text)).toBe(true);
      expect(adminState(ctx).dailyCeilingMicroUsd).toBe(10_000_000n);
      const lines = systemLines(ctx);
      expect(lines).toHaveLength(1);
      expect(
        [LLM_COMMAND_USAGE, 'Daily ceiling must be between $0.01 and $1000.00.'].includes(lines[0]),
        lines[0],
      ).toBe(true);
    },
  );

  it('a bare /llm or an unknown verb prints the usage line, with no markup characters', () => {
    for (const text of ['/llm', '/llm frobnicate']) {
      const ctx = ctxFor(admin);
      expect(handleLlmAdminCommand(ctx, character, text)).toBe(true);
      expect(systemLines(ctx)).toEqual([LLM_COMMAND_USAGE]);
    }
    expect(LLM_COMMAND_USAGE).not.toMatch(/[[<]/);
  });
});

describe('/llm stats', () => {
  const ledger = {
    id: 1n,
    spentMicroUsd: 231_000n,
    reservedMicroUsd: 5_000n,
    calls: 40n,
    updatedAt: { microsSinceUnixEpoch: T0 },
    dayUtc: utcDay({ microsSinceUnixEpoch: T0 }),
    daySpentMicroUsd: 71_200n,
  };

  it('prints every route in order, zeros for empty routes and the ledger line', () => {
    const ctx = ctxFor(admin, {
      llm_spend: [ledger],
      llm_call_log: [
        logRow({ id: 1n, latencyMs: 5000n }),
        logRow({ id: 2n, latencyMs: 5200n }),
        logRow({ id: 3n, outcome: 'truncated', latencyMs: 9000n }),
        logRow({ id: 4n, route: 'npc_reply', latencyMs: 2000n, costMicroUsd: 500n, createdAt: { microsSinceUnixEpoch: T0 - 90_000_000_000n } }),
      ],
    });
    expect(handleLlmAdminCommand(ctx, character, '/llm stats')).toBe(true);
    const lines = systemLines(ctx);
    expect(lines).toHaveLength(1);
    const text = lines[0];

    let cursor = -1;
    for (const route of LLM_ROUTE_NAMES) {
      const at = text.indexOf(`${route}: `);
      expect(at, route).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(text).toContain('npc_reply: 0 calls, $0.0000, p50 0.0s, p95 0.0s, 0 errors, 0 truncated | all time: 1 calls, $0.0005');
    expect(text).toContain('world_gen_start: 3 calls');
    expect(text).toContain('1 truncated');
    expect(text).toContain(
      'Ledger: all time $0.2310 over 40 calls. Today $0.0712 spent and $0.0050 reserved of a $10.0000 daily ceiling. LLM calls are on.',
    );
  });

  it('shows zeros and off when there is no ledger row and calls are off', () => {
    const ctx = ctxFor(admin, {
      llm_admin_state: [
        { id: 1n, keySet: false, keyLength: 0n, keyLastCheckOk: false, lastSmokeJson: '{}', llmEnabled: false, dailyCeilingMicroUsd: 12_500_000n },
      ],
    });
    const text = buildLlmStatsText(ctx);
    expect(text).toContain(
      'Ledger: all time $0.0000 over 0 calls. Today $0.0000 spent and $0.0000 reserved of a $12.5000 daily ceiling. LLM calls are off.',
    );
    for (const route of LLM_ROUTE_NAMES) expect(text).toContain(`${route}: 0 calls`);
  });

  it('has no [ or <, no identity hex, and no prompt or reply text, even when rows carry them', () => {
    const ctx = ctxFor(admin, {
      llm_spend: [ledger],
      llm_call_log: [
        logRow({
          requestId: 'req_secret_[link]',
          errorMessage: '<script>alert(1)</script> [Click me]',
          stopReason: 'end_turn',
          route: 'bad[route]<x>',
        }),
        logRow({ id: 2n }),
      ],
    });
    handleLlmAdminCommand(ctx, character, '/llm stats');
    const text = systemLines(ctx)[0];
    expect(text).not.toMatch(/[[<]/);
    expect(text).not.toContain('>');
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
    expect(text).not.toContain(PLAYER_HEX);
    expect(text).not.toContain('script');
    expect(text).not.toContain('Click me');
    expect(text).not.toContain('req_secret');
    expect(text).not.toContain('end_turn');
  });

  it('scans llm_call_log once and never touches llm_config', () => {
    const base = ctxFor(admin, { llm_call_log: [logRow({})] });
    const touched: string[] = [];
    const db = new Proxy(base.db, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') touched.push(prop);
        return Reflect.get(target, prop, receiver);
      },
    });
    buildLlmStatsText({ ...base, db });
    expect(touched.filter((name) => name === 'llm_call_log')).toHaveLength(1);
    expect(touched).not.toContain('llm_config');
    expect(touched.sort()).toEqual(['llm_admin_state', 'llm_call_log', 'llm_spend']);
  });
});
