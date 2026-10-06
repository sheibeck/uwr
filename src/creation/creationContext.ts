import { computed } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type { CharacterCreationState, MyLlmJob, RaceDefinition } from '../module_bindings/types';
import { createCreationFeedStore } from './creationFeedStore';
import type { CreationFeedStore } from './creationFeedStore';

// The creation data contract: what the creation view reads and calls. The session owns the hub
// (so the feed outlives the view, RESEARCH Pitfall 7); the view injects it through CREATION_KEY.

type List<T> = Readonly<Ref<readonly T[]>>;

export interface CreationData {
  /** The socket is connected and a connection object exists. */
  readonly connected: Readonly<Ref<boolean>>;
  /** The player's own creation row (the lowest id), or null before it exists. */
  readonly state: Readonly<Ref<CharacterCreationState | null>>;
  /** The state subscription has applied (a null state then means "no row yet"). */
  readonly stateApplied: Readonly<Ref<boolean>>;
  /** The event_creation subscription has applied (the greeting is safe to request). */
  readonly eventsApplied: Readonly<Ref<boolean>>;
  /** Stored races (race_definition), empty unless a view is mounted. */
  readonly races: List<RaceDefinition>;
  /** The race_definition subscription has applied. */
  readonly racesApplied: Readonly<Ref<boolean>>;
  /** The player's own LLM jobs (my_llm_jobs). */
  readonly llmJobs: List<MyLlmJob>;
  /** A creation-scope job (race, class, class fill, first region) is active. */
  readonly creationJobActive: Readonly<Ref<boolean>>;
  /** The active character exists but is not placed yet (finalize ran, the first region is pending). */
  readonly unplacedActive: Readonly<Ref<boolean>>;
  /** The first region failed to form for the unplaced active character. */
  readonly regionFailed: Readonly<Ref<boolean>>;
  /**
   * The creation row is COMPLETE, the characters list has applied and is empty, and there is no
   * unplaced active character: the character was removed after creation. The server has no restart
   * for this (start_creation answers "already created"), so the screen says so instead of working.
   */
  readonly endedWithoutCharacter: Readonly<Ref<boolean>>;
  /** The state step, treating an unplaced active character as COMPLETE; null before any state. */
  readonly effectiveStep: Readonly<Ref<string | null>>;
  /** A submit_creation_input call is in flight. */
  readonly sending: Readonly<Ref<boolean>>;
  /** start_creation was rejected; the view offers Retry. */
  readonly startFailed: Readonly<Ref<boolean>>;
  /** The creation feed (server rows, echoes, errors), owned by the hub. */
  readonly feed: CreationFeedStore;
  /** A view mounted: binds races and starts the interview once. Returns the release. */
  mount(): () => void;
  /** Call start_creation again after a failure and clear startFailed. */
  retryStart(): void;
  /** Echo and send one answer; true when the reducer accepted it (the draft may clear). */
  send(text: string): Promise<boolean>;
  /** Clear the feed and the flags (logout). */
  reset(): void;
  /** Dispose every binding and watcher. */
  dispose(): void;
}

export const CREATION_KEY: InjectionKey<CreationData> = Symbol('uwr.creation');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
}

export function createInertCreation(): CreationData {
  return {
    connected: constant(false),
    state: constant<CharacterCreationState | null>(null),
    stateApplied: constant(false),
    eventsApplied: constant(false),
    races: empty<RaceDefinition>(),
    racesApplied: constant(false),
    llmJobs: empty<MyLlmJob>(),
    creationJobActive: constant(false),
    unplacedActive: constant(false),
    regionFailed: constant(false),
    endedWithoutCharacter: constant(false),
    effectiveStep: constant<string | null>(null),
    sending: constant(false),
    startFailed: constant(false),
    feed: createCreationFeedStore(),
    mount: () => () => {},
    retryStart() {},
    send: () => Promise.resolve(false),
    reset() {},
    dispose() {},
  };
}
