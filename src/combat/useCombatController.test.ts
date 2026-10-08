// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope, Ref } from 'vue';
import { createServerClock } from '../game/serverClock';
import { createCombatController } from './useCombatController';
import { createInertCombatData, createInertGame } from '../game/context';
import type { CombatController, FrameControls, GameData } from '../game/context';
import type { ActiveScreen } from '../frame/useScreens';

interface Fake {
  game: GameData;
  frame: FrameControls;
  setCombatTarget: ReturnType<typeof vi.fn>;
  character: Ref<Record<string, unknown> | null>;
  connected: Ref<boolean>;
  reducers: Ref<unknown>;
  activeScreen: Ref<ActiveScreen>;
  active: Ref<boolean>;
  enemies: Ref<unknown[]>;
  participants: Ref<unknown[]>;
  openRound: Ref<unknown>;
  roundsApplied: Ref<boolean>;
  participantApplied: Ref<boolean>;
  groupMembers: Ref<unknown[]>;
  knownCharacters: Ref<unknown[]>;
  characterId: Ref<bigint | null>;
  setNow(micros: number): void;
}

let now = 1_000_000_000;
let scope: EffectScope | null = null;
let controller: CombatController | null = null;

function enemy(id: bigint, name: string, currentHp = 10n): Record<string, unknown> {
  return { id, combatId: 1n, enemyTemplateId: 1n, displayName: name, currentHp, maxHp: 10n };
}

/** Bo (8): in your party (group 5), online, at your place (10), 30 HP. */
function bo(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 8n, name: 'Bo', groupId: 5n, locationId: 10n, online: true, hp: 30n, ...over };
}

function build(over: { targetId?: bigint } = {}): Fake {
  const setCombatTarget = vi.fn().mockResolvedValue(undefined);
  const character = ref<Record<string, unknown> | null>({
    id: 5n,
    hp: 100n,
    groupId: 5n,
    locationId: 10n,
    online: true,
    combatTargetEnemyId: over.targetId ?? 3n,
  });
  const characterId = ref<bigint | null>(5n);
  const connected = ref(true);
  const reducers = ref<unknown>({ setCombatTarget });
  const activeScreen = ref<ActiveScreen>(null);
  const active = ref(true);
  const enemies = ref<unknown[]>([enemy(3n, 'Fangling'), enemy(5n, 'Rotfang'), enemy(9n, 'Cinderhound')]);
  const participants = ref<unknown[]>([
    { id: 1n, combatId: 1n, characterId: 5n, status: 'active' },
    { id: 2n, combatId: 1n, characterId: 8n, status: 'active' },
  ]);
  const openRound = ref<unknown>(null);
  const roundsApplied = ref(false);
  const participantApplied = ref(false);
  const groupMembers = ref<unknown[]>([{ id: 1n, characterId: 5n }, { id: 2n, characterId: 8n }]);
  const knownCharacters = ref<unknown[]>([bo()]);
  const game = {
    ...createInertGame(),
    connected,
    character,
    characterId,
    reducers,
    groupMembers,
    knownCharacters,
    clock: { nowMicros: () => now },
    combat: { ...createInertCombatData(), active, enemies, participants, openRound, roundsApplied, participantApplied },
  } as unknown as GameData;
  const frame = {
    isDesktop: ref(true),
    activeScreen,
    openScreen() {},
    closeScreen() {},
  } as unknown as FrameControls;
  return {
    game,
    frame,
    setCombatTarget,
    character,
    connected,
    reducers,
    activeScreen,
    active,
    enemies,
    participants,
    openRound,
    roundsApplied,
    participantApplied,
    groupMembers,
    knownCharacters,
    characterId,
    setNow(micros) {
      now = micros;
    },
  };
}

function confirmTarget(fake: Fake, enemyId: bigint): void {
  fake.character.value = { ...fake.character.value, combatTargetEnemyId: enemyId };
}

function start(fake: Fake): CombatController {
  scope = effectScope();
  controller = scope.run(() => createCombatController({ game: fake.game, frame: fake.frame }))!;
  return controller;
}

function key(init: KeyboardEventInit & { key: string }, target: EventTarget = document): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function focusable(tag: 'button' | 'input' | 'textarea', parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement(tag);
  parent.appendChild(el);
  el.focus();
  return el;
}

function region(className: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  now = 1_000_000_000;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  controller?.dispose();
  controller = null;
  scope?.stop();
  scope = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestTarget', () => {
  it('requests a living hostile once and sets the status line when the server echoes it', () => {
    const fake = build();
    const c = start(fake);
    c.requestTarget(9n);
    expect(fake.setCombatTarget).toHaveBeenCalledTimes(1);
    expect(fake.setCombatTarget).toHaveBeenCalledWith({ characterId: 5n, enemyId: 9n });
    // Nothing is announced before the subscription confirms the target.
    expect(c.targetStatus.value).toBe('');
    confirmTarget(fake, 9n);
    expect(c.targetStatus.value).toBe('Target: Cinderhound');
  });

  it('announces at once when the confirmed target already is the requested one', () => {
    const fake = build();
    const c = start(fake);
    c.requestTarget(3n);
    expect(c.targetStatus.value).toBe('Target: Fangling');
  });

  it('does not announce a target the server never confirmed', () => {
    const fake = build();
    const c = start(fake);
    c.requestTarget(9n);
    // The server kept the old target (a refusal written to the feed): no echo, no status.
    expect(c.targetStatus.value).toBe('');
    // A different server-side change is not the requested one either.
    confirmTarget(fake, 5n);
    expect(c.targetStatus.value).toBe('');
  });

  it('rolls the cycle base back when the reducer rejects, so Tab continues from the confirmed target', async () => {
    const fake = build();
    fake.setCombatTarget.mockRejectedValueOnce(new Error('refused'));
    start(fake);
    // Confirmed target 3n. Tab requests 5n, which is rejected.
    key({ key: 'Tab' });
    await Promise.resolve();
    await Promise.resolve();
    // Without the rollback the base would be 5n and this Tab would request 9n.
    key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenNthCalledWith(1, { characterId: 5n, enemyId: 5n });
    expect(fake.setCombatTarget).toHaveBeenNthCalledWith(2, { characterId: 5n, enemyId: 5n });
  });

  it('keeps a newer request when an older one is rejected', async () => {
    const fake = build();
    fake.setCombatTarget.mockRejectedValueOnce(new Error('refused'));
    start(fake);
    key({ key: 'Tab' }); // 5n, rejected later
    key({ key: 'Tab' }); // 9n, newer
    await Promise.resolve();
    await Promise.resolve();
    key({ key: 'Tab' }); // base is still 9n -> wraps to 3n
    expect(fake.setCombatTarget).toHaveBeenNthCalledWith(3, { characterId: 5n, enemyId: 3n });
  });

  it('never requests a defeated hostile', () => {
    const fake = build();
    fake.enemies.value = [enemy(3n, 'Fangling'), enemy(9n, 'Rotfang', 0n)];
    const c = start(fake);
    c.requestTarget(9n);
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
    expect(c.targetStatus.value).toBe('');
  });

  it('never requests an unknown hostile', () => {
    const fake = build();
    start(fake).requestTarget(77n);
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
  });

  it('calls nothing while offline', () => {
    const fake = build();
    fake.reducers.value = null;
    start(fake).requestTarget(9n);
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
  });

  it('catches and logs a rejected reducer call', async () => {
    const fake = build();
    const failure = new Error('refused');
    fake.setCombatTarget.mockRejectedValue(failure);
    start(fake).requestTarget(9n);
    await Promise.resolve();
    await Promise.resolve();
    expect(console.warn).toHaveBeenCalledWith('[combat] set_combat_target failed', failure);
  });
});

describe('Tab cycling', () => {
  it('targets the next living hostile and prevents the default', () => {
    const fake = build();
    start(fake);
    const event = key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenCalledWith({ characterId: 5n, enemyId: 5n });
    expect(event.defaultPrevented).toBe(true);
  });

  it('advances from the last requested target before the server echo', () => {
    const fake = build();
    start(fake);
    key({ key: 'Tab' });
    key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenNthCalledWith(1, { characterId: 5n, enemyId: 5n });
    expect(fake.setCombatTarget).toHaveBeenNthCalledWith(2, { characterId: 5n, enemyId: 9n });
  });

  it('Shift+Tab goes to the previous hostile, wrapping', () => {
    const fake = build();
    start(fake);
    const event = key({ key: 'Tab', shiftKey: true });
    expect(fake.setCombatTarget).toHaveBeenCalledWith({ characterId: 5n, enemyId: 9n });
    expect(event.defaultPrevented).toBe(true);
  });

  it('picks the first (Tab) or last (Shift+Tab) when nothing is targeted', () => {
    const fake = build();
    fake.character.value = { id: 5n, hp: 40n };
    start(fake);
    key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenLastCalledWith({ characterId: 5n, enemyId: 3n });
  });

  it('Shift+Tab picks the last hostile when nothing is targeted', () => {
    const fake = build();
    fake.character.value = { id: 5n, hp: 40n };
    start(fake);
    key({ key: 'Tab', shiftKey: true });
    expect(fake.setCombatTarget).toHaveBeenLastCalledWith({ characterId: 5n, enemyId: 9n });
  });

  it('skips defeated hostiles', () => {
    const fake = build();
    fake.enemies.value = [enemy(3n, 'Fangling'), enemy(5n, 'Rotfang', 0n), enemy(9n, 'Cinderhound')];
    start(fake);
    key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenCalledWith({ characterId: 5n, enemyId: 9n });
  });

  it('is a native no-op with one living hostile already targeted', () => {
    const fake = build();
    fake.enemies.value = [enemy(3n, 'Fangling'), enemy(5n, 'Rotfang', 0n)];
    start(fake);
    const event = key({ key: 'Tab' });
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('is a native no-op with no living hostile', () => {
    const fake = build();
    fake.enemies.value = [enemy(3n, 'Fangling', 0n)];
    start(fake);
    const event = key({ key: 'Tab' });
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('acts with focus on a button inside the encounter panel', () => {
    const fake = build();
    start(fake);
    focusable('button', region('encounter-panel'));
    const event = key({ key: 'Tab' });
    expect(fake.setCombatTarget).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('acts with focus on a button inside the feed', () => {
    const fake = build();
    start(fake);
    focusable('button', region('feed-region'));
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(true);
    expect(fake.setCombatTarget).toHaveBeenCalledTimes(1);
  });

  describe('is ignored (native Tab) when', () => {
    function expectIgnored(fake: Fake, init: KeyboardEventInit = {}): void {
      const event = key({ key: 'Tab', ...init });
      expect(fake.setCombatTarget).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }

    it('an input has focus', () => {
      const fake = build();
      start(fake);
      focusable('input');
      expectIgnored(fake);
    });

    it('a textarea inside the feed has focus', () => {
      const fake = build();
      start(fake);
      focusable('textarea', region('feed-region'));
      expectIgnored(fake);
    });

    it('a button outside the panel and the feed has focus', () => {
      const fake = build();
      start(fake);
      focusable('button');
      expectIgnored(fake);
    });

    it('the map screen is open', () => {
      const fake = build();
      fake.activeScreen.value = 'map';
      start(fake);
      expectIgnored(fake);
    });

    it('the encounter sheet is open', () => {
      const fake = build();
      fake.activeScreen.value = 'encounter';
      start(fake);
      expectIgnored(fake);
    });

    it('a menu (the account menu) is open', () => {
      const fake = build();
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
      start(fake);
      expectIgnored(fake);
    });

    it('Ctrl, Meta or Alt is held', () => {
      const fake = build();
      start(fake);
      expectIgnored(fake, { ctrlKey: true });
      expectIgnored(fake, { metaKey: true });
      expectIgnored(fake, { altKey: true });
    });

    it('the key repeats or a composition is running', () => {
      const fake = build();
      start(fake);
      expectIgnored(fake, { repeat: true });
      expectIgnored(fake, { isComposing: true });
    });

    it('offline', () => {
      const fake = build();
      fake.connected.value = false;
      start(fake);
      expectIgnored(fake);
      fake.connected.value = true;
      fake.reducers.value = null;
      expectIgnored(fake);
    });

    it('combat is not active', () => {
      const fake = build();
      fake.active.value = false;
      start(fake);
      expectIgnored(fake);
    });
  });
});

describe('Escape', () => {
  it('blurs a button focused inside the encounter panel', () => {
    const fake = build();
    start(fake);
    const button = focusable('button', region('encounter-panel'));
    expect(document.activeElement).toBe(button);
    key({ key: 'Escape' });
    expect(document.activeElement).toBe(document.body);
  });

  it('blurs a button focused inside the feed', () => {
    const fake = build();
    start(fake);
    const button = focusable('button', region('feed-region'));
    key({ key: 'Escape' });
    expect(document.activeElement).not.toBe(button);
  });

  it('leaves an input alone', () => {
    const fake = build();
    start(fake);
    const input = focusable('input', region('feed-region'));
    key({ key: 'Escape' });
    expect(document.activeElement).toBe(input);
  });

  it('leaves a button outside the panel and the feed alone', () => {
    const fake = build();
    start(fake);
    const button = focusable('button');
    key({ key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });

  it('does nothing with a screen open', () => {
    const fake = build();
    fake.activeScreen.value = 'map';
    start(fake);
    const button = focusable('button', region('encounter-panel'));
    key({ key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });

  it('does nothing outside combat', () => {
    const fake = build();
    fake.active.value = false;
    start(fake);
    const button = focusable('button', region('encounter-panel'));
    key({ key: 'Escape' });
    expect(document.activeElement).toBe(button);
  });
});

describe('ally selection', () => {
  it('defaults to the player and follows selectAlly', () => {
    const c = start(build());
    expect(c.allyTargetId.value).toBe(5n);
    c.selectAlly(8n);
    expect(c.allyTargetId.value).toBe(8n);
    c.selectAlly(5n);
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('keeps an ally who is still in the party, online and here when the fight ends, and clears the target memory', async () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    c.requestTarget(9n);
    confirmTarget(fake, 9n);
    expect(c.targetStatus.value).toBe('Target: Cinderhound');
    fake.active.value = false;
    await nextTick();
    expect(c.allyTargetId.value).toBe(8n);
    expect(c.targetStatus.value).toBe('');
  });

  it('a fight ending drops an ally who is no longer here', async () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.knownCharacters.value = [bo({ locationId: 11n })];
    expect(c.allyTargetId.value).toBe(8n);
    fake.active.value = false;
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('resets when the ally participant row is gone', () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.participants.value = [{ id: 1n, combatId: 1n, characterId: 5n, status: 'active' }];
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('resets when the ally leaves the party', () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.groupMembers.value = [{ id: 1n, characterId: 5n }];
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('keeps a dead ally selected', () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.participants.value = [
      { id: 1n, combatId: 1n, characterId: 5n, status: 'active' },
      { id: 2n, combatId: 1n, characterId: 8n, status: 'dead' },
    ];
    expect(c.allyTargetId.value).toBe(8n);
  });
});

// Owner 2026-10-08: tap a party member to target them, everywhere. Out of combat the selection
// persists and follows @game-data/ally_target_rules (same party, online, here, standing).
describe('ally selection out of combat', () => {
  function peace(): { fake: Fake; c: CombatController } {
    const fake = build();
    fake.active.value = false;
    fake.participants.value = [];
    return { fake, c: start(fake) };
  }

  it('keeps a selected ally across ticks and unrelated row updates', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    expect(c.allyTargetId.value).toBe(8n);
    await nextTick();
    expect(c.allyTargetId.value).toBe(8n);
    fake.knownCharacters.value = [
      bo({ hp: 25n }),
      { id: 12n, name: 'Stranger', groupId: undefined, locationId: 40n, online: true, hp: 10n },
    ];
    fake.character.value = { ...fake.character.value, hp: 90n };
    await nextTick();
    expect(c.allyTargetId.value).toBe(8n);
  });

  it('goes back to you when the ally goes offline', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.knownCharacters.value = [bo({ online: false })];
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('goes back to you when the ally moves away', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.knownCharacters.value = [bo({ locationId: 11n })];
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('goes back to you when the ally leaves the party', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.knownCharacters.value = [bo({ groupId: 6n })];
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('goes back to you when the ally row disappears', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.knownCharacters.value = [];
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('goes back to you when you move away and the ally stays', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.character.value = { ...fake.character.value, locationId: 11n };
    await nextTick();
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('keeps the ally when you both move in the same tick (your row first)', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.character.value = { ...fake.character.value, locationId: 11n };
    fake.knownCharacters.value = [bo({ locationId: 11n })];
    await nextTick();
    expect(c.allyTargetId.value).toBe(8n);
  });

  it('keeps a fallen ally selected, but sends no id for them', async () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.knownCharacters.value = [bo({ hp: 0n })];
    await nextTick();
    expect(c.allyTargetId.value).toBe(8n);
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBeUndefined();
  });

  it('canSelectAlly: you always, an ok member yes, an offline or elsewhere member no', () => {
    const { fake, c } = peace();
    expect(c.canSelectAlly(5n)).toBe(true);
    expect(c.canSelectAlly(8n)).toBe(true);
    fake.knownCharacters.value = [bo({ online: false })];
    expect(c.canSelectAlly(8n)).toBe(false);
    fake.knownCharacters.value = [bo({ locationId: 11n })];
    expect(c.canSelectAlly(8n)).toBe(false);
  });

  it('canSelectAlly is true for anyone in a fight', () => {
    const fake = build();
    fake.knownCharacters.value = [bo({ online: false, locationId: 11n })];
    const c = start(fake);
    expect(c.canSelectAlly(8n)).toBe(true);
  });

  it('selectAlly of an offline or elsewhere member out of combat leaves the selection unchanged', () => {
    const { fake, c } = peace();
    fake.knownCharacters.value = [bo({ online: false })];
    c.selectAlly(8n);
    expect(c.allyTargetId.value).toBe(5n);
    fake.knownCharacters.value = [bo({ locationId: 11n })];
    c.selectAlly(8n);
    expect(c.allyTargetId.value).toBe(5n);
  });

  it('allyArgFor sends the selected ok ally for single_ally only', () => {
    const { c } = peace();
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBeUndefined();
    c.selectAlly(8n);
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBe(8n);
    expect(c.allyArgFor({ targetRule: 'single_enemy' })).toBeUndefined();
    c.selectAlly(5n);
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBeUndefined();
  });

  it('changing character resets the selection to the new character', () => {
    const { fake, c } = peace();
    c.selectAlly(8n);
    fake.characterId.value = 6n;
    expect(c.allyTargetId.value).toBe(6n);
  });
});

describe('allyArgFor', () => {
  it('returns the id of an active living ally for a single_ally ability', () => {
    const c = start(build());
    c.selectAlly(8n);
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBe(8n);
  });

  it('returns undefined for other rules', () => {
    const c = start(build());
    c.selectAlly(8n);
    expect(c.allyArgFor({ targetRule: 'single_enemy' })).toBeUndefined();
  });

  it('returns undefined for a dead ally', () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.participants.value = [
      { id: 1n, combatId: 1n, characterId: 5n, status: 'active' },
      { id: 2n, combatId: 1n, characterId: 8n, status: 'dead' },
    ];
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBeUndefined();
  });

  it('returns undefined for an ally with 0 HP', () => {
    const fake = build();
    const c = start(fake);
    c.selectAlly(8n);
    fake.knownCharacters.value = [{ id: 8n, hp: 0n }];
    expect(c.allyArgFor({ targetRule: 'single_ally' })).toBeUndefined();
  });
});

describe('round clock', () => {
  const round = (expiresInSeconds: number): Record<string, unknown> => ({
    id: 1n,
    combatId: 1n,
    roundNumber: 1n,
    state: 'action_select',
    startedAtMicros: BigInt(now),
    timerExpiresAtMicros: BigInt(now + expiresInSeconds * 1_000_000),
  });

  it('counts down an open round and resolves at expiry', async () => {
    vi.useFakeTimers();
    const fake = build();
    fake.openRound.value = round(6);
    const c = start(fake);
    await nextTick();
    expect(c.timer.value.seconds).toBe(6);
    expect(c.resolving.value).toBe(false);
    fake.setNow(now + 7_000_000);
    vi.advanceTimersByTime(250);
    expect(c.resolving.value).toBe(true);
  });

  describe('with a client clock that runs ahead of the server', () => {
    const SERVER_MS = 1_700_000_000_000;
    const AHEAD_MS = 10_000;

    function skewed() {
      const fake = build();
      let clientMs = SERVER_MS + AHEAD_MS;
      (fake.game as unknown as { clock: unknown }).clock = createServerClock(() => clientMs);
      const open = (roundNumber: bigint, startedAtMs = SERVER_MS): Record<string, unknown> => ({
        id: roundNumber,
        combatId: 1n,
        roundNumber,
        state: 'action_select',
        startedAtMicros: BigInt(startedAtMs) * 1000n,
        timerExpiresAtMicros: BigInt(startedAtMs) * 1000n + 6_000_000n,
      });
      return { fake, open, advance: (ms: number) => void (clientMs += ms) };
    }

    it('does not read a fresh fight round as expired', async () => {
      const { fake, open } = skewed();
      // The fight starts while the controller watches: the server confirmed it was not in a fight.
      fake.active.value = false;
      fake.participantApplied.value = true;
      const c = start(fake);
      fake.active.value = true;
      // Without a sample the estimate is 10 s past the server, so 6 s rounds would read expired.
      fake.openRound.value = open(1n);
      await nextTick();
      expect(c.resolving.value).toBe(false);
      expect(c.timer.value.seconds).toBe(6);
    });

    it('samples the next round when it arrives after the round binding applied', async () => {
      vi.useFakeTimers();
      const { fake, open, advance } = skewed();
      fake.active.value = false;
      fake.participantApplied.value = true;
      const c = start(fake);
      fake.active.value = true;
      fake.openRound.value = open(1n);
      fake.roundsApplied.value = true;
      await nextTick();
      // Drop the sample from round 1 to prove round 2 re-samples (a client drift of +3 s).
      advance(6_000);
      (fake.game.clock as ReturnType<typeof createServerClock>).sample(BigInt(SERVER_MS - 3_000) * 1000n);
      fake.openRound.value = open(2n, SERVER_MS + 6_000);
      vi.advanceTimersByTime(250);
      expect(c.resolving.value).toBe(false);
      expect(c.timer.value.seconds).toBe(6);
    });

    it('does not sample a Round 1 snapshot on a reload, where inactive is not yet server-confirmed', async () => {
      const { fake, open } = skewed();
      // The production reload order: the controller mounts with the own-participant binding not yet
      // applied, so active is false only because nothing has arrived.
      fake.active.value = false;
      fake.participantApplied.value = false;
      const c = start(fake);
      // The participant snapshot arrives (active flips, then the flag), then the Round 1 snapshot
      // of a round that began 5 s ago.
      fake.active.value = true;
      fake.participantApplied.value = true;
      fake.openRound.value = open(1n, SERVER_MS - 5_000);
      await nextTick();
      expect(fake.game.clock.skewMicros.value).toBe(0);
      expect(c.resolving.value).toBe(true);
    });

    it('samples Round 1 of a fight that starts after the server confirmed no fight', async () => {
      const { fake, open } = skewed();
      fake.active.value = false;
      fake.participantApplied.value = true;
      const c = start(fake);
      // The fight starts while watching: the participant row arrives, then a live Round 1.
      fake.active.value = true;
      fake.openRound.value = open(1n);
      await nextTick();
      expect(fake.game.clock.skewMicros.value).not.toBe(0);
      expect(c.resolving.value).toBe(false);
    });

    it('does not sample a later round first seen as a snapshot', async () => {
      const { fake, open } = skewed();
      const c = start(fake);
      // A mid-fight reload: round 4 started 5 s ago. Sampling it would bias the estimate.
      fake.openRound.value = open(4n, SERVER_MS - 5_000);
      await nextTick();
      expect(fake.game.clock.skewMicros.value).toBe(0);
      expect(c.resolving.value).toBe(true);
    });

    it('does not sample a later round snapshot after the controller saw combat inactive', async () => {
      const { fake, open } = skewed();
      fake.active.value = false;
      fake.participantApplied.value = true;
      start(fake);
      // A late join into a fight already in round 3: the snapshot lands before the binding applied.
      fake.active.value = true;
      fake.openRound.value = open(3n, SERVER_MS - 5_000);
      await nextTick();
      expect(fake.game.clock.skewMicros.value).toBe(0);
    });

    it('samples a round that arrives after the binding applied on a controller that started in combat', async () => {
      const { fake, open } = skewed();
      const c = start(fake);
      fake.openRound.value = open(4n, SERVER_MS - 5_000);
      fake.roundsApplied.value = true;
      expect(fake.game.clock.skewMicros.value).toBe(0);
      fake.openRound.value = open(5n, SERVER_MS + 1_000);
      await nextTick();
      expect(fake.game.clock.skewMicros.value).not.toBe(0);
      expect(c.resolving.value).toBe(false);
    });
  });

  it('is resolving with no open round', () => {
    const c = start(build());
    expect(c.resolving.value).toBe(true);
    expect(c.timer.value.seconds).toBe(0);
  });

  it('ticks every 250 ms normally', () => {
    vi.useFakeTimers();
    const fake = build();
    fake.openRound.value = round(6);
    const c = start(fake);
    fake.setNow(now + 2_000_000);
    expect(c.timer.value.seconds).toBe(6);
    vi.advanceTimersByTime(250);
    expect(c.timer.value.seconds).toBe(4);
  });

  it('ticks every 1000 ms under reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    window.matchMedia = globalThis.matchMedia;
    const fake = build();
    fake.openRound.value = round(6);
    const c = start(fake);
    fake.setNow(now + 2_000_000);
    vi.advanceTimersByTime(250);
    expect(c.timer.value.seconds).toBe(6);
    vi.advanceTimersByTime(750);
    expect(c.timer.value.seconds).toBe(4);
  });

  it('runs no interval outside combat', () => {
    vi.useFakeTimers();
    const fake = build();
    fake.active.value = false;
    fake.openRound.value = round(6);
    start(fake);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the interval on dispose', () => {
    vi.useFakeTimers();
    const fake = build();
    fake.openRound.value = round(6);
    start(fake);
    expect(vi.getTimerCount()).toBe(1);
    controller?.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('down', () => {
  it('is true only at 0 HP', () => {
    const fake = build();
    const c = start(fake);
    expect(c.down.value).toBe(false);
    fake.character.value = { id: 5n, hp: 0n };
    expect(c.down.value).toBe(true);
    fake.character.value = null;
    expect(c.down.value).toBe(false);
  });
});

describe('dispose', () => {
  it('removes the document listener', () => {
    const fake = build();
    const c = start(fake);
    c.dispose();
    key({ key: 'Tab' });
    expect(fake.setCombatTarget).not.toHaveBeenCalled();
  });
});
