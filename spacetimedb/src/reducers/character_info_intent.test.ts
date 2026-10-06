/**
 * The character info screen through the real submit_intent handler (Phase 49, IN-14). The race section
 * reads the stored race_definition through findRaceDefinition, so a legacy row saved under the reserved
 * placeholder name 'Unknown' is never honored: a placeholder-race character shows no racial bonuses,
 * while a named race still shows its stored narrative and bonuses.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let submitIntent: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_intent');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('submit_intent') is not a function: STOP and report; never edit production code to fix this.");
  }
  submitIntent = h;
}, 120_000);

const BONUSES = '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

const raceDefinitionRow = (id: bigint, name: string) => ({
  id,
  name,
  nameLower: name.toLowerCase(),
  narrative: `${name} narrative.`,
  bonusesJson: BONUSES,
  createdAt: { microsSinceUnixEpoch: T0 },
});

function newCtx(race: string, definitions: string[]) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{
        id: 1n,
        ownerUserId: 7n,
        name: 'Mirel',
        race,
        className: 'Warrior',
        weaponProficiencies: '',
        armorProficiencies: '',
        level: 3n,
        locationId: 10n,
      }],
      race_definition: definitions.map((name, i) => raceDefinitionRow(BigInt(i + 1), name)),
      race: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const events = (ctx: any): any[] => ctx.db._tables.event_private ?? [];

describe('character info: race section (real handler)', () => {
  it('shows the stored narrative and bonuses of a named race', () => {
    const ctx = newCtx('Saltkin', ['Saltkin']);
    submitIntent(ctx, { characterId: 1n, text: 'character' });
    expect(events(ctx)).toHaveLength(1);
    const message: string = events(ctx)[0].message;
    expect(message).toContain('Race: Saltkin');
    expect(message).toContain('Saltkin narrative.');
    expect(message).toContain('Racial Bonuses:');
    expect(message).toContain('Underlight Eyes');
  });

  it.each(['Unknown', 'unknown', 'UNKNOWN'])(
    'IN-14: a legacy definition named "Unknown" is not honored for a "%s" race character',
    (race) => {
      const ctx = newCtx(race, ['Unknown']);
      submitIntent(ctx, { characterId: 1n, text: 'character' });
      expect(events(ctx)).toHaveLength(1);
      const message: string = events(ctx)[0].message;
      expect(message).toContain(`Race: ${race}`);
      expect(message).toContain('Race data unavailable.');
      expect(message).not.toContain('Racial Bonuses:');
      expect(message).not.toContain('Underlight Eyes');
      expect(message).not.toContain('Unknown narrative.');
    },
  );
});
