// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import CombatMemberCard from './CombatMemberCard.vue';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { CombatController, GameData } from '../game/context';
import type { PartyMemberView } from '../rails/party';
import type { FollowState } from './follow';

// The in-combat member card (51.1-UI-SPEC "Vitals Rail Party Block", In combat (COMBAT3 7a)):
// div.member-card = [button.member-target][⋯]; the header (crosshair when selected, name, crown,
// class or 'Offline', follow icon, Lv), no visible HP text, the HP, mana (casters only) and stamina
// bars, the member's effect chips (8 then +N), HP numbers in the accessible name, ally selection
// through the combat controller, and the non-button unknown card.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const ME = 1n;
const BO = 3n;
const PAYLOAD = '<img src=x onerror=alert(1)>';

function view(over: Partial<PartyMemberView> = {}): PartyMemberView {
  return {
    id: BO,
    name: 'Bo',
    className: 'Shade Rogue',
    level: 5n,
    hp: 201n,
    maxHp: 410n,
    resource: 20n,
    maxResource: 40n,
    resourceKind: 'stamina',
    stamina: 20n,
    maxStamina: 40n,
    lowStamina: false,
    isLeader: false,
    known: true,
    healthPercent: 49,
    online: true,
    followLeader: true,
    locationId: 10n,
    ...over,
  };
}

function caster(over: Partial<PartyMemberView> = {}): PartyMemberView {
  return view({ className: 'Hedge-Priest', resource: 30n, maxResource: 120n, resourceKind: 'mana', ...over });
}

function row(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    level: 5n,
    race: 'Human',
    className: 'Shade Rogue',
    locationId: 10n,
    online: true,
    groupId: 7n,
    ...over,
  };
}

function fx(id: bigint, characterId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    characterId,
    effectType: 'dot',
    magnitude: 3n,
    roundsRemaining: 0n,
    sourceAbility: 'Poisoned',
    ...over,
  };
}

interface Options {
  member?: PartyMemberView;
  state?: FollowState | null;
  allyTargetId?: bigint | null;
  effects?: unknown[];
}

function mountCard(options: Options = {}): {
  w: VueWrapper;
  selectAlly: ReturnType<typeof vi.fn>;
  allyTargetId: ReturnType<typeof ref<bigint | null>>;
} {
  const selectAlly = vi.fn();
  const allyTargetId = ref<bigint | null>(options.allyTargetId === undefined ? ME : options.allyTargetId);
  const inert = createInertGame();
  // You lead a party of you and Bo, so Bo's menu has entries (the ⋯ renders).
  const game = {
    ...inert,
    connected: ref(true),
    character: ref(row(ME, 'Ann')),
    characterId: ref<bigint | null>(ME),
    group: ref({ id: 7n, leaderCharacterId: ME }),
    groupMembers: ref([
      { id: 11n, groupId: 7n, characterId: ME, followLeader: true, joinedAt: { microsSinceUnixEpoch: 1n } },
      { id: 12n, groupId: 7n, characterId: BO, followLeader: true, joinedAt: { microsSinceUnixEpoch: 2n } },
    ]),
    knownCharacters: ref([row(BO, 'Bo')]),
    effects: ref(options.effects ?? [fx(1n, BO), fx(2n, ME, { sourceAbility: 'Your Ward', effectType: 'armor_up' })]),
    combat: { ...inert.combat, active: ref(true) },
  } as unknown as GameData;
  const controller = { ...createInertCombat(), allyTargetId, selectAlly } as unknown as CombatController;
  wrapper = mount(CombatMemberCard, {
    attachTo: document.body,
    props: {
      member: options.member ?? view(),
      state: options.state === undefined ? 'comes_along' : options.state,
    },
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [COMBAT_KEY as symbol]: controller,
        [SOCIAL_KEY as symbol]: createInertSocial(),
        [CONSOLE_KEY as symbol]: createInertConsole(),
        [FRAME_KEY as symbol]: createInertFrame(),
      },
    },
  });
  return { w: wrapper, selectAlly, allyTargetId };
}

function childClasses(el: Element): string[] {
  return Array.from(el.children).map((child) => (child.getAttribute('class') ?? '').split(' ')[0]);
}

describe('CombatMemberCard populated', () => {
  it('is a div holding the target button and the ⋯ as siblings', () => {
    const { w } = mountCard();
    const card = w.get('.member-card');
    expect(card.element.tagName).toBe('DIV');
    expect(childClasses(card.element)).toEqual(['member-target', 'player-menu']);
    const target = card.get('.member-target');
    expect(target.element.tagName).toBe('BUTTON');
    expect(target.attributes('type')).toBe('button');
    expect(card.get('.player-menu .menu-opener').attributes('aria-label')).toBe('Actions for Bo');
    expect(w.findAll('button button')).toHaveLength(0);
    expect(target.find('div').exists()).toBe(false);
  });

  it('reads name, class, follow icon and Lv in the header, with no visible HP text', () => {
    const { w } = mountCard();
    const header = w.get('.member-row');
    expect(w.get('.member-name').text()).toBe('Bo');
    expect(w.get('.member-name').attributes('title')).toBe('Bo');
    expect(w.get('.member-class').text()).toBe('Shade Rogue');
    const icon = w.get('.right .follow-icon');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.attributes('title')).toBe('Travels with the leader');
    expect(w.get('.member-level').text()).toBe('Lv 5');
    expect(w.find('.crown').exists()).toBe(false);
    expect(header.text()).not.toContain('201');
    expect(w.get('.member-target').text()).not.toContain('201');
    expect(w.get('.member-target').text()).not.toContain('410');
  });

  it('orders the header crosshair, name, crown, class, right group for a selected leader', () => {
    const { w } = mountCard({ member: view({ isLeader: true }), state: 'leader', allyTargetId: BO });
    expect(childClasses(w.get('.member-row').element)).toEqual([
      'marker',
      'character-name',
      'crown',
      'member-class',
      'right',
    ]);
    expect(w.get('.crown').attributes('aria-hidden')).toBe('true');
  });

  it('draws the HP bar with its title, no mana bar and the stamina bar for a mana-less member', () => {
    const { w } = mountCard();
    const health = w.get('.health-track');
    expect(health.element.tagName).toBe('SPAN');
    expect(health.attributes('role')).toBe('progressbar');
    expect(health.attributes('title')).toBe('Health 201/410');
    expect((health.get('.fill').element as HTMLElement).style.width).toBe(`${(201 / 410) * 100}%`);
    expect(w.find('.mana-track').exists()).toBe(false);
    const stamina = w.get('.stamina-track');
    expect(stamina.attributes('title')).toBe('Stamina 20/40');
    expect((stamina.get('.fill').element as HTMLElement).style.width).toBe('50%');
  });

  it('a caster shows the mana bar with its title between HP and stamina', () => {
    const { w } = mountCard({ member: caster() });
    const mana = w.get('.mana-track');
    expect(mana.attributes('title')).toBe('Mana 30/120');
    expect(mana.find('.fill-mana').exists()).toBe(true);
    expect(childClasses(w.get('.bars').element)).toEqual(['track', 'track', 'track']);
    const tracks = w.findAll('.bars > .track').map((t) => t.classes()[1]);
    expect(tracks).toEqual(['health-track', 'mana-track', 'stamina-track']);
  });

  it('labels the target with level, class, health, follow phrase and effects', () => {
    const { w } = mountCard();
    expect(w.get('.member-target').attributes('aria-label')).toBe(
      'Target Bo with your next ability. Shade Rogue, level 5, health 201 of 410, stamina 20 of 40, travels with the leader. Effects: Poisoned.',
    );
  });

  it('a caster label carries mana between health and stamina (owner 2026-10-08)', () => {
    const { w } = mountCard({ member: caster() });
    expect(w.get('.member-target').attributes('aria-label')).toBe(
      'Target Bo with your next ability. Hedge-Priest, level 5, health 201 of 410, mana 30 of 120, stamina 20 of 40, travels with the leader. Effects: Poisoned.',
    );
  });

  it('leaves out the effects part when the member has none, and the follow phrase with no state', () => {
    const { w } = mountCard({ effects: [], state: null });
    expect(w.get('.member-target').attributes('aria-label')).toBe(
      'Target Bo with your next ability. Shade Rogue, level 5, health 201 of 410, stamina 20 of 40.',
    );
  });

  it('shows only this member chips, inline and dense, inside the button', () => {
    const { w } = mountCard();
    const chips = w.get('.member-target .effect-chips');
    expect(chips.element.tagName).toBe('SPAN');
    expect(chips.classes()).toContain('dense');
    expect(chips.findAll('.tag').map((t) => t.text())).toEqual(['Poisoned']);
    expect(w.text()).not.toContain('Your Ward');
  });

  it('shows no chip strip for a member with no effects', () => {
    const { w } = mountCard({ effects: [] });
    expect(w.find('.effect-chips').exists()).toBe(false);
  });

  it('shows eight chips then +1 for nine effects', () => {
    const nine = Array.from({ length: 9 }, (_, i) => fx(BigInt(i + 1), BO, { sourceAbility: `Hex ${i + 1}` }));
    const { w } = mountCard({ effects: nine });
    const tags = w.findAll('.effect-chips .tag');
    expect(tags).toHaveLength(9);
    expect(tags[8].text()).toBe('+1');
  });
});

describe('CombatMemberCard ally targeting', () => {
  it('is not pressed and shows no crosshair while the ally target is you', () => {
    const { w } = mountCard();
    expect(w.get('.member-target').attributes('aria-pressed')).toBe('false');
    expect(w.get('.member-card').classes()).not.toContain('selected');
    expect(w.find('.marker').exists()).toBe(false);
  });

  it('is pressed with the ring and the crosshair when this member is the ally target', () => {
    const { w } = mountCard({ allyTargetId: BO });
    expect(w.get('.member-target').attributes('aria-pressed')).toBe('true');
    expect(w.get('.member-card').classes()).toContain('selected');
    const marker = w.get('.marker');
    expect(marker.attributes('aria-hidden')).toBe('true');
    expect(w.get('.member-row').element.firstElementChild).toBe(marker.element);
  });

  it('click selects the member through the controller, with no server call', async () => {
    const { w, selectAlly } = mountCard();
    await w.get('.member-target').trigger('click');
    expect(selectAlly).toHaveBeenCalledTimes(1);
    expect(selectAlly).toHaveBeenCalledWith(BO);
  });

  it('follows the controller selection at once', async () => {
    const { w, allyTargetId } = mountCard();
    allyTargetId.value = BO;
    await nextTick();
    expect(w.get('.member-target').attributes('aria-pressed')).toBe('true');
    allyTargetId.value = ME;
    await nextTick();
    expect(w.get('.member-target').attributes('aria-pressed')).toBe('false');
  });

  it('a selected member at 0 HP stays selected', () => {
    const { w } = mountCard({ member: view({ hp: 0n }), allyTargetId: BO });
    expect(w.get('.member-target').attributes('aria-pressed')).toBe('true');
    expect(w.get('.health-track').attributes('title')).toBe('Health 0/410');
  });

  it('right-click on the card opens the menu, prevents the browser menu and keeps the target', async () => {
    const { w, selectAlly } = mountCard();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    w.get('.member-row').element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(w.get('button.menu-opener').attributes('aria-expanded')).toBe('true');
    expect(selectAlly).not.toHaveBeenCalled();
  });
});

describe('CombatMemberCard partial and unknown', () => {
  it('an offline member reads Offline, is muted, says offline and is still a target', async () => {
    const { w, selectAlly } = mountCard({ member: view({ online: false }), state: 'following_elsewhere' });
    const card = w.get('.member-card');
    expect(card.classes()).toContain('muted');
    expect(w.get('.member-class').text()).toBe('Offline');
    const target = w.get('.member-target');
    expect(target.element.tagName).toBe('BUTTON');
    expect(target.attributes('aria-label')).toBe(
      "Target Bo with your next ability. Shade Rogue, level 5, health 201 of 410, stamina 20 of 40, follows the leader, but isn't with them, offline. Effects: Poisoned.",
    );
    await target.trigger('click');
    expect(selectAlly).toHaveBeenCalledWith(BO);
  });

  it('an unknown member is a muted div reading Member with no bars, no button and no ⋯', async () => {
    const unknown = view({ name: '', className: '', known: false, online: false, hp: 0n, maxHp: 0n });
    const { w, selectAlly } = mountCard({ member: unknown, state: null });
    const card = w.get('.member-card');
    expect(card.element.tagName).toBe('DIV');
    expect(card.classes()).toContain('unknown');
    expect(card.classes()).toContain('muted');
    expect(w.get('.member-name').text()).toBe('Member');
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('[role="progressbar"]').exists()).toBe(false);
    expect(w.find('.player-menu').exists()).toBe(false);
    expect(w.find('.effect-chips').exists()).toBe(false);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.element.dispatchEvent(event);
    await card.trigger('click');
    expect(event.defaultPrevented).toBe(false);
    expect(selectAlly).not.toHaveBeenCalled();
  });

  it('renders the name, class and effect text as text, not markup', () => {
    const { w } = mountCard({
      member: view({ name: PAYLOAD, className: PAYLOAD }),
      effects: [fx(1n, BO, { sourceAbility: PAYLOAD })],
    });
    expect(w.find('img').exists()).toBe(false);
    expect(document.body.querySelector('img')).toBeNull();
    expect(w.get('.member-name').text()).toBe(PAYLOAD);
    expect(w.get('.member-class').text()).toBe(PAYLOAD);
    expect(w.get('.effect-chips .tag').text()).toBe(PAYLOAD);
    expect(w.get('.member-target').attributes('aria-label')).toBe(
      `Target ${PAYLOAD} with your next ability. ${PAYLOAD}, level 5, health 201 of 410, stamina 20 of 40, travels with the leader. Effects: ${PAYLOAD}.`,
    );
  });
});

describe('CombatMemberCard source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/social/CombatMemberCard.vue'), 'utf8');
  const style = source.slice(source.indexOf('<style'));

  it('wires the controller, the shared chips and the tokens', () => {
    expect(source).toContain('selectAlly(');
    expect(source).toContain('effectViews(');
    expect(source).toContain('<PlayerMenu');
    expect(source).toContain('var(--color-health)');
    expect(source).toContain('var(--color-mana)');
    expect(source).toContain('var(--color-stamina)');
    expect(source).toContain('0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent)');
    expect(source).toContain('margin: 4px 4px 0 0');
    expect(source).toContain('opacity: 0.45');
    expect(source).not.toContain('v-html');
  });

  it('lets the class ellipsize first while the right group keeps its width', () => {
    const rule = (selector: string): string => {
      const at = style.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return style.slice(at, style.indexOf('}', at));
    };
    expect(rule('.member-class')).toContain('flex: 1 1 0');
    expect(rule('.member-class')).toContain('text-overflow: ellipsis');
    expect(rule('.member-name')).toContain('flex: 0 1 auto');
    expect(rule('.right')).toContain('flex: none');
    expect(rule('.right')).toContain('margin-left: auto');
    expect(rule('.marker')).toContain('flex: none');
    expect(style).not.toMatch(/(?:margin|padding)[a-z-]*\s*:[^;]*-\d/);
  });
});
