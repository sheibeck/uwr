import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMockDb } from '../helpers/test-utils';
import { perkBonusByField, perkDisplayName } from './perk_rules';
import { RENOWN_PERK_POOLS } from './renown_data';
import { getPerkBonusByField } from '../helpers/renown';

// Records the real table definitions; strict mode derives its accessor allowlist from them.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('perkBonusByField', () => {
  it('sums a pool perk field; each row counts, as the server does today', () => {
    expect(perkBonusByField(['shrewd_bargainer'], 'vendorBuyDiscount')).toBe(5);
    expect(perkBonusByField(['shrewd_bargainer', 'shrewd_bargainer'], 'vendorBuyDiscount')).toBe(10);
    expect(perkBonusByField(['shrewd_bargainer'], 'vendorSellBonus')).toBe(5);
  });

  it('an unknown key, an empty list or a field the effect lacks gives 0', () => {
    expect(perkBonusByField(['no_such_perk'], 'vendorBuyDiscount')).toBe(0);
    expect(perkBonusByField([], 'vendorBuyDiscount')).toBe(0);
    expect(perkBonusByField(['shrewd_bargainer'], 'gatherDoubleChance')).toBe(0);
  });

  it('converts a bigint effect field to a number', () => {
    // iron_will carries maxHp: 25n
    expect(perkBonusByField(['iron_will'], 'maxHp')).toBe(25);
  });

  it('a scalesWithLevel perk adds perLevelBonus times the level only when a level is passed', () => {
    const scaling = Object.values(RENOWN_PERK_POOLS)
      .flat()
      .find((p) => p.effect.scalesWithLevel && p.effect.perLevelBonus && p.effect.craftQualityBonus !== undefined);
    expect(scaling).toBeDefined();
    const base = scaling!.effect.craftQualityBonus as number;
    const per = scaling!.effect.perLevelBonus as number;
    expect(perkBonusByField([scaling!.key], 'craftQualityBonus')).toBe(base);
    expect(perkBonusByField([scaling!.key], 'craftQualityBonus', 10n)).toBe(base + per * 10);
  });

  it('pins today: a renown_rank{N}_ prefixed passive key adds nothing (owner todo 2026-10-06-renown-passive-perks-no-effect)', () => {
    expect(perkBonusByField(['renown_rank3_shrewd_bargainer'], 'vendorBuyDiscount')).toBe(0);
  });
});

describe('perkDisplayName', () => {
  it('an exact pool key gives the pool name', () => {
    expect(perkDisplayName('iron_will')).toBe('Iron Will');
    expect(perkDisplayName('shrewd_bargainer')).toBe('Shrewd Bargainer');
  });

  it('a renown_rank{N}_{name} key gives the matching rank-N pool name', () => {
    expect(perkDisplayName('renown_rank2_iron_will')).toBe('Iron Will');
    expect(perkDisplayName('renown_rank3_shrewd_bargainer')).toBe('Shrewd Bargainer');
  });

  it('a prefixed key whose rank pool lacks the name is humanized', () => {
    // iron_will is a rank 2 perk, so rank 3 falls through to the fallback
    expect(perkDisplayName('renown_rank3_iron_will')).toBe('Iron Will');
    expect(perkDisplayName('renown_rank4_warrior_s_edge')).toBe('Warrior S Edge');
  });

  it('anything else is humanized; an empty key is empty', () => {
    expect(perkDisplayName('mystery_gift')).toBe('Mystery Gift');
    expect(perkDisplayName('__a__b__')).toBe('A B');
    expect(perkDisplayName('')).toBe('');
  });
});

describe('getPerkBonusByField delegates to perkBonusByField', () => {
  const perk = (id: bigint, characterId: bigint, perkKey: string) => ({
    id,
    characterId,
    rank: 3n,
    perkKey,
    chosenAt: { microsSinceUnixEpoch: 0n },
  });

  it('gives 5 for one shrewd_bargainer and equals the pure function over the same keys', () => {
    const db = createMockDb(
      { renown_perk: [perk(1n, 10n, 'shrewd_bargainer'), perk(2n, 11n, 'shrewd_bargainer')] },
      { strict: true },
    );
    const ctx = { db };
    expect(getPerkBonusByField(ctx, 10n, 'vendorBuyDiscount')).toBe(5);
    expect(getPerkBonusByField(ctx, 10n, 'vendorBuyDiscount')).toBe(
      perkBonusByField(['shrewd_bargainer'], 'vendorBuyDiscount'),
    );
  });

  it('a character with no perks, or only an unmatched prefixed key, gets 0', () => {
    const db = createMockDb({ renown_perk: [perk(1n, 10n, 'renown_rank3_shrewd_bargainer')] }, { strict: true });
    expect(getPerkBonusByField({ db }, 10n, 'vendorBuyDiscount')).toBe(0);
    expect(getPerkBonusByField({ db }, 99n, 'vendorBuyDiscount')).toBe(0);
  });
});

describe('import pin', () => {
  it('perk_rules imports only ./renown_data', () => {
    expect(new Set(importSpecifiers('perk_rules.ts'))).toEqual(new Set(['./renown_data']));
  });
});
