import { describe, expect, it } from 'vitest';
import { COMMAND_WORDS, COMMAND_SHAPES, isCommandWord, tokenize } from './commands';
import { routeInput, type Route, type RouteContext } from './routeInput';

const FERRYMAN = { id: 3n, name: 'Ferryman' };
const MARISOL = { id: 4n, name: 'Marisol' };

function ctxWith(over: Partial<RouteContext> = {}): RouteContext {
  return {
    conversation: null,
    npcsHere: [FERRYMAN, MARISOL],
    placeNames: ['Gloamwood', 'Old Mill'],
    nodeNames: ['Ironwood'],
    pendingInviterNames: [],
    ...over,
  };
}

const talking = (over: Partial<RouteContext> = {}) => ctxWith({ conversation: FERRYMAN, ...over });

function sentenceIntent(text: string): Route {
  return { kind: 'intent', text, echo: text, queue: true, endsConversation: false };
}

describe('empty input', () => {
  it.each(['', '   ', '\t', ' \n '])('%j routes to none', (text) => {
    expect(routeInput(text, ctxWith())).toEqual({ kind: 'none' });
  });
});

describe('INP-01 sentence forms reach intent', () => {
  it.each([
    'Who is that over there?',
    'Leave him alone',
    'End this now',
    'Accept my apology',
    'Decline the offer politely',
    'Invite them all in',
    'Kick the door down',
    'Promote peace and quiet',
    'Friend me please',
    'Endcombat right now',
    'Endc soon',
    'Group up everyone',
    'Renown matters here',
    'Factions are everywhere',
    'Faction politics bore me',
    'Events unfold slowly',
    'Whisper',
    'w',
    'whisper Bob',
    'w hat',
    'who?',
    'invite',
    'kick',
    'invite Bob Smith',
    'faction',
  ])('%s', (text) => {
    expect(routeInput(text, ctxWith())).toEqual(sentenceIntent(text));
  });

  it('accept/decline with a token that is not a pending inviter reach intent', () => {
    expect(routeInput('accept Bob', ctxWith({ pendingInviterNames: ['Mara'] }))).toEqual(sentenceIntent('accept Bob'));
    expect(routeInput('decline Bob', ctxWith())).toEqual(sentenceIntent('decline Bob'));
  });

  it('whisper with an empty quoted message reaches intent', () => {
    expect(routeInput('whisper Bob ""', ctxWith())).toEqual(sentenceIntent('whisper Bob ""'));
  });
});

describe('INP-02 exact forms', () => {
  const reducer = (call: object, echo: string | null) => ({ kind: 'reducer', call, echo });

  it('who and WHO go to intent who without queueing', () => {
    expect(routeInput('who', ctxWith())).toEqual({ kind: 'intent', text: 'who', echo: 'who', queue: false, endsConversation: false });
    expect(routeInput('WHO', ctxWith())).toEqual({ kind: 'intent', text: 'who', echo: 'WHO', queue: false, endsConversation: false });
  });

  it('accept and decline use the sole pending inviter, else an empty name', () => {
    expect(routeInput('accept', ctxWith({ pendingInviterNames: ['Mara'] }))).toEqual(
      reducer({ reducer: 'acceptGroupInvite', args: { fromName: 'Mara' } }, 'accept'),
    );
    expect(routeInput('accept', ctxWith())).toEqual(reducer({ reducer: 'acceptGroupInvite', args: { fromName: '' } }, 'accept'));
    expect(routeInput('accept', ctxWith({ pendingInviterNames: ['Mara', 'Bob'] }))).toEqual(
      reducer({ reducer: 'acceptGroupInvite', args: { fromName: '' } }, 'accept'),
    );
    expect(routeInput('decline', ctxWith({ pendingInviterNames: ['Mara'] }))).toEqual(
      reducer({ reducer: 'rejectGroupInvite', args: { fromName: 'Mara' } }, 'decline'),
    );
    expect(routeInput('decline', ctxWith())).toEqual(reducer({ reducer: 'rejectGroupInvite', args: { fromName: '' } }, 'decline'));
  });

  it('accept/decline with a pending inviter name send the stored name', () => {
    const c = ctxWith({ pendingInviterNames: ['Mara', 'Bob'] });
    expect(routeInput('accept Mara', c)).toEqual(reducer({ reducer: 'acceptGroupInvite', args: { fromName: 'Mara' } }, 'accept Mara'));
    expect(routeInput('accept mara', c)).toEqual(reducer({ reducer: 'acceptGroupInvite', args: { fromName: 'Mara' } }, 'accept mara'));
    expect(routeInput('decline Bob', c)).toEqual(reducer({ reducer: 'rejectGroupInvite', args: { fromName: 'Bob' } }, 'decline Bob'));
  });

  it('leave and the end words run their reducers', () => {
    expect(routeInput('leave', ctxWith())).toEqual(reducer({ reducer: 'leaveGroup', args: {} }, 'leave'));
    for (const word of ['end', 'endc', 'endcombat']) {
      expect(routeInput(word, ctxWith())).toEqual(reducer({ reducer: 'endCombat', args: {} }, word));
    }
  });

  it('name commands send the single name token', () => {
    expect(routeInput('invite Bob', ctxWith())).toEqual(reducer({ reducer: 'inviteToGroup', args: { targetName: 'Bob' } }, 'invite Bob'));
    expect(routeInput('kick Bob', ctxWith())).toEqual(reducer({ reducer: 'kickGroupMember', args: { targetName: 'Bob' } }, 'kick Bob'));
    expect(routeInput('promote Bob', ctxWith())).toEqual(reducer({ reducer: 'promoteGroupLeader', args: { targetName: 'Bob' } }, 'promote Bob'));
    expect(routeInput('friend Bob', ctxWith())).toEqual(
      reducer({ reducer: 'sendFriendRequestToCharacter', args: { targetName: 'Bob' } }, 'friend Bob'),
    );
  });

  it('whisper and w send name and message with no local echo', () => {
    const expected = reducer({ reducer: 'whisper', args: { targetName: 'Bob', message: 'hello there' } }, null);
    expect(routeInput('whisper Bob hello there', ctxWith())).toEqual(expected);
    expect(routeInput('w Bob hello there', ctxWith())).toEqual(expected);
    expect(routeInput('whisper Bob "hi"', ctxWith())).toEqual(reducer({ reducer: 'whisper', args: { targetName: 'Bob', message: 'hi' } }, null));
  });

  it('info commands carry the trimmed text as echo', () => {
    for (const word of ['renown', 'factions', 'events', 'group'] as const) {
      expect(routeInput(`  ${word}  `, ctxWith())).toEqual({ kind: 'info', command: word, arg: null, echo: word });
    }
    expect(routeInput('faction Wardens', ctxWith())).toEqual({ kind: 'info', command: 'faction', arg: 'Wardens', echo: 'faction Wardens' });
  });

  it('a multi-word faction name needs the slash form', () => {
    expect(routeInput('faction Iron Wardens', ctxWith())).toEqual(sentenceIntent('faction Iron Wardens'));
    expect(routeInput('/faction Iron Wardens', ctxWith())).toEqual({
      kind: 'info',
      command: 'faction',
      arg: 'Iron Wardens',
      echo: '/faction Iron Wardens',
    });
  });
});

describe('slash lines are always commands', () => {
  const reducer = (call: object, echo: string | null) => ({ kind: 'reducer', call, echo });
  const sub = (text: string) => reducer({ reducer: 'submitCommand', args: { text } }, null);

  it('/who goes to intent who', () => {
    expect(routeInput('/who', ctxWith())).toEqual({ kind: 'intent', text: 'who', echo: '/who', queue: false, endsConversation: false });
    expect(routeInput('/WHO', ctxWith())).toEqual({ kind: 'intent', text: 'who', echo: '/WHO', queue: false, endsConversation: false });
  });

  it('/say sends a say intent without queue or echo', () => {
    expect(routeInput('/say hello all', ctxWith())).toEqual({ kind: 'intent', text: 'say hello all', echo: null, queue: false, endsConversation: false });
  });

  it('/hail enters a hail only for an NPC here', () => {
    expect(routeInput('/hail Ferryman', ctxWith())).toEqual({ kind: 'hail', npc: FERRYMAN, text: 'hail Ferryman', echo: '/hail Ferryman' });
    expect(routeInput('/hail Nobody', ctxWith())).toEqual({ kind: 'intent', text: 'hail Nobody', echo: '/hail Nobody', queue: true, endsConversation: false });
  });

  it('name commands take all remaining text', () => {
    expect(routeInput('/invite Bob Smith', ctxWith())).toEqual(
      reducer({ reducer: 'inviteToGroup', args: { targetName: 'Bob Smith' } }, '/invite Bob Smith'),
    );
    expect(routeInput('/kick Bob Smith', ctxWith())).toEqual(
      reducer({ reducer: 'kickGroupMember', args: { targetName: 'Bob Smith' } }, '/kick Bob Smith'),
    );
    expect(routeInput('/promote Bob Smith', ctxWith())).toEqual(
      reducer({ reducer: 'promoteGroupLeader', args: { targetName: 'Bob Smith' } }, '/promote Bob Smith'),
    );
    expect(routeInput('/friend Bob Smith', ctxWith())).toEqual(
      reducer({ reducer: 'sendFriendRequestToCharacter', args: { targetName: 'Bob Smith' } }, '/friend Bob Smith'),
    );
  });

  it('a name command with nothing goes to submitCommand', () => {
    expect(routeInput('/invite', ctxWith())).toEqual(sub('/invite'));
    expect(routeInput('/kick', ctxWith())).toEqual(sub('/kick'));
  });

  it('/w and /whisper send a whisper', () => {
    const expected = reducer({ reducer: 'whisper', args: { targetName: 'Bob', message: 'hi there' } }, null);
    expect(routeInput('/w Bob hi there', ctxWith())).toEqual(expected);
    expect(routeInput('/whisper Bob hi there', ctxWith())).toEqual(expected);
    expect(routeInput('/w Bob', ctxWith())).toEqual(sub('/w Bob'));
  });

  it('/group sends a group message, bare /group is info', () => {
    expect(routeInput('/group hello team', ctxWith())).toEqual(reducer({ reducer: 'groupMessage', args: { message: 'hello team' } }, null));
    expect(routeInput('/group', ctxWith())).toEqual({ kind: 'info', command: 'group', arg: null, echo: '/group' });
  });

  it('/accept and /decline use the rest, the sole inviter or an empty name', () => {
    expect(routeInput('/accept Mara', ctxWith())).toEqual(reducer({ reducer: 'acceptGroupInvite', args: { fromName: 'Mara' } }, '/accept Mara'));
    expect(routeInput('/accept', ctxWith({ pendingInviterNames: ['Mara'] }))).toEqual(
      reducer({ reducer: 'acceptGroupInvite', args: { fromName: 'Mara' } }, '/accept'),
    );
    expect(routeInput('/decline', ctxWith())).toEqual(reducer({ reducer: 'rejectGroupInvite', args: { fromName: '' } }, '/decline'));
  });

  it('/leave and the end words run their reducers', () => {
    expect(routeInput('/leave', ctxWith())).toEqual(reducer({ reducer: 'leaveGroup', args: {} }, '/leave'));
    for (const word of ['end', 'endc', 'endcombat']) {
      expect(routeInput(`/${word}`, ctxWith())).toEqual(reducer({ reducer: 'endCombat', args: {} }, `/${word}`));
    }
  });

  it('/renown, /factions, /events and /faction are info routes', () => {
    expect(routeInput('/renown', ctxWith())).toEqual({ kind: 'info', command: 'renown', arg: null, echo: '/renown' });
    expect(routeInput('/factions', ctxWith())).toEqual({ kind: 'info', command: 'factions', arg: null, echo: '/factions' });
    expect(routeInput('/events', ctxWith())).toEqual({ kind: 'info', command: 'events', arg: null, echo: '/events' });
    expect(routeInput('/faction', ctxWith())).toEqual({ kind: 'info', command: 'factions', arg: null, echo: '/faction' });
    expect(routeInput('/faction Wardens', ctxWith())).toEqual({ kind: 'info', command: 'faction', arg: 'Wardens', echo: '/faction Wardens' });
  });

  it('bare-shape slash words with extra text and unknown words go to submitCommand', () => {
    for (const text of ['/who is there', '/leave now', '/level 5', '/createitem x', '/frobnicate', '/', '/ who', '/say']) {
      expect(routeInput(text, ctxWith())).toEqual(sub(text));
    }
  });

  it('a full-width slash is not a slash command', () => {
    expect(routeInput('／who', ctxWith())).toEqual(sentenceIntent('／who'));
  });

  it('slash lines run in conversation too', () => {
    expect(routeInput('/leave', talking())).toEqual(reducer({ reducer: 'leaveGroup', args: {} }, '/leave'));
    expect(routeInput('/end', talking())).toEqual(reducer({ reducer: 'endCombat', args: {} }, '/end'));
  });
});

describe('adjacency and encoding', () => {
  it('runs of spaces and tabs split like one space', () => {
    const expected = { kind: 'reducer', call: { reducer: 'inviteToGroup', args: { targetName: 'Bob' } } };
    expect(routeInput('invite   Bob', ctxWith())).toMatchObject(expected);
    expect(routeInput('invite\tBob', ctxWith())).toMatchObject(expected);
    expect(routeInput('  invite \t Bob  ', ctxWith())).toMatchObject({ echo: 'invite \t Bob' });
  });

  it('names keep their code points', () => {
    expect(routeInput('invite Zoë', ctxWith())).toMatchObject({ call: { args: { targetName: 'Zoë' } } });
  });

  it('whisper message keeps its inner spacing', () => {
    expect(routeInput('w Bob  hello   there ', ctxWith())).toMatchObject({ call: { args: { targetName: 'Bob', message: 'hello   there' } } });
  });

  it('command words compare after toLowerCase', () => {
    expect(routeInput('INVITE Bob', ctxWith())).toMatchObject({ call: { reducer: 'inviteToGroup' } });
    expect(routeInput('Leave', ctxWith())).toMatchObject({ call: { reducer: 'leaveGroup' } });
  });

  it('never throws and is deterministic for hostile input', () => {
    const hostile = [
      'x'.repeat(5000),
      `who ${'a '.repeat(2500)}`,
      `hail${' '.repeat(5000)}x`,
      '\ud800',
      'invite \ud800',
      'C++ (the Elder)',
      '[unclosed',
      '/' + 'y'.repeat(5000),
      'constructor',
      '__proto__',
      '/__proto__ x',
      'toString',
    ];
    for (const text of hostile) {
      for (const c of [ctxWith(), talking()]) {
        const first = routeInput(text, c);
        expect(routeInput(text, c)).toEqual(first);
      }
    }
  });

  it('prototype property names are not command words', () => {
    expect(isCommandWord('constructor')).toBe(false);
    expect(isCommandWord('__proto__')).toBe(false);
    expect(isCommandWord('hasOwnProperty')).toBe(false);
    expect(isCommandWord('WHO')).toBe(true);
    expect(isCommandWord('who?')).toBe(false);
  });

  it('tokenize trims and splits on whitespace runs', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('  a \t b  c ')).toEqual(['a', 'b', 'c']);
  });
});

describe('say', () => {
  it('"say x" is an unqueued intent with no echo, even in conversation', () => {
    const expected = { kind: 'intent', text: 'say hello there', echo: null, queue: false, endsConversation: false };
    expect(routeInput('say hello there', ctxWith())).toEqual(expected);
    expect(routeInput('say hello there', talking())).toEqual(expected);
  });

  it('bare "say" is a plain sentence', () => {
    expect(routeInput('say', ctxWith())).toEqual(sentenceIntent('say'));
  });
});

describe('hail forms', () => {
  it.each(['hail Ferryman', 'talk to ferryman', 'speak to Ferryman', 'talk Ferryman', 'ferryman', '  Ferryman  '])('%j', (text) => {
    expect(routeInput(text, ctxWith())).toEqual({ kind: 'hail', npc: FERRYMAN, text: 'hail Ferryman', echo: text.trim() });
  });

  it('a name that is not an NPC here reaches intent', () => {
    expect(routeInput('talk to me, Ferryman', ctxWith())).toEqual(sentenceIntent('talk to me, Ferryman'));
    expect(routeInput('hail Nobody', ctxWith())).toEqual(sentenceIntent('hail Nobody'));
  });
});

describe('conversation mode', () => {
  it.each(['bye', 'Farewell', 'goodbye.', 'leave', 'end', 'quit', 'exit', 'back'])('%s ends the conversation', (text) => {
    expect(routeInput(text, talking())).toEqual({ kind: 'endConversation', echo: text });
  });

  it.each(['look', 'look at the well', 'go to Gloamwood', 'attack', 'kill the rat', 'gather Ironwood', 'buy bread', 'inventory'])(
    '%s is a game action that ends the conversation',
    (text) => {
      expect(routeInput(text, talking())).toEqual({ kind: 'intent', text, echo: text, queue: true, endsConversation: true });
    },
  );

  it('free text is spoken to the NPC', () => {
    expect(routeInput('Go away, fool', talking())).toEqual({ kind: 'talk', npcId: 3n, message: 'Go away, fool' });
    expect(routeInput('Tell me about the river', talking())).toEqual({ kind: 'talk', npcId: 3n, message: 'Tell me about the river' });
  });

  it('who still runs the command', () => {
    expect(routeInput('who', talking())).toEqual({ kind: 'intent', text: 'who', echo: 'who', queue: false, endsConversation: false });
  });

  it('other command words still run in conversation', () => {
    expect(routeInput('endc', talking())).toMatchObject({ call: { reducer: 'endCombat' } });
    expect(routeInput('invite Bob', talking())).toMatchObject({ call: { reducer: 'inviteToGroup' } });
  });

  it('hailing another NPC switches the conversation', () => {
    expect(routeInput('hail Marisol', talking())).toEqual({ kind: 'hail', npc: MARISOL, text: 'hail Marisol', echo: 'hail Marisol' });
  });

  it('sentences with a command word are spoken, not run', () => {
    expect(routeInput('Leave him alone', talking())).toEqual({ kind: 'talk', npcId: 3n, message: 'Leave him alone' });
  });
});

describe('INP-02 matrix: every command word, exact form and sentence form', () => {
  const ctx = ctxWith({ pendingInviterNames: ['Mara'] });

  // One exact-form row per word: the word and the route kind or reducer it must produce.
  const exact: Record<string, { text: string; match: object }> = {
    who: { text: 'who', match: { kind: 'intent', text: 'who' } },
    accept: { text: 'accept', match: { kind: 'reducer', call: { reducer: 'acceptGroupInvite' } } },
    decline: { text: 'decline', match: { kind: 'reducer', call: { reducer: 'rejectGroupInvite' } } },
    leave: { text: 'leave', match: { kind: 'reducer', call: { reducer: 'leaveGroup' } } },
    invite: { text: 'invite Bob', match: { kind: 'reducer', call: { reducer: 'inviteToGroup' } } },
    kick: { text: 'kick Bob', match: { kind: 'reducer', call: { reducer: 'kickGroupMember' } } },
    promote: { text: 'promote Bob', match: { kind: 'reducer', call: { reducer: 'promoteGroupLeader' } } },
    whisper: { text: 'whisper Bob hi', match: { kind: 'reducer', call: { reducer: 'whisper' } } },
    w: { text: 'w Bob hi', match: { kind: 'reducer', call: { reducer: 'whisper' } } },
    friend: { text: 'friend Bob', match: { kind: 'reducer', call: { reducer: 'sendFriendRequestToCharacter' } } },
    endcombat: { text: 'endcombat', match: { kind: 'reducer', call: { reducer: 'endCombat' } } },
    end: { text: 'end', match: { kind: 'reducer', call: { reducer: 'endCombat' } } },
    endc: { text: 'endc', match: { kind: 'reducer', call: { reducer: 'endCombat' } } },
    group: { text: 'group', match: { kind: 'info', command: 'group' } },
    renown: { text: 'renown', match: { kind: 'info', command: 'renown' } },
    factions: { text: 'factions', match: { kind: 'info', command: 'factions' } },
    faction: { text: 'faction Wardens', match: { kind: 'info', command: 'faction' } },
    events: { text: 'events', match: { kind: 'info', command: 'events' } },
  };

  // One sentence-form row per word: it must reach intent with the full text.
  const sentence: Record<string, string> = {
    who: 'Who is that over there?',
    accept: 'Accept my apology',
    decline: 'Decline the offer politely',
    leave: 'Leave him alone',
    invite: 'Invite them all in',
    kick: 'Kick the door down',
    promote: 'Promote peace and quiet',
    whisper: 'Whisper',
    w: 'w hat',
    friend: 'Friend me please',
    endcombat: 'Endcombat right now',
    end: 'End this now',
    endc: 'Endc soon',
    group: 'Group up everyone',
    renown: 'Renown matters here',
    factions: 'Factions are everywhere',
    faction: 'Faction politics bore me',
    events: 'Events unfold slowly',
  };

  it('has 18 command words', () => {
    expect(COMMAND_WORDS.length).toBe(18);
    expect(Object.keys(COMMAND_SHAPES).length).toBe(18);
  });

  it.each([...COMMAND_WORDS])('%s: exact form runs the command', (word) => {
    const row = exact[word];
    expect(row, `missing exact row for ${word}`).toBeDefined();
    expect(routeInput(row.text, ctx)).toMatchObject(row.match);
  });

  it.each([...COMMAND_WORDS])('%s: sentence form reaches intent', (word) => {
    const text = sentence[word];
    expect(text, `missing sentence row for ${word}`).toBeDefined();
    expect(routeInput(text, ctx)).toEqual(sentenceIntent(text));
  });

  it.each([...COMMAND_WORDS])('%s: sentence form reaches talk in conversation', (word) => {
    const text = sentence[word];
    const route = routeInput(text, talking({ pendingInviterNames: ['Mara'] }));
    expect(['talk', 'intent']).toContain(route.kind);
    if (route.kind === 'talk') expect(route.message).toBe(text);
    if (route.kind === 'intent') expect(route.text).toBe(text);
  });

  it('every word appears in both tables', () => {
    for (const word of COMMAND_WORDS) {
      expect(Object.prototype.hasOwnProperty.call(exact, word)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(sentence, word)).toBe(true);
    }
  });
});
