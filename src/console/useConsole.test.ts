import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref, shallowRef } from 'vue';
import type { EffectScope } from 'vue';
import { createConsole, QUEUE_FULL_LINE, QUEUE_LOST_LINE } from './useConsole';
import { createFeedStore } from './feedStore';
import { createInertGame } from '../game/context';
import type { FrameControls, GameData, GameReducers } from '../game/context';

const REDUCER_NAMES: (keyof GameReducers)[] = [
  'submitIntent',
  'submitCommand',
  'talkToNpc',
  'whisper',
  'groupMessage',
  'inviteToGroup',
  'acceptGroupInvite',
  'rejectGroupInvite',
  'leaveGroup',
  'kickGroupMember',
  'promoteGroupLeader',
  'endCombat',
  'sendFriendRequestToCharacter',
  'switchHotbar',
  'useAbility',
  'moveCharacter',
  'startGatherResource',
];

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

let scope: EffectScope | null = null;
afterEach(() => {
  scope?.stop();
  scope = null;
  vi.restoreAllMocks();
});

function npc(id: bigint, name: string) {
  return { id, name, npcType: 'townsfolk', locationId: 10n };
}

function job(id: number, route = 'npc_conversation', status = 'pending') {
  return { id: BigInt(id), route, status, createdAt: { microsSinceUnixEpoch: BigInt(id) } };
}

function setup() {
  const feed = createFeedStore();
  feed.setCharacter(1n);
  const connected = ref(true);
  const characterId = ref<bigint | null>(1n);
  const character = shallowRef<any>({ id: 1n, name: 'Bob', locationId: 10n, level: 3n, className: 'Warden' });
  const llmJobs = shallowRef<any[]>([]);
  const npcsHere = shallowRef<any[]>([]);
  const nodesHere = shallowRef<any[]>([]);
  const locations = shallowRef<any[]>([]);
  const connections = shallowRef<any[]>([]);
  const groupInvites = shallowRef<any[]>([]);
  const knownCharacters = shallowRef<any[]>([]);
  const group = shallowRef<any>(null);
  const groupMembers = shallowRef<any[]>([]);
  const renown = shallowRef<any[]>([]);
  const renownPerks = shallowRef<any[]>([]);
  const factions = shallowRef<any[]>([]);
  const factionStandings = shallowRef<any[]>([]);
  const worldEvents = shallowRef<any[]>([]);
  const eventObjectives = shallowRef<any[]>([]);
  const regions = shallowRef<any[]>([]);
  const applied = ref(false);

  const pending = new Map<string, Deferred[]>();
  const reducers: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of REDUCER_NAMES) {
    reducers[name] = vi.fn(() => {
      const d = deferred();
      const list = pending.get(name) ?? [];
      list.push(d);
      pending.set(name, list);
      return d.promise;
    });
  }
  // Most tests settle sends right away; settle(name) resolves every pending call.
  function settle(name?: string): void {
    for (const [key, list] of pending) {
      if (name !== undefined && key !== name) continue;
      for (const d of list) d.resolve();
      pending.set(key, []);
    }
  }

  const game = {
    ...createInertGame(),
    connected,
    characterId,
    character,
    llmJobs,
    npcsHere,
    nodesHere,
    locations,
    connections,
    groupInvites,
    knownCharacters,
    group,
    groupMembers,
    renown,
    renownPerks,
    factions,
    factionStandings,
    worldEvents,
    eventObjectives,
    regions,
    privateEventsApplied: applied,
    feed,
    reducers: computed(() => (connected.value ? (reducers as unknown as GameReducers) : null)),
  } as unknown as GameData;

  const closeScreen = vi.fn();
  const openScreen = vi.fn();
  const frame: FrameControls = {
    isDesktop: ref(true),
    activeScreen: ref(null),
    openScreen,
    closeScreen,
  };

  scope = effectScope();
  const consoleApi = scope.run(() => createConsole({ game, frame }))!;
  const settleAll = () => settle();

  return {
    api: consoleApi,
    feed,
    reducers,
    pending,
    settle,
    settleAll,
    closeScreen,
    openScreen,
    connected,
    characterId,
    character,
    llmJobs,
    npcsHere,
    nodesHere,
    locations,
    connections,
    groupInvites,
    knownCharacters,
    group,
    groupMembers,
    renown,
    renownPerks,
    factions,
    factionStandings,
    worldEvents,
    eventObjectives,
    regions,
    applied,
  };
}

function lines(feed: ReturnType<typeof createFeedStore>) {
  return feed.entries.value.map((e) => ({ kind: e.kind, message: e.message, queued: e.queued }));
}

describe('submit: guards', () => {
  it('offline returns offline and keeps the draft', () => {
    const s = setup();
    s.connected.value = false;
    s.api.draft.value = 'look around';
    expect(s.api.submit()).toBe('offline');
    expect(s.api.draft.value).toBe('look around');
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
  });

  it('a blank draft returns empty', () => {
    const s = setup();
    s.api.draft.value = '   ';
    expect(s.api.submit()).toBe('empty');
    expect(s.feed.entries.value).toHaveLength(0);
  });
});

describe('submit: routing and echoes', () => {
  it('a sentence goes to submitIntent with a local echo', () => {
    const s = setup();
    s.api.draft.value = 'Who is that over there?';
    const tick = s.api.sendTick.value;
    expect(s.api.submit()).toBe('sent');
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'Who is that over there?' });
    expect(lines(s.feed)).toEqual([{ kind: 'echo', message: 'Who is that over there?', queued: false }]);
    expect(s.api.draft.value).toBe('');
    expect(s.api.sendTick.value).toBe(tick + 1);
    s.api.recallPrevious();
    expect(s.api.draft.value).toBe('Who is that over there?');
  });

  it('the four roadmap sentences reach submitIntent and never a group reducer', () => {
    for (const sentence of ['Who is that over there?', 'Leave him alone', 'End this now', 'Accept my apology']) {
      const s = setup();
      s.api.draft.value = sentence;
      expect(s.api.submit()).toBe('sent');
      expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: sentence });
      for (const name of [
        'leaveGroup',
        'endCombat',
        'acceptGroupInvite',
        'rejectGroupInvite',
        'inviteToGroup',
        'kickGroupMember',
        'promoteGroupLeader',
        'sendFriendRequestToCharacter',
        'whisper',
        'submitCommand',
      ]) {
        expect(s.reducers[name]).not.toHaveBeenCalled();
      }
    }
  });

  it('invite Bob runs inviteToGroup with an echo', () => {
    const s = setup();
    s.api.draft.value = 'invite Bob';
    s.api.submit();
    expect(s.reducers.inviteToGroup).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Bob' });
    expect(lines(s.feed)).toEqual([{ kind: 'echo', message: 'invite Bob', queued: false }]);
  });

  it('whisper runs whisper with no echo', () => {
    const s = setup();
    s.api.draft.value = 'whisper Bob hi';
    s.api.submit();
    expect(s.reducers.whisper).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Bob', message: 'hi' });
    expect(s.feed.entries.value).toHaveLength(0);
  });

  it('a slash command goes to submitCommand with no echo', () => {
    const s = setup();
    s.api.draft.value = '/frobnicate';
    s.api.submit();
    expect(s.reducers.submitCommand).toHaveBeenCalledWith({ characterId: 1n, text: '/frobnicate' });
    expect(s.feed.entries.value).toHaveLength(0);
  });

  it('group chat, leave, kick, promote and friend call their reducers', () => {
    const s = setup();
    for (const text of ['/group hello all', 'kick Ann', 'promote Ann', 'friend Ann', '/leave']) {
      s.api.draft.value = text;
      s.api.submit();
    }
    expect(s.reducers.groupMessage).toHaveBeenCalledWith({ characterId: 1n, message: 'hello all' });
    expect(s.reducers.kickGroupMember).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Ann' });
    expect(s.reducers.promoteGroupLeader).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Ann' });
    expect(s.reducers.sendFriendRequestToCharacter).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Ann' });
    expect(s.reducers.leaveGroup).toHaveBeenCalledWith({ characterId: 1n });
  });

  it('accept uses the pending inviter name', () => {
    const s = setup();
    s.knownCharacters.value = [{ id: 7n, name: 'Mara', level: 2n, className: 'Rogue' }];
    s.groupInvites.value = [{ id: 1n, groupId: 5n, fromCharacterId: 7n, toCharacterId: 1n }];
    s.api.draft.value = 'accept';
    s.api.submit();
    expect(s.reducers.acceptGroupInvite).toHaveBeenCalledWith({ characterId: 1n, fromName: 'Mara' });
  });

  it('who is sent directly even while a gating job is active', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'who';
    expect(s.api.submit()).toBe('sent');
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'who' });
    expect(s.api.queuedCount.value).toBe(0);
  });

  it('say is an intent with no echo', () => {
    const s = setup();
    s.api.draft.value = 'say hello there';
    s.api.submit();
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'say hello there' });
    expect(s.feed.entries.value).toHaveLength(0);
  });

  it('a reducer failure only logs a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup();
    s.reducers.inviteToGroup.mockImplementationOnce(() => Promise.reject(new Error('nope')));
    s.api.draft.value = 'invite Cat';
    s.api.submit();
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(lines(s.feed).every((l) => l.kind === 'echo')).toBe(true);
  });
});

describe('info commands', () => {
  it('renown prints a Renown Status block', () => {
    const s = setup();
    s.renown.value = [{ id: 1n, characterId: 1n, points: 50n, currentRank: 1n }];
    s.renownPerks.value = [{ id: 1n, characterId: 1n, rank: 1n, perkKey: 'sturdy' }];
    s.api.draft.value = 'renown';
    expect(s.api.submit()).toBe('sent');
    const out = lines(s.feed);
    expect(out[0]).toEqual({ kind: 'echo', message: 'renown', queued: false });
    expect(out[1].kind).toBe('look');
    expect(out[1].message.startsWith('Renown Status')).toBe(true);
    expect(out[1].message).toContain('sturdy');
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
  });

  it('factions and faction <name> print from subscribed data', () => {
    const s = setup();
    s.factions.value = [{ id: 2n, name: 'Wardens', description: 'Guardians of the road.' }];
    s.factionStandings.value = [{ id: 1n, characterId: 1n, factionId: 2n, standing: 0n }];
    s.api.draft.value = 'factions';
    s.api.submit();
    s.api.draft.value = 'faction Wardens';
    s.api.submit();
    const out = lines(s.feed).filter((l) => l.kind === 'look');
    expect(out[0].message.startsWith('Faction Standings')).toBe(true);
    expect(out[0].message).toContain('Wardens');
    expect(out[1].message.startsWith('Wardens')).toBe(true);
    expect(out[1].message).toContain('Guardians of the road.');
  });

  it('events lists active events of every region with names and objectives', () => {
    const s = setup();
    s.regions.value = [{ id: 4n, name: 'Gloamwood' }];
    s.worldEvents.value = [{ id: 9n, name: 'The Blight', regionId: 4n, status: 'active' }];
    s.eventObjectives.value = [{ id: 1n, eventId: 9n, name: 'Burn nests', currentCount: 2n, targetCount: 5n }];
    s.api.draft.value = 'events';
    s.api.submit();
    const out = lines(s.feed).filter((l) => l.kind === 'look')[0].message;
    expect(out).toContain('The Blight (Gloamwood)');
    expect(out).toContain('Burn nests: 2/5');
  });

  it('bare group prints the roster from members, known characters and self', () => {
    const s = setup();
    s.group.value = { id: 5n, name: 'g', leaderCharacterId: 1n };
    s.groupMembers.value = [
      { id: 1n, groupId: 5n, characterId: 1n },
      { id: 2n, groupId: 5n, characterId: 7n },
    ];
    s.knownCharacters.value = [{ id: 7n, name: 'Mara', level: 2n, className: 'Rogue' }];
    s.api.draft.value = 'group';
    s.api.submit();
    const out = lines(s.feed).filter((l) => l.kind === 'look')[0].message;
    expect(out).toContain('Bob, Lv 3 Warden (Leader)');
    expect(out).toContain('Mara, Lv 2 Rogue');
  });

  it('group outside a party lists pending inviters', () => {
    const s = setup();
    s.knownCharacters.value = [{ id: 7n, name: 'Mara', level: 2n, className: 'Rogue' }];
    s.groupInvites.value = [{ id: 1n, groupId: 5n, fromCharacterId: 7n, toCharacterId: 1n }];
    s.api.draft.value = 'group';
    s.api.submit();
    expect(lines(s.feed).filter((l) => l.kind === 'look')[0].message).toContain('Mara');
  });
});

describe('narrative queue', () => {
  it('queues while a Keeper job is active, then refuses the fourth', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    for (const text of ['look around', 'look north', 'look south']) {
      s.api.draft.value = text;
      expect(s.api.submit()).toBe('queued');
      expect(s.api.draft.value).toBe('');
    }
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
    expect(s.api.queuedCount.value).toBe(3);
    expect(lines(s.feed).every((l) => l.kind === 'echo' && l.queued)).toBe(true);

    s.api.draft.value = 'look east';
    expect(s.api.submit()).toBe('refused');
    expect(s.api.draft.value).toBe('look east');
    const last = s.feed.entries.value[s.feed.entries.value.length - 1];
    expect(last.kind).toBe('system');
    expect(last.message).toBe(QUEUE_FULL_LINE);
    expect(QUEUE_FULL_LINE).toBe('Wait for the Keeper to finish first.');
  });

  it('releases one line when the job is done and the next after that send settles', async () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'look around';
    s.api.submit();
    s.api.draft.value = 'look north';
    s.api.submit();
    s.llmJobs.value = [job(1, 'npc_conversation', 'done')];
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({ characterId: 1n, text: 'look around' });
    expect(lines(s.feed)[0].queued).toBe(false);
    expect(lines(s.feed)[1].queued).toBe(true);

    s.settle('submitIntent');
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(2);
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({ characterId: 1n, text: 'look north' });
    expect(s.api.queuedCount.value).toBe(0);
  });

  it('the next line waits when the gate closes again before the send settles', async () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'look around';
    s.api.submit();
    s.api.draft.value = 'look north';
    s.api.submit();
    s.llmJobs.value = [];
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
    s.llmJobs.value = [job(2)];
    s.settle('submitIntent');
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
    s.llmJobs.value = [];
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(2);
  });

  it('a direct narrative send marks in flight and a second line queues behind it', async () => {
    const s = setup();
    s.api.draft.value = 'look around';
    expect(s.api.submit()).toBe('sent');
    s.api.draft.value = 'look north';
    expect(s.api.submit()).toBe('queued');
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
    s.settle('submitIntent');
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(2);
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({ characterId: 1n, text: 'look north' });
  });

  it('a send abandoned by a disconnect cannot release the next send early (WR-02)', async () => {
    const s = setup();
    s.api.draft.value = 'look around';
    expect(s.api.submit()).toBe('sent');
    s.connected.value = false;
    await flush();
    s.connected.value = true;
    await flush();

    s.api.draft.value = 'look north';
    expect(s.api.submit()).toBe('sent');
    const [stale, fresh] = s.pending.get('submitIntent')!;

    // The first reducer promise finally settles while the second is still in flight.
    stale.resolve();
    await flush();

    s.api.draft.value = 'look east';
    expect(s.api.submit()).toBe('queued');
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(2);

    fresh.resolve();
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(3);
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({ characterId: 1n, text: 'look east' });
  });

  it('commands and chat go through while the Keeper works', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'whisper Bob hi';
    expect(s.api.submit()).toBe('sent');
    s.api.draft.value = 'invite Bob';
    expect(s.api.submit()).toBe('sent');
    expect(s.reducers.whisper).toHaveBeenCalled();
    expect(s.reducers.inviteToGroup).toHaveBeenCalled();
  });

  it('a queued talk line goes to talkToNpc while the NPC is still here and drops its echo', async () => {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    s.api.draft.value = 'hail Ferryman';
    s.api.submit();
    expect(s.api.conversation.value).toEqual({ npcId: 3n, name: 'Ferryman' });
    s.settle('submitIntent');
    await flush();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'How far is the crossing?';
    expect(s.api.submit()).toBe('queued');
    expect(lines(s.feed)[1]).toEqual({ kind: 'echo', message: 'How far is the crossing?', queued: true });
    s.llmJobs.value = [];
    await flush();
    expect(s.reducers.talkToNpc).toHaveBeenCalledWith({
      characterId: 1n,
      npcId: 3n,
      message: 'How far is the crossing?',
    });
    expect(lines(s.feed).some((l) => l.message === 'How far is the crossing?')).toBe(false);
  });

  it('a queued talk line goes to submitIntent after the NPC left and keeps its echo without the suffix', async () => {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    s.api.draft.value = 'hail Ferryman';
    s.api.submit();
    s.settle('submitIntent');
    await flush();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'How far is the crossing?';
    s.api.submit();
    s.npcsHere.value = [];
    await flush();
    expect(s.api.conversation.value).toBeNull();
    s.llmJobs.value = [];
    await flush();
    expect(s.reducers.talkToNpc).not.toHaveBeenCalled();
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({
      characterId: 1n,
      text: 'How far is the crossing?',
    });
    const echoLine = lines(s.feed).find((l) => l.message === 'How far is the crossing?');
    expect(echoLine).toEqual({ kind: 'echo', message: 'How far is the crossing?', queued: false });
  });

  it('losing the connection with queued lines announces them as not sent', async () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'look around';
    s.api.submit();
    s.api.draft.value = 'look north';
    s.api.submit();
    s.connected.value = false;
    await flush();
    expect(s.api.queuedCount.value).toBe(0);
    const out = lines(s.feed);
    expect(out[0].queued).toBe(false);
    expect(out[1].queued).toBe(false);
    expect(out.filter((l) => l.kind === 'system')).toEqual([
      { kind: 'system', message: QUEUE_LOST_LINE, queued: false },
    ]);
    expect(QUEUE_LOST_LINE).toBe('Your queued lines were not sent. Send them again.');
    s.llmJobs.value = [];
    s.connected.value = true;
    await flush();
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
  });

  it('losing the connection with nothing queued adds no line', async () => {
    const s = setup();
    s.connected.value = false;
    await flush();
    expect(s.feed.entries.value).toHaveLength(0);
  });

  it('changing the active character drops the queue silently and clears the conversation', async () => {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    s.api.draft.value = 'hail Ferryman';
    s.api.submit();
    s.llmJobs.value = [job(1)];
    s.settle('submitIntent');
    await flush();
    s.api.draft.value = 'look around';
    s.api.submit();
    expect(s.api.queuedCount.value).toBe(1);
    s.characterId.value = 2n;
    await flush();
    expect(s.api.queuedCount.value).toBe(0);
    expect(s.api.conversation.value).toBeNull();
    expect(lines(s.feed).some((l) => l.kind === 'system')).toBe(false);
  });

  it('dispose drops the queue silently', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.draft.value = 'look around';
    s.api.submit();
    s.api.dispose();
    expect(s.api.queuedCount.value).toBe(0);
    expect(lines(s.feed).some((l) => l.kind === 'system')).toBe(false);
  });
});

describe('conversation lifecycle', () => {
  function inConversation() {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman'), npc(4n, 'Smith')];
    s.api.draft.value = 'hail Ferryman';
    s.api.submit();
    s.settle();
    return s;
  }

  it('free text in a conversation goes to talkToNpc without an echo', async () => {
    const s = inConversation();
    await flush();
    s.api.draft.value = 'Where does the river go?';
    expect(s.api.submit()).toBe('sent');
    expect(s.reducers.talkToNpc).toHaveBeenCalledWith({
      characterId: 1n,
      npcId: 3n,
      message: 'Where does the river go?',
    });
    expect(lines(s.feed).some((l) => l.message === 'Where does the river go?')).toBe(false);
  });

  it('ends on a farewell line, a game action line and endConversation()', async () => {
    const s = inConversation();
    await flush();
    s.api.draft.value = 'goodbye';
    s.api.submit();
    expect(s.api.conversation.value).toBeNull();

    s.api.hail({ id: 3n, name: 'Ferryman' });
    s.settle();
    await flush();
    expect(s.api.conversation.value).not.toBeNull();
    s.api.draft.value = 'look';
    s.api.submit();
    expect(s.api.conversation.value).toBeNull();

    s.settle();
    await flush();
    s.api.hail({ id: 3n, name: 'Ferryman' });
    s.api.endConversation();
    expect(s.api.conversation.value).toBeNull();
  });

  it('ends when the location changes and when the NPC leaves', async () => {
    const s = inConversation();
    await flush();
    s.character.value = { ...s.character.value, locationId: 11n };
    await flush();
    expect(s.api.conversation.value).toBeNull();

    s.api.hail({ id: 4n, name: 'Smith' });
    s.settle();
    await flush();
    expect(s.api.conversation.value?.name).toBe('Smith');
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    await flush();
    expect(s.api.conversation.value).toBeNull();
  });

  it('hail by bare npc name sets the conversation and sends hail text', () => {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    s.api.draft.value = 'ferryman';
    s.api.submit();
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'hail Ferryman' });
    expect(s.api.conversation.value).toEqual({ npcId: 3n, name: 'Ferryman' });
  });
});

describe('keyword and rail actions', () => {
  it('npc keyword: closes the screen, starts the conversation, hails with an echo', () => {
    const s = setup();
    s.npcsHere.value = [npc(3n, 'Ferryman')];
    s.api.actOnKeyword({ kind: 'npc', id: 3n, name: 'Ferryman' });
    expect(s.closeScreen).toHaveBeenCalled();
    expect(s.api.conversation.value).toEqual({ npcId: 3n, name: 'Ferryman' });
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'hail Ferryman' });
    expect(lines(s.feed)).toEqual([{ kind: 'echo', message: 'hail Ferryman', queued: false }]);
  });

  it('npc keyword queues while the Keeper works', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.actOnKeyword({ kind: 'npc', id: 3n, name: 'Ferryman' });
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
    expect(lines(s.feed)).toEqual([{ kind: 'echo', message: 'hail Ferryman', queued: true }]);
  });

  it('place keyword: travels with moveCharacter even while gated, clears the conversation', () => {
    const s = setup();
    s.llmJobs.value = [job(1)];
    s.api.hail({ id: 3n, name: 'Ferryman' });
    s.api.actOnKeyword({ kind: 'place', id: 12n, name: 'Gloamwood' });
    expect(s.closeScreen).toHaveBeenCalled();
    expect(s.api.conversation.value).toBeNull();
    expect(s.reducers.moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 12n });
    expect(lines(s.feed).map((l) => l.message)).toContain('go to Gloamwood');
  });

  it('node keyword: looks at the node through submitIntent with an echo', () => {
    const s = setup();
    s.api.actOnKeyword({ kind: 'node', id: 5n, name: 'Old Well' });
    expect(s.closeScreen).toHaveBeenCalled();
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'look at Old Well' });
    expect(lines(s.feed)).toEqual([{ kind: 'echo', message: 'look at Old Well', queued: false }]);
  });

  it('player keyword pre-fills the whisper, focuses and keeps the old draft in history', () => {
    const s = setup();
    s.api.draft.value = 'half typed';
    const focus = s.api.focusTick.value;
    s.api.actOnKeyword({ kind: 'player', id: 8n, name: 'Marisol' });
    expect(s.closeScreen).toHaveBeenCalled();
    expect(s.api.draft.value).toBe('whisper Marisol ');
    expect(s.api.focusTick.value).toBe(focus + 1);
    s.api.recallPrevious();
    expect(s.api.draft.value).toBe('half typed');
    s.api.recallNext();
    expect(s.api.draft.value).toBe('whisper Marisol ');
  });

  it('gather, invite and trade', () => {
    const s = setup();
    s.api.gather({ id: 6n, name: 'Ironwood' });
    expect(s.reducers.startGatherResource).toHaveBeenCalledWith({ characterId: 1n, nodeId: 6n });
    s.api.invite('Bo');
    expect(s.reducers.inviteToGroup).toHaveBeenCalledWith({ characterId: 1n, targetName: 'Bo' });
    expect(lines(s.feed).map((l) => l.message)).toEqual(['gather Ironwood', 'invite Bo']);
    s.api.trade();
    expect(s.openScreen).toHaveBeenCalledWith('vendor');
  });

  it('every action does nothing while offline', () => {
    const s = setup();
    s.connected.value = false;
    s.api.actOnKeyword({ kind: 'npc', id: 3n, name: 'Ferryman' });
    s.api.actOnKeyword({ kind: 'place', id: 12n, name: 'Gloamwood' });
    s.api.actOnKeyword({ kind: 'node', id: 5n, name: 'Old Well' });
    s.api.actOnKeyword({ kind: 'player', id: 8n, name: 'Marisol' });
    s.api.gather({ id: 6n, name: 'Ironwood' });
    s.api.invite('Bo');
    s.api.trade();
    expect(s.closeScreen).not.toHaveBeenCalled();
    expect(s.openScreen).not.toHaveBeenCalled();
    expect(s.feed.entries.value).toHaveLength(0);
    expect(s.api.draft.value).toBe('');
    expect(s.api.conversation.value).toBeNull();
  });

  it('prefill replaces the draft and focuses (the Invite button)', () => {
    const s = setup();
    s.api.prefill('invite ');
    expect(s.api.draft.value).toBe('invite ');
    expect(s.api.focusTick.value).toBe(1);
  });
});

describe('history recall', () => {
  it('moves through history with the draft saved and restored', () => {
    const s = setup();
    for (const text of ['who', 'renown']) {
      s.api.draft.value = text;
      s.api.submit();
    }
    s.api.draft.value = 'typing';
    s.api.recallPrevious();
    expect(s.api.draft.value).toBe('renown');
    s.api.recallPrevious();
    expect(s.api.draft.value).toBe('who');
    s.api.recallNext();
    expect(s.api.draft.value).toBe('renown');
    s.api.recallNext();
    expect(s.api.draft.value).toBe('typing');
  });
});

describe('automatic look', () => {
  it('sends nothing until the private subscription applied', async () => {
    const s = setup();
    await flush();
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
  });

  it('sends one look with no echo, not again after a reconnect, and one for a new character', async () => {
    const s = setup();
    s.applied.value = true;
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
    expect(s.reducers.submitIntent).toHaveBeenCalledWith({ characterId: 1n, text: 'look' });
    expect(s.feed.entries.value).toHaveLength(0);

    s.applied.value = false;
    await flush();
    s.applied.value = true;
    await flush();
    s.connected.value = false;
    await flush();
    s.connected.value = true;
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);

    s.characterId.value = 2n;
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(2);
    expect(s.reducers.submitIntent).toHaveBeenLastCalledWith({ characterId: 2n, text: 'look' });
  });

  it('sends one look when the subscription is already applied at creation', async () => {
    const s = setup();
    s.applied.value = true;
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
  });

  it('does not send while offline', async () => {
    const s = setup();
    s.connected.value = false;
    s.applied.value = true;
    await flush();
    expect(s.reducers.submitIntent).not.toHaveBeenCalled();
    s.connected.value = true;
    await flush();
    expect(s.reducers.submitIntent).toHaveBeenCalledTimes(1);
  });
});
