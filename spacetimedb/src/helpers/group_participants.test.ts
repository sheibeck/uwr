/**
 * getGroupOrSoloParticipants (plan 51.1-02): who a fight started by one party member pulls in.
 * Only online members at the initiator's place join; the initiator always fights.
 */
import { describe, it, expect } from 'vitest';
import { getGroupOrSoloParticipants } from './group';
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
