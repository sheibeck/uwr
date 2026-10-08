/**
 * getGroupOrSoloParticipants (plan 51.1-02): who a fight started by one party member pulls in.
 * Only online members at the initiator's place join; the initiator always fights.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node builtins are not in the server tsconfig types
import { readFileSync } from 'node:fs';
// @ts-ignore node builtins are not in the server tsconfig types
import { fileURLToPath } from 'node:url';
import { fightRoster, getGroupOrSoloParticipants } from './group';
import { createMockDb } from './test-utils';

const ch = (id: bigint, over: Record<string, unknown> = {}) => ({
  id,
  name: `C${id}`,
  locationId: 10n,
  groupId: 5n,
  online: true,
  ...over,
});

const ctxWith = (characters: any[], memberIds: bigint[]) => ({
  db: createMockDb({
    character: characters,
    group_member: memberIds.map((characterId, i) => ({
      id: BigInt(i + 1),
      groupId: 5n,
      characterId,
      role: i === 0 ? 'leader' : 'member',
      followLeader: true,
    })),
  }),
});

describe('getGroupOrSoloParticipants', () => {
  it('a solo character returns just itself', () => {
    const solo = ch(1n, { groupId: undefined });
    expect(getGroupOrSoloParticipants(ctxWith([solo], []), solo)).toEqual([solo]);
  });

  it('includes online members at the place', () => {
    const rows = [ch(1n), ch(2n), ch(3n)];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n, 3n]), rows[0]);
    expect(out.map((r: any) => r.id)).toEqual([1n, 2n, 3n]);
  });

  it('leaves out an offline member at the place', () => {
    const rows = [ch(1n), ch(2n, { online: false }), ch(3n)];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n, 3n]), rows[0]);
    expect(out.map((r: any) => r.id)).toEqual([1n, 3n]);
  });

  it('treats a row without the online field as offline', () => {
    const noFlag: any = ch(2n);
    delete noFlag.online;
    const rows = [ch(1n), noFlag];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n]), rows[0]);
    expect(out.map((r: any) => r.id)).toEqual([1n]);
  });

  it('leaves out an online member at another place', () => {
    const rows = [ch(1n), ch(2n, { locationId: 11n })];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n]), rows[0]);
    expect(out.map((r: any) => r.id)).toEqual([1n]);
  });

  it('always includes the initiator, even when its own row reads offline', () => {
    const rows = [ch(1n, { online: false }), ch(2n)];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n]), rows[0]);
    expect(out.map((r: any) => r.id)).toEqual([1n, 2n]);
  });

  it('puts the initiator first, then members in member order', () => {
    const rows = [ch(1n), ch(2n), ch(3n)];
    const out = getGroupOrSoloParticipants(ctxWith(rows, [1n, 2n, 3n]), rows[2]);
    expect(out.map((r: any) => r.id)).toEqual([3n, 1n, 2n]);
  });
});

describe('fightRoster: the one fight rule every fight start uses (code review CR-02)', () => {
  it('keeps the initiator first and only online candidates at its place, without duplicates', () => {
    const me = ch(1n);
    const out = fightRoster(me, [
      ch(2n),
      ch(3n, { online: false }),
      ch(4n, { locationId: 11n }),
      ch(2n),
      me,
      null,
      ch(5n),
    ]);
    expect(out.map((r: any) => r.id)).toEqual([1n, 2n, 5n]);
    expect(out[0]).toBe(me);
  });

  it('includes the initiator even when it is missing from the candidates', () => {
    expect(fightRoster(ch(1n), [ch(2n)]).map((r: any) => r.id)).toEqual([1n, 2n]);
  });

  it('is applied inside startCombatForSpawn, so no caller can pull an offline member in', () => {
    const src = readFileSync(fileURLToPath(new URL('../reducers/combat.ts', import.meta.url)), 'utf8');
    const start = src.indexOf('export const startCombatForSpawn');
    const body = src.slice(start, src.indexOf('combat_encounter.insert', start));
    expect(body).toMatch(/const participants = fightRoster\(\s*leader,\s*candidates,/);
    // Review 2 IN-04: with the in-another-fight check.
    expect(body).toContain('activeFightOf(ctx, characterId) !== null');
  });

  it('drops a candidate already in another fight, never the initiator (review 2 IN-04)', () => {
    const fighting = new Set([1n, 3n]);
    const out = fightRoster(ch(1n), [ch(2n), ch(3n), ch(4n)], (id) => fighting.has(id));
    expect(out.map((r: any) => r.id)).toEqual([1n, 2n, 4n]);
  });
});
