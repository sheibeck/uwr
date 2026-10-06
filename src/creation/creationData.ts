import { computed, effectScope, ref, watch } from 'vue';
import type { EffectScope, Ref, ShallowRef } from 'vue';
import type { Identity } from 'spacetimedb';
import type {
  Character,
  CharacterCreationState,
  EventCreation,
  MyLlmJob,
  RaceDefinition,
  WorldGenState,
} from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import type { BindEventTableOptions, EventTableBinding, EventTableLike } from '../game/bindEventTable';
import { createKeyed, keyedRows } from '../game/keyedBinding';
import { selectLlmIndicator } from '../console/indicator';
import type { CreationData } from './creationContext';
import { createCreationFeedStore } from './creationFeedStore';
import { ENDED_WITHOUT_CHARACTER_TEXT } from './creationControls';
import { effectiveCreationStep, firstRegionFailed } from './creationSteps';
import type { CreationQueries } from './queries';

// The creation hub (Phase 49): the session-owned subscriptions, feed and actions of the
// character-creation interview. It outlives the view (RESEARCH Pitfall 7): an unmount and
// remount keeps the feed lines, because event rows are never replayed.
//
// Scope of each subscription:
//   by player identity  character_creation_state, event_creation, world_gen_state; live while
//                       there is an identity and no placed active character
//   while mounted       race_definition (the stored races; whole table, view-scoped)
//
// Creation reducers never carry an identity or a character id: ctx.sender is the principal.
// Nothing is optimistic: the step bar and the sheet derive from the subscribed row only.

export const START_ERROR_TEXT = "Couldn't start the interview. Try again.";
export const SEND_ERROR_TEXT = "Couldn't send that. Try again.";

export interface CreationConn extends ConnLike {
  db: {
    characterCreationState: TableLike<CharacterCreationState>;
    raceDefinition: TableLike<RaceDefinition>;
    worldGenState: TableLike<WorldGenState>;
    eventCreation: EventTableLike<EventCreation>;
  };
  reducers: {
    startCreation(args: {}): Promise<void>;
    submitCreationInput(args: { text: string }): Promise<void>;
    setActiveCharacter(args: { characterId: bigint }): Promise<void>;
  };
}

export interface CreationInput<C> {
  conn: Readonly<ShallowRef<C | null>>;
  status: Readonly<Ref<ConnectionStatus>>;
  /** The player's identity (my_player.id), null until the session knows it. */
  identity: Readonly<Ref<Identity | null>>;
  /** The characters binding has applied (zero rows then means zero characters). */
  charactersApplied: Readonly<Ref<boolean>>;
  characters: Readonly<Ref<readonly Character[]>>;
  activeCharacterId: Readonly<Ref<bigint | null>>;
  activeCharacter: Readonly<Ref<Character | null>>;
  llmJobs: Readonly<Ref<readonly MyLlmJob[]>>;
}

export interface CreationDeps<C> {
  bind: <R>(options: BindTableOptions<C, R>) => TableBinding<C, R>;
  bindEvent: <R>(options: BindEventTableOptions<C, R>) => EventTableBinding<C>;
  queries: CreationQueries;
}

const NO_ROWS: readonly never[] = [];

export function createCreationData<C extends CreationConn>(
  deps: CreationDeps<C>,
  input: CreationInput<C>,
): CreationData {
  const { queries } = deps;
  const feed = createCreationFeedStore();
  // Every watcher and keyed binding lives in one child scope, so dispose() can stop them all
  // and the session scope still stops them when it ends.
  const scope = effectScope();

  const sending = ref(false);
  const startFailed = ref(false);
  const mountCount = ref(0);
  const mountScopes = new Set<EffectScope>();
  // Defensive hand-off (RESEARCH Open Question 4): armed by seeing CONFIRMING in this session.
  const handoffArmed = ref(false);
  let handoffFired = false;
  let disposed = false;
  let endedNoticed = false;
  // Bumped by reset() so a pending microtask check from before the reset does nothing.
  let resetEpoch = 0;

  const connected = computed(() => input.status.value === 'connected' && input.conn.value !== null);

  const unplacedActive = computed(() => {
    const active = input.activeCharacter.value;
    return active !== null && active.locationId === 0n;
  });

  // Key: the identity hex while there is an identity and no placed active character.
  const identityKey = computed<string | null>(() => {
    const identity = input.identity.value;
    if (identity === null) return null;
    const active = input.activeCharacter.value;
    if (active !== null && active.locationId !== 0n) return null;
    return identity.toHexString();
  });

  const run = scope.run(() => {
    function currentIdentity(): Identity {
      const identity = input.identity.value;
      if (identity === null) throw new Error('[creation] no identity for a creation subscription');
      return identity;
    }

    const stateKeyed = createKeyed<C, string, TableBinding<C, CharacterCreationState>>({
      key: identityKey,
      conn: input.conn,
      swap: 'immediate',
      make: (hex) =>
        deps.bind<CharacterCreationState>({
          table: (c) => c.db.characterCreationState,
          sql: [queries.creationState(currentIdentity())],
          filter: (row) => row.playerId.toHexString() === hex,
        }),
    });
    const genKeyed = createKeyed<C, string, TableBinding<C, WorldGenState>>({
      key: identityKey,
      conn: input.conn,
      swap: 'immediate',
      make: (hex) =>
        deps.bind<WorldGenState>({
          table: (c) => c.db.worldGenState,
          sql: [queries.worldGenState(currentIdentity())],
          filter: (row) => row.playerId.toHexString() === hex,
        }),
    });
    const eventsKeyed = createKeyed<C, string, EventTableBinding<C>>({
      key: identityKey,
      conn: input.conn,
      swap: 'immediate',
      make: (hex) =>
        deps.bindEvent<EventCreation>({
          table: (c) => c.db.eventCreation,
          sql: [queries.eventCreation(currentIdentity())],
          // The event listener is table-wide: only this player's rows are accepted.
          onRow: (row) => {
            if (row.playerId.toHexString() === hex) feed.ingest(row);
          },
        }),
    });

    // race_definition: bound while at least one view is mounted.
    const races = deps.bind<RaceDefinition>({
      table: (c) => c.db.raceDefinition,
      sql: [queries.raceDefinitions],
    });
    watch(
      [mountCount, input.conn],
      ([count, conn]) => {
        if (count > 0) races.attach(conn);
        else races.dispose();
      },
      { immediate: true, flush: 'sync' },
    );

    const stateRows = keyedRows(stateKeyed);
    const genRows = keyedRows(genKeyed);
    const state = computed<CharacterCreationState | null>(() => {
      let lowest: CharacterCreationState | null = null;
      for (const row of stateRows.value) {
        if (lowest === null || row.id < lowest.id) lowest = row;
      }
      return lowest;
    });
    const stateApplied = computed(() => stateKeyed.current.value?.applied.value ?? false);
    const eventsApplied = computed(() => eventsKeyed.current.value?.applied.value ?? false);
    const genApplied = computed(() => genKeyed.current.value?.applied.value ?? false);

    const creationJobActive = computed(
      () => selectLlmIndicator(input.llmJobs.value, 'creation').active,
    );
    const regionFailed = computed(() =>
      firstRegionFailed({
        genRows: genRows.value,
        genApplied: genApplied.value,
        characterId: input.activeCharacter.value?.id ?? null,
        worldJobActive: creationJobActive.value,
      }),
    );
    const effectiveStep = computed(() =>
      effectiveCreationStep(state.value?.step ?? null, unplacedActive.value),
    );

    const stateStep = computed(() => state.value?.step ?? null);

    // A COMPLETE row with no character behind it (the character was removed): say so once.
    const endedWithoutCharacter = computed(
      () =>
        stateApplied.value &&
        stateStep.value === 'COMPLETE' &&
        input.charactersApplied.value &&
        input.characters.value.length === 0 &&
        !unplacedActive.value,
    );

    // Start gate (RESEARCH Pitfall 4): the greeting is only safe once the event subscription
    // has applied. Zero characters, and never for an unplaced active character.
    const startReady = computed(
      () =>
        connected.value &&
        input.charactersApplied.value &&
        input.characters.value.length === 0 &&
        !unplacedActive.value &&
        stateApplied.value &&
        eventsApplied.value &&
        !endedWithoutCharacter.value,
    );

    watch(
      endedWithoutCharacter,
      (ended) => {
        if (!ended || endedNoticed) return;
        // Same callback-order hazard as the hand-off below (review WR-05): the finalize burst
        // refreshes the state, characters and player bindings one table callback at a time, so a
        // sync reading can say "COMPLETE, characters applied and empty" before the character row
        // lands. The condition is confirmed after the whole burst, and a reset cancels a pending check.
        const epoch = resetEpoch;
        queueMicrotask(() => {
          if (disposed || endedNoticed || epoch !== resetEpoch || !endedWithoutCharacter.value) return;
          endedNoticed = true;
          feed.appendError(ENDED_WITHOUT_CHARACTER_TEXT);
        });
      },
      { immediate: true, flush: 'sync' },
    );

    // Defensive one-shot hand-off.
    watch(
      stateStep,
      (step) => {
        if (step === 'CONFIRMING') handoffArmed.value = true;
      },
      { immediate: true, flush: 'sync' },
    );
    const handoffReady = computed(
      () =>
        handoffArmed.value &&
        stateStep.value === 'COMPLETE' &&
        input.characters.value.length === 1 &&
        input.activeCharacterId.value === null &&
        connected.value,
    );
    watch(
      handoffReady,
      (ready) => {
        if (!ready || handoffFired) return;
        // The finalize transaction changes the state, character and player rows together, but each
        // table's SDK callback refreshes its own binding one after another. Between those callbacks
        // the three bindings can disagree (COMPLETE and one character, with the active id not yet
        // applied), so the condition is confirmed after every callback has run (review WR-03).
        queueMicrotask(() => {
          if (disposed || handoffFired || !handoffReady.value) return;
          const conn = input.conn.value;
          const only = input.characters.value[0];
          if (conn === null || only === undefined) return;
          handoffFired = true;
          void callSetActive(conn, only.id);
        });
      },
      { immediate: true, flush: 'sync' },
    );

    return {
      stateKeyed,
      genKeyed,
      eventsKeyed,
      races,
      state,
      stateApplied,
      eventsApplied,
      creationJobActive,
      regionFailed,
      endedWithoutCharacter,
      effectiveStep,
      startReady,
    };
  })!;

  async function callSetActive(conn: C, characterId: bigint): Promise<void> {
    try {
      await conn.reducers.setActiveCharacter({ characterId });
    } catch (error) {
      console.warn('[creation] set_active_character failed', error);
    }
  }

  async function callStart(): Promise<void> {
    const conn = input.conn.value;
    if (conn === null) return;
    startFailed.value = false;
    try {
      await conn.reducers.startCreation({});
    } catch {
      startFailed.value = true;
      feed.appendError(START_ERROR_TEXT);
    }
  }

  function mount(): () => void {
    mountCount.value += 1;
    // Detached: a watcher created from a component's onMounted must not leak into that scope.
    const mountScope = effectScope(true);
    mountScopes.add(mountScope);
    let started = false;
    mountScope.run(() => {
      watch(
        run.startReady,
        (ready) => {
          if (!ready || started) return;
          started = true;
          void callStart();
        },
        { immediate: true, flush: 'sync' },
      );
    });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      mountScope.stop();
      mountScopes.delete(mountScope);
      mountCount.value -= 1;
    };
  }

  function retryStart(): void {
    if (!connected.value) return;
    void callStart();
  }

  async function send(text: string): Promise<boolean> {
    const trimmed = text.trim();
    const conn = input.conn.value;
    if (trimmed === '' || !connected.value || conn === null || sending.value) return false;
    feed.appendEcho(trimmed);
    sending.value = true;
    try {
      await conn.reducers.submitCreationInput({ text: trimmed });
      return true;
    } catch {
      feed.appendError(SEND_ERROR_TEXT);
      return false;
    } finally {
      sending.value = false;
    }
  }

  function reset(): void {
    feed.clear();
    startFailed.value = false;
    sending.value = false;
    handoffArmed.value = false;
    handoffFired = false;
    endedNoticed = false;
    resetEpoch += 1;
  }

  function dispose(): void {
    disposed = true;
    for (const mountScope of mountScopes) mountScope.stop();
    mountScopes.clear();
    mountCount.value = 0;
    scope.stop();
    run.races.dispose();
    run.stateKeyed.reset();
    run.genKeyed.reset();
    run.eventsKeyed.reset();
  }

  return {
    connected,
    state: run.state,
    stateApplied: run.stateApplied,
    eventsApplied: run.eventsApplied,
    races: computed(() => run.races.rows.value),
    racesApplied: computed(() => run.races.applied.value),
    llmJobs: computed(() => input.llmJobs.value ?? NO_ROWS),
    creationJobActive: run.creationJobActive,
    unplacedActive,
    regionFailed: run.regionFailed,
    endedWithoutCharacter: run.endedWithoutCharacter,
    effectiveStep: run.effectiveStep,
    sending,
    startFailed,
    feed,
    mount,
    retryStart,
    send,
    reset,
    dispose,
  };
}
