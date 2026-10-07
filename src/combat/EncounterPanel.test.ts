// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import EncounterPanel from './EncounterPanel.vue';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  GAME_KEY,
  createInertCombat,
  createInertCombatData,
  createInertConsole,
  createInertGame,
} from '../game/context';
import type { CombatController, ConsoleApi, GameData } from '../game/context';

const XSS = '<img src=x onerror=alert(1)>';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

interface Setup {
  enemies?: Array<Record<string, unknown>>;
  templates?: Array<Record<string, unknown>>;
  abilities?: Array<Record<string, unknown>>;
  casts?: Array<Record<string, unknown>>;
  effects?: Array<Record<string, unknown>>;
  aggro?: Array<Record<string, unknown>>;
  aggroApplied?: boolean;
  applied?: boolean;
  target?: bigint | null;
  roundNumber?: bigint | null;
  characterNames?: Map<bigint, string>;
}

function enemy(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    combatId: 1n,
    enemyTemplateId: id === 3n ? 101n : 100n,
    displayName: name,
    currentHp: 212n,
    maxHp: 480n,
    ...over,
  };
}

function mountPanel(setup: Setup = {}, props: { variant?: 'rail' | 'sheet' } = {}) {
  const requestTarget = vi.fn();
  const examine = vi.fn();
  const combat = {
    ...createInertCombatData(),
    active: ref(true),
    applied: ref(setup.applied ?? true),
    aggroApplied: ref(setup.aggroApplied ?? true),
    enemies: ref(setup.enemies ?? [enemy(9n, 'Rotfang'), enemy(3n, 'Gnawer', { currentHp: 50n, maxHp: 100n })]),
    enemyTemplates: ref(
      setup.templates ?? [
        { id: 100n, level: 6n },
        { id: 101n, level: 3n, isBoss: true },
      ],
    ),
    enemyAbilities: ref(
      setup.abilities ?? [{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: 'Bile Spray' }],
    ),
    casts: ref(setup.casts ?? []),
    enemyEffects: ref(setup.effects ?? []),
    aggro: ref(setup.aggro ?? []),
    roundNumber: ref(setup.roundNumber === undefined ? 3n : setup.roundNumber),
    characterNames: ref(setup.characterNames ?? new Map<bigint, string>()),
  };
  const game = {
    ...createInertGame(),
    connected: ref(true),
    character: ref({ id: 5n, name: 'Hero', level: 4n, combatTargetEnemyId: setup.target === undefined ? 9n : setup.target }),
    characterId: ref(5n),
    combat,
  } as unknown as GameData;
  const controller = { ...createInertCombat(), requestTarget } as CombatController;
  const consoleApi = { ...createInertConsole(), examine } as unknown as ConsoleApi;
  wrapper = mount(EncounterPanel, {
    props,
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [COMBAT_KEY as symbol]: controller,
        [CONSOLE_KEY as symbol]: consoleApi,
      },
    },
  });
  return { requestTarget, examine, combat, game };
}

describe('EncounterPanel hostiles', () => {
  it('shows the heading, the hint and cards in ascending id', () => {
    mountPanel();
    expect(wrapper!.get('section.encounter-panel').attributes('aria-label')).toBe('Encounter');
    expect(wrapper!.get('h6').text()).toBe('Encounter · 2 hostiles');
    expect(wrapper!.get('.hint').text()).toBe('Tab to cycle');
    const names = wrapper!.findAll('.hostile-card .name').map((n) => n.text());
    expect(names).toEqual(['Gnawer', 'Rotfang']);
  });

  it('puts each hostile in a row with an Examine eye beside the card, never inside its button', async () => {
    const { examine } = mountPanel();
    const rows = wrapper!.findAll('.hostile-row');
    expect(rows).toHaveLength(2);
    for (const [index, name] of ['Gnawer', 'Rotfang'].entries()) {
      const row = rows[index];
      const card = row.get('button.hostile-card');
      const eye = row.get(`button[aria-label="Examine ${name}"]`);
      expect(eye.attributes('title')).toBe(`Examine ${name}`);
      expect(card.element.contains(eye.element)).toBe(false);
      expect(eye.element.parentElement).toBe(row.element);
      expect(card.element.querySelector('button')).toBeNull();
      await eye.trigger('click');
      expect(examine).toHaveBeenLastCalledWith(name);
    }
    expect(examine).toHaveBeenCalledTimes(2);
  });

  it('the eye does not select the hostile and is aria-disabled offline', async () => {
    const { requestTarget, examine, game } = mountPanel();
    await wrapper!.get('button[aria-label="Examine Rotfang"]').trigger('click');
    expect(requestTarget).not.toHaveBeenCalled();
    (game.connected as unknown as { value: boolean }).value = false;
    await wrapper!.vm.$nextTick();
    const eye = wrapper!.get('button[aria-label="Examine Rotfang"]');
    expect(eye.attributes('aria-disabled')).toBe('true');
    examine.mockClear();
    await eye.trigger('click');
    expect(examine).not.toHaveBeenCalled();
  });

  it('uses the singular heading for one hostile', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')] });
    expect(wrapper!.get('h6').text()).toBe('Encounter · 1 hostile');
  });

  it('tags a boss only on the boss card and colors names by difficulty', () => {
    mountPanel();
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    expect(gnawer.find('.boss-tag').text()).toBe('Boss');
    expect(rotfang.find('.boss-tag').exists()).toBe(false);
    const name = rotfang.get('.name');
    expect(name.classes()).toContain('con-orange');
    expect(name.attributes('title')).toBe('Rotfang · Hard');
    expect(rotfang.get('.level').text()).toBe('Lv 6');
  });

  it('rings only the server-confirmed target with the marker and aria-pressed', () => {
    mountPanel();
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    expect(rotfang.attributes('aria-pressed')).toBe('true');
    expect(rotfang.find('.marker').exists()).toBe(true);
    expect(gnawer.attributes('aria-pressed')).toBe('false');
    expect(gnawer.find('.marker').exists()).toBe(false);
  });

  it('does not move the ring on click, only the controller is asked', async () => {
    const { requestTarget } = mountPanel();
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    await gnawer.trigger('click');
    expect(requestTarget).toHaveBeenCalledTimes(1);
    expect(requestTarget).toHaveBeenCalledWith(3n);
    expect(gnawer.attributes('aria-pressed')).toBe('false');
    expect(rotfang.attributes('aria-pressed')).toBe('true');
  });

  it('renders the HP bar attributes and the centered value', () => {
    mountPanel();
    const rotfang = wrapper!.findAll('.hostile-card')[1];
    const bar = rotfang.get('[role="progressbar"]');
    expect(bar.attributes('aria-label')).toBe('Rotfang health');
    expect(bar.attributes('aria-valuenow')).toBe('212');
    expect(bar.attributes('aria-valuemax')).toBe('480');
    expect(rotfang.get('.hp-value').text()).toBe('212/480');
    expect((rotfang.get('.hp-fill').element as HTMLElement).style.width).toBe('44.17%');
  });

  it('makes a defeated card inert', async () => {
    const { requestTarget } = mountPanel({
      enemies: [enemy(9n, 'Rotfang', { currentHp: 0n }), enemy(3n, 'Gnawer')],
    });
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    expect(rotfang.attributes('aria-disabled')).toBe('true');
    expect(rotfang.classes()).toContain('defeated');
    expect(rotfang.find('.marker').exists()).toBe(false);
    expect(gnawer.attributes('aria-disabled')).toBeUndefined();
    await rotfang.trigger('click');
    expect(requestTarget).not.toHaveBeenCalled();
    expect(wrapper!.get('h6').text()).toBe('Encounter · 1 hostile');
  });

  it('falls back to Even match with no level when the template is missing', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')], templates: [] });
    const card = wrapper!.get('.hostile-card');
    expect(card.find('.level').exists()).toBe(false);
    expect(card.get('.name').attributes('title')).toBe('Rotfang · Even match');
    expect(card.get('.name').classes()).toContain('con-white');
  });

  it('puts a long name on one line with the full text in the title', () => {
    const long = 'The Extremely Long Named Bog Horror of the Hollowmere Depths';
    mountPanel({ enemies: [enemy(9n, long)] });
    const name = wrapper!.get('.name');
    expect(name.text()).toBe(long);
    expect(name.attributes('title')).toContain(long);
  });
});

describe('EncounterPanel wind-ups', () => {
  const cast = {
    id: 1n,
    combatId: 1n,
    enemyId: 9n,
    abilityKey: 'bile_spray',
    targetCharacterId: 5n,
    announcedRound: 2n,
    landsAtRound: 4n,
  };

  it('shows a wind-up row with the live round count and the hourglass icon', () => {
    mountPanel({ casts: [cast] });
    const rotfang = wrapper!.findAll('.hostile-card')[1];
    expect(rotfang.findAll('.windup')).toHaveLength(1);
    expect(rotfang.get('.windup-text').text()).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
    expect(rotfang.find('.windup-icon').exists()).toBe(true);
    expect(wrapper!.findAll('.hostile-card')[0].find('.windup').exists()).toBe(false);
  });

  it('shows no wind-up row without a cast', () => {
    mountPanel();
    expect(wrapper!.find('.windup').exists()).toBe(false);
  });

  it('shows each cast on its own hostile', () => {
    mountPanel({
      casts: [cast, { ...cast, id: 2n, enemyId: 3n, abilityKey: 'bite' }],
      abilities: [
        { enemyTemplateId: 100n, abilityKey: 'bile_spray', name: 'Bile Spray' },
        { enemyTemplateId: 101n, abilityKey: 'bite', name: 'Bite' },
      ],
    });
    expect(wrapper!.findAll('.windup')).toHaveLength(2);
  });
});

describe('EncounterPanel threat', () => {
  const aggro = [
    { combatId: 1n, enemyId: 9n, characterId: 8n, value: 300n },
    { combatId: 1n, enemyId: 9n, characterId: 5n, value: 400n },
    { combatId: 1n, enemyId: 3n, characterId: 8n, value: 999n },
  ];

  it('lists the target threat in descending order with You first and relative percent', () => {
    mountPanel({ aggro, characterNames: new Map([[8n, 'Mara']]) });
    expect(wrapper!.get('.threat-heading').text()).toBe('Threat on Rotfang');
    const rows = wrapper!.findAll('.threat-row');
    expect(rows.map((r) => r.get('.threat-name').text())).toEqual(['You', 'Mara']);
    expect(rows.map((r) => r.get('.threat-percent').text())).toEqual(['100%', '75%']);
    expect(rows[0].classes()).toContain('self');
    expect(rows[1].classes()).not.toContain('self');
  });

  it('shows No threat yet. when the view applied with no rows for the target', () => {
    mountPanel({ aggro: [] });
    expect(wrapper!.get('.threat .empty').text()).toBe('No threat yet.');
  });

  it('hides the threat block before the view applies', () => {
    mountPanel({ aggro, aggroApplied: false });
    expect(wrapper!.find('.threat').exists()).toBe(false);
  });

  it('hides the threat block with no target', () => {
    mountPanel({ aggro, target: null });
    expect(wrapper!.find('.threat').exists()).toBe(false);
  });
});

describe('EncounterPanel empty and loading states', () => {
  it('shows only the heading before the enemy binding applies', () => {
    mountPanel({ applied: false, enemies: [] });
    expect(wrapper!.find('h6').exists()).toBe(true);
    expect(wrapper!.find('.hostile-card').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('No hostiles left.');
    expect(wrapper!.find('.threat').exists()).toBe(false);
  });

  it('shows No hostiles left. and hides the threat block when every hostile is defeated', () => {
    mountPanel({
      enemies: [enemy(9n, 'Rotfang', { currentHp: 0n })],
      aggro: [{ combatId: 1n, enemyId: 9n, characterId: 5n, value: 5n }],
    });
    expect(wrapper!.get('.empty').text()).toBe('No hostiles left.');
    expect(wrapper!.find('.hostile-card').exists()).toBe(false);
    expect(wrapper!.find('.threat').exists()).toBe(false);
  });
});

describe('EncounterPanel variants', () => {
  it('rail has the hint and no sheet class', () => {
    mountPanel();
    expect(wrapper!.classes()).not.toContain('sheet');
    expect(wrapper!.find('.hint').exists()).toBe(true);
  });

  it('sheet has no hint, the sheet class and sheet cards', () => {
    mountPanel({}, { variant: 'sheet' });
    expect(wrapper!.classes()).toContain('sheet');
    expect(wrapper!.find('.hint').exists()).toBe(false);
    expect(wrapper!.get('.hostile-card').classes()).toContain('sheet');
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

describe('EncounterPanel enemy effect chips', () => {
  it('shows no chip row for a hostile without effects', () => {
    mountPanel();
    expect(wrapper!.find('.hostile-effects').exists()).toBe(false);
  });

  it('shows each hostile only its own effects', () => {
    mountPanel({
      effects: [
        fx(1n, 9n),
        fx(2n, 9n, { effectType: 'armor_down', sourceAbility: 'Sunder', roundsRemaining: 2n }),
        fx(3n, 3n, { effectType: 'stun', sourceAbility: 'Bash', roundsRemaining: 1n }),
      ],
    });
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    expect(gnawer.findAll('.effect-chips .tag').map((chip) => chip.text())).toEqual(['Crowd control · 1 round']);
    expect(rotfang.findAll('.effect-chips .tag').map((chip) => chip.text())).toEqual([
      'Damage over time · 3 rounds',
      'Debuff · 2 rounds',
    ]);
  });

  it('shows the type text for damage over time, heal over time, debuff and buff', () => {
    mountPanel({
      enemies: [enemy(9n, 'Rotfang')],
      effects: [
        fx(1n, 9n),
        fx(2n, 9n, { effectType: 'regen', sourceAbility: 'Mend' }),
        fx(3n, 9n, { effectType: 'armor_down', sourceAbility: 'Sunder' }),
        fx(4n, 9n, { effectType: 'damage_up', sourceAbility: 'Rage' }),
      ],
    });
    // limit 3 shows three chips and a +1
    expect(wrapper!.findAll('.effect-chips .tag').map((chip) => chip.text())).toEqual([
      'Damage over time · 3 rounds',
      'Heal over time · 3 rounds',
      'Debuff · 3 rounds',
      '+1',
    ]);
  });

  it('reads one round in the singular and N rounds in the plural', () => {
    mountPanel({
      enemies: [enemy(9n, 'Rotfang')],
      effects: [fx(1n, 9n, { roundsRemaining: 1n }), fx(2n, 9n, { roundsRemaining: 12n, sourceAbility: 'Rot' })],
    });
    const texts = wrapper!.findAll('.effect-chips .tag').map((chip) => chip.text());
    expect(texts).toEqual(['Damage over time · 1 round', 'Damage over time · 12 rounds']);
  });

  it('shows a +N chip when more effects than fit, and the total never exceeds the limit plus one', () => {
    const effects = [1n, 2n, 3n, 4n, 5n, 6n].map((id) => fx(id, 9n, { sourceAbility: `Rot ${id}` }));
    mountPanel({ enemies: [enemy(9n, 'Rotfang')], effects });
    const chips = wrapper!.findAll('.effect-chips .tag');
    expect(chips).toHaveLength(4);
    expect(chips[3].text()).toBe('+3');
    expect(chips[3].classes()).toContain('tag-neutral');
    expect(chips[3].attributes('title')).toBe('3 more effects');
  });

  it('shows no +N chip at exactly the limit', () => {
    mountPanel({
      enemies: [enemy(9n, 'Rotfang')],
      effects: [fx(1n, 9n), fx(2n, 9n), fx(3n, 9n)],
    });
    expect(wrapper!.findAll('.effect-chips .tag')).toHaveLength(3);
    expect(wrapper!.find('.tag-neutral').exists()).toBe(false);
  });

  it('names the effect in the title and "{effect} on {enemy}, N rounds left" in the card label', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')], effects: [fx(1n, 9n)] });
    const card = wrapper!.get('.hostile-card');
    expect(card.get('.effect-chips .tag').attributes('title')).toBe('Ignite · Damage over time · 3 rounds');
    expect(card.attributes('aria-label')).toContain('Ignite on Rotfang, 3 rounds left');
  });

  it('keeps chips inline (spans) inside the card button and does not change what a click does', async () => {
    const { requestTarget } = mountPanel({ enemies: [enemy(9n, 'Rotfang')], effects: [fx(1n, 9n)] });
    expect(wrapper!.get('.hostile-card .effect-chips').element.tagName).toBe('SPAN');
    await wrapper!.get('.hostile-card .effect-chips .tag').trigger('click');
    expect(requestTarget).toHaveBeenCalledWith(9n);
  });

  it('shows chips on the sheet variant too', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')], effects: [fx(1n, 9n)] }, { variant: 'sheet' });
    expect(wrapper!.findAll('.effect-chips .tag')).toHaveLength(1);
  });

  it('renders an effect name as text, never markup', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')], effects: [fx(1n, 9n, { sourceAbility: XSS })] });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.effect-chips .tag').attributes('title')).toContain(XSS);
    expect(wrapper!.get('.hostile-card').attributes('aria-label')).toContain(`${XSS} on Rotfang, 3 rounds left`);
    expect(wrapper!.get('.effect-chips').text()).not.toContain('onerror');
    expect(wrapper!.element.querySelector('img')).toBeNull();
  });
});

describe('EncounterPanel rendering safety', () => {
  it('renders hostile, ability and character names as text', () => {
    mountPanel({
      enemies: [enemy(9n, XSS)],
      abilities: [{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: XSS }],
      casts: [
        {
          id: 1n,
          combatId: 1n,
          enemyId: 9n,
          abilityKey: 'bile_spray',
          targetCharacterId: 8n,
          announcedRound: 2n,
          landsAtRound: 4n,
        },
      ],
      aggro: [{ combatId: 1n, enemyId: 9n, characterId: 8n, value: 10n }],
      characterNames: new Map([[8n, XSS]]),
    });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.name').text()).toBe(XSS);
    expect(wrapper!.get('.windup-text').text()).toContain(XSS);
    expect(wrapper!.get('.threat-name').text()).toBe(XSS);
  });
});
