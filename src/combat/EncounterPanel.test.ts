// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
const PANEL_SOURCE = readFileSync(resolve(process.cwd(), 'src/combat/EncounterPanel.vue'), 'utf8');
const CARD_SOURCE = readFileSync(resolve(process.cwd(), 'src/combat/HostileCard.vue'), 'utf8');

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
  petNames?: Map<bigint, string>;
  /** The fight's combat_encounter origin columns; omitted means no row (no origin known). */
  encounter?: Record<string, unknown> | null;
  namedEnemies?: Array<Record<string, unknown>>;
  /** Puts the character at a known place so the rail foot line can render. */
  place?: { name: string; isSafe?: boolean; ready?: boolean };
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
    petNames: ref(setup.petNames ?? new Map<bigint, string>()),
    encounter: ref(setup.encounter ?? null),
  };
  const place = setup.place;
  const game = {
    ...createInertGame(),
    connected: ref(true),
    character: ref({
      id: 5n,
      name: 'Hero',
      level: 4n,
      locationId: 10n,
      combatTargetEnemyId: setup.target === undefined ? 9n : setup.target,
    }),
    characterId: ref(5n),
    namedEnemies: ref(setup.namedEnemies ?? []),
    locations: ref(
      place
        ? [{ id: 10n, name: place.name, regionId: 1n, isSafe: place.isSafe ?? false, terrainType: 'plains', levelOffset: 0n }]
        : [],
    ),
    regions: ref(place ? [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n }] : []),
    poolLevelsHere: ref(
      place && !place.isSafe
        ? [{ id: 1n, regionId: 1n, locationId: 10n, kind: 'creature', refId: 1n, level: 2, lvLo: 6n, lvHi: 7n }]
        : [],
    ),
    poolsAppliedFor: () => place?.ready ?? false,
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
    expect(wrapper!.get('h6').text()).toBe('Encounter · 2 left');
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

  it('counts one living enemy as 1 left', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang')] });
    expect(wrapper!.get('h6').text()).toBe('Encounter · 1 left');
  });

  it('shows the Boss role chip on the boss card (no old Boss tag) and colors names by difficulty', () => {
    mountPanel();
    const [gnawer, rotfang] = wrapper!.findAll('.hostile-card');
    expect(gnawer.get('.role-chip').text()).toBe('Boss');
    expect(gnawer.get('.role-chip').classes()).toContain('role-boss');
    expect(rotfang.get('.role-chip').text()).toBe('Damage');
    expect(wrapper!.find('.boss-tag').exists()).toBe(false);
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
    expect(wrapper!.get('h6').text()).toBe('Encounter · 1 left');
    expect(rotfang.get('.hp-value').text()).toBe('Down');
    expect(rotfang.get('.target-line').text()).toBe('Out of the fight');
    expect(rotfang.get('.target-line').classes()).toContain('out');
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

describe('EncounterPanel threat block removed (D-40)', () => {
  it('draws no threat heading, rows or empty line even with threat rows applied', () => {
    mountPanel({
      aggro: [
        { combatId: 1n, enemyId: 9n, characterId: 8n, value: 300n },
        { combatId: 1n, enemyId: 9n, characterId: 5n, value: 400n },
      ],
      characterNames: new Map([[8n, 'Mara']]),
    });
    expect(wrapper!.find('.threat').exists()).toBe(false);
    expect(wrapper!.find('.threat-heading').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('Threat');
    expect(PANEL_SOURCE).not.toContain('ThreatBlock');
    expect(PANEL_SOURCE).not.toContain('threatView');
  });
});

describe('EncounterPanel empty and loading states', () => {
  it('shows only the heading before the enemy binding applies', () => {
    mountPanel({ applied: false, enemies: [] });
    expect(wrapper!.find('h6').exists()).toBe(true);
    expect(wrapper!.find('.hostile-card').exists()).toBe(false);
    expect(wrapper!.text()).not.toContain('No hostiles left.');
  });

  it('shows No hostiles left. when every hostile is defeated', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang', { currentHp: 0n })] });
    expect(wrapper!.get('.empty').text()).toBe('No hostiles left.');
    expect(wrapper!.find('.hostile-card').exists()).toBe(false);
    expect(wrapper!.get('h6').text()).toBe('Encounter · 0 left');
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
      characterNames: new Map([[8n, XSS]]),
    });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.name').text()).toBe(XSS);
    expect(wrapper!.get('.windup-text').text()).toContain(XSS);
  });

  it('renders target, ally, family and place names as text', () => {
    mountPanel({
      enemies: [
        enemy(9n, XSS, { aggroTargetCharacterId: 8n }),
        enemy(3n, XSS, { healTargetEnemyId: 9n }),
      ],
      templates: [{ id: 100n, level: 6n }, { id: 101n, level: 3n, role: 'healer' }],
      characterNames: new Map([[8n, XSS]]),
      encounter: { origin: 'pull', originName: XSS, originPlural: XSS, originLevel: 2n },
      place: { name: XSS, ready: true },
    });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.element.querySelector('img')).toBeNull();
    expect(wrapper!.get('h6').text()).toBe(`Encounter · ${XSS} · 2 left`);
    expect(wrapper!.get('.source').text()).toBe(`Pulled from ${XSS} that read stable here.`);
    const names = wrapper!.findAll('.target-name').map((n) => n.text());
    expect(names).toEqual([XSS, XSS]);
    expect(wrapper!.get('.encounter-foot .foot-text').text()).toBe(`${XSS} · Deadly`);
  });

  it('no button nests inside another in the panel', () => {
    mountPanel({ enemies: [enemy(9n, 'Rotfang', { aggroTargetCharacterId: 5n })] });
    expect(wrapper!.findAll('button button')).toHaveLength(0);
  });
});

describe('EncounterPanel role chips and target lines (UI Q6)', () => {
  const names = new Map<bigint, string>([[8n, 'Mara']]);

  function mixed(over: Partial<Setup> = {}) {
    return mountPanel({
      enemies: [
        enemy(1n, 'Shieldback', { enemyTemplateId: 201n, aggroTargetCharacterId: 5n }),
        enemy(2n, 'Biter', { enemyTemplateId: 202n, aggroTargetCharacterId: 8n }),
        enemy(3n, 'Hexer', { enemyTemplateId: 203n, aggroTargetPetId: 7n }),
        enemy(4n, 'Mender', { enemyTemplateId: 204n, healTargetEnemyId: 1n, aggroTargetCharacterId: 5n }),
      ],
      templates: [
        { id: 201n, level: 4n, role: 'tank' },
        { id: 202n, level: 4n, role: 'damage' },
        { id: 203n, level: 4n, role: 'caster' },
        { id: 204n, level: 4n, role: 'healer' },
      ],
      characterNames: names,
      petNames: new Map([[7n, 'Ember']]),
      target: 2n,
      ...over,
    });
  }

  it('orders each card: role row, name row, HP, then the target line last', () => {
    mixed();
    const card = wrapper!.findAll('.hostile-card')[1];
    const kids = [...card.element.children].map((el) => el.className);
    expect(kids[0]).toContain('row-role');
    expect(kids[1]).toContain('row-name');
    expect(kids[2]).toContain('hp-track');
    expect(kids[kids.length - 1]).toContain('target-line');
    // the targeted marker sits in the role row now
    expect(card.find('.row-role .marker').exists()).toBe(true);
    expect(card.get('.row-name .name').text()).toBe('Biter');
    expect(card.get('.row-name .level').text()).toBe('Lv 4');
  });

  it('shows Tank, Damage, Caster and Support (healer) chips', () => {
    mixed();
    expect(wrapper!.findAll('.role-chip').map((c) => c.text())).toEqual(['Tank', 'Damage', 'Caster', 'Support']);
    expect(wrapper!.findAll('.role-chip svg').every((icon) => icon.attributes('aria-hidden') === 'true')).toBe(true);
  });

  it('reads Targeting you, Targeting {name}, the pet name and Healing {ally}', () => {
    mixed();
    const lines = wrapper!.findAll('.target-line');
    expect(lines.map((l) => l.text())).toEqual([
      'Targeting you',
      'Targeting Mara',
      'Targeting Ember',
      'Healing Shieldback',
    ]);
    expect(lines[0].get('.target-name').classes()).toContain('self');
    expect(lines[1].get('.target-name').classes()).not.toContain('self');
    expect(lines[3].classes()).toContain('healing');
  });

  it('puts the role after the name and the target at the end of the card label', () => {
    mixed();
    const cards = wrapper!.findAll('.hostile-card');
    expect(cards[0].attributes('aria-label')).toBe('Shieldback, Tank, level 4, Even match, 44% health, targeting you');
    expect(cards[3].attributes('aria-label')).toBe(
      'Mender, Support, level 4, Even match, 44% health, healing Shieldback',
    );
  });

  it('shows no target line without a known target, and only Healing with a heal target', () => {
    mountPanel({
      enemies: [enemy(9n, 'Rotfang'), enemy(3n, 'Gnawer', { aggroTargetCharacterId: 99n })],
      characterNames: names,
    });
    expect(wrapper!.find('.target-line').exists()).toBe(false);
  });

  it('a name arriving later fills the target line in', async () => {
    const { combat } = mountPanel({ enemies: [enemy(9n, 'Rotfang', { aggroTargetCharacterId: 8n })] });
    expect(wrapper!.find('.target-line').exists()).toBe(false);
    (combat.characterNames as unknown as { value: Map<bigint, string> }).value = names;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('.target-line').text()).toBe('Targeting Mara');
  });

  it('marks a named enemy with the Named chip', () => {
    mountPanel({
      enemies: [enemy(9n, 'Old Greymaw')],
      namedEnemies: [{ id: 1n, characterId: 5n, name: 'Old Greymaw', enemyTemplateId: 100n, locationId: 10n, isAlive: true }],
    });
    expect(wrapper!.get('.role-chip').text()).toBe('Named');
  });

  it('target line icons and colours follow the UI-SPEC table', () => {
    expect(CARD_SOURCE).toContain('PhCrosshair ');
    expect(CARD_SOURCE).toContain('PhFirstAid ');
    expect(CARD_SOURCE).toContain('PhSkull');
    expect(CARD_SOURCE).toContain('RoleChip');
    expect(CARD_SOURCE).not.toContain('boss-tag');
    const rule = (sel: string) => CARD_SOURCE.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    expect(rule('.target-line')).toContain('border-top: 1px solid var(--color-neutral-800)');
    expect(rule('.target-line')).toContain('padding-top: 4px');
    expect(rule('.target-name.self')).toContain('var(--color-accent-300)');
    expect(rule('.target-line.healing .target-name')).toContain('var(--color-con-light-green)');
    expect(rule('.target-line.out')).toContain('var(--color-neutral-500)');
  });
});

describe('EncounterPanel heading, source and foot (UI Q7, D-32)', () => {
  const pull = { origin: 'pull', originName: 'Goblins', originPlural: 'goblins', originLevel: 2n };

  it('heads a family fight with the family name and the living count', () => {
    mountPanel({ encounter: pull });
    expect(wrapper!.get('h6').text()).toBe('Encounter · Goblins · 2 left');
    expect(wrapper!.get('p.source').text()).toBe('Pulled from Goblins that read stable here.');
    expect(wrapper!.get('p.source').classes()).not.toContain('ambush');
  });

  it('heads a named fight with the enemy name', () => {
    mountPanel({
      enemies: [enemy(9n, 'Old Greymaw')],
      encounter: { origin: 'named', originName: 'Cave Rat', originPlural: '', originLevel: 0n },
    });
    expect(wrapper!.get('h6').text()).toBe('Encounter · Old Greymaw · 1 left');
    expect(wrapper!.get('p.source').text()).toBe('A named fight. No one else comes.');
    expect(wrapper!.get('.role-chip').text()).toBe('Named');
  });

  it('tones the ambush source line', () => {
    mountPanel({ encounter: { ...pull, origin: 'ambush_enter' } });
    expect(wrapper!.get('p.source').text()).toBe('Ambushed on the way in.');
    expect(wrapper!.get('p.source').classes()).toContain('ambush');
    expect(PANEL_SOURCE).toMatch(/\.source\.ambush\s*\{[^}]*var\(--color-con-orange\)/);
    expect(PANEL_SOURCE).toMatch(/\.source\s*\{[^}]*var\(--color-neutral-400\)/);
  });

  it('shows no source line and the fallback heading without a recorded origin', () => {
    mountPanel({ encounter: { origin: '', originName: '', originPlural: '', originLevel: 0n } });
    expect(wrapper!.get('h6').text()).toBe('Encounter · 2 left');
    expect(wrapper!.find('.source').exists()).toBe(false);
    wrapper!.unmount();
    wrapper = null;
    mountPanel({ encounter: null });
    expect(wrapper!.find('.source').exists()).toBe(false);
  });

  it('ellipsizes the heading', () => {
    expect(PANEL_SOURCE).toMatch(/\.panel-head h6\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(PANEL_SOURCE).toMatch(/\.panel-head h6\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('ends the rail with the foot line: dot, place and rating', () => {
    mountPanel({ place: { name: 'Ember Gate', ready: true } });
    const foot = wrapper!.get('p.encounter-foot');
    expect(foot.get('.rating-mark').classes()).toContain('rate-deadly');
    expect(foot.get('.rating-mark .dot').attributes('aria-hidden')).toBe('true');
    expect(foot.get('.foot-text').text()).toBe('Ember Gate · Deadly');
    const section = wrapper!.get('section.encounter-panel').element;
    expect(section.lastElementChild).toBe(foot.element);
    expect(PANEL_SOURCE).toMatch(/\.encounter-foot\s*\{[^}]*margin-top:\s*auto/);
  });

  it('reads the place alone with the neutral dot until the pools apply, and Safe at a safe place', () => {
    mountPanel({ place: { name: 'Ember Gate', ready: false } });
    expect(wrapper!.get('.encounter-foot .foot-text').text()).toBe('Ember Gate');
    expect(wrapper!.get('.encounter-foot .rating-mark').classes()).toContain('rate-unknown');
    wrapper!.unmount();
    wrapper = null;
    mountPanel({ place: { name: 'Hearth', isSafe: true, ready: true } });
    expect(wrapper!.get('.encounter-foot .foot-text').text()).toBe('Hearth · Safe');
  });

  it('shows no foot line without a known place', () => {
    mountPanel();
    expect(wrapper!.find('.encounter-foot').exists()).toBe(false);
  });

  it('the sheet keeps the source as its first paragraph, one column, 44px cards, no hint and no foot', () => {
    mountPanel({ encounter: { ...pull, origin: 'ambush_leave' }, place: { name: 'Ember Gate', ready: true } }, { variant: 'sheet' });
    expect(wrapper!.find('.hint').exists()).toBe(false);
    expect(wrapper!.find('.encounter-foot').exists()).toBe(false);
    const firstParagraph = wrapper!.element.querySelector('p');
    expect(firstParagraph?.textContent).toBe('Ambushed on the way out.');
    for (const card of wrapper!.findAll('.hostile-card')) expect(card.classes()).toContain('sheet');
    expect(CARD_SOURCE).toMatch(/\.hostile-card\.sheet\s*\{[^}]*min-height:\s*44px/);
    expect(PANEL_SOURCE).toMatch(/\.hostiles\s*\{[^}]*flex-direction:\s*column/);
  });
});

// UI Q6 overflow (backstop): happy-dom has no layout, so the measured check reads the card CSS the
// browser applies: every row is a block or flex row that keeps its place, and the name and the target
// name hold one line with an ellipsis inside a min-width 0 box.
describe('EncounterPanel overflow backstop: four enemies, long names, effects and a wind-up each', () => {
  const LONG = 'The Extremely Long Named Bog Horror of the Hollowmere Depths';
  const style = CARD_SOURCE.slice(CARD_SOURCE.indexOf('>', CARD_SOURCE.indexOf('<style')) + 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const value = (selector: string, prop: string): string | null => {
    for (const match of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = match[1].split(',').map((x) => x.trim());
      if (!selectors.includes(selector)) continue;
      const found = match[2].match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
      if (found) return found[1].trim();
    }
    return null;
  };

  it('keeps every card row and ellipsizes the names and target names', () => {
    const ids = [1n, 2n, 3n, 4n];
    mountPanel({
      enemies: ids.map((id) => enemy(id, `${LONG} ${id}`, { aggroTargetCharacterId: 8n })),
      characterNames: new Map([[8n, `${LONG} the Wanderer`]]),
      effects: ids.map((id) => ({ id, combatId: 1n, enemyId: id, effectType: 'dot', magnitude: 6n, roundsRemaining: 3n, sourceAbility: 'Ignite' })),
      casts: ids.map((id) => ({ id, combatId: 1n, enemyId: id, abilityKey: 'bile_spray', targetCharacterId: 5n, announcedRound: 2n, landsAtRound: 4n })),
      target: 2n,
    });
    const cards = wrapper!.findAll('.hostile-card');
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.find('.row-role .role-chip').exists()).toBe(true);
      expect(card.find('.row-name .name').exists()).toBe(true);
      expect(card.find('.hp-track').exists()).toBe(true);
      expect(card.find('.effect-chips').exists()).toBe(true);
      expect(card.find('.windup').exists()).toBe(true);
      expect(card.get('.target-line .target-name').text()).toBe(`${LONG} the Wanderer`);
      expect(card.attributes('aria-label')).toContain(`targeting ${LONG} the Wanderer`);
      expect(card.attributes('aria-label')!.startsWith(LONG)).toBe(true);
    }
    for (const sel of ['.name', '.target-name']) {
      expect(value(sel, 'overflow')).toBe('hidden');
      expect(value(sel, 'text-overflow')).toBe('ellipsis');
      expect(value(sel, 'white-space')).toBe('nowrap');
      expect(value(sel, 'min-width')).toBe('0');
    }
    expect(value('.hostile-card', 'min-width')).toBe('0');
    expect(value('.row', 'min-width')).toBe('0');
    expect(value('.target-line', 'min-width')).toBe('0');
  });
});
