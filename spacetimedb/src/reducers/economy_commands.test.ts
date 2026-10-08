/**
 * /economy through the REAL submit_command handler captured from `spacetimedb/src/index.ts`
 * (Phase 51.3, Plan 08). The mock db is strict, and one shared identity object per person is used for
 * seeding and as the sender (the mock compares identities with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { ECONOMY_ADMIN_REFUSAL_LINE } from '../helpers/economy_admin_commands';
import { LLM_ADMIN_REFUSAL_LINE } from '../helpers/llm_admin_commands';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const adminIdentity = { toHexString: () => CLI_HEX };
const strangerIdentity = { toHexString: () => 'b'.repeat(64) };

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
  region: [{ id: 7n, name: 'Ashfall' }],
});

const newCtx = (sender: any, seed: Seed = baseSeed()) =>
  createMockCtx({ seed, sender, timestampMicros: T0, strict: true });

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);

describe('submit_command /economy', () => {
  it('/economy gold 150 by the admin writes goldPct, posts one system line and inserts no command row', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/economy gold 150' });
    expect(rows(ctx, 'economy_dials')[0].goldPct).toBe(150n);
    expect(systemLines(ctx)).toEqual(['Gold set to 150%.']);
    expect(rows(ctx, 'command')).toHaveLength(0);
  });

  it('/economy gold 150 from a stranger writes the refusal line only', () => {
    const ctx = newCtx(strangerIdentity);
    submitCommand(ctx, { characterId: 2n, text: '/economy gold 150' });
    expect(systemLines(ctx)).toEqual([ECONOMY_ADMIN_REFUSAL_LINE]);
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
    expect(rows(ctx, 'command')).toHaveLength(0);
  });

  it('/economy from the admin writes the show text without writing a dial row', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/economy' });
    const lines = systemLines(ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('AI economy: off');
    expect(lines[0]).toContain('1 on fallbacks');
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
    expect(rows(ctx, 'command')).toHaveLength(0);
  });

  it('a malformed form from the admin prints the usage line and writes nothing', () => {
    const ctx = newCtx(adminIdentity);
    submitCommand(ctx, { characterId: 1n, text: '/economy gold 150.5' });
    expect(systemLines(ctx)).toHaveLength(1);
    expect(systemLines(ctx)[0]).toMatch(/^Usage: \/economy/);
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
  });

  it('/llm stats still reaches the llm handler (stranger gets the llm refusal, not the economy one)', () => {
    const ctx = newCtx(strangerIdentity);
    submitCommand(ctx, { characterId: 2n, text: '/llm stats' });
    expect(systemLines(ctx)).toEqual([LLM_ADMIN_REFUSAL_LINE]);
  });
});
