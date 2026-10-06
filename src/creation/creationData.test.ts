import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { Character, MyLlmJob } from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import type { BindEventTableOptions } from '../game/bindEventTable';
import { createCreationData } from './creationData';
import type { CreationConn, CreationDeps, CreationInput } from './creationData';
import type { CreationQueries } from './queries';
import { CREATION_KEY, createInertCreation } from './creationContext';

interface FakeConn {
  id: number;
  reducers: {
    startCreation: ReturnType<typeof vi.fn>;
    submitCreationInput: ReturnType<typeof vi.fn>;
    setActiveCharacter: ReturnType<typeof vi.fn>;
  };
}

interface FakeBinding {
  kind: 'table' | 'event';
  sql: string[];
  options: BindTableOptions<FakeConn, any> | BindEventTableOptions<FakeConn, any>;
  rows: ShallowRef<readonly any[]>;
  applied: Ref<boolean>;
  failed: Ref<boolean>;
  attach: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
  conn: FakeConn | null;
}

const queries: CreationQueries = {
  creationState: (id) => `Q_STATE_${id.toHexString()}`,
  eventCreation: (id) => `Q_EVENTS_${id.toHexString()}`,
  worldGenState: (id) => `Q_GEN_${id.toHexString()}`,
  raceDefinitions: 'Q_RACES',
};

const START_ERROR = "Couldn't start the interview. Try again.";
const SEND_ERROR = "Couldn't send that. Try again.";

function identityOf(hex: string) {
  return { toHexString: () => hex } as unknown as import('spacetimedb').Identity;
}

function makeCharacter(id: bigint, overrides: Record<string, unknown> = {}): Character {
  return { id, name: `Hero${id}`, locationId: 3n, ...overrides } as unknown as Character;
}

let connCounter = 0;
function makeConn(): FakeConn {
  connCounter += 1;
  return {
    id: connCounter,
    reducers: {
      startCreation: vi.fn(() => Promise.resolve()),
      submitCreationInput: vi.fn(() => Promise.resolve()),
      setActiveCharacter: vi.fn(() => Promise.resolve()),
    },
  };
}

function micros(value: number): { microsSinceUnixEpoch: bigint } {
  return { microsSinceUnixEpoch: BigInt(value) };
}

function harness() {
  const conn = shallowRef<FakeConn | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const identity = shallowRef<ReturnType<typeof identityOf> | null>(null);
  const charactersApplied = ref(false);
  const characters = shallowRef<readonly Character[]>([]);
  const activeCharacterId = ref<bigint | null>(null);
  const activeCharacter = shallowRef<Character | null>(null);
  const llmJobs = shallowRef<readonly MyLlmJob[]>([]);
  const bindings: FakeBinding[] = [];

  function register(binding: FakeBinding): FakeBinding {
    binding.attach = vi.fn((c: FakeConn | null) => {
      binding.conn = c;
    });
    binding.dispose = vi.fn(() => {
      binding.disposed = true;
      binding.conn = null;
      binding.rows.value = [];
      binding.applied.value = false;
    });
    bindings.push(binding);
    return binding;
  }

  function blank(kind: 'table' | 'event', options: any): FakeBinding {
    return register({
      kind,
      sql: options.sql,
      options,
      rows: shallowRef<readonly any[]>([]),
      applied: ref(false),
      failed: ref(false),
      attach: vi.fn(),
      dispose: vi.fn(),
      disposed: false,
      conn: null,
    });
  }

  const deps = {
    bind: (options: BindTableOptions<FakeConn, any>) => blank('table', options),
    bindEvent: (options: BindEventTableOptions<FakeConn, any>) => blank('event', options),
    queries,
  } as unknown as CreationDeps<FakeConn & CreationConn>;

  const input = {
    conn,
    status,
    identity,
    charactersApplied,
    characters,
    activeCharacterId,
    activeCharacter,
    llmJobs,
  } as unknown as CreationInput<FakeConn & CreationConn>;

  const scope = effectScope();
  const hub = scope.run(() => createCreationData(deps, input))!;

  const live = (sql: string): FakeBinding[] => bindings.filter((b) => b.sql[0] === sql && !b.disposed);
  const find = (sql: string): FakeBinding => {
    const found = live(sql);
    if (found.length === 0) throw new Error(`no live binding for ${sql}`);
    return found[found.length - 1];
  };

  return {
    hub,
    scope,
    conn,
    status,
    identity,
    charactersApplied,
    characters,
    activeCharacterId,
    activeCharacter,
    llmJobs,
    bindings,
    live,
    find,
    connect(): FakeConn {
      const c = makeConn();
      conn.value = c;
      status.value = 'connected';
      return c;
    },
    signIn(hex = 'aa') {
      identity.value = identityOf(hex);
    },
    applyState(hex = 'aa') {
      find(`Q_STATE_${hex}`).applied.value = true;
    },
    applyEvents(hex = 'aa') {
      find(`Q_EVENTS_${hex}`).applied.value = true;
    },
  };
}

type Harness = ReturnType<typeof harness>;

const scopes: Harness[] = [];
function make(): Harness {
  const h = harness();
  scopes.push(h);
  return h;
}

afterEach(() => {
  for (const h of scopes.splice(0)) h.scope.stop();
  vi.restoreAllMocks();
});

function stateRow(id: bigint, step: string, extra: Record<string, unknown> = {}, hex = 'aa') {
  return { id, playerId: identityOf(hex), step, ...extra };
}

function eventRow(id: bigint, hex: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    playerId: identityOf(hex),
    kind: 'creation',
    message: `m${id}`,
    createdAt: micros(Number(id)),
    segments: undefined,
    ...extra,
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('createCreationData: bindings', () => {
  it('creates filtered state, event and world-gen bindings for the identity and attaches them', () => {
    const h = make();
    expect(h.bindings).toHaveLength(1); // only the race binding exists before sign-in
    h.signIn('aa');
    const c = h.connect();
    for (const sql of ['Q_STATE_aa', 'Q_EVENTS_aa', 'Q_GEN_aa']) {
      expect(h.live(sql)).toHaveLength(1);
      expect(h.find(sql).conn).toBe(c);
    }
    const state = h.find('Q_STATE_aa');
    const filter = (state.options as BindTableOptions<FakeConn, any>).filter!;
    expect(filter(stateRow(1n, 'AWAITING_RACE', {}, 'aa'))).toBe(true);
    expect(filter(stateRow(2n, 'AWAITING_RACE', {}, 'bb'))).toBe(false);
    const gen = h.find('Q_GEN_aa');
    expect((gen.options as BindTableOptions<FakeConn, any>).filter!({ playerId: identityOf('bb') })).toBe(false);
  });

  it('disposes the creation bindings once the active character is placed', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    const state = h.find('Q_STATE_aa');
    const events = h.find('Q_EVENTS_aa');
    const gen = h.find('Q_GEN_aa');
    h.activeCharacter.value = makeCharacter(1n, { locationId: 0n });
    expect(state.disposed).toBe(false);
    h.activeCharacter.value = makeCharacter(1n, { locationId: 3n });
    expect(state.disposed).toBe(true);
    expect(events.disposed).toBe(true);
    expect(gen.disposed).toBe(true);
    expect(h.live('Q_STATE_aa')).toHaveLength(0);
  });

  it('subscribes nothing for state, events or world gen without an identity', () => {
    const h = make();
    h.connect();
    expect(h.live('Q_STATE_aa')).toHaveLength(0);
    expect(h.bindings.filter((b) => b.sql[0] !== 'Q_RACES')).toHaveLength(0);
  });

  it('ingests an event row only when its player hex equals the identity hex', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    const onRow = (h.find('Q_EVENTS_aa').options as BindEventTableOptions<FakeConn, any>).onRow;
    onRow(eventRow(1n, 'bb'));
    expect(h.hub.feed.entries.value).toHaveLength(0);
    onRow(eventRow(2n, 'aa'));
    expect(h.hub.feed.entries.value.map((e) => e.key)).toEqual(['creation:2']);
  });

  it('exposes the lowest-id state row and mirrors the applied flags', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    expect(h.hub.state.value).toBeNull();
    expect(h.hub.stateApplied.value).toBe(false);
    expect(h.hub.eventsApplied.value).toBe(false);
    h.find('Q_STATE_aa').rows.value = [stateRow(5n, 'AWAITING_NAME'), stateRow(2n, 'AWAITING_RACE')];
    expect(h.hub.state.value?.id).toBe(2n);
    h.applyState();
    h.applyEvents();
    expect(h.hub.stateApplied.value).toBe(true);
    expect(h.hub.eventsApplied.value).toBe(true);
  });

  it('binds race_definition only while a mount is active and disposes it on the last release', () => {
    const h = make();
    h.connect();
    const races = h.bindings.find((b) => b.sql[0] === 'Q_RACES')!;
    expect(races.conn).toBeNull();
    const releaseA = h.hub.mount();
    const releaseB = h.hub.mount();
    expect(races.conn).not.toBeNull();
    races.rows.value = [{ id: 1n }];
    races.applied.value = true;
    expect(h.hub.races.value).toHaveLength(1);
    expect(h.hub.racesApplied.value).toBe(true);
    races.dispose.mockClear();
    releaseA();
    expect(races.dispose).not.toHaveBeenCalled();
    releaseB();
    expect(races.dispose).toHaveBeenCalledTimes(1);
    expect(h.hub.races.value).toEqual([]);
    expect(h.hub.racesApplied.value).toBe(false);
  });

  it('re-attaches the race binding when the connection changes while mounted', () => {
    const h = make();
    const first = h.connect();
    h.hub.mount();
    const races = h.bindings.find((b) => b.sql[0] === 'Q_RACES')!;
    expect(races.conn).toBe(first);
    const second = makeConn();
    h.conn.value = second;
    expect(races.conn).toBe(second);
  });

  it('dispose() disposes every binding', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    h.hub.mount();
    h.hub.dispose();
    expect(h.bindings.every((b) => b.disposed)).toBe(true);
  });
});

describe('createCreationData: start gating', () => {
  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    const out: T[][] = [];
    items.forEach((item, index) => {
      const rest = items.slice(0, index).concat(items.slice(index + 1));
      for (const tail of permutations(rest)) out.push([item, ...tail]);
    });
    return out;
  }

  it('calls startCreation({}) exactly once after the four flags are true, in any order', () => {
    const steps: Record<string, (h: Harness) => void> = {
      connect: (h) => void h.connect(),
      characters: (h) => {
        h.charactersApplied.value = true;
      },
      state: (h) => h.applyState(),
      events: (h) => h.applyEvents(),
    };
    for (const order of permutations(Object.keys(steps))) {
      const h = make();
      h.signIn('aa');
      h.hub.mount();
      for (let i = 0; i < order.length; i += 1) {
        steps[order[i]](h);
        if (i < order.length - 1) expect(h.conn.value?.reducers.startCreation.mock.calls.length ?? 0).toBe(0);
      }
      const reducers = h.conn.value!.reducers;
      expect(reducers.startCreation).toHaveBeenCalledTimes(1);
      expect(reducers.startCreation).toHaveBeenCalledWith({});
    }
  });

  function ready(h: Harness): FakeConn {
    h.signIn('aa');
    const c = h.connect();
    h.charactersApplied.value = true;
    h.applyState();
    h.applyEvents();
    return c;
  }

  it('does not call again when the flags change after the start; a new mount calls again', () => {
    const h = make();
    const c = ready(h);
    const release = h.hub.mount();
    expect(c.reducers.startCreation).toHaveBeenCalledTimes(1);
    h.charactersApplied.value = false;
    h.charactersApplied.value = true;
    h.find('Q_STATE_aa').applied.value = false;
    h.find('Q_STATE_aa').applied.value = true;
    expect(c.reducers.startCreation).toHaveBeenCalledTimes(1);
    release();
    h.hub.mount();
    expect(c.reducers.startCreation).toHaveBeenCalledTimes(2);
  });

  it('never calls startCreation once the release ran', () => {
    const h = make();
    h.signIn('aa');
    const c = h.connect();
    const release = h.hub.mount();
    release();
    h.charactersApplied.value = true;
    h.applyState();
    h.applyEvents();
    expect(c.reducers.startCreation).not.toHaveBeenCalled();
  });

  it('never calls startCreation when the account already has a character', () => {
    const h = make();
    const c = ready(h);
    h.characters.value = [makeCharacter(1n)];
    h.hub.mount();
    expect(c.reducers.startCreation).not.toHaveBeenCalled();
  });

  it('never calls startCreation while the active character is unplaced', () => {
    const h = make();
    const c = ready(h);
    h.activeCharacter.value = makeCharacter(1n, { locationId: 0n });
    h.hub.mount();
    expect(c.reducers.startCreation).not.toHaveBeenCalled();
  });

  it('a rejected startCreation sets startFailed and appends the error line; retryStart calls again', async () => {
    const h = make();
    const c = ready(h);
    c.reducers.startCreation.mockImplementationOnce(() => Promise.reject(new Error('nope')));
    h.hub.mount();
    await flush();
    expect(h.hub.startFailed.value).toBe(true);
    const entries = h.hub.feed.entries.value;
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('error');
    expect(entries[0].message).toBe(START_ERROR);

    h.hub.retryStart();
    expect(c.reducers.startCreation).toHaveBeenCalledTimes(2);
    expect(h.hub.startFailed.value).toBe(false);
    await flush();
    expect(h.hub.startFailed.value).toBe(false);
  });
});

describe('createCreationData: send', () => {
  function online(h: Harness): FakeConn {
    h.signIn('aa');
    return h.connect();
  }

  it('echoes the trimmed text before calling submitCreationInput and resolves true', async () => {
    const h = make();
    const c = online(h);
    const gate = deferred();
    let echoedBeforeCall = false;
    c.reducers.submitCreationInput.mockImplementationOnce(() => {
      echoedBeforeCall = h.hub.feed.entries.value.some((e) => e.kind === 'echo' && e.message === 'Warrior');
      return gate.promise;
    });
    const result = h.hub.send('  Warrior ');
    expect(echoedBeforeCall).toBe(true);
    expect(c.reducers.submitCreationInput).toHaveBeenCalledWith({ text: 'Warrior' });
    expect(h.hub.sending.value).toBe(true);
    gate.resolve();
    await expect(result).resolves.toBe(true);
    expect(h.hub.sending.value).toBe(false);
  });

  it('never sends empty or whitespace-only text and adds no echo', async () => {
    const h = make();
    const c = online(h);
    await expect(h.hub.send('')).resolves.toBe(false);
    await expect(h.hub.send('   ')).resolves.toBe(false);
    expect(c.reducers.submitCreationInput).not.toHaveBeenCalled();
    expect(h.hub.feed.entries.value).toHaveLength(0);
  });

  it('resolves false without a call while offline', async () => {
    const h = make();
    h.signIn('aa');
    await expect(h.hub.send('Elf')).resolves.toBe(false);
    const c = h.connect();
    h.status.value = 'reconnecting';
    await expect(h.hub.send('Elf')).resolves.toBe(false);
    expect(c.reducers.submitCreationInput).not.toHaveBeenCalled();
    expect(h.hub.feed.entries.value).toHaveLength(0);
  });

  it('resolves false without a call while another send is in flight', async () => {
    const h = make();
    const c = online(h);
    const gate = deferred();
    c.reducers.submitCreationInput.mockImplementationOnce(() => gate.promise);
    const first = h.hub.send('Elf');
    await expect(h.hub.send('Dwarf')).resolves.toBe(false);
    expect(c.reducers.submitCreationInput).toHaveBeenCalledTimes(1);
    gate.resolve();
    await first;
  });

  it('a rejected submitCreationInput appends the send error line and resolves false', async () => {
    const h = make();
    const c = online(h);
    c.reducers.submitCreationInput.mockImplementationOnce(() => Promise.reject(new Error('no')));
    await expect(h.hub.send('Elf')).resolves.toBe(false);
    const entries = h.hub.feed.entries.value;
    expect(entries.map((e) => [e.kind, e.message])).toEqual([
      ['echo', 'Elf'],
      ['error', SEND_ERROR],
    ]);
    expect(h.hub.sending.value).toBe(false);
  });

  it('a synchronous throw from the reducer call is a rejection too', async () => {
    const h = make();
    const c = online(h);
    c.reducers.submitCreationInput.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(h.hub.send('Elf')).resolves.toBe(false);
    expect(h.hub.sending.value).toBe(false);
  });
});

describe('createCreationData: feed and reset', () => {
  it('keeps feed entries across mount, release, mount; reset() clears them and the flags', async () => {
    const h = make();
    h.signIn('aa');
    const c = h.connect();
    const release = h.hub.mount();
    (h.find('Q_EVENTS_aa').options as BindEventTableOptions<FakeConn, any>).onRow(eventRow(1n, 'aa'));
    await h.hub.send('Elf');
    expect(h.hub.feed.entries.value).toHaveLength(2);
    release();
    h.hub.mount();
    expect(h.hub.feed.entries.value).toHaveLength(2);

    c.reducers.submitCreationInput.mockImplementationOnce(() => deferred().promise);
    void h.hub.send('Dwarf');
    expect(h.hub.sending.value).toBe(true);
    h.hub.reset();
    expect(h.hub.feed.entries.value).toHaveLength(0);
    expect(h.hub.startFailed.value).toBe(false);
    expect(h.hub.sending.value).toBe(false);
  });
});

describe('createCreationData: derived flags', () => {
  it('an unplaced active character gives effectiveStep COMPLETE even without a state row', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    expect(h.hub.unplacedActive.value).toBe(false);
    expect(h.hub.effectiveStep.value).toBeNull();
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'AWAITING_NAME')];
    expect(h.hub.effectiveStep.value).toBe('AWAITING_NAME');
    h.activeCharacter.value = makeCharacter(1n, { locationId: 0n });
    expect(h.hub.unplacedActive.value).toBe(true);
    expect(h.hub.effectiveStep.value).toBe('COMPLETE');
    h.find('Q_STATE_aa').rows.value = [];
    expect(h.hub.state.value).toBeNull();
    expect(h.hub.effectiveStep.value).toBe('COMPLETE');
  });

  it('creationJobActive follows the creation-scope indicator over the job rows', () => {
    const h = make();
    expect(h.hub.creationJobActive.value).toBe(false);
    const job = (id: bigint, route: string, status: string) =>
      ({ id, route, status, createdAt: micros(Number(id)) }) as unknown as MyLlmJob;
    h.llmJobs.value = [job(1n, 'narrative', 'pending')];
    expect(h.hub.creationJobActive.value).toBe(false);
    h.llmJobs.value = [job(2n, 'creation_race', 'pending')];
    expect(h.hub.creationJobActive.value).toBe(true);
    h.llmJobs.value = [job(3n, 'creation_race', 'failed')];
    expect(h.hub.creationJobActive.value).toBe(false);
    expect(h.hub.llmJobs.value).toHaveLength(1);
  });

  it('regionFailed follows firstRegionFailed over the world-gen rows of the active character', () => {
    const h = make();
    h.signIn('aa');
    h.connect();
    h.activeCharacter.value = makeCharacter(7n, { locationId: 0n });
    expect(h.hub.regionFailed.value).toBe(false); // world gen not applied: nothing decided
    const gen = h.find('Q_GEN_aa');
    gen.applied.value = true;
    expect(h.hub.regionFailed.value).toBe(true); // applied and no row for the character
    gen.rows.value = [{ id: 1n, characterId: 7n, step: 'GENERATING' }];
    expect(h.hub.regionFailed.value).toBe(false);
    gen.rows.value = [{ id: 1n, characterId: 7n, step: 'ERROR' }];
    expect(h.hub.regionFailed.value).toBe(true);
    h.llmJobs.value = [{ id: 9n, route: 'world_gen_start', status: 'in_flight' } as unknown as MyLlmJob];
    expect(h.hub.regionFailed.value).toBe(false); // a creation-scope job is active
  });
});

describe('createCreationData: defensive set_active_character hand-off', () => {
  function armed(h: Harness): FakeConn {
    h.signIn('aa');
    const c = h.connect();
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'CONFIRMING')];
    return c;
  }

  it('fires once when CONFIRMING then COMPLETE with exactly one character and no active id', async () => {
    const h = make();
    const c = armed(h);
    h.characters.value = [makeCharacter(4n, { locationId: 0n })];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(c.reducers.setActiveCharacter).toHaveBeenCalledTimes(1);
    expect(c.reducers.setActiveCharacter).toHaveBeenCalledWith({ characterId: 4n });
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE', { characterName: 'x' })];
    h.characters.value = [makeCharacter(4n, { locationId: 0n })];
    await flush();
    expect(c.reducers.setActiveCharacter).toHaveBeenCalledTimes(1);
  });

  it('WR-03: does not fire when the active id arrives in the same synchronous burst (out-of-order table callbacks)', async () => {
    const h = make();
    const c = armed(h);
    // The state and character callbacks run first, the my_player callback last, all in one burst.
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    h.characters.value = [makeCharacter(4n, { locationId: 0n })];
    h.activeCharacterId.value = 4n;
    await flush();
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled();
  });

  it('WR-03: still fires when the active id never arrives after the burst', async () => {
    const h = make();
    const c = armed(h);
    h.characters.value = [makeCharacter(4n, { locationId: 0n })];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled(); // deferred to a microtask
    await flush();
    expect(c.reducers.setActiveCharacter).toHaveBeenCalledTimes(1);
  });

  it('WR-03: a reset or dispose before the microtask cancels the hand-off', async () => {
    const h = make();
    const c = armed(h);
    h.characters.value = [makeCharacter(4n, { locationId: 0n })];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    h.hub.reset();
    await flush();
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled();

    const g = make();
    const gc = armed(g);
    g.characters.value = [makeCharacter(4n, { locationId: 0n })];
    g.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    g.hub.dispose();
    await flush();
    expect(gc.reducers.setActiveCharacter).not.toHaveBeenCalled();
  });

  it('never fires when CONFIRMING was not observed in this session (returning player)', async () => {
    const h = make();
    h.signIn('aa');
    const c = h.connect();
    h.characters.value = [makeCharacter(4n)];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled();
  });

  it('does not fire with an active id, with two characters, or while offline', async () => {
    const h = make();
    const c = armed(h);
    h.activeCharacterId.value = 4n;
    h.characters.value = [makeCharacter(4n)];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled();

    const g = make();
    const gc = armed(g);
    g.characters.value = [makeCharacter(4n), makeCharacter(5n)];
    g.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(gc.reducers.setActiveCharacter).not.toHaveBeenCalled();

    const o = make();
    const oc = armed(o);
    o.status.value = 'reconnecting';
    o.characters.value = [makeCharacter(4n)];
    o.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(oc.reducers.setActiveCharacter).not.toHaveBeenCalled();
  });

  it('reset() disarms, and a rejection only logs a console warning', async () => {
    const h = make();
    const c = armed(h);
    h.hub.reset();
    h.characters.value = [makeCharacter(4n)];
    h.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    expect(c.reducers.setActiveCharacter).not.toHaveBeenCalled();

    const g = make();
    const gc = armed(g);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    gc.reducers.setActiveCharacter.mockImplementationOnce(() => Promise.reject(new Error('x')));
    g.characters.value = [makeCharacter(4n)];
    g.find('Q_STATE_aa').rows.value = [stateRow(1n, 'COMPLETE')];
    await flush();
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('createInertCreation', () => {
  it('is constant, offline and harmless to call', async () => {
    const inert = createInertCreation();
    expect(inert.connected.value).toBe(false);
    expect(inert.state.value).toBeNull();
    expect(inert.races.value).toEqual([]);
    expect(inert.effectiveStep.value).toBeNull();
    expect(inert.feed.entries.value).toEqual([]);
    inert.mount()();
    inert.retryStart();
    inert.reset();
    inert.dispose();
    await expect(inert.send('x')).resolves.toBe(false);
    expect(CREATION_KEY.toString()).toBe('Symbol(uwr.creation)');
  });
});
