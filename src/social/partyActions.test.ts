import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createActionRunner } from '../ledger/actionRunner';
import type { GameReducers } from '../game/context';
import type { MenuAction } from './playerMenu';
import { createPartyActions } from './partyActions';

function setup(options: { characterId?: bigint | null; reducers?: boolean; online?: boolean } = {}) {
  const calls: { name: string; args: unknown }[] = [];
  const gates: Array<() => void> = [];
  let hold = false;
  let reject = false;
  const record = (name: string) => (args: unknown) => {
    calls.push({ name, args });
    if (reject) return Promise.reject(new Error('refused'));
    if (hold) return new Promise<void>((resolve) => gates.push(resolve));
    return Promise.resolve();
  };
  const reducers = {
    inviteToGroup: record('inviteToGroup'),
    cancelGroupInvite: record('cancelGroupInvite'),
    kickGroupMember: record('kickGroupMember'),
    promoteGroupLeader: record('promoteGroupLeader'),
    leaveGroup: record('leaveGroup'),
    setFollowLeader: record('setFollowLeader'),
    acceptGroupInvite: record('acceptGroupInvite'),
    rejectGroupInvite: record('rejectGroupInvite'),
    sendFriendRequestToCharacter: record('sendFriendRequestToCharacter'),
  } as unknown as GameReducers;
  const online = ref(options.online ?? true);
  const runner = createActionRunner({ online });
  const consoleApi = { whisperTo: vi.fn(), examine: vi.fn(), prefill: vi.fn() };
  const actions = createPartyActions({
    game: {
      characterId: ref(options.characterId === undefined ? 1n : options.characterId),
      reducers: ref(options.reducers === false ? null : reducers),
    },
    consoleApi,
    runner,
  });
  return {
    actions,
    calls,
    runner,
    consoleApi,
    online,
    hold: () => {
      hold = true;
    },
    release: () => gates.splice(0).forEach((open) => open()),
    rejectNext: () => {
      reject = true;
    },
  };
}

describe('reducer actions', () => {
  it('sends each reducer once with object arguments and the active character id', async () => {
    const t = setup();
    await t.actions.inviteToParty('Bram');
    await t.actions.cancelInvite('Bram');
    await t.actions.removeFromParty('Bram');
    await t.actions.makeLeader('Bram');
    await t.actions.leaveParty();
    await t.actions.setTravelWithLeader(false);
    await t.actions.acceptInvite('Ann');
    await t.actions.declineInvite('Ann');
    await t.actions.addFriend('Bram');
    expect(t.calls).toEqual([
      { name: 'inviteToGroup', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'cancelGroupInvite', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'kickGroupMember', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'promoteGroupLeader', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'leaveGroup', args: { characterId: 1n } },
      { name: 'setFollowLeader', args: { characterId: 1n, follow: false } },
      { name: 'acceptGroupInvite', args: { characterId: 1n, fromName: 'Ann' } },
      { name: 'rejectGroupInvite', args: { characterId: 1n, fromName: 'Ann' } },
      { name: 'sendFriendRequestToCharacter', args: { characterId: 1n, targetName: 'Bram' } },
    ]);
  });

  it('resolves true when the call ran', async () => {
    const t = setup();
    expect(await t.actions.inviteToParty('Bram')).toBe(true);
    expect(await t.actions.setTravelWithLeader(true)).toBe(true);
  });

  it('a second click on the same action and name while pending sends nothing', async () => {
    const t = setup();
    t.hold();
    const first = t.actions.inviteToParty('Bram');
    const second = t.actions.inviteToParty('Bram');
    expect(await second).toBe(false);
    expect(t.calls).toHaveLength(1);
    t.release();
    expect(await first).toBe(true);
    // Settled: the same action works again.
    t.actions.inviteToParty('Bram');
    expect(t.calls).toHaveLength(2);
    t.release();
  });

  it('different names do not block each other', async () => {
    const t = setup();
    t.hold();
    const a = t.actions.inviteToParty('Bram');
    const b = t.actions.inviteToParty('Cyd');
    expect(t.calls).toHaveLength(2);
    t.release();
    await Promise.all([a, b]);
  });

  it('leave and travel use fixed keys, so a double click sends once', async () => {
    const t = setup();
    t.hold();
    const a = t.actions.leaveParty();
    const b = t.actions.leaveParty();
    const c = t.actions.setTravelWithLeader(true);
    const d = t.actions.setTravelWithLeader(false);
    expect(t.calls.map((call) => call.name)).toEqual(['leaveGroup', 'setFollowLeader']);
    t.release();
    expect(await Promise.all([a, b, c, d])).toEqual([true, false, true, false]);
  });

  it('keyFor builds the runner keys', () => {
    const t = setup();
    expect(t.actions.keyFor('invite', 'Bram')).toBe('invite:Bram');
    expect(t.actions.keyFor('leave', '')).toBe('leave');
    expect(t.actions.keyFor('travelWithLeader', '')).toBe('travel');
    expect(t.actions.keyFor('stopTravelWithLeader', '')).toBe('travel');
  });

  it('sends nothing with no connection, no active character or an offline runner', async () => {
    const noConn = setup({ reducers: false });
    expect(await noConn.actions.inviteToParty('Bram')).toBe(false);
    expect(await noConn.actions.leaveParty()).toBe(false);
    expect(noConn.calls).toHaveLength(0);

    const noChar = setup({ characterId: null });
    expect(await noChar.actions.inviteToParty('Bram')).toBe(false);
    expect(await noChar.actions.leaveParty()).toBe(false);
    expect(noChar.calls).toHaveLength(0);

    const offline = setup({ online: false });
    expect(await offline.actions.inviteToParty('Bram')).toBe(false);
    expect(await offline.actions.setTravelWithLeader(true)).toBe(false);
    expect(offline.calls).toHaveLength(0);
  });

  it('a rejected promise resolves false and counts in runner.rejection', async () => {
    const t = setup();
    t.rejectNext();
    expect(await t.actions.inviteToParty('Bram')).toBe(false);
    expect(t.runner.rejection.value).toBe(1);
    expect(await t.actions.leaveParty()).toBe(false);
    expect(t.runner.rejection.value).toBe(2);
  });

  it('a blank or whitespace name sends nothing; inner spaces are sent unchanged', async () => {
    const t = setup();
    expect(await t.actions.inviteToParty('')).toBe(false);
    expect(await t.actions.cancelInvite('   ')).toBe(false);
    expect(await t.actions.removeFromParty('\t')).toBe(false);
    expect(await t.actions.makeLeader(' ')).toBe(false);
    expect(await t.actions.addFriend('')).toBe(false);
    expect(await t.actions.acceptInvite('')).toBe(false);
    expect(await t.actions.declineInvite(' ')).toBe(false);
    expect(t.calls).toHaveLength(0);
    await t.actions.inviteToParty("Mira Dawn-o'Reilly");
    expect(t.calls[0]?.args).toEqual({ characterId: 1n, targetName: "Mira Dawn-o'Reilly" });
  });
});

describe('console actions', () => {
  it('whisper, examine and the rail invite go through the console', () => {
    const t = setup();
    t.actions.whisper('Bram');
    t.actions.examine('Bram');
    t.actions.prefillInvite();
    expect(t.consoleApi.whisperTo).toHaveBeenCalledWith('Bram');
    expect(t.consoleApi.examine).toHaveBeenCalledWith('Bram');
    expect(t.consoleApi.prefill).toHaveBeenCalledWith('invite ');
    expect(t.calls).toHaveLength(0);
  });

  it('a blank name does nothing', () => {
    const t = setup();
    t.actions.whisper(' ');
    t.actions.examine('');
    expect(t.consoleApi.whisperTo).not.toHaveBeenCalled();
    expect(t.consoleApi.examine).not.toHaveBeenCalled();
  });
});

describe('perform', () => {
  it('dispatches every MenuAction to the matching method', async () => {
    const t = setup();
    const actions: MenuAction[] = [
      'invite',
      'cancelInvite',
      'whisper',
      'examine',
      'addFriend',
      'makeLeader',
      'remove',
      'travelWithLeader',
      'stopTravelWithLeader',
      'leave',
    ];
    for (const action of actions) expect(await t.actions.perform(action, 'Bram')).toBe(true);
    expect(t.calls).toEqual([
      { name: 'inviteToGroup', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'cancelGroupInvite', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'sendFriendRequestToCharacter', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'promoteGroupLeader', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'kickGroupMember', args: { characterId: 1n, targetName: 'Bram' } },
      { name: 'setFollowLeader', args: { characterId: 1n, follow: true } },
      { name: 'setFollowLeader', args: { characterId: 1n, follow: false } },
      { name: 'leaveGroup', args: { characterId: 1n } },
    ]);
    expect(t.consoleApi.whisperTo).toHaveBeenCalledWith('Bram');
    expect(t.consoleApi.examine).toHaveBeenCalledWith('Bram');
  });

  it('leave and travel actions need no name', async () => {
    const t = setup();
    expect(await t.actions.perform('leave', '')).toBe(true);
    expect(await t.actions.perform('travelWithLeader', '')).toBe(true);
  });
});

describe('source guard', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/social/partyActions.ts'), 'utf8')
    .split('\n')
    .filter((line: string) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  it('never references the join-by-group-id reducer', () => {
    expect(source).not.toContain('joinGroup');
  });

  it('never appends a client-made feed line', () => {
    expect(source).not.toContain('appendLocal');
  });

  it('the only join path is accepting an invite', () => {
    expect(source).toContain('acceptGroupInvite({');
  });
});
