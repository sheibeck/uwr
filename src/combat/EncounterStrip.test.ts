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
  effects?: Array<Record<string, unknown>>;
  applied?: boolean;
  target?: bigint | null;
  templates?: Array<Record<string, unknown>>;
  encounter?: Record<string, unknown> | null;
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
    enemyTemplates: ref(setup.templates ?? [{ id: 100n, level: 6n }]),
    enemyAbilities: ref([{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: 'Bile Spray' }]),
    casts: ref(setup.casts ?? [CAST]),
    enemyEffects: ref(setup.effects ?? []),
    roundNumber: ref<bigint | null>(3n),
    encounter: ref(setup.encounter ?? null),
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
    expect(open.text()).toBe('Encounter · 2 left');
    expect(open.attributes('aria-label')).toBe('Open encounter list');
    expect(open.find('svg').exists()).toBe(true);
    expect(wrapper!.get('section').attributes('aria-label')).toBe('Encounter');
  });

  it('counts one living hostile as 1 left', () => {
    mountStrip({ enemies: [enemy(9n, 'Rotfang')] });
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter · 1 left');
  });

  it('uses the same heading string as the panel: family name and living count', () => {
    mountStrip({ encounter: { origin: 'ambush_enter', originName: 'Goblins', originPlural: 'goblins', originLevel: 2n } });
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter · Goblins · 2 left');
  });

  it('keeps the count in its own unshrinking span with the full heading as the title (IN-05)', () => {
    mountStrip({ encounter: { origin: 'pull', originName: 'Goblins', originPlural: 'goblins', originLevel: 2n } });
    const label = wrapper!.get('.strip-label');
    expect(label.attributes('title')).toBe('Encounter · Goblins · 2 left');
    expect(label.get('.head-lead').text()).toBe('Encounter · Goblins');
    expect(label.get('.head-count').text()).toBe('· 2 left');
    const source = readFileSync(resolve(process.cwd(), 'src/combat/EncounterStrip.vue'), 'utf8');
    expect(source).toMatch(/\.head-count\s*\{[^}]*flex: none;/);
    expect(source).toMatch(/\.head-lead\s*\{[^}]*text-overflow: ellipsis;/);
  });

  it('omits the count before the enemy rows apply (IN-05)', () => {
    mountStrip({ applied: false, enemies: [] });
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter');
    expect(wrapper!.find('.head-count').exists()).toBe(false);
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
    expect(rotfang.attributes('aria-label')).toBe('Rotfang, Damage, level 6, Hard, 44% health, winding up Bile Spray');
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
    expect(wrapper!.get('button.strip-open').text()).toBe('Encounter · 1 left');
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

function fx(id: bigint, enemyId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    combatId: 1n,
    enemyId,
    effectType: 'dot',
    magnitude: 6n,
    roundsRemaining: 3n,
    sourceAbility: 'Ignite',
    ...over,
  };
}

describe('EncounterStrip effect chips', () => {
  it('shows no effect chips for a chip without effects', () => {
    mountStrip();
    expect(wrapper!.find('.effect-chips').exists()).toBe(false);
    expect(wrapper!.findAll('button.hostile-chip').some((chip) => chip.classes().includes('has-effects'))).toBe(false);
  });

  it('shows each chip only its own effects, as the rounds with an icon', () => {
    mountStrip({
      effects: [fx(1n, 9n), fx(2n, 3n, { effectType: 'stun', sourceAbility: 'Bash', roundsRemaining: 1n })],
    });
    const [gnawer, rotfang] = wrapper!.findAll('button.hostile-chip');
    expect(gnawer.findAll('.effect-chips .tag').map((chip) => chip.text())).toEqual(['1 round']);
    expect(rotfang.findAll('.effect-chips .tag').map((chip) => chip.text())).toEqual(['3 rounds']);
    expect(rotfang.find('.effect-chips .tag svg').exists()).toBe(true);
    expect(rotfang.classes()).toContain('has-effects');
  });

  it('carries the type and the effect name in the chip title', () => {
    mountStrip({ effects: [fx(1n, 9n)] });
    expect(wrapper!.get('.effect-chips .tag').attributes('title')).toBe('Ignite · Damage over time · 3 rounds');
  });

  it('adds "{effect} on {enemy}, N rounds left" to the chip label', () => {
    mountStrip({ effects: [fx(1n, 9n)] });
    const rotfang = wrapper!.findAll('button.hostile-chip')[1];
    expect(rotfang.attributes('aria-label')).toBe(
      'Rotfang, Damage, level 6, Hard, 44% health, winding up Bile Spray, Ignite on Rotfang, 3 rounds left',
    );
  });

  it('keeps the strip compact: one chip, then a +N chip for the rest', () => {
    mountStrip({
      effects: [fx(1n, 9n), fx(2n, 9n, { sourceAbility: 'Rot' }), fx(3n, 9n, { sourceAbility: 'Bile' })],
    });
    const chips = wrapper!.findAll('button.hostile-chip')[1].findAll('.effect-chips .tag');
    expect(chips.map((chip) => chip.text())).toEqual(['3 rounds', '+2']);
    expect(wrapper!.get('.effect-chips').classes()).toContain('nowrap');
  });

  it('shows no +N chip for a single effect', () => {
    mountStrip({ effects: [fx(1n, 9n)] });
    expect(wrapper!.find('.tag-neutral').exists()).toBe(false);
  });

  it('keeps the chip a button without nested block elements, and clicking a chip still targets', async () => {
    const { requestTarget } = mountStrip({ effects: [fx(1n, 9n)] });
    const rotfang = wrapper!.findAll('button.hostile-chip')[1];
    expect(rotfang.get('.effect-chips').element.tagName).toBe('SPAN');
    expect(rotfang.find('div').exists()).toBe(false);
    await rotfang.get('.effect-chips .tag').trigger('click');
    expect(requestTarget).toHaveBeenCalledWith(9n);
  });

  it('shows no effect chips when collapsed or on a defeated chip', () => {
    mountStrip({ effects: [fx(1n, 9n)] }, { collapsed: true });
    expect(wrapper!.find('.effect-chips').exists()).toBe(false);
    wrapper?.unmount();
    mountStrip({ enemies: [enemy(9n, 'Rotfang', { currentHp: 0n })], effects: [fx(1n, 9n)] });
    expect(wrapper!.find('.effect-chips').exists()).toBe(false);
  });

  it('renders an effect name as text, never markup', () => {
    mountStrip({ effects: [fx(1n, 9n, { sourceAbility: XSS })] });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.effect-chips .tag').attributes('title')).toContain(XSS);
    expect(wrapper!.findAll('button.hostile-chip')[1].attributes('aria-label')).toContain(`${XSS} on Rotfang, 3 rounds left`);
    expect(document.body.querySelector('img')).toBeNull();
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

describe('EncounterStrip role icons (UI Q8)', () => {
  const templates = [
    { id: 100n, level: 6n, role: 'healer' },
    { id: 101n, level: 6n, role: 'tank', isBoss: true },
  ];

  it('puts the role icon (12, aria-hidden, role colour) before the name', () => {
    mountStrip({
      enemies: [enemy(9n, 'Rotfang'), enemy(3n, 'Gnawer', { enemyTemplateId: 101n })],
      templates,
    });
    const [gnawer, rotfang] = wrapper!.findAll('button.hostile-chip');
    for (const [chip, cls] of [
      [rotfang, 'role-support'],
      [gnawer, 'role-boss'],
    ] as const) {
      const top = chip.get('.chip-top').element;
      const icon = top.firstElementChild as Element;
      expect(icon.tagName.toLowerCase()).toBe('svg');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(icon.getAttribute('width')).toBe('12');
      expect(icon.getAttribute('class')).toContain('chip-role');
      expect(icon.getAttribute('class')).toContain(cls);
      expect(icon.nextElementSibling?.classList.contains('chip-name')).toBe(true);
    }
  });

  it('names the role word in the chip accessible name, Support for healer, without visible role text', () => {
    mountStrip({ enemies: [enemy(9n, 'Rotfang'), enemy(3n, 'Gnawer', { enemyTemplateId: 101n })], templates });
    const [gnawer, rotfang] = wrapper!.findAll('button.hostile-chip');
    expect(rotfang.attributes('aria-label')!.startsWith('Rotfang, Support, ')).toBe(true);
    expect(gnawer.attributes('aria-label')!.startsWith('Gnawer, Boss, ')).toBe(true);
    expect(rotfang.text()).toBe('Rotfang');
  });

  it('shows one to four chips', () => {
    for (const count of [1, 2, 3, 4]) {
      const ids = [1n, 2n, 3n, 4n].slice(0, count);
      mountStrip({ enemies: ids.map((id) => enemy(id, `Enemy ${id}`)), casts: [] });
      expect(wrapper!.findAll('button.hostile-chip')).toHaveLength(count);
      expect(wrapper!.findAll('button button')).toHaveLength(0);
      wrapper!.unmount();
      wrapper = null;
    }
  });

  it('colours role icons from existing tokens only', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/combat/EncounterStrip.vue'), 'utf8');
    const rule = (cls: string) => source.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    expect(rule('chip-role.role-tank')).toContain('var(--color-neutral-200)');
    expect(rule('chip-role.role-damage')).toContain('var(--color-con-orange)');
    expect(rule('chip-role.role-caster')).toContain('var(--color-line-npc)');
    expect(rule('chip-role.role-support')).toContain('var(--color-con-light-green)');
    expect(rule('chip-role.role-named')).toContain('var(--color-line-quest)');
    expect(rule('chip-role.role-boss')).toContain('var(--color-con-red)');
  });
});

// UI Q8 overflow (backstop) at the 390 x 844 phone frame. happy-dom has no layout, so the check reads
// the rules the browser applies at 390px: the chip row scrolls inside itself (never the page), chips
// never shrink below 96px, and a long name ellipsizes inside a capped, min-width 0 box, even on a chip
// that sizes to its effect chips.
describe('EncounterStrip measured at 390x844: four enemies with long names', () => {
  const MOBILE_WIDTH = 390;
  const source = readFileSync(resolve(process.cwd(), 'src/combat/EncounterStrip.vue'), 'utf8');
  const style = source.slice(source.indexOf('>', source.indexOf('<style')) + 1).replace(/\/\*[\s\S]*?\*\//g, '');
  function mobileValue(selector: string, prop: string): string | null {
    let value: string | null = null;
    const topLevel = style.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
    const scan = (css: string): void => {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1].split(',').map((x) => x.trim());
        if (!selectors.includes(selector)) continue;
        const found = match[2].match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
        if (found) value = found[1].trim();
      }
    };
    scan(topLevel);
    for (const block of style.matchAll(/@media([^{]*)\{([\s\S]*?\})\s*\}/g)) {
      const max = block[1].match(/max-width:\s*(\d+)px/);
      const min = block[1].match(/min-width:\s*(\d+)px/);
      if (max && MOBILE_WIDTH > Number(max[1])) continue;
      if (min && MOBILE_WIDTH < Number(min[1])) continue;
      scan(block[2]);
    }
    return value;
  }

  it('ellipsizes every long name and scrolls the row, not the page', () => {
    const LONG = 'The Extremely Long Named Bog Horror of the Hollowmere Depths';
    const ids = [1n, 2n, 3n, 4n];
    mountStrip({
      enemies: ids.map((id) => enemy(id, `${LONG} ${id}`)),
      casts: ids.map((id) => ({ ...CAST, id, enemyId: id })),
      effects: [fx(1n, 1n), fx(2n, 3n)],
      target: 2n,
    });
    const chips = wrapper!.findAll('button.hostile-chip');
    expect(chips).toHaveLength(4);
    for (const [i, chip] of chips.entries()) {
      expect(chip.get('.chip-name').text()).toBe(`${LONG} ${ids[i]}`);
      expect(chip.attributes('aria-label')!.startsWith(`${LONG} ${ids[i]}, Damage, `)).toBe(true);
      expect(chip.find('.chip-role').exists()).toBe(true);
    }
    expect(mobileValue('.chip-name', 'overflow')).toBe('hidden');
    expect(mobileValue('.chip-name', 'text-overflow')).toBe('ellipsis');
    expect(mobileValue('.chip-name', 'white-space')).toBe('nowrap');
    expect(mobileValue('.chip-name', 'min-width')).toBe('0');
    const cap = Number((mobileValue('.chip-name', 'max-width') ?? '').replace('px', ''));
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(MOBILE_WIDTH - 32);
    expect(mobileValue('.chip-row', 'overflow-x')).toBe('auto');
    expect(mobileValue('.chip-row', 'flex-wrap')).toBe('nowrap');
    expect(mobileValue('.hostile-chip', 'min-height')).toBe('44px');
    expect(mobileValue('.chip-role', 'flex-shrink')).toBe('0');
    expect(mobileValue('.encounter-strip', 'min-width')).toBe('0');
  });
});
