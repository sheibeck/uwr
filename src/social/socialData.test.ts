import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import { GROUP_INVITE_TTL_MICROS } from '@game-data/group_config';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import { createSocialData } from './socialData';
import type { SocialConn, SocialDeps, SocialInput } from './socialData';
import type { SocialQueries } from './queries';

interface FakeConn {
  id: number;
}

interface FakeBinding {
  sql: string[];
  filter: ((row: any) => boolean) | undefined;
  rows: ShallowRef<readonly any[]>;
  applied: Ref<boolean>;
  failed: Ref<boolean>;
  attach: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
}

const list = (ids: readonly bigint[]) => ids.join(',');
const queries: SocialQueries = {
  petsOf: (ids) => `Q_PETS_${list(ids)}`,
  groupInvitesOf: (id) => `Q_INVITES_${id}`,
  groupById: (id) => `Q_GROUP_${id}`,
  groupMembersOf: (id) => `Q_MEMBERS_${id}`,
  charactersById: (ids) => `Q_CHARS_${list(ids)}`,
};

const SECOND = 1_000_000;
const NOW = 10_000_000_000;
let clockNow = NOW;

function character(id: bigint, groupId?: bigint) {
  return { id, groupId, name: `C${id}` } as any;
}
function invite(id: bigint, groupId: bigint, toCharacterId: bigint, createdAtMicros = NOW, fromCharacterId = 99n) {
  return {
    id,
    groupId,
    fromCharacterId,
    toCharacterId,
    createdAt: { microsSinceUnixEpoch: BigInt(createdAtMicros) },
  } as any;
}

function harness() {
  const conn = shallowRef<FakeConn | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const activeCharacter = ref<any>(null);
  const partyCharacterIds = ref<bigint[]>([]);
  const incomingInvites = ref<any[]>([]);
  const knownCharacters = ref<any[]>([]);
  const bindings: FakeBinding[] = [];

  const deps = {
    bind: (options: BindTableOptions<FakeConn, any>) => {
      const binding: FakeBinding = {
        sql: options.sql,
        filter: options.filter,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
      };
      binding.dispose = vi.fn(() => {
        binding.disposed = true;
        binding.rows.value = [];
        binding.applied.value = false;
      });
      bindings.push(binding);
      return binding;
    },
    queries,
  } as unknown as SocialDeps<FakeConn & SocialConn>;

  const input = {
    conn,
    status,
    character: activeCharacter,
    partyCharacterIds,
    incomingInvites,
    knownCharacters,
    clock: { nowMicros: () => clockNow },
  } as unknown as SocialInput<FakeConn & SocialConn>;
  const scope = effectScope();
  const hub = scope.run(() => createSocialData(deps, input))!;

  const live = (sql: string): FakeBinding[] => bindings.filter((b) => b.sql[0] === sql && !b.disposed);
  const find = (sql: string): FakeBinding => {
    const found = live(sql);
    if (found.length === 0) throw new Error(`no live binding for ${sql}`);
    return found[found.length - 1];
  };
  const liveSql = (): string[] => bindings.filter((b) => !b.disposed).map((b) => b.sql[0]);

  return {
    hub,
    scope,
    conn,
    status,
    activeCharacter,
    partyCharacterIds,
    incomingInvites,
    knownCharacters,
    bindings,
    live,
    find,
    liveSql,
    connect(): FakeConn {
      const c = { id: 1 };
      conn.value = c;
      status.value = 'connected';
      return c;
    },
  };
}

type Harness = ReturnType<typeof harness>;
const made: Harness[] = [];
function make(): Harness {
  const h = harness();
  made.push(h);
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
  clockNow = NOW;
});
afterEach(() => {
  for (const h of made.splice(0)) h.scope.stop();
  vi.useRealTimers();
});

describe('bindings by situation', () => {
  it('has no keyed bindings without an active character', () => {
    const h = make();
    h.connect();
    expect(h.liveSql()).toEqual([]);
  });

  it('solo: one active_pet binding for you and no group_invite binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    expect(h.liveSql()).toEqual(['Q_PETS_1']);
  });

  it('joining a group re-keys the pets to you plus the party and binds the outgoing invites', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    const solo = h.find('Q_PETS_1');
    solo.applied.value = true;

    h.activeCharacter.value = character(1n, 5n);
    h.partyCharacterIds.value = [3n, 2n];
    const grown = h.find('Q_PETS_1,2,3');
    expect(grown.filter!({ characterId: 3n })).toBe(true);
    expect(grown.filter!({ characterId: 4n })).toBe(false);
    // the old rows stay until the new binding has applied, then the old binding is disposed
    expect(solo.disposed).toBe(false);
    grown.applied.value = true;
    expect(solo.disposed).toBe(true);

    const outgoing = h.find('Q_INVITES_5');
    expect(outgoing.filter!({ groupId: 5n })).toBe(true);
    expect(outgoing.filter!({ groupId: 6n })).toBe(false);
  });

  it('leaving the group drops the outgoing invite binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    const outgoing = h.find('Q_INVITES_5');
    h.activeCharacter.value = character(1n);
    expect(outgoing.disposed).toBe(true);
    expect(h.live('Q_INVITES_5')).toHaveLength(0);
  });

  it('filter equals query: a pet row of someone outside the key is not in pets', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    h.partyCharacterIds.value = [2n];
    const binding = h.find('Q_PETS_1,2');
    binding.applied.value = true;
    binding.rows.value = [
      { id: 10n, characterId: 2n, name: 'Wolf' },
      { id: 11n, characterId: 1n, name: 'Cat' },
    ];
    expect(h.hub.petsApplied.value).toBe(true);
    expect(h.hub.pets.value.map((p) => p.id)).toEqual([10n, 11n]);
    expect(h.hub.petOf(2n)?.name).toBe('Wolf');
    expect(h.hub.petOf(4n)).toBeNull();
    expect(binding.filter!({ characterId: 4n })).toBe(false);
  });
});

describe('incoming invite', () => {
  it('takes only the row addressed to the active character', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    h.incomingInvites.value = [invite(7n, 8n, 9n), invite(6n, 8n, 1n)];
    expect(h.hub.incomingInvite.value?.id).toBe(6n);
    h.incomingInvites.value = [invite(7n, 8n, 9n)];
    expect(h.hub.incomingInvite.value).toBeNull();
  });

  it('takes the lowest id when several rows are addressed to the character', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    h.incomingInvites.value = [invite(12n, 3n, 1n), invite(4n, 8n, 1n), invite(9n, 5n, 1n)];
    expect(h.hub.incomingInvite.value?.id).toBe(4n);
  });

  it('is null with no active character', () => {
    const h = make();
    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    expect(h.hub.incomingInvite.value).toBeNull();
  });

  it('binds the inviting group and its members by the invite group id, while you are solo', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    const group = h.find('Q_GROUP_8');
    const members = h.find('Q_MEMBERS_8');
    expect(group.filter!({ id: 8n })).toBe(true);
    expect(group.filter!({ id: 5n })).toBe(false);
    expect(members.filter!({ groupId: 8n })).toBe(true);
    expect(members.filter!({ groupId: 5n })).toBe(false);
    expect(h.hub.inviteGroupApplied.value).toBe(false);

    group.rows.value = [{ id: 8n, name: 'Group' }];
    members.rows.value = [
      { id: 1n, groupId: 8n, characterId: 20n },
      { id: 2n, groupId: 8n, characterId: 21n },
    ];
    group.applied.value = true;
    members.applied.value = true;
    expect(h.hub.inviteGroup.value?.id).toBe(8n);
    expect(h.hub.inviteGroupMembers.value).toHaveLength(2);
    expect(h.hub.inviteGroupApplied.value).toBe(true);

    // the invite ends: both bindings go and the rows with them
    h.incomingInvites.value = [];
    expect(group.disposed).toBe(true);
    expect(members.disposed).toBe(true);
    expect(h.hub.inviteGroup.value).toBeNull();
    expect(h.hub.inviteGroupMembers.value).toEqual([]);
  });

  it('a new invite from another group drops the previous group rows at once', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n);
    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    const first = h.find('Q_GROUP_8');
    first.rows.value = [{ id: 8n }];
    first.applied.value = true;
    h.incomingInvites.value = [invite(5n, 9n, 1n)];
    expect(first.disposed).toBe(true);
    expect(h.hub.inviteGroup.value).toBeNull();
  });
});

describe('extra characters', () => {
  it('binds the outgoing targets plus the inviting group members, by id', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    expect(h.liveSql().some((sql) => sql.startsWith('Q_CHARS_'))).toBe(false);

    h.find('Q_INVITES_5').rows.value = [
      { id: 1n, groupId: 5n, toCharacterId: 31n },
      { id: 2n, groupId: 5n, toCharacterId: 30n },
    ];
    const targets = h.find('Q_CHARS_30,31');
    expect(targets.filter!({ id: 31n })).toBe(true);
    expect(targets.filter!({ id: 32n })).toBe(false);

    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    h.find('Q_MEMBERS_8').rows.value = [
      { id: 1n, groupId: 8n, characterId: 21n },
      { id: 2n, groupId: 8n, characterId: 20n },
    ];
    const both = h.find('Q_CHARS_20,21,30,31');
    both.applied.value = true;
    expect(targets.disposed).toBe(true);
    both.rows.value = [{ id: 20n, name: 'Ada' }];
    expect(h.hub.extraCharacters.value).toHaveLength(1);
  });
});

describe('characterById', () => {
  it('prefers your own row, then known characters, then the extra characters; unknown is null', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = { id: 1n, groupId: 5n, name: 'Own' };
    h.knownCharacters.value = [
      { id: 1n, name: 'KnownOwn' },
      { id: 2n, name: 'Known2' },
    ];
    h.find('Q_INVITES_5').rows.value = [{ id: 1n, groupId: 5n, toCharacterId: 2n }];
    const extra = h.find('Q_CHARS_2');
    extra.rows.value = [
      { id: 2n, name: 'Extra2' },
      { id: 3n, name: 'Extra3' },
    ];
    expect(h.hub.characterById(1n)?.name).toBe('Own');
    expect(h.hub.characterById(2n)?.name).toBe('Known2');
    expect(h.hub.characterById(3n)?.name).toBe('Extra3');
    expect(h.hub.characterById(4n)).toBeNull();
  });
});

describe('timers', () => {
  it('inviteSecondsLeft rounds up on the server clock and clamps at 0', async () => {
    const h = make();
    const created = NOW;
    const expires = created + Number(GROUP_INVITE_TTL_MICROS);
    const sample = invite(1n, 8n, 1n, created);

    h.activeCharacter.value = character(1n);
    clockNow = expires - 1.5 * SECOND;
    // a new invite row samples the clock at once
    h.incomingInvites.value = [sample];
    expect(h.hub.inviteSecondsLeft(sample)).toBe(2);
    await nextTick();

    clockNow = expires;
    vi.advanceTimersByTime(1000);
    expect(h.hub.inviteSecondsLeft(sample)).toBe(0);

    clockNow = expires + 5 * SECOND;
    vi.advanceTimersByTime(1000);
    expect(h.hub.inviteSecondsLeft(sample)).toBe(0);
  });

  it('inviteSecondsLeft reads the TTL from the shared rule', () => {
    const h = make();
    h.activeCharacter.value = character(1n);
    clockNow = NOW;
    const sample = invite(1n, 8n, 1n, NOW);
    h.incomingInvites.value = [sample];
    expect(h.hub.inviteSecondsLeft(sample)).toBe(Number(GROUP_INVITE_TTL_MICROS) / SECOND);
  });

  it('petSecondsLeft is null without expiresAtMicros and the rounded-up seconds with it', async () => {
    const h = make();
    expect(h.hub.petSecondsLeft({})).toBeNull();
    expect(h.hub.petSecondsLeft({ expiresAtMicros: undefined })).toBeNull();
    expect(h.hub.petSecondsLeft({ expiresAtMicros: null })).toBeNull();
    // the tick is idle, so the pet row itself makes it sample the clock
    h.connect();
    h.activeCharacter.value = character(1n);
    const binding = h.find('Q_PETS_1');
    clockNow = NOW;
    binding.rows.value = [{ id: 1n, characterId: 1n, expiresAtMicros: BigInt(Math.round(NOW + 90.2 * SECOND)) }];
    expect(h.hub.petSecondsLeft(binding.rows.value[0])).toBe(91);
    await nextTick();
    clockNow = NOW + 200 * SECOND;
    vi.advanceTimersByTime(1000);
    expect(h.hub.petSecondsLeft(binding.rows.value[0])).toBe(0);
  });

  it('ticks once a second only while an invite or a timed pet exists', async () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);

    // a pet without expiry does not start the tick
    const pets = h.find('Q_PETS_1');
    pets.rows.value = [{ id: 1n, characterId: 1n }];
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);

    // an outgoing invite does
    const outgoing = h.find('Q_INVITES_5');
    outgoing.rows.value = [{ id: 1n, groupId: 5n, toCharacterId: 2n, createdAt: { microsSinceUnixEpoch: BigInt(NOW) } }];
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    clockNow = NOW + 30 * SECOND;
    vi.advanceTimersByTime(1000);
    expect(h.hub.nowMicros.value).toBe(NOW + 30 * SECOND);
    outgoing.rows.value = [];
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);

    // an incoming invite does
    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    h.incomingInvites.value = [];
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);

    // a timed pet does
    pets.rows.value = [{ id: 1n, characterId: 1n, expiresAtMicros: BigInt(NOW + 60 * SECOND) }];
    await nextTick();
    expect(vi.getTimerCount()).toBe(1);
    pets.rows.value = [];
    await nextTick();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('reset and dispose', () => {
  it('reset drops every keyed binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    h.incomingInvites.value = [invite(4n, 8n, 1n)];
    expect(h.liveSql().length).toBeGreaterThan(2);
    h.hub.reset();
    expect(h.liveSql()).toEqual([]);
    expect(h.hub.pets.value).toEqual([]);
    expect(h.hub.outgoingInvites.value).toEqual([]);
  });

  it('a logout clears the character, so the bindings stay gone and a new character starts fresh', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    h.hub.reset();
    h.activeCharacter.value = null;
    expect(h.liveSql()).toEqual([]);
    h.activeCharacter.value = character(2n);
    expect(h.liveSql()).toEqual(['Q_PETS_2']);
  });

  it('dispose stops the scope and resets every binding', () => {
    const h = make();
    h.connect();
    h.activeCharacter.value = character(1n, 5n);
    expect(h.liveSql().length).toBeGreaterThan(0);
    h.hub.dispose();
    expect(h.liveSql()).toEqual([]);
    h.activeCharacter.value = character(2n);
    expect(h.liveSql()).toEqual([]);
  });
});
