import type { Ref } from 'vue';
import type { ActionRunner } from '../ledger/actionRunner';
import type { ConsoleApi, GameReducers } from '../game/context';
import type { MenuAction } from './playerMenu';

// One action layer for the rail, the player menus, the invite card and the mobile Party sheet.
// Every party reducer goes through the action runner it is given: a second click on the same action
// and name while it is pending sends nothing, offline sends nothing, and a rejected promise only
// counts in runner.rejection (usePartyActions turns that into the shared send error line). Each
// surface builds its own runner, so pending and dedupe hold per surface, not across them: the same
// action from two surfaces (the Nearby ⋯ and an Invited · waiting row) can both send, and the server
// refuses the second (51.1 review client-social IN-01). Nothing is optimistic (rows drive state) and
// no feed line is written here: results and refusals arrive as server lines. The only way into a
// party is accepting an invite.
// Names are sent exactly as the target's server row has them; a blank name is never sent.

export interface PartyActionDeps {
  game: {
    characterId: Readonly<Ref<bigint | null>>;
    reducers: Readonly<Ref<GameReducers | null>>;
  };
  consoleApi: Pick<ConsoleApi, 'whisperTo' | 'examine' | 'prefill'>;
  runner: ActionRunner;
}

export interface PartyActions {
  inviteToParty(name: string): Promise<boolean>;
  cancelInvite(name: string): Promise<boolean>;
  removeFromParty(name: string): Promise<boolean>;
  makeLeader(name: string): Promise<boolean>;
  leaveParty(): Promise<boolean>;
  setTravelWithLeader(follow: boolean): Promise<boolean>;
  acceptInvite(fromName: string): Promise<boolean>;
  declineInvite(fromName: string): Promise<boolean>;
  addFriend(name: string): Promise<boolean>;
  /** Pre-fills 'whisper {name} ' through the console. */
  whisper(name: string): void;
  /** Sends 'look at {name}' through the console. */
  examine(name: string): void;
  /** Pre-fills 'invite ' (the rail Invite button). */
  prefillInvite(): void;
  /** Runs the matching action for a menu entry. Whisper and Examine resolve true once handed to the console. */
  perform(action: MenuAction, name: string): Promise<boolean>;
  keyFor(action: string, name: string): string;
}

export function createPartyActions(deps: PartyActionDeps): PartyActions {
  const { game, consoleApi, runner } = deps;

  function keyFor(action: string, name: string): string {
    if (action === 'leave') return 'leave';
    if (action === 'travelWithLeader' || action === 'stopTravelWithLeader' || action === 'travel') {
      return 'travel';
    }
    return `${action}:${name}`;
  }

  function hasName(name: string): boolean {
    return name.trim() !== '';
  }

  // Runs `call` once through the runner; false (nothing sent) without a connection or character.
  function send(
    key: string,
    call: (reducers: GameReducers, characterId: bigint) => Promise<unknown>,
  ): Promise<boolean> {
    const reducers = game.reducers.value;
    const characterId = game.characterId.value;
    if (reducers === null || characterId === null) return Promise.resolve(false);
    return runner.run(key, () => call(reducers, characterId));
  }

  function sendNamed(
    action: string,
    name: string,
    call: (reducers: GameReducers, characterId: bigint, name: string) => Promise<unknown>,
  ): Promise<boolean> {
    if (!hasName(name)) return Promise.resolve(false);
    return send(keyFor(action, name), (reducers, characterId) => call(reducers, characterId, name));
  }

  const inviteToParty = (name: string) =>
    sendNamed('invite', name, (r, characterId, targetName) => r.inviteToGroup({ characterId, targetName }));
  const cancelInvite = (name: string) =>
    sendNamed('cancelInvite', name, (r, characterId, targetName) => r.cancelGroupInvite({ characterId, targetName }));
  const removeFromParty = (name: string) =>
    sendNamed('remove', name, (r, characterId, targetName) => r.kickGroupMember({ characterId, targetName }));
  const makeLeader = (name: string) =>
    sendNamed('makeLeader', name, (r, characterId, targetName) => r.promoteGroupLeader({ characterId, targetName }));
  const addFriend = (name: string) =>
    sendNamed('addFriend', name, (r, characterId, targetName) =>
      r.sendFriendRequestToCharacter({ characterId, targetName }),
    );
  const acceptInvite = (fromName: string) =>
    sendNamed('accept', fromName, (r, characterId, from) => r.acceptGroupInvite({ characterId, fromName: from }));
  const declineInvite = (fromName: string) =>
    sendNamed('decline', fromName, (r, characterId, from) => r.rejectGroupInvite({ characterId, fromName: from }));
  const leaveParty = () => send('leave', (r, characterId) => r.leaveGroup({ characterId }));
  const setTravelWithLeader = (follow: boolean) =>
    send('travel', (r, characterId) => r.setFollowLeader({ characterId, follow }));

  function whisper(name: string): void {
    if (hasName(name)) consoleApi.whisperTo(name);
  }

  function examine(name: string): void {
    if (hasName(name)) consoleApi.examine(name);
  }

  function prefillInvite(): void {
    consoleApi.prefill('invite ');
  }

  function perform(action: MenuAction, name: string): Promise<boolean> {
    switch (action) {
      case 'invite':
        return inviteToParty(name);
      case 'cancelInvite':
        return cancelInvite(name);
      case 'addFriend':
        return addFriend(name);
      case 'makeLeader':
        return makeLeader(name);
      case 'remove':
        return removeFromParty(name);
      case 'travelWithLeader':
        return setTravelWithLeader(true);
      case 'stopTravelWithLeader':
        return setTravelWithLeader(false);
      case 'leave':
        return leaveParty();
      case 'whisper':
        if (!hasName(name)) return Promise.resolve(false);
        whisper(name);
        return Promise.resolve(true);
      case 'examine':
        if (!hasName(name)) return Promise.resolve(false);
        examine(name);
        return Promise.resolve(true);
    }
  }

  return {
    inviteToParty,
    cancelInvite,
    removeFromParty,
    makeLeader,
    leaveParty,
    setTravelWithLeader,
    acceptInvite,
    declineInvite,
    addFriend,
    whisper,
    examine,
    prefillInvite,
    perform,
    keyFor,
  };
}
