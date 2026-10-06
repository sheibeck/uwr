// Pure input router (47-CONTEXT "Input routing", INP-01 and INP-02, backlog 999.7).
// routeInput() returns a descriptor; 47-09 executes it. No Vue, no reducer calls, never throws.
//
// Precedence (fixed, tested):
//   1. empty or whitespace-only line            -> none
//   2. leading ASCII "/"                        -> always a command (slash table below)
//   3. command word in its exact typed shape    -> that command ('leave' and 'end' end a conversation)
//   4. "say <text>"                             -> intent, never queued, no local echo
//   5. hail forms (hail / talk to / speak to X, or a bare NPC name here) -> hail
//   6. in conversation: farewell, game action, otherwise talk
//   7. everything else                          -> intent
// A command word followed by anything but its exact shape ("Who is that over there?") falls to 4-7.

import { COMMAND_SHAPES, isCommandWord, tokenize, type CommandWord } from './commands';
import { isFarewell, isGameAction } from './conversation';

export interface NamedId {
  id: bigint;
  name: string;
}

export interface RouteContext {
  conversation: NamedId | null;
  npcsHere: readonly NamedId[];
  placeNames: readonly string[];
  nodeNames: readonly string[];
  pendingInviterNames: readonly string[];
}

export type ReducerCall =
  | { reducer: 'whisper'; args: { targetName: string; message: string } }
  | { reducer: 'groupMessage'; args: { message: string } }
  | {
      reducer: 'inviteToGroup' | 'kickGroupMember' | 'promoteGroupLeader' | 'sendFriendRequestToCharacter';
      args: { targetName: string };
    }
  | { reducer: 'acceptGroupInvite' | 'rejectGroupInvite'; args: { fromName: string } }
  | { reducer: 'leaveGroup' | 'endCombat'; args: Record<string, never> }
  | { reducer: 'submitCommand'; args: { text: string } };

export type InfoCommand = 'renown' | 'factions' | 'faction' | 'events' | 'group';

export type Route =
  | { kind: 'none' }
  | { kind: 'reducer'; call: ReducerCall; echo: string | null }
  | { kind: 'intent'; text: string; echo: string | null; queue: boolean; endsConversation: boolean }
  | { kind: 'talk'; npcId: bigint; message: string }
  | { kind: 'hail'; npc: NamedId; text: string; echo: string }
  | { kind: 'info'; command: InfoCommand; arg: string | null; echo: string }
  | { kind: 'endConversation'; echo: string };

type NameReducer = 'inviteToGroup' | 'kickGroupMember' | 'promoteGroupLeader' | 'sendFriendRequestToCharacter';
type InviteReducer = 'acceptGroupInvite' | 'rejectGroupInvite';

const NAME_REDUCERS: Readonly<Record<'invite' | 'kick' | 'promote' | 'friend', NameReducer>> = {
  invite: 'inviteToGroup',
  kick: 'kickGroupMember',
  promote: 'promoteGroupLeader',
  friend: 'sendFriendRequestToCharacter',
};

const HAIL_PATTERN = /^(?:hail|talk|speak)(?:\s+to)?\s+(.+)$/;

function lower(text: string): string {
  return text.toLowerCase();
}

function findNpc(npcs: readonly NamedId[], name: string): NamedId | null {
  const wanted = lower(name.trim());
  if (wanted === '') return null;
  for (const npc of npcs) {
    if (lower(npc.name.trim()) === wanted) return npc;
  }
  return null;
}

/** One pair of outer double quotes is stripped from a whisper message. */
function stripOuterQuotes(message: string): string {
  if (message.length >= 2 && message.charAt(0) === '"' && message.charAt(message.length - 1) === '"') {
    return message.slice(1, -1).trim();
  }
  return message;
}

/** Splits trimmed text into its first whitespace token and the trimmed remainder. */
function splitFirst(trimmed: string): { first: string; rest: string } {
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!m) return { first: trimmed, rest: '' };
  return { first: m[1], rest: (m[2] ?? '').trim() };
}

function pendingInviter(ctx: RouteContext, name: string): string | null {
  const wanted = lower(name.trim());
  if (wanted === '') return null;
  for (const inviter of ctx.pendingInviterNames) {
    if (lower(inviter.trim()) === wanted) return inviter;
  }
  return null;
}

/** Name to send for accept/decline when none was typed: the sole pending inviter, else ''. */
function defaultInviter(ctx: RouteContext): string {
  return ctx.pendingInviterNames.length === 1 ? ctx.pendingInviterNames[0] : '';
}

function inviteCall(reducer: InviteReducer, fromName: string): ReducerCall {
  return { reducer, args: { fromName } };
}

function nameCall(reducer: NameReducer, targetName: string): ReducerCall {
  return { reducer, args: { targetName } };
}

function whisperCall(targetName: string, message: string): ReducerCall {
  return { reducer: 'whisper', args: { targetName, message } };
}

function viaReducer(call: ReducerCall, echo: string | null): Route {
  return { kind: 'reducer', call, echo };
}

function intent(text: string, echo: string | null, queue: boolean, endsConversation: boolean): Route {
  return { kind: 'intent', text, echo, queue, endsConversation };
}

function hailRoute(npc: NamedId, echo: string): Route {
  return { kind: 'hail', npc, text: `hail ${npc.name}`, echo };
}

function fallbackCommand(trimmed: string): Route {
  return viaReducer({ reducer: 'submitCommand', args: { text: trimmed } }, null);
}

/** Splits "<name> <message>" for whisper; null when either part is missing. */
function nameAndMessage(rest: string): { name: string; message: string } | null {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(rest);
  if (!m) return null;
  const message = stripOuterQuotes(m[2].trim());
  if (message === '') return null;
  return { name: m[1], message };
}

/** Rule 2: a line starting with "/" is always a command. */
function routeSlash(trimmed: string, ctx: RouteContext): Route {
  const m = /^\/(\S*)(?:\s+([\s\S]*))?$/.exec(trimmed);
  const word = lower(m ? m[1] : '');
  const rest = (m && m[2] ? m[2] : '').trim();

  switch (word) {
    case 'who':
      if (rest === '') return intent('who', trimmed, false, false);
      return fallbackCommand(trimmed);
    case 'say':
      if (rest !== '') return intent(`say ${rest}`, null, false, false);
      return fallbackCommand(trimmed);
    case 'hail': {
      if (rest === '') return fallbackCommand(trimmed);
      const npc = findNpc(ctx.npcsHere, rest);
      if (npc) return hailRoute(npc, trimmed);
      return intent(`hail ${rest}`, trimmed, true, false);
    }
    case 'w':
    case 'whisper': {
      const parts = nameAndMessage(rest);
      if (!parts) return fallbackCommand(trimmed);
      return viaReducer(whisperCall(parts.name, parts.message), null);
    }
    case 'group':
      if (rest === '') return { kind: 'info', command: 'group', arg: null, echo: trimmed };
      return viaReducer({ reducer: 'groupMessage', args: { message: rest } }, null);
    case 'invite':
    case 'kick':
    case 'promote':
    case 'friend':
      if (rest === '') return fallbackCommand(trimmed);
      return viaReducer(nameCall(NAME_REDUCERS[word], rest), trimmed);
    case 'accept':
    case 'decline': {
      const reducer: InviteReducer = word === 'accept' ? 'acceptGroupInvite' : 'rejectGroupInvite';
      const fromName = rest !== '' ? (pendingInviter(ctx, rest) ?? rest) : defaultInviter(ctx);
      return viaReducer(inviteCall(reducer, fromName), trimmed);
    }
    case 'leave':
      if (rest !== '') return fallbackCommand(trimmed);
      return viaReducer({ reducer: 'leaveGroup', args: {} }, trimmed);
    case 'end':
    case 'endc':
    case 'endcombat':
      if (rest !== '') return fallbackCommand(trimmed);
      return viaReducer({ reducer: 'endCombat', args: {} }, trimmed);
    case 'renown':
    case 'factions':
    case 'events':
      if (rest !== '') return fallbackCommand(trimmed);
      return { kind: 'info', command: word, arg: null, echo: trimmed };
    case 'faction':
      if (rest === '') return { kind: 'info', command: 'factions', arg: null, echo: trimmed };
      return { kind: 'info', command: 'faction', arg: rest, echo: trimmed };
    default:
      return fallbackCommand(trimmed);
  }
}

/** Rule 3: a command word whose rest matches its exact shape; null when it does not. */
function routeExactCommand(trimmed: string, ctx: RouteContext): Route | null {
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return null;
  const first = tokens[0];
  if (!isCommandWord(first)) return null;
  const word: CommandWord = lower(first) as CommandWord;
  const shape = COMMAND_SHAPES[word];
  const inConversation = ctx.conversation !== null;

  if (shape === 'bare') {
    if (tokens.length === 1) {
      switch (word) {
        case 'who':
          return intent('who', trimmed, false, false);
        case 'accept':
          return viaReducer(inviteCall('acceptGroupInvite', defaultInviter(ctx)), trimmed);
        case 'decline':
          return viaReducer(inviteCall('rejectGroupInvite', defaultInviter(ctx)), trimmed);
        case 'leave':
          if (inConversation) return { kind: 'endConversation', echo: trimmed };
          return viaReducer({ reducer: 'leaveGroup', args: {} }, trimmed);
        case 'end':
          if (inConversation) return { kind: 'endConversation', echo: trimmed };
          return viaReducer({ reducer: 'endCombat', args: {} }, trimmed);
        case 'endc':
        case 'endcombat':
          return viaReducer({ reducer: 'endCombat', args: {} }, trimmed);
        case 'group':
          return { kind: 'info', command: 'group', arg: null, echo: trimmed };
        case 'renown':
        case 'factions':
        case 'events':
          return { kind: 'info', command: word, arg: null, echo: trimmed };
        default:
          return null;
      }
    }
    if (tokens.length === 2 && (word === 'accept' || word === 'decline')) {
      const inviter = pendingInviter(ctx, tokens[1]);
      if (inviter === null) return null;
      return viaReducer(inviteCall(word === 'accept' ? 'acceptGroupInvite' : 'rejectGroupInvite', inviter), trimmed);
    }
    return null;
  }

  if (shape === 'name') {
    if (tokens.length !== 2) return null;
    if (word === 'faction') return { kind: 'info', command: 'faction', arg: tokens[1], echo: trimmed };
    if (word === 'invite' || word === 'kick' || word === 'promote' || word === 'friend') {
      return viaReducer(nameCall(NAME_REDUCERS[word], tokens[1]), trimmed);
    }
    return null;
  }

  // nameAndMessage: w / whisper
  const parts = nameAndMessage(splitFirst(trimmed).rest);
  if (!parts) return null;
  return viaReducer(whisperCall(parts.name, parts.message), null);
}

/** Rule 5: hail forms and a bare NPC name at this location. */
function routeHail(trimmed: string, ctx: RouteContext): Route | null {
  const match = HAIL_PATTERN.exec(lower(trimmed));
  if (match) {
    const npc = findNpc(ctx.npcsHere, match[1]);
    if (npc) return hailRoute(npc, trimmed);
  }
  const bare = findNpc(ctx.npcsHere, trimmed);
  if (bare) return hailRoute(bare, trimmed);
  return null;
}

/** Routes one typed line. Pure and total: the same input and context always give the same route. */
export function routeInput(text: string, ctx: RouteContext): Route {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'none' };

  if (trimmed.charAt(0) === '/') return routeSlash(trimmed, ctx);

  const command = routeExactCommand(trimmed, ctx);
  if (command) return command;

  const { first, rest } = splitFirst(trimmed);
  if (lower(first) === 'say' && rest !== '') return intent(trimmed, null, false, false);

  const hail = routeHail(trimmed, ctx);
  if (hail) return hail;

  if (ctx.conversation) {
    if (isFarewell(trimmed)) return { kind: 'endConversation', echo: trimmed };
    if (isGameAction(trimmed, ctx)) return intent(trimmed, trimmed, true, true);
    return { kind: 'talk', npcId: ctx.conversation.id, message: trimmed };
  }

  return intent(trimmed, trimmed, true, false);
}
