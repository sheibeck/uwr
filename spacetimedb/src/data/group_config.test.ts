import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GROUP_INVITE_TTL_MICROS,
  MAX_GROUP_SIZE,
  comesAlongWithLeader,
  inviteExpiresAtMicros,
  isInviteExpired,
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
