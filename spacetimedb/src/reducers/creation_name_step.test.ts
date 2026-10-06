/**
 * The name step quotes the real name length rule (3 to 20 letters). The resume line at AWAITING_NAME
 * once said "Four characters minimum" while the check accepted 3. Both lines now read the same
 * constants as the check, so a wrong number cannot come back. Runs the REAL start_creation and
 * submit_creation_input handlers captured from index.ts on the strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const T = { microsSinceUnixEpoch: T0 };
const alice = { toHexString: () => 'a'.repeat(64) };

let startCreation: (...args: any[]) => any;
let submitCreationInput: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const start = capturedReducer('start_creation');
  const submit = capturedReducer('submit_creation_input');
  if (typeof start !== 'function' || typeof submit !== 'function') {
    throw new Error(
      'capturedReducer could not capture start_creation or submit_creation_input from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  startCreation = start;
  submitCreationInput = submit;
}, 120_000);

function nameStepCtx() {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character_creation_state: [
        {
          id: 1n,
          playerId: alice,
          step: 'AWAITING_NAME',
          raceName: 'Saltkin',
          archetype: 'mystic',
          className: 'Tidecaller',
          chosenAbilityIndex: 0n,
          createdAt: T,
          updatedAt: T,
        },
      ],
      character: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const events = (ctx: any): any[] => ctx.db._tables.event_creation ?? [];

describe('the name step quotes the real rule', () => {
  it('the resume line says 3 and 20, never the old "Four characters minimum"', () => {
    const ctx = nameStepCtx();
    startCreation(ctx, {});
    expect(events(ctx)).toHaveLength(1);
    const message: string = events(ctx)[0].message;
    expect(message).toContain('You still need a name.');
    expect(message).toContain('Between 3 and 20 characters.');
    expect(message).not.toMatch(/four/i);
  });

  it.each([
    ['2 letters', 'Al'],
    ['21 letters', 'A'.repeat(21)],
  ])('%s is rejected with the same 3 and 20 rule', (_label, text) => {
    const ctx = nameStepCtx();
    submitCreationInput(ctx, { text });
    expect(events(ctx)).toHaveLength(1);
    expect(events(ctx)[0].kind).toBe('creation_error');
    expect(events(ctx)[0].message).toContain('Names must be between 3 and 20 characters.');
    expect(ctx.db._tables.character_creation_state[0].step).toBe('AWAITING_NAME');
  });

  it.each([
    ['3 letters', 'Ash'],
    ['20 letters', 'A'.repeat(20)],
  ])('%s is accepted at the edge of the rule', (_label, text) => {
    const ctx = nameStepCtx();
    submitCreationInput(ctx, { text });
    expect(ctx.db._tables.character_creation_state[0].step).toBe('CONFIRMING');
    expect(ctx.db._tables.character_creation_state[0].characterName).toBe(text);
  });
});
