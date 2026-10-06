// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import EncounterStrip from './EncounterStrip.vue';
import {
  COMBAT_KEY,
  GAME_KEY,
  createInertCombat,
  createInertCombatData,
  createInertGame,
} from '../game/context';
import type { CombatController, GameData } from '../game/context';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

interface Setup {
  enemies?: Array<Record<string, unknown>>;
  casts?: Array<Record<string, unknown>>;
  applied?: boolean;
  target?: bigint | null;
}

function enemy(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    combatId: 1n,
    enemyTemplateId: 100n,
    displayName: name,
    currentHp: 212n,
    maxHp: 480n,
    ...over,
  };
}

const CAST = {
  id: 1n,
  combatId: 1n,
  enemyId: 9n,
  abilityKey: 'bile_spray',
  targetCharacterId: 5n,
  announcedRound: 2n,
  landsAtRound: 4n,
};

function mountStrip(setup: Setup = {}, props: { collapsed?: boolean } = {}) {
  const requestTarget = vi.fn();
  const combat = {
    ...createInertCombatData(),
    active: ref(true),
    applied: ref(setup.applied ?? true),
    enemies: ref(setup.enemies ?? [enemy(9n, 'Rotfang'), enemy(3n, 'Gnawer', { currentHp: 50n, maxHp: 100n })]),
    enemyTemplates: ref([{ id: 100n, level: 6n }]),
    enemyAbilities: ref([{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: 'Bile Spray' }]),
    casts: ref(setup.casts ?? [CAST]),
    roundNumber: ref<bigint | null>(3n),
  };
  const game = {
    ...createInertGame(),
    character: ref({ id: 5n, name: 'Hero', level: 4n, combatTargetEnemyId: setup.target === undefined ? 9n : setup.target }),
    characterId: ref(5n),
    combat,
  } as unknown as GameData;
  const controller = { ...createInertCombat(), requestTarget } as CombatController;
  wrapper = mount(EncounterStrip, {
    props,
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: game, [COMBAT_KEY as symbol]: controller } },
  });
  return { requestTarget, combat, game };
}

describe('EncounterStrip header', () => {
  it('shows the heading on a button that opens the encounter list, with the caret', () => {
    mountStrip();
    const open = wrapper!.get('button.strip-open');
    expect(open.text()).toBe('Encounter · 2 hostiles');
    expect(open.attributes('aria-label')).toBe('Open encounter list');
    expect(open.find('svg').exists()).toBe(true);
    expect(wrapper!.get('section').attributes('aria-label')).toBe('Encounter');
  });

  it('uses the singular for one living hostile', () => {
    mountStrip({ enemies: [enemy(9n, 'Rotfang')] });
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter · 1 hostile');
  });

  it('emits open with the button element', async () => {
    mountStrip();
    const open = wrapper!.get('button.strip-open');
    await open.trigger('click');
    expect(wrapper!.emitted('open')).toHaveLength(1);
    expect(wrapper!.emitted('open')![0][0]).toBe(open.element);
  });

  it('has an Account button that emits account with its element', async () => {
    mountStrip();
    const account = wrapper!.get('button.strip-account');
    expect(account.attributes('aria-label')).toBe('Account');
    expect(account.attributes('title')).toBe('Account');
    await account.trigger('click');
    expect(wrapper!.emitted('account')).toHaveLength(1);
    expect(wrapper!.emitted('account')![0][0]).toBe(account.element);
    expect(wrapper!.emitted('open')).toBeUndefined();
  });
});

describe('EncounterStrip chips', () => {
  it('lists chips in ascending id with the target pressed and the wind-up marker on its hostile only', () => {
    mountStrip();
    const chips = wrapper!.findAll('button.hostile-chip');
    expect(chips.map((chip) => chip.get('.chip-name').text())).toEqual(['Gnawer', 'Rotfang']);
    const [gnawer, rotfang] = chips;
    expect(rotfang.attributes('aria-pressed')).toBe('true');
    expect(rotfang.classes()).toContain('targeted');
    expect(gnawer.attributes('aria-pressed')).toBe('false');
    expect(gnawer.classes()).not.toContain('targeted');
    expect(rotfang.find('.chip-windup').exists()).toBe(true);
    expect(gnawer.find('.chip-windup').exists()).toBe(false);
  });

  it('colors the name by difficulty and uses the hostile view aria label', () => {
    mountStrip();
    const rotfang = wrapper!.findAll('button.hostile-chip')[1];
    expect(rotfang.get('.chip-name').classes()).toContain('con-orange');
    expect(rotfang.attributes('aria-label')).toBe('Rotfang, level 6, Hard, 44% health, winding up Bile Spray');
  });

  it('shows a health sliver and no numbers', () => {
    mountStrip();
    const rotfang = wrapper!.findAll('button.hostile-chip')[1];
    expect((rotfang.get('.sliver-fill').element as HTMLElement).style.width).toBe('44.17%');
    expect(rotfang.text()).toBe('Rotfang');
    expect(rotfang.text()).not.toMatch(/\d/);
  });

  it('targets a living chip through the controller and leaves the ring to the server', async () => {
    const { requestTarget } = mountStrip();
    const [gnawer, rotfang] = wrapper!.findAll('button.hostile-chip');
    await gnawer.trigger('click');
    expect(requestTarget).toHaveBeenCalledTimes(1);
    expect(requestTarget).toHaveBeenCalledWith(3n);
    expect(gnawer.attributes('aria-pressed')).toBe('false');
    expect(rotfang.attributes('aria-pressed')).toBe('true');
  });

  it('makes a defeated chip inert', async () => {
    const { requestTarget } = mountStrip({
      enemies: [enemy(9n, 'Rotfang', { currentHp: 0n }), enemy(3n, 'Gnawer')],
    });
    const [gnawer, rotfang] = wrapper!.findAll('button.hostile-chip');
    expect(rotfang.attributes('aria-disabled')).toBe('true');
    expect(rotfang.classes()).toContain('defeated');
    expect(rotfang.attributes('aria-pressed')).toBe('false');
    expect(gnawer.attributes('aria-disabled')).toBeUndefined();
    await rotfang.trigger('click');
    expect(requestTarget).not.toHaveBeenCalled();
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter · 1 hostile');
  });

  it('shows no chip row when collapsed, but keeps the header', () => {
    mountStrip({}, { collapsed: true });
    expect(wrapper!.find('.chip-row').exists()).toBe(false);
    expect(wrapper!.find('button.strip-open').exists()).toBe(true);
    expect(wrapper!.find('button.strip-account').exists()).toBe(true);
  });

  it('shows no chip row before the enemy binding applies, but keeps the header', () => {
    mountStrip({ applied: false, enemies: [] });
    expect(wrapper!.find('.chip-row').exists()).toBe(false);
    expect(wrapper!.find('button.strip-open').exists()).toBe(true);
  });

  it('renders hostile names as text', () => {
    mountStrip({ enemies: [enemy(9n, XSS)] });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.chip-name').text()).toBe(XSS);
    expect(wrapper!.get('button.hostile-chip').attributes('aria-label')).toContain(XSS);
  });
});

describe('EncounterStrip styles', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/combat/EncounterStrip.vue'), 'utf8');

  function ruleBody(selector: string): string {
    const start = source.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    return source.slice(start, source.indexOf('}', start));
  }

  it('scrolls the chip row sideways and never wraps', () => {
    const body = ruleBody('.chip-row');
    expect(body).toContain('overflow-x: auto');
    expect(body).not.toMatch(/flex-wrap:\s*wrap\b/);
    expect(body).toContain('flex-wrap: nowrap');
  });

  it('sizes the chip, the header and the account button to the touch minimums', () => {
    const chip = ruleBody('.hostile-chip');
    expect(chip).toContain('min-height: 44px');
    expect(chip).toContain('min-width: 96px');
    expect(chip).toContain('flex: 1 0 96px');
    expect(ruleBody('.strip-open')).toContain('height: 44px');
    expect(ruleBody('.strip-account')).toContain('width: 44px');
    expect(ruleBody('.sliver')).toContain('height: 4px');
  });

  it('ellipsizes long names and dims defeated chips', () => {
    expect(ruleBody('.chip-name')).toContain('text-overflow: ellipsis');
    expect(ruleBody('.hostile-chip.defeated')).toContain('opacity: 0.45');
  });
});
