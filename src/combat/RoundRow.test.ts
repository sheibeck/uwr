// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import RoundRow from './RoundRow.vue';
import {
  COMBAT_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertCombatData,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { CombatController, FrameControls, GameData } from '../game/context';
import type { RoundTimerState } from './roundClock';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

interface Setup {
  action?: Record<string, unknown> | null;
  enemies?: Array<Record<string, unknown>>;
  abilities?: Array<Record<string, unknown>>;
  target?: bigint | null;
  timer?: RoundTimerState;
  resolving?: boolean;
  down?: boolean;
  connected?: boolean;
  desktop?: boolean;
  active?: boolean;
  submit?: ReturnType<typeof vi.fn>;
  flee?: ReturnType<typeof vi.fn>;
}

function enemy(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return { id, combatId: 1n, displayName: name, currentHp: 100n, maxHp: 100n, ...over };
}

function mountRow(setup: Setup = {}) {
  const submit = setup.submit ?? vi.fn(() => Promise.resolve());
  const flee = setup.flee ?? vi.fn(() => Promise.resolve());
  const action = ref<Record<string, unknown> | null>(setup.action ?? null);
  const enemies = ref(setup.enemies ?? [enemy(9n, 'Rotfang')]);
  const abilities = ref(setup.abilities ?? [{ id: 20n, name: 'Firebolt', kind: 'damage', targetRule: 'single_enemy' }]);
  const target = ref<bigint | null>(setup.target === undefined ? 9n : setup.target);
  const connected = ref(setup.connected ?? true);
  const timer = ref<RoundTimerState>(
    setup.timer ?? { resolving: false, seconds: 6, fraction: 0.6, totalSeconds: 10 },
  );
  const resolving = ref(setup.resolving ?? false);
  const down = ref(setup.down ?? false);
  const desktop = ref(setup.desktop ?? true);
  const combat = {
    ...createInertCombatData(),
    active: ref(setup.active ?? true),
    enemies,
    ownAction: action,
    characterNames: ref(new Map<bigint, string>()),
  };
  const game = {
    ...createInertGame(),
    connected,
    characterId: ref(5n),
    character: ref({ id: 5n, name: 'Hero', combatTargetEnemyId: target.value }),
    abilities,
    reducers: ref({ submitCombatAction: submit, fleeCombat: flee }),
    combat,
  } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop: desktop } as unknown as FrameControls;
  const controller = { ...createInertCombat(), timer, resolving, down } as unknown as CombatController;
  const w = mount(RoundRow, {
    global: {
      provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame, [COMBAT_KEY as symbol]: controller },
    },
  });
  wrapper = w;
  return { w, submit, flee, action, enemies, abilities, connected, timer, resolving, down, desktop, game, combat };
}

const ready = (w: VueWrapper) => w.get('button.ready');
const fleeBtn = (w: VueWrapper) => w.get('button.flee');

describe('RoundRow visibility', () => {
  it('renders nothing outside combat', () => {
    const { w } = mountRow({ active: false });
    expect(w.find('.round-row').exists()).toBe(false);
  });

  it('renders nothing with the inert game', () => {
    wrapper = mount(RoundRow);
    expect(wrapper.find('.round-row').exists()).toBe(false);
  });
});

describe('RoundRow chip', () => {
  it('shows the neutral auto-attack default with the sword', () => {
    const { w } = mountRow();
    const chip = w.get('.choice-chip');
    expect(chip.text()).toBe('Auto-attack → Rotfang');
    expect(chip.classes()).toContain('tag');
    expect(chip.classes()).toContain('tag-neutral');
    expect(chip.attributes('title')).toBe('Auto-attack → Rotfang');
    expect(chip.find('svg').exists()).toBe(true);
    expect(ready(w).attributes('aria-disabled')).toBeUndefined();
    expect(fleeBtn(w).text()).toBe('Flee');
  });

  it('turns accent with the check after Ready and disables Ready', () => {
    const { w } = mountRow({ action: { actionType: 'auto_attack', targetEnemyId: 9n } });
    const chip = w.get('.choice-chip');
    expect(chip.classes()).toContain('tag-accent');
    expect(chip.text()).toBe('Auto-attack → Rotfang');
    expect(ready(w).attributes('aria-disabled')).toBe('true');
  });

  it('names the ability and its enemy target', () => {
    const { w } = mountRow({ action: { actionType: 'ability', abilityTemplateId: 20n, targetEnemyId: 9n } });
    expect(w.get('.choice-chip').text()).toBe('Firebolt → Rotfang');
    expect(w.get('.choice-chip').classes()).toContain('tag-accent');
    expect(ready(w).attributes('aria-disabled')).toBe('true');
  });

  it('reads Fleeing with the health tint class after Flee', () => {
    const { w } = mountRow({ action: { actionType: 'flee' } });
    expect(w.get('.choice-chip').text()).toBe('Fleeing');
    expect(w.get('.choice-chip').classes()).toContain('tone-danger');
  });

  it('reads You are down at 0 HP and makes the buttons inert', () => {
    const { w } = mountRow({ down: true });
    expect(w.get('.choice-chip').text()).toBe('You are down');
    expect(ready(w).attributes('aria-disabled')).toBe('true');
    expect(fleeBtn(w).attributes('aria-disabled')).toBe('true');
  });

  it('renders markup in an enemy and an ability name as text', () => {
    const { w } = mountRow({
      enemies: [enemy(9n, XSS)],
      abilities: [{ id: 20n, name: XSS, kind: 'damage', targetRule: 'single_enemy' }],
      action: { actionType: 'ability', abilityTemplateId: 20n, targetEnemyId: 9n },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.choice-chip').text()).toBe(`${XSS} → ${XSS}`);
  });
});

describe('RoundRow timer', () => {
  it('shows the seconds, the progressbar and the fill width', () => {
    const { w } = mountRow();
    const seconds = w.get('.seconds');
    expect(seconds.text()).toBe('6s');
    expect(seconds.attributes('aria-hidden')).toBe('true');
    const bar = w.get('[role="progressbar"]');
    expect(bar.attributes('aria-label')).toBe('Round timer');
    expect(bar.attributes('aria-valuenow')).toBe('6');
    expect(bar.attributes('aria-valuemax')).toBe('10');
    expect((w.get('.fill').element as HTMLElement).style.width).toBe('60%');
    expect(w.find('[role="status"]').exists()).toBe(false);
  });

  it('shows Resolving with the spinner and an empty bar, never 0s', () => {
    const { w, submit, flee } = mountRow({
      resolving: true,
      timer: { resolving: true, seconds: 0, fraction: 0, totalSeconds: 10 },
    });
    expect(w.find('.seconds').exists()).toBe(false);
    expect(w.text()).not.toContain('0s');
    const status = w.get('[role="status"]');
    expect(status.text()).toBe('Resolving…');
    expect(status.find('svg').exists()).toBe(true);
    expect((w.get('.fill').element as HTMLElement).style.width).toBe('0%');
    expect(ready(w).attributes('aria-disabled')).toBe('true');
    expect(fleeBtn(w).attributes('aria-disabled')).toBe('true');
    void ready(w).trigger('click');
    void fleeBtn(w).trigger('click');
    expect(submit).not.toHaveBeenCalled();
    expect(flee).not.toHaveBeenCalled();
  });

  it('switches to Resolving when the controller flips with a live timer value', async () => {
    const { w, resolving } = mountRow();
    resolving.value = true;
    await nextTick();
    expect(w.find('.seconds').exists()).toBe(false);
    expect(w.get('[role="status"]').text()).toBe('Resolving…');
  });
});

describe('RoundRow Ready', () => {
  it('submits an auto-attack with the living target only', async () => {
    const { w, submit } = mountRow();
    await ready(w).trigger('click');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({ characterId: 5n, targetEnemyId: 9n });
  });

  it('omits targetEnemyId when the current target is dead', async () => {
    const { w, submit } = mountRow({ enemies: [enemy(9n, 'Rotfang', { currentHp: 0n }), enemy(10n, 'Gnawer')] });
    await ready(w).trigger('click');
    expect(submit).toHaveBeenCalledTimes(1);
    const args = submit.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toEqual({ characterId: 5n });
    expect('targetEnemyId' in args).toBe(false);
  });

  it('ignores a second click while the first is pending', async () => {
    const submit = vi.fn(() => new Promise<void>(() => {}));
    const { w } = mountRow({ submit });
    await ready(w).trigger('click');
    await ready(w).trigger('click');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does nothing once a choice row exists', async () => {
    const { w, submit } = mountRow({ action: { actionType: 'ability', abilityTemplateId: 20n, targetEnemyId: 9n } });
    await ready(w).trigger('click');
    expect(submit).not.toHaveBeenCalled();
  });

  it('warns and recovers when the reducer rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const submit = vi.fn(() => Promise.reject(new Error('refused')));
    const { w } = mountRow({ submit });
    await ready(w).trigger('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    await ready(w).trigger('click');
    expect(submit).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('does not show a choice the server has not recorded', async () => {
    const { w } = mountRow();
    await ready(w).trigger('click');
    expect(w.get('.choice-chip').classes()).toContain('tag-neutral');
    expect(ready(w).attributes('aria-disabled')).toBeUndefined();
  });
});

describe('RoundRow Flee', () => {
  it('calls flee_combat with the character id only', async () => {
    const { w, flee } = mountRow();
    await fleeBtn(w).trigger('click');
    expect(flee).toHaveBeenCalledTimes(1);
    expect(flee).toHaveBeenCalledWith({ characterId: 5n });
    expect(fleeBtn(w).text()).toBe('Flee');
    expect(fleeBtn(w).attributes('aria-pressed')).toBe('false');
  });

  it('reads Flee chosen from the row and ignores another click, then reverts on an ability row', async () => {
    const { w, flee, action } = mountRow({ action: { actionType: 'flee' } });
    const button = fleeBtn(w);
    expect(button.text()).toBe('Flee chosen');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.classes()).toContain('chosen');
    await button.trigger('click');
    expect(flee).not.toHaveBeenCalled();

    action.value = { actionType: 'ability', abilityTemplateId: 20n, targetEnemyId: 9n };
    await nextTick();
    expect(fleeBtn(w).text()).toBe('Flee');
    expect(fleeBtn(w).attributes('aria-pressed')).toBe('false');
    expect(fleeBtn(w).classes()).not.toContain('chosen');
  });

  it('ignores a second click while the first is pending', async () => {
    const flee = vi.fn(() => new Promise<void>(() => {}));
    const { w } = mountRow({ flee });
    await fleeBtn(w).trigger('click');
    await fleeBtn(w).trigger('click');
    expect(flee).toHaveBeenCalledTimes(1);
  });
});

describe('RoundRow offline', () => {
  it('makes Ready and Flee inert while the timer keeps showing', async () => {
    const { w, submit, flee } = mountRow({ connected: false });
    expect(ready(w).attributes('aria-disabled')).toBe('true');
    expect(fleeBtn(w).attributes('aria-disabled')).toBe('true');
    expect(w.get('.seconds').text()).toBe('6s');
    await ready(w).trigger('click');
    await fleeBtn(w).trigger('click');
    expect(submit).not.toHaveBeenCalled();
    expect(flee).not.toHaveBeenCalled();
  });

  it('keeps the buttons focusable (aria-disabled, not the disabled attribute)', () => {
    const { w } = mountRow({ connected: false });
    expect(ready(w).attributes('disabled')).toBeUndefined();
    expect(fleeBtn(w).attributes('disabled')).toBeUndefined();
  });
});

describe('RoundRow layout', () => {
  it('uses the stacked and mobile forms when the frame is not desktop', () => {
    const { w } = mountRow({ desktop: false });
    const row = w.get('.round-row');
    expect(row.classes()).toContain('stacked');
    expect(row.classes()).toContain('mobile');
  });

  it('is not stacked on desktop with no ResizeObserver available', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { w } = mountRow();
    const row = w.get('.round-row');
    expect(row.classes()).not.toContain('stacked');
    expect(row.classes()).not.toContain('mobile');
  });

  it('stacks below 520px of measured width, leaves 520px alone and disconnects on unmount', async () => {
    let callback: ((entries: Array<{ contentRect: { width: number } }>) => void) | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
        callback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    const { w } = mountRow();
    await nextTick();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(w.get('.round-row').classes()).not.toContain('stacked');

    callback!([{ contentRect: { width: 519 } }]);
    await nextTick();
    expect(w.get('.round-row').classes()).toContain('stacked');
    expect(w.get('.round-row').classes()).not.toContain('mobile');

    callback!([{ contentRect: { width: 520 } }]);
    await nextTick();
    expect(w.get('.round-row').classes()).not.toContain('stacked');

    w.unmount();
    wrapper = null;
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('RoundRow source', () => {
  const source = readFileSync(resolve(__dirname, 'RoundRow.vue'), 'utf8');

  it('calls the two reducers and carries the contract copy', () => {
    expect(source).toContain('submitCombatAction(');
    expect(source).toContain('fleeCombat(');
    expect(source).toContain('Round timer');
    expect(source).toContain('Resolving…');
    expect(source).toContain('Flee chosen');
    expect(source).toContain('ResizeObserver');
  });

  it('removes the bar transition and the spinner animation under reduced motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(source);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/\.fill\s*\{[^}]*transition:\s*none/);
    expect(block![1]).toMatch(/\.spinner\s*\{[^}]*animation:\s*none/);
  });

  it('adds no container query and no width media query', () => {
    expect(source).not.toContain('@container');
    expect(/@media[^{]*width/.test(source)).toBe(false);
  });

  it('breaks at 520px', () => {
    expect(source).toContain('ROUND_ROW_STACK_PX = 520');
  });
});
