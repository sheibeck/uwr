// The per-frame combat controller (48-CONTEXT "Targeting enemies", "Ally targeting (A7, A26)";
// 48-UI-SPEC "Keyboard (CMB-01)"; RESEARCH Q6).
//
// One instance per frame, provided through COMBAT_KEY. It owns the last requested target, the
// hidden 'Target: {name}' status line, the ally selection and the shared round clock.
//
// Keyboard: Tab and Shift+Tab cycle living hostiles only inside the combat scope (connected,
// no screen or account menu open, no Ctrl/Meta/Alt, not a repeat or composition, focus on the
// page body or inside the encounter panel or the feed). preventDefault is called only when the
// key changed the target, so everywhere else Tab keeps its native focus behavior. Esc inside the
// panel or the feed blurs the focused element: keyboard users are never trapped (A4).
//
// Must be called inside a component setup or an effect scope: the ticker and the watchers stop
// with that scope, and dispose() removes the one document keydown listener.

import { computed, effectScope, shallowRef, watch } from 'vue';
import type { CombatController, FrameControls, GameData } from '../game/context';
import { useCooldownTicker } from '../hotbar/useCooldownTicker';
import { allyResetNeeded, allyTargetFor } from './ally';
import { nextTargetId } from './cycling';
import { roundTimer } from './roundClock';

const COMBAT_SCOPE_SELECTOR = '.encounter-panel, .feed-region';

function isTextField(element: Element | null): boolean {
  if (element === null) return false;
  const tag = element.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((element as HTMLElement).isContentEditable === true) return true;
  const editable = element.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

function compareIds(a: bigint, b: bigint): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function createCombatController(input: { game: GameData; frame: FrameControls }): CombatController {
  const { game, frame } = input;
  const combat = game.combat;

  const scope = effectScope();

  const selectedAlly = shallowRef<bigint | null>(null);
  const targetStatus = shallowRef('');
  // Plain value: only the next cycle reads it, so rapid presses advance before the server echo.
  // It is a cycle base, never shown. A rejected call rolls it back; a refusal the server writes
  // into the feed names an enemy that is not living in this fight, which the cycle already skips.
  let lastRequested: bigint | null = null;

  const allyTargetId = computed<bigint | null>(() => selectedAlly.value ?? game.characterId.value);

  // ---- targets -------------------------------------------------------------------------------

  function announceTarget(enemyId: bigint): void {
    const enemy = combat.enemies.value.find((row) => row.id === enemyId);
    targetStatus.value = enemy === undefined ? '' : `Target: ${enemy.displayName}`;
  }

  /** Sends set_combat_target for a living hostile; false when nothing was requested. */
  function send(enemyId: bigint): boolean {
    const reducers = game.reducers.value;
    const characterId = game.characterId.value;
    if (reducers === null || characterId === null) return false;
    const enemy = combat.enemies.value.find((row) => row.id === enemyId);
    if (enemy === undefined || enemy.currentHp <= 0n) return false;
    lastRequested = enemyId;
    // The status line follows the server: it is announced when the character's confirmed
    // combatTargetEnemyId echoes this request (the watcher below), not on the click.
    if (game.character.value?.combatTargetEnemyId === enemyId) announceTarget(enemyId);
    void (async () => {
      try {
        await reducers.setCombatTarget({ characterId, enemyId });
      } catch (error) {
        // Only roll back when nothing newer was requested meanwhile.
        if (lastRequested === enemyId) lastRequested = null;
        console.warn('[combat] set_combat_target failed', error);
      }
    })();
    return true;
  }

  function requestTarget(enemyId: bigint): void {
    send(enemyId);
  }

  function cycle(dir: 1 | -1): boolean {
    const living = combat.enemies.value
      .filter((row) => row.currentHp > 0n)
      .map((row) => row.id)
      .sort(compareIds);
    const current = game.character.value?.combatTargetEnemyId ?? null;
    const next = nextTargetId(living, current, lastRequested, dir);
    if (next === null) return false;
    return send(next);
  }

  // ---- ally ----------------------------------------------------------------------------------

  function selectAlly(characterId: bigint): void {
    selectedAlly.value = characterId === game.characterId.value ? null : characterId;
  }

  function hpOf(characterId: bigint): bigint | null {
    const own = game.character.value;
    if (own !== null && own.id === characterId) return own.hp;
    const known = game.knownCharacters.value.find((row) => row.id === characterId);
    return known === undefined ? null : known.hp;
  }

  function allyArgFor(ability: { targetRule: string }): bigint | undefined {
    return allyTargetFor({
      targetRule: ability.targetRule,
      selectedId: allyTargetId.value,
      participants: combat.participants.value,
      hpOf,
    });
  }

  // ---- clock ---------------------------------------------------------------------------------

  const clockActive = computed(() => combat.active.value && combat.openRound.value !== null);
  const { timer, resolving } = scope.run(() => {
    const ticker = useCooldownTicker({ clock: game.clock, active: clockActive });
    const timerState = computed(() =>
      roundTimer(clockActive.value ? combat.openRound.value : null, ticker.nowMicros.value),
    );
    const resolvingState = computed(() => timerState.value.resolving);

    watch(
      [combat.active, combat.participants, game.groupMembers, game.characterId],
      () => {
        const selfId = game.characterId.value;
        const partyIds = new Set<bigint>(game.groupMembers.value.map((row) => row.characterId));
        if (selfId !== null) partyIds.add(selfId);
        if (
          allyResetNeeded({
            selectedId: selectedAlly.value,
            selfId,
            active: combat.active.value,
            participants: combat.participants.value,
            partyIds,
          })
        ) {
          selectedAlly.value = null;
        }
        if (!combat.active.value) {
          lastRequested = null;
          targetStatus.value = '';
        }
      },
      { flush: 'sync' },
    );

    // The countdown reads the server-clock estimate, which only feed events used to sample. A client
    // clock that runs ahead of the server would read the open round as expired and lock the round
    // controls, so a round that arrives live samples its startedAt too. Live means:
    //   - the round binding has applied (a snapshot is published before the applied flag flips, so
    //     only later rows pass), or
    //   - this controller has seen combat.active === false and the row is Round 1, the fresh start
    //     of a fight that began while it was watching.
    // Anything else is a snapshot (a reload, a late join or a reconnect) that can be up to one round
    // old, so it never samples: it would bias the estimate behind a correct clock.
    let seenInactive = false;
    watch(
      combat.active,
      (active) => {
        if (!active) seenInactive = true;
      },
      { flush: 'sync', immediate: true },
    );
    let lastSeenRound: { combatId: bigint; roundNumber: bigint } | null = null;
    watch(
      combat.openRound,
      (round) => {
        if (round === null) return;
        const prev = lastSeenRound;
        if (prev !== null && prev.combatId === round.combatId && prev.roundNumber === round.roundNumber) return;
        lastSeenRound = { combatId: round.combatId, roundNumber: round.roundNumber };
        const live = combat.roundsApplied.value || (seenInactive && round.roundNumber === 1n);
        if (!live || round.startedAtMicros === 0n) return;
        game.clock.sample(round.startedAtMicros);
      },
      { flush: 'sync' },
    );

    watch(
      () => game.character.value?.combatTargetEnemyId ?? null,
      (confirmed) => {
        if (!combat.active.value || confirmed === null || confirmed !== lastRequested) return;
        announceTarget(confirmed);
      },
      { flush: 'sync' },
    );

    return { timer: timerState, resolving: resolvingState };
  })!;

  const down = computed(() => game.character.value?.hp === 0n);

  // ---- keyboard ------------------------------------------------------------------------------

  function inCombatScope(active: Element | null): boolean {
    if (active === null || active === document.body || active === document.documentElement) return true;
    return active.closest(COMBAT_SCOPE_SELECTOR) !== null;
  }

  function typingTarget(event: KeyboardEvent): boolean {
    if (isTextField(document.activeElement)) return true;
    return event.target instanceof Element && isTextField(event.target);
  }

  function onTab(event: KeyboardEvent): void {
    if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!combat.active.value || !game.connected.value || game.reducers.value === null) return;
    if (frame.activeScreen.value !== null) return;
    if (document.querySelector('[role="menu"]') !== null) return;
    if (typingTarget(event)) return;
    if (!inCombatScope(document.activeElement)) return;
    if (cycle(event.shiftKey ? -1 : 1)) event.preventDefault();
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.isComposing || !combat.active.value) return;
    if (frame.activeScreen.value !== null) return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    if (isTextField(active) || typingTarget(event)) return;
    if (active.closest(COMBAT_SCOPE_SELECTOR) === null) return;
    active.blur();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.key === 'Tab') onTab(event);
    else if (event.key === 'Escape') onEscape(event);
  }

  document.addEventListener('keydown', onKeydown);

  function dispose(): void {
    document.removeEventListener('keydown', onKeydown);
    scope.stop();
  }

  return {
    allyTargetId,
    timer,
    resolving,
    down,
    targetStatus,
    selectAlly,
    requestTarget,
    cycle,
    allyArgFor,
    dispose,
  };
}
