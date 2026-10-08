import { describe, expect, it } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore node types are not part of this module's tsconfig
import { fileURLToPath } from 'node:url';
import {
  GROUP_INVITE_TTL_MICROS,
  MAX_GROUP_SIZE,
  comesAlongWithLeader,
  inviteExpiresAtMicros,
  isInviteExpired,
  successorOrder,
  GROUP_REINVITE_COOLDOWN_MICROS,
  reinviteWaitRunning,
} from './group_config';

describe('group_config constants', () => {
  it('caps a group at 5 and lets an invite live 5 minutes', () => {
    expect(MAX_GROUP_SIZE).toBe(5);
    expect(GROUP_INVITE_TTL_MICROS).toBe(300_000_000n);
  });
});

describe('inviteExpiresAtMicros', () => {
  it('is createdAt plus the TTL', () => {
    expect(inviteExpiresAtMicros(1_000n)).toBe(300_001_000n);
    expect(inviteExpiresAtMicros(0n)).toBe(GROUP_INVITE_TTL_MICROS);
  });
});

describe('isInviteExpired', () => {
  const c = 1_700_000_000_000_000n;

  it('is live at creation and one microsecond before the TTL ends', () => {
    expect(isInviteExpired(c, c)).toBe(false);
    expect(isInviteExpired(c, c + GROUP_INVITE_TTL_MICROS - 1n)).toBe(false);
  });

  it('is expired from exactly createdAt + TTL onwards', () => {
    expect(isInviteExpired(c, c + GROUP_INVITE_TTL_MICROS)).toBe(true);
    expect(isInviteExpired(c, c + GROUP_INVITE_TTL_MICROS + 1n)).toBe(true);
  });
});

describe('comesAlongWithLeader', () => {
  it('is true only when following, online and at the leader place', () => {
    for (const followLeader of [true, false]) {
      for (const online of [true, false]) {
        for (const atLeaderPlace of [true, false]) {
          const expected = followLeader && online && atLeaderPlace;
          expect(comesAlongWithLeader({ followLeader, online, atLeaderPlace })).toBe(expected);
        }
      }
    }
  });

  it('leaves an offline follower behind', () => {
    expect(comesAlongWithLeader({ followLeader: true, online: false, atLeaderPlace: true })).toBe(false);
  });
});

describe('group_config module shape', () => {
  it('imports nothing (the browser imports it through @game-data)', () => {
    const source = readFileSync(fileURLToPath(new URL('./group_config.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});

describe('successorOrder (code review WR-04)', () => {
  const c = (memberId: bigint, joinedAtMicros: bigint, online: boolean) => ({ memberId, joinedAtMicros, online });
  const first = (list: ReturnType<typeof c>[]) => [...list].sort(successorOrder)[0].memberId;

  it('puts an online member before an earlier offline one', () => {
    expect(first([c(2n, 1n, false), c(3n, 2n, true)])).toBe(3n);
  });

  it('then the earliest joinedAt, then the lowest member id', () => {
    expect(first([c(3n, 2n, true), c(2n, 5n, true)])).toBe(3n);
    expect(first([c(3n, 2n, true), c(2n, 2n, true)])).toBe(2n);
    expect(first([c(3n, 2n, false), c(2n, 4n, false)])).toBe(3n);
  });

  it('is zero only for the same candidate', () => {
    expect(successorOrder(c(1n, 1n, true), c(1n, 1n, true))).toBe(0);
  });
});

describe('re-invite wait (code review WR-02)', () => {
  it('is 30 seconds and runs until exactly its end', () => {
    expect(GROUP_REINVITE_COOLDOWN_MICROS).toBe(30_000_000n);
    expect(reinviteWaitRunning(100n, 99n)).toBe(true);
    expect(reinviteWaitRunning(100n, 100n)).toBe(false);
  });
});
