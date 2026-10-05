import { computed, effectScope, ref, shallowRef, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { toSql } from 'spacetimedb';
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
import type { ConnectionController } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { deriveScreen } from './deriveScreen';
import type { AppScreen } from './deriveScreen';
import { buildFrameView, sortCharacters } from './frameView';
import type { FrameView } from './frameView';
import { shouldPromptReload } from './versionCheck';

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
}

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
  start(): void;
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
      conn.reducers.loginEmail({ email }).catch(failSignIn);
    },
    { immediate: true, flush: 'sync' },
  );

  const screen = computed(() =>
    deriveScreen({
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
    }),
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

  const pickerPendingId = ref<bigint | null>(null);
  const pickerFailed = ref(false);

  const disposeBindings = () => {
    for (const binding of staticBindings) binding.dispose();
    charactersBinding.value?.dispose();
    charactersBinding.value = null;
    pendingBinding.value?.dispose();
    pendingBinding.value = null;
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
    start() {
      controller.connect();
    },
    dispose() {
      stopScope();
      disposeBindings();
      controller.dispose();
    },
  };
}
