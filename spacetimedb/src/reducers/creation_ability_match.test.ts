/**
 * The CLASS_REVEALED ability matcher (review WR-02): an exact name match anywhere in the list wins,
 * and only then does a substring in either direction pick the first hit. The ability cards on the
 * client send the ability name, so a shared-prefix pair must never choose the wrong ability.
 * Runs the REAL submit_creation_input handler captured from index.ts on the strict mock db.
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

let submitCreationInput: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_creation_input');
  if (typeof h !== 'function') {
    throw new Error(
      "capturedReducer('submit_creation_input') is not a function: the schema recorder could not capture the " +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  submitCreationInput = h;
}, 120_000);

const ability = (name: string) => ({ name, description: `${name}.`, kind: 'damage' });

function pick(names: string[], text: string) {
  const ctx = createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character_creation_state: [
        {
          id: 1n,
          playerId: alice,
          step: 'CLASS_REVEALED',
          raceName: 'Saltkin',
          archetype: 'mystic',
          className: 'Tidecaller',
          abilities: JSON.stringify(names.map(ability)),
          createdAt: T,
          updatedAt: T,
        },
      ],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
  submitCreationInput(ctx, { text });
  return ctx.db._tables.character_creation_state[0];
}

describe('CLASS_REVEALED ability matching', () => {
  it('an exact name wins over an earlier ability that merely contains it (Frost Bolt vs Frost Bolt Volley)', () => {
    const state = pick(['Frost Bolt Volley', 'Frost Bolt', 'Ember Ward'], 'Frost Bolt');
    expect(state.chosenAbilityIndex).toBe(1n);
    expect(state.step).toBe('AWAITING_NAME');
  });

  it('an exact name wins over an earlier ability the input contains (Strike vs Shadow Strike)', () => {
    const state = pick(['Strike', 'Shadow Strike', 'Ember Ward'], 'Shadow Strike');
    expect(state.chosenAbilityIndex).toBe(1n);
  });

  it('the exact match is case and spacing insensitive', () => {
    const state = pick(['Frost Bolt Volley', 'Frost Bolt', 'Ember Ward'], '  frost   BOLT ');
    expect(state.chosenAbilityIndex).toBe(1n);
  });

  it('with no exact match a substring in either direction still picks the first hit', () => {
    expect(pick(['Frost Bolt', 'Ember Ward', 'Tide Surge'], 'ember').chosenAbilityIndex).toBe(1n);
    expect(pick(['Frost Bolt', 'Ember Ward', 'Tide Surge'], 'the tide surge please').chosenAbilityIndex).toBe(2n);
  });

  it('an input that matches nothing leaves the step at CLASS_REVEALED', () => {
    const state = pick(['Frost Bolt', 'Ember Ward', 'Tide Surge'], 'Banana');
    expect(state.step).toBe('CLASS_REVEALED');
    expect(state.chosenAbilityIndex).toBeUndefined();
  });
});
