import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { SenderError, toSql } from 'spacetimedb';
import { tables } from '../module_bindings';
import type {
  AppVersion,
  Character,
  Location,
  PendingSkill,
  Player,
  Region,
  WorldState,
} from '../module_bindings/types';
import { createConnectionController, defaultControllerDeps } from '../net/connection';
import type { ConnectionController } from '../net/connection';
import { bindTable } from '../net/bindTable';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import {
  beginSpacetimeAuthLogin,
  clearAuthSession,
  getStoredEmail,
  getStoredIdToken,
} from '../auth/spacetimeAuth';
import { deriveScreen } from './deriveScreen';
import type { AppScreen } from './deriveScreen';
import { buildFrameView, sortCharacters } from './frameView';
import type { FrameView } from './frameView';
import { shouldPromptReload } from './versionCheck';
import { bindEventTable } from '../game/bindEventTable';
import { createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { createGameData } from '../game/gameData';
import type { GameConn, GameInput } from '../game/gameData';
import { gameQueries } from '../game/queries';
import { createInertCreation } from '../creation/creationContext';
import type { CreationData } from '../creation/creationContext';
import { createCreationData } from '../creation/creationData';
import type { CreationConn, CreationInput } from '../creation/creationData';
import { creationQueries } from '../creation/queries';
import { createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData } from '../ledger/ledgerContext';
import { createLedgerData } from '../ledger/ledgerData';
import type { LedgerConn, LedgerInput } from '../ledger/ledgerData';
import { ledgerQueries } from '../ledger/queries';

export interface SessionAuth {
  getStoredIdToken(): string | null;
  getStoredEmail(): string | null;
  clearAuthSession(): void;
  beginSpacetimeAuthLogin(): Promise<void>;
}

export interface SessionConn extends ConnLike {
  db: {
    myPlayer: TableLike<Player>;
    worldState: TableLike<WorldState>;
    appVersion: TableLike<AppVersion>;
    region: TableLike<Region>;
    location: TableLike<Location>;
    character: TableLike<Character>;
    pendingSkill: TableLike<PendingSkill>;
  };
  reducers: {
    loginEmail(args: { email: string }): Promise<void>;
    logout(args: {}): Promise<void>;
    setActiveCharacter(args: { characterId: bigint }): Promise<void>;
  };
}

export interface SessionQueries {
  myPlayer: string;
  worldState: string;
  appVersion: string;
  region: string;
  location: string;
  characters(userId: bigint): string;
  pendingSkills(characterId: bigint): string;
}

export interface SessionDeps<C extends SessionConn> {
  controller: ConnectionController<C>;
  auth: SessionAuth;
  bind: <Row>(options: BindTableOptions<C, Row>) => TableBinding<C, Row>;
  queries: SessionQueries;
  buildVersion: string;
  isDev: boolean;
  reloadPage(): void;
  /** Builds the game data hub. Omitted: the session carries an inert hub. */
  game?: (input: GameInput<C>) => GameData;
  /** Builds the creation hub. Omitted: the session carries an inert hub. */
  creation?: (input: CreationInput<C>) => CreationData;
  /** Builds the ledger hub (items, vendor, recipes, perks). Omitted: the session carries an inert hub. */
  ledger?: (input: LedgerInput<C>) => LedgerData;
}

export const SELECT_TIMEOUT_MS = 8000;
/** How long a connected session may sit on "Signing in…" before it reports a failure. */
export const SIGNIN_TIMEOUT_MS = 15000;
export const LOGOUT_REDUCER_CAP_MS = 2000;

export interface Session {
  readonly screen: ComputedRef<AppScreen>;
  readonly frame: ComputedRef<FrameView | null>;
  /** Own characters, oldest first. */
  readonly characters: ComputedRef<Character[]>;
  readonly pickerPendingId: Readonly<Ref<bigint | null>>;
  readonly pickerFailed: Readonly<Ref<boolean>>;
  readonly reconnecting: ComputedRef<boolean>;
  readonly nextRetryAt: Readonly<Ref<number | null>>;
  readonly versionPrompt: ComputedRef<boolean>;
  /** The game data hub (feed, rails, hotbar data); reset on logout. */
  readonly game: GameData;
  /** The creation interview hub (feed, step data, actions); reset on logout. */
  readonly creation: CreationData;
  /** The ledger hub (items, vendor stock, recipes, pending perks); reset on logout. */
  readonly ledger: LedgerData;
  start(): void;
  signIn(): void;
  selectCharacter(characterId: bigint): void;
  logout(): Promise<void>;
  reload(): void;
  dispose(): void;
}

export function defaultQueries(): SessionQueries {
  // my_player (a view) and where(...) subscriptions: never the whole public
  // player, character or pending_skill tables.
  return {
    myPlayer: toSql(tables.myPlayer),
    worldState: toSql(tables.worldState),
    appVersion: toSql(tables.appVersion),
    region: toSql(tables.region),
    location: toSql(tables.location),
    characters: (userId) => toSql(tables.character.where((r) => r.ownerUserId.eq(userId))),
    pendingSkills: (characterId) =>
      toSql(tables.pendingSkill.where((r) => r.characterId.eq(characterId))),
  };
}

/**
 * Real wiring: a fresh controller per session (the session owns it and disposes it),
 * the generated bindings and the stored-session helpers.
 */
export function createDefaultSession(options: { callbackError: unknown }): Session {
  return createSession<SessionConn & GameConn & CreationConn & LedgerConn>(
    {
      controller: createConnectionController(defaultControllerDeps()),
      auth: { getStoredIdToken, getStoredEmail, clearAuthSession, beginSpacetimeAuthLogin },
      bind: bindTable,
      queries: defaultQueries(),
      buildVersion: __BUILD_VERSION__,
      isDev: import.meta.env.DEV,
      reloadPage: () => window.location.reload(),
      game: (input) =>
        createGameData(
          { bind: bindTable, bindEvent: bindEventTable, queries: gameQueries() },
          input,
        ),
      creation: (input) =>
        createCreationData(
          { bind: bindTable, bindEvent: bindEventTable, queries: creationQueries() },
          input,
        ),
      ledger: (input) =>
        createLedgerData({ bind: bindTable, queries: ledgerQueries() }, input),
    },
    options,
  );
}

export function createSession<C extends SessionConn>(
  deps: SessionDeps<C>,
  options: { callbackError: unknown },
): Session {
  const scope = effectScope();
  const session = scope.run(() => build(deps, options, () => scope.stop()))!;
  return session;
}

function build<C extends SessionConn>(
  deps: SessionDeps<C>,
  options: { callbackError: unknown },
  stopScope: () => void,
): Session {
  const { controller, auth, queries } = deps;

  // Static subscriptions: camelCase handles only.
  const myPlayer = deps.bind<Player>({
    table: (c) => c.db.myPlayer,
    sql: [queries.myPlayer],
  });
  const worldState = deps.bind<WorldState>({
    table: (c) => c.db.worldState,
    sql: [queries.worldState],
  });
  const appVersion = deps.bind<AppVersion>({
    table: (c) => c.db.appVersion,
    sql: [queries.appVersion],
  });
  const region = deps.bind<Region>({ table: (c) => c.db.region, sql: [queries.region] });
  const location = deps.bind<Location>({ table: (c) => c.db.location, sql: [queries.location] });
  const staticBindings = [myPlayer, worldState, appVersion, region, location] as const;

  // Keyed subscriptions: replaced whenever their key changes.
  const charactersBinding = shallowRef<TableBinding<C, Character> | null>(null);
  const pendingBinding = shallowRef<TableBinding<C, PendingSkill> | null>(null);

  const hasToken = ref(auth.getStoredIdToken() !== null);
  const authFailed = ref(options.callbackError != null);
  const redirecting = ref(false);

  const player = computed(() => myPlayer.rows.value[0] ?? null);
  const userId = computed<bigint | null>(() => player.value?.userId ?? null);
  const activeCharacterId = computed<bigint | null>(() => player.value?.activeCharacterId ?? null);

  const characterRows = computed(() => charactersBinding.value?.rows.value ?? []);
  const characters = computed(() => sortCharacters(characterRows.value));
  const activeCharacter = computed(() => {
    const id = activeCharacterId.value;
    if (id === null) return null;
    return characterRows.value.find((c) => c.id === id) ?? null;
  });

  // The binding keeps its rows through a disconnect and drops the stale ones when
  // the new connection applies, so a plain re-attach is all a reconnect needs.
  watch(
    controller.conn,
    (conn) => {
      for (const binding of staticBindings) binding.attach(conn);
      charactersBinding.value?.attach(conn);
      pendingBinding.value?.attach(conn);
    },
    { immediate: true, flush: 'sync' },
  );

  watch(
    userId,
    (id) => {
      charactersBinding.value?.dispose();
      charactersBinding.value = null;
      if (id === null) return;
      const binding = deps.bind<Character>({
        table: (c) => c.db.character,
        sql: [queries.characters(id)],
        filter: (row) => row.ownerUserId === id,
      });
      binding.attach(controller.conn.value);
      charactersBinding.value = binding;
    },
    { immediate: true, flush: 'sync' },
  );

  watch(
    activeCharacterId,
    (id) => {
      pendingBinding.value?.dispose();
      pendingBinding.value = null;
      if (id === null) return;
      const binding = deps.bind<PendingSkill>({
        table: (c) => c.db.pendingSkill,
        sql: [queries.pendingSkills(id)],
        filter: (row) => row.characterId === id,
      });
      binding.attach(controller.conn.value);
      pendingBinding.value = binding;
    },
    { immediate: true, flush: 'sync' },
  );

  watch(
    controller.status,
    (status) => {
      // The controller already cleared the stored session in these states.
      if (status === 'rejected' || status === 'expired') hasToken.value = false;
    },
    { immediate: true, flush: 'sync' },
  );

  const failSignIn = () => {
    authFailed.value = true;
    auth.clearAuthSession();
    hasToken.value = false;
    controller.disconnect();
  };

  // login_email once per connection, as soon as the player row says nobody is logged in.
  let loginSentFor: C | null = null;
  watch(
    [controller.status, controller.conn, myPlayer.applied, player, userId],
    () => {
      const conn = controller.conn.value;
      if (controller.status.value !== 'connected' || !conn) return;
      if (!myPlayer.applied.value || player.value === null) return;
      if (userId.value !== null || loginSentFor === conn) return;
      loginSentFor = conn;
      const email = auth.getStoredEmail();
      if (!email) {
        failSignIn();
        return;
      }
      conn.reducers.loginEmail({ email }).catch((error: unknown) => {
        // A socket drop mid-call, or a late rejection from a connection that has since
        // been replaced, says nothing about the credentials: the reconnect path sends
        // loginEmail again on the new connection.
        if (controller.conn.value !== conn || controller.status.value !== 'connected') {
          console.warn('[session] loginEmail interrupted; waiting for the reconnect', error);
          return;
        }
        // The SDK rejects a reducer call with SenderError (the server refused it) or
        // InternalError (a runtime fault). Only a refusal means these credentials are bad;
        // anything else keeps them and leaves recovery to the sign-in watchdog or a reconnect.
        if (!(error instanceof SenderError)) {
          console.warn('[session] loginEmail failed without a server refusal', error);
          return;
        }
        failSignIn();
      });
    },
    { immediate: true, flush: 'sync' },
  );

  const bindingFailed = computed(
    () => myPlayer.failed.value || (charactersBinding.value?.failed.value ?? false),
  );
  const signInTimedOut = ref(false);

  const screenInput = computed(() => ({
    redirecting: redirecting.value,
    authFailed: authFailed.value,
    hasToken: hasToken.value,
    status: controller.status.value,
    playerLoaded: myPlayer.applied.value && player.value !== null,
    userId: userId.value,
    activeCharacterId: activeCharacterId.value,
    charactersApplied: charactersBinding.value?.applied.value ?? false,
    characterCount: characterRows.value.length,
    activeCharacterLoaded: activeCharacter.value !== null,
    activeCharacterPlaced: activeCharacter.value !== null && activeCharacter.value.locationId !== 0n,
  }));

  const screen = computed(() =>
    deriveScreen({
      ...screenInput.value,
      bindingFailed: bindingFailed.value,
      signInTimedOut: signInTimedOut.value,
    }),
  );

  // Watchdog: a connected session that keeps waiting for its data (no player row, a
  // character that never loads) must end in the sign-in failure splash. It is judged on
  // the data alone, never on the timeout itself, so expiring does not restart the clock.
  const awaitingSessionData = computed(() => {
    const result = deriveScreen({
      ...screenInput.value,
      status: controller.status.value,
      bindingFailed: false,
      signInTimedOut: false,
    });
    return (
      controller.status.value === 'connected' &&
      result.kind === 'splash' &&
      result.state === 'signingIn'
    );
  });
  let signInTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSignInTimer = () => {
    if (signInTimer !== null) {
      clearTimeout(signInTimer);
      signInTimer = null;
    }
  };
  watch(
    awaitingSessionData,
    (waiting) => {
      clearSignInTimer();
      signInTimedOut.value = false;
      if (!waiting) return;
      signInTimer = setTimeout(() => {
        signInTimer = null;
        console.warn('[session] timed out waiting for the signed-in session data');
        signInTimedOut.value = true;
      }, SIGNIN_TIMEOUT_MS);
    },
    { immediate: true, flush: 'sync' },
  );

  const frame = computed<FrameView | null>(() => {
    const character = activeCharacter.value;
    if (!character) return null;
    return buildFrameView({
      character,
      locations: location.rows.value,
      regions: region.rows.value,
      worldState: worldState.rows.value,
      pendingSkills: pendingBinding.value?.rows.value ?? [],
    });
  });

  const reconnecting = computed(() => controller.status.value === 'reconnecting');
  const versionPrompt = computed(() =>
    shouldPromptReload(appVersion.rows.value[0], deps.buildVersion, deps.isDev),
  );

  const game: GameData = deps.game
    ? deps.game({
        conn: controller.conn,
        status: controller.status,
        userId,
        character: activeCharacter,
        locations: location.rows,
        regions: region.rows,
      })
    : createInertGame();

  const creation: CreationData = deps.creation
    ? deps.creation({
        conn: controller.conn,
        status: controller.status,
        identity: computed(() => player.value?.id ?? null),
        charactersApplied: computed(() => charactersBinding.value?.applied.value ?? false),
        characters,
        activeCharacterId,
        activeCharacter,
        llmJobs: game.llmJobs,
      })
    : createInertCreation();

  const ledger: LedgerData = deps.ledger
    ? deps.ledger({
        conn: controller.conn,
        status: controller.status,
        activeCharacterId,
      })
    : createInertLedger();

  const pickerPendingId = ref<bigint | null>(null);
  const pickerFailed = ref(false);
  let selectTimer: ReturnType<typeof setTimeout> | null = null;

  const disposeBindings = () => {
    for (const binding of staticBindings) binding.dispose();
    charactersBinding.value?.dispose();
    charactersBinding.value = null;
    pendingBinding.value?.dispose();
    pendingBinding.value = null;
  };

  const clearSelectTimer = () => {
    if (selectTimer !== null) {
      clearTimeout(selectTimer);
      selectTimer = null;
    }
  };
  const resetPicker = () => {
    clearSelectTimer();
    pickerPendingId.value = null;
    pickerFailed.value = false;
  };
  const failSelection = () => {
    clearSelectTimer();
    pickerPendingId.value = null;
    pickerFailed.value = true;
  };

  // The server accepted the choice: the player row now names the active character.
  watch(
    activeCharacterId,
    (id) => {
      if (id !== null) resetPicker();
    },
    { flush: 'sync' },
  );

  const signIn = () => {
    // A second call (the window Enter handler plus the button click) would overwrite the
    // PKCE verifier and state of the first, and the callback would fail "Invalid auth state".
    if (redirecting.value) return;
    authFailed.value = false;
    redirecting.value = true;
    // Async: a synchronous try/catch would miss a rejected promise.
    auth.beginSpacetimeAuthLogin().catch((error: unknown) => {
      console.warn('[session] could not start sign-in', error);
      redirecting.value = false;
      authFailed.value = true;
    });
  };

  // Back from the IdP page restores this page from the bfcache with `redirecting` still
  // true: reset it so the button works again.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) redirecting.value = false;
  };
  if (typeof window !== 'undefined') window.addEventListener('pageshow', onPageShow);

  const selectCharacter = (characterId: bigint) => {
    if (pickerPendingId.value !== null) return;
    const conn = controller.conn.value;
    if (controller.status.value !== 'connected' || !conn) {
      pickerFailed.value = true;
      return;
    }
    pickerPendingId.value = characterId;
    pickerFailed.value = false;
    // set_active_character is a silent no-op in combat: time out instead of waiting forever.
    selectTimer = setTimeout(failSelection, SELECT_TIMEOUT_MS);
    conn.reducers.setActiveCharacter({ characterId }).catch(failSelection);
  };

  const logout = async () => {
    const conn = controller.conn.value;
    if (controller.status.value === 'connected' && conn) {
      await new Promise<void>((resolve) => {
        const cap = setTimeout(resolve, LOGOUT_REDUCER_CAP_MS);
        const settle = () => {
          clearTimeout(cap);
          resolve();
        };
        try {
          conn.reducers.logout({}).then(settle, settle);
        } catch {
          settle();
        }
      });
    }
    auth.clearAuthSession();
    hasToken.value = false;
    controller.disconnect(); // intentional: no retry
    disposeBindings();
    // No stale rows or feed lines may reach the next sign-in.
    game.reset();
    creation.reset();
    ledger.reset();
    loginSentFor = null;
    authFailed.value = false;
    redirecting.value = false;
    clearSignInTimer();
    signInTimedOut.value = false;
    resetPicker();
  };

  return {
    screen,
    frame,
    characters,
    pickerPendingId,
    pickerFailed,
    reconnecting,
    nextRetryAt: controller.nextRetryAt,
    versionPrompt,
    game,
    creation,
    ledger,
    start() {
      controller.connect();
    },
    signIn,
    selectCharacter,
    logout,
    reload() {
      deps.reloadPage();
    },
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('pageshow', onPageShow);
      stopScope();
      clearSignInTimer();
      clearSelectTimer();
      disposeBindings();
      game.dispose();
      creation.dispose();
      ledger.dispose();
      controller.dispose();
    },
  };
}
