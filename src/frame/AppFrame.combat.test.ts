// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import AppFrame from './AppFrame.vue';
import type { FrameView } from '../session/frameView';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { landsInAtAnnouncement, windupParts } from '../combat/windup';

// Phase 48 gate (48-14): every combat surface in one mounted frame, at desktop (1280) and mobile
// (390) widths. Fixtures use bigint ids and { microsSinceUnixEpoch } timestamps and are cast once
// at the provide boundary, like the other frame tests. The frame provides its own combat
// controller (48-05), so the test supplies only GAME_KEY.

const XSS = '<img src=x onerror=alert(1)>';

type Listener = (event: { matches: boolean }) => void;

function installMatchMedia(desktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: (_type: string, _listener: Listener) => {},
    removeEventListener: (_type: string, _listener: Listener) => {},
  }));
  window.matchMedia = globalThis.matchMedia;
}

const CHARACTER_ID = 1n;
const MARA_ID = 2n;
const COMBAT_ID = 1n;
const PET_ID = 7n;
const SECOND = 1_000_000n;
const FIXED_NOW = Date.UTC(2026, 9, 6, 12, 0, 0);

const view: FrameView = {
  characterName: 'Brannoch',
  avatarInitial: 'B',
  classLine: 'Lv 3 · Wizard',
  accountLine: 'Lv 3 · Elf Wizard',
  hp: 212n,
  maxHp: 260n,
  mana: 80n,
  maxMana: 120n,
  stamina: 50n,
  maxStamina: 90n,
  placeLabel: 'Ashfall Wilds · Ember Gate',
  locationName: 'Ember Gate',
  timeOfDay: 'day',
  levelUp: false,
  newSkill: false,
};

function nowMicros(): bigint {
  return BigInt(Date.now()) * 1000n;
}

interface Names {
  hostile: string;
  ability: string;
  windupAbility: string;
  member: string;
  pet: string;
  narration: string;
}

const PLAIN: Names = {
  hostile: 'Rotfang',
  ability: 'Firebolt',
  windupAbility: 'Bile Spray',
  member: 'Mara',
  pet: 'Ember',
  narration: 'The ground shakes as Rotfang lunges.',
};

const HOSTILE_NAMES: Names = {
  hostile: XSS,
  ability: XSS,
  windupAbility: XSS,
  member: XSS,
  pet: XSS,
  narration: XSS,
};

interface Reducers {
  submitIntent: ReturnType<typeof vi.fn>;
  moveCharacter: ReturnType<typeof vi.fn>;
  inviteToGroup: ReturnType<typeof vi.fn>;
  useAbility: ReturnType<typeof vi.fn>;
  switchHotbar: ReturnType<typeof vi.fn>;
  setCombatTarget: ReturnType<typeof vi.fn>;
  submitCombatAction: ReturnType<typeof vi.fn>;
  fleeCombat: ReturnType<typeof vi.fn>;
}

function combatGame(names: Names): { game: GameData; reducers: Reducers } {
  const base = createInertGame();
  const reducers: Reducers = {
    submitIntent: vi.fn().mockResolvedValue(undefined),
    moveCharacter: vi.fn().mockResolvedValue(undefined),
    inviteToGroup: vi.fn().mockResolvedValue(undefined),
    useAbility: vi.fn().mockResolvedValue(undefined),
    switchHotbar: vi.fn().mockResolvedValue(undefined),
    setCombatTarget: vi.fn().mockResolvedValue(undefined),
    submitCombatAction: vi.fn().mockResolvedValue(undefined),
    fleeCombat: vi.fn().mockResolvedValue(undefined),
  };

  const character = {
    id: CHARACTER_ID,
    name: 'Brannoch',
    // The self block menu (51.1-13) reads your race.
    race: 'Human',
    className: 'Wizard',
    level: 3n,
    xp: 318n,
    hp: 212n,
    maxHp: 260n,
    mana: 80n,
    maxMana: 120n,
    stamina: 50n,
    maxStamina: 90n,
    locationId: 10n,
    combatTargetEnemyId: 9n,
  };
  const mara = {
    id: MARA_ID,
    name: names.member,
    // The in-combat member card (51.1-14) mounts Mara's ⋯, whose header reads race; online keeps
    // the card out of the muted offline state.
    race: 'Elf',
    online: true,
    className: 'Ranger',
    level: 4n,
    hp: 95n,
    maxHp: 100n,
    mana: 20n,
    maxMana: 40n,
    stamina: 10n,
    maxStamina: 10n,
    locationId: 10n,
  };

  const abilities = [
    {
      id: 11n,
      characterId: CHARACTER_ID,
      name: names.ability,
      kind: 'damage',
      targetRule: 'single_enemy',
      resourceType: 'mana',
      resourceCost: 10n,
      cooldownSeconds: 6n,
    },
    {
      id: 12n,
      characterId: CHARACTER_ID,
      name: 'Mend',
      kind: 'heal',
      targetRule: 'single_ally',
      resourceType: 'mana',
      resourceCost: 12n,
      cooldownSeconds: 8n,
    },
  ];

  const openRound = {
    id: 1n,
    combatId: COMBAT_ID,
    roundNumber: 3n,
    state: 'action_select',
    timerExpiresAtMicros: nowMicros() + 6n * SECOND,
    narrationCount: 0n,
    startedAtMicros: nowMicros() - 4n * SECOND,
  };
  const self = { id: 1n, combatId: COMBAT_ID, characterId: CHARACTER_ID, status: 'active', nextAutoAttackAt: 0n };
  const maraParticipant = { id: 2n, combatId: COMBAT_ID, characterId: MARA_ID, status: 'active', nextAutoAttackAt: 0n };
  const cast = {
    id: 70n,
    combatId: COMBAT_ID,
    enemyId: 9n,
    abilityKey: 'bile_spray',
    endsAtMicros: nowMicros() + 8n * SECOND,
    targetCharacterId: null,
    targetPetId: PET_ID,
    announcedRound: 2n,
    landsAtRound: 4n,
  };

  const combat = {
    ...base.combat,
    active: ref(true),
    applied: ref(true),
    aggroApplied: ref(true),
    castsApplied: ref(true),
    combatId: ref<bigint | null>(COMBAT_ID),
    self: ref(self),
    participants: ref([self, maraParticipant]),
    enemies: ref([
      { id: 9n, combatId: COMBAT_ID, enemyTemplateId: 100n, displayName: names.hostile, currentHp: 212n, maxHp: 480n },
      { id: 3n, combatId: COMBAT_ID, enemyTemplateId: 101n, displayName: 'Gnawer', currentHp: 50n, maxHp: 100n },
    ]),
    enemyTemplates: ref([
      { id: 100n, level: 6n },
      { id: 101n, level: 3n },
    ]),
    enemyAbilities: ref([{ enemyTemplateId: 100n, abilityKey: 'bile_spray', name: names.windupAbility }]),
    rounds: ref([openRound]),
    openRound: ref<typeof openRound | null>(openRound),
    roundNumber: ref<bigint | null>(3n),
    actions: ref([]),
    ownAction: ref(null),
    casts: ref([cast]),
    narratives: ref([]),
    pets: ref([
      {
        id: PET_ID,
        characterId: CHARACTER_ID,
        combatId: COMBAT_ID,
        name: names.pet,
        level: 2n,
        currentHp: 30n,
        maxHp: 40n,
        attackDamage: 4n,
      },
    ]),
    aggro: ref([
      { id: 1n, combatId: COMBAT_ID, enemyId: 9n, characterId: CHARACTER_ID, value: 120n },
      { id: 2n, combatId: COMBAT_ID, enemyId: 9n, characterId: MARA_ID, value: 90n },
    ]),
    characterNames: ref(
      new Map<bigint, string>([
        [CHARACTER_ID, 'Brannoch'],
        [MARA_ID, names.member],
      ]),
    ),
    petNames: ref(new Map<bigint, string>([[PET_ID, names.pet]])),
  };

  const game = {
    ...base,
    connected: ref(true),
    character: ref(character),
    characterId: ref(CHARACTER_ID),
    inCombat: ref(true),
    locations: ref([{ id: 10n, name: 'Ember Gate', regionId: 1n, isSafe: false, levelOffset: 0n }]),
    regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }]),
    group: ref({ id: 1n, leaderCharacterId: MARA_ID }),
    groupMembers: ref([
      { id: 11n, groupId: 1n, characterId: CHARACTER_ID, joinedAt: { microsSinceUnixEpoch: 100n } },
      { id: 12n, groupId: 1n, characterId: MARA_ID, joinedAt: { microsSinceUnixEpoch: 200n } },
    ]),
    knownCharacters: ref([mara]),
    hotbars: ref([{ id: 1n, characterId: CHARACTER_ID, name: 'Combat', sortOrder: 0, isActive: true }]),
    hotbarSlots: ref([
      { id: 101n, characterId: CHARACTER_ID, hotbarId: 1n, slot: 1, abilityTemplateId: 11n },
      { id: 102n, characterId: CHARACTER_ID, hotbarId: 1n, slot: 2, abilityTemplateId: 12n },
    ]),
    abilities: ref(abilities),
    abilityCooldowns: ref([
      {
        id: 1n,
        characterId: CHARACTER_ID,
        abilityTemplateId: 11n,
        startedAtMicros: 0n,
        durationMicros: 0n,
        roundsRemaining: 2n,
      },
    ]),
    combat,
    reducers: ref(reducers),
  } as unknown as GameData;

  game.feed.setCharacter(CHARACTER_ID);
  let id = 0n;
  const at = (): { id: bigint; createdAt: { microsSinceUnixEpoch: bigint } } => {
    id += 1n;
    return { id, createdAt: { microsSinceUnixEpoch: id } };
  };
  game.feed.ingest('location', { ...at(), kind: 'look', message: 'Ember Gate\nA cracked archway opens onto the ash road.' });
  game.feed.ingest('location', {
    ...at(),
    kind: 'combat_narration',
    message: names.narration,
  });
  // The two client-made combat entries, the way wireCombatFeed produces them from the rows above.
  game.feed.addRoundHeader({ combatId: COMBAT_ID, roundNumber: 3n, startedAtMicros: openRound.startedAtMicros });
  game.feed.addWindup({
    castId: cast.id,
    combatId: COMBAT_ID,
    createdAtMicros: openRound.startedAtMicros,
    parts: windupParts({
      enemy: names.hostile,
      ability: names.windupAbility,
      target: names.pet,
      rounds: landsInAtAnnouncement(cast),
    }),
  });
  game.feed.flush();

  return { game, reducers };
}

let wrapper: VueWrapper | null = null;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.innerHTML = '';
  // Only Date is faked: the round timer then reads a fixed 6 s, and Vue's scheduling is untouched.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(FIXED_NOW));
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountFrame(desktop: boolean, game: GameData): VueWrapper {
  installMatchMedia(desktop);
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
    global: { provide: { [GAME_KEY as symbol]: game } },
  });
  return wrapper;
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('combat frame, desktop (1280)', () => {
  it('shows the header tag and locks the six screen buttons', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    expect(w.get('header .in-combat-tag').text()).toBe('In combat · Round 3');
    const buttons = w.findAll('button.screen-btn');
    expect(buttons).toHaveLength(6);
    for (const button of buttons) {
      expect(button.attributes('aria-disabled')).toBe('true');
      expect(button.attributes('disabled')).toBeUndefined();
    }
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('swaps the context rail for the Encounter panel: cards, wind-up row and threat', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    const rail = w.get('.context-rail');
    const panel = rail.get('section.encounter-panel');
    expect(panel.get('h6').text()).toBe('Encounter · 2 hostiles');
    expect(rail.find('.event-card').exists()).toBe(false);

    const cards = panel.findAll('.hostile-card');
    expect(cards).toHaveLength(2);
    const targeted = cards.filter((card) => card.attributes('aria-pressed') === 'true');
    expect(targeted).toHaveLength(1);
    expect(targeted[0].get('.name').text()).toBe('Rotfang');

    const windups = panel.findAll('.windup');
    expect(windups).toHaveLength(1);
    expect(windups[0].text()).toBe('Rotfang winds up Bile Spray → Ember · lands in 2 rounds');

    expect(panel.get('.threat-heading').text()).toBe('Threat on Rotfang');
    const rows = panel.findAll('.threat-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classes()).toContain('self');
    expect(rows[0].get('.threat-name').text()).toBe('You');
    expect(rows[1].get('.threat-name').text()).toBe('Mara');
  });

  it('puts the round row before the hotbar row, with the chip, the timer and a rounds cooldown slot', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    const composer = w.get('section.composer');
    const row = composer.get('.round-row');
    const hotbar = composer.get('.hotbar-row');
    expect(precedes(row.element, hotbar.element)).toBe(true);
    expect(row.classes()).not.toContain('mobile');

    expect(row.get('.choice-chip').text()).toBe('Auto-attack → Rotfang');
    const timer = row.get('[role="progressbar"]');
    expect(timer.attributes('aria-label')).toBe('Round timer');
    expect(timer.attributes('aria-valuenow')).toBe('6');
    expect(row.get('.seconds').text()).toBe('6s');
    expect(row.get('button.ready').text()).toBe('Ready');
    expect(row.get('button.flee').text()).toBe('Flee');

    const slots = hotbar.findAll('button.slot');
    expect(slots[0].get('.slot-name').text()).toBe('Firebolt');
    expect(slots[0].get('.slot-rounds').text()).toBe('2 rounds');
    expect(slots[1].find('.slot-rounds').exists()).toBe(false);
  });

  // Was the Phase 48 'cards[0] is You, pressed' case: the self block is now the self target (51.1-14).
  it('shows the self block and the member card as ally targets in the vitals rail', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    const rail = w.get('.vitals-rail');
    expect(rail.find('.party-head').exists()).toBe(false);
    expect(rail.text()).not.toContain('Click to target ');
    const self = rail.get('.self-block > button.self-target');
    expect(self.attributes('aria-pressed')).toBe('true');
    expect(self.attributes('title')).toBe('Click to target yourself');
    expect(self.attributes('aria-label')).toBe(
      'Target yourself with your next ability. Health 212 of 260, mana 80 of 120, stamina 50 of 90.',
    );
    expect(rail.find('.xp-row').exists()).toBe(false);
    const cards = rail.findAll('.member-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].get('.member-name').text()).toBe('Mara');
    const mara = cards[0].get('button.member-target');
    expect(mara.attributes('aria-pressed')).toBe('false');
    expect(rail.text()).not.toContain('You');
    expect(rail.findAll('button button')).toHaveLength(0);
  });

  it('moves the ally ring between the self block and a member card with the real controller', async () => {
    const { game, reducers } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    const self = () => w.get('.vitals-rail button.self-target');
    const mara = () => w.get('.vitals-rail .member-card button.member-target');
    await mara().trigger('click');
    expect(mara().attributes('aria-pressed')).toBe('true');
    expect(self().attributes('aria-pressed')).toBe('false');
    await self().trigger('click');
    expect(self().attributes('aria-pressed')).toBe('true');
    expect(mara().attributes('aria-pressed')).toBe('false');
    // Ally selection is client state: no reducer is called.
    for (const reducer of Object.values(reducers)) expect(reducer).not.toHaveBeenCalled();
  });

  it('shows the round header (accent for the open round) and the wind-up block in the feed', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();

    const feed = w.get('[role="log"]');
    const header = feed.get('.line-round');
    expect(header.text()).toBe('Round 3');
    expect(header.classes()).toContain('current');
    const windup = feed.get('.line-windup');
    expect(windup.text()).toBe('Rotfang winds up Bile Spray → Ember · lands in 2 rounds');
    expect(feed.text()).toContain('The ground shakes as Rotfang lunges.');
  });

  it('a click on a hostile card sets the target through the controller', async () => {
    const { game, reducers } = combatGame(PLAIN);
    const w = mountFrame(true, game);
    await settle();
    const gnawer = w.findAll('.encounter-panel .hostile-card').find((card) => card.get('.name').text() === 'Gnawer');
    expect(gnawer).toBeDefined();
    await gnawer!.trigger('click');
    expect(reducers.setCombatTarget).toHaveBeenCalledTimes(1);
  });

  it('renders every name surface as text: no img element in the frame', async () => {
    const { game } = combatGame(HOSTILE_NAMES);
    const w = mountFrame(true, game);
    await settle();

    expect(w.findAll('img')).toHaveLength(0);
    expect(document.body.querySelectorAll('img')).toHaveLength(0);

    // Hostile name, ability (slot and wind-up), pet, party member and narration all arrive as text.
    expect(w.get('.encounter-panel .hostile-card[aria-pressed="true"] .name').text()).toBe(XSS);
    expect(w.get('.encounter-panel .windup').text()).toBe(`${XSS} winds up ${XSS} → ${XSS} · lands in 2 rounds`);
    expect(w.get('.hotbar-row button.slot .slot-name').text()).toBe(XSS);
    expect(w.get('.encounter-panel .threat-row:not(.self) .threat-name').text()).toBe(XSS);
    expect(w.get('.vitals-rail .member-card .member-name').text()).toBe(XSS);
    expect(w.get('.vitals-rail .member-card .member-target').attributes('aria-label')).toContain(`Target ${XSS} with`);
    expect(w.get('.line-windup').text()).toBe(`${XSS} winds up ${XSS} → ${XSS} · lands in 2 rounds`);
    expect(w.get('[role="log"]').text()).toContain(XSS);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('combat frame, mobile (390)', () => {
  it('replaces the tab bar and the location row with the encounter strip before the feed', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(false, game);
    await settle();

    expect(w.find('.tab-bar').exists()).toBe(false);
    expect(w.find('.location-row').exists()).toBe(false);
    const strip = w.get('section.encounter-strip');
    expect(precedes(strip.element, w.get('main.feed').element)).toBe(true);
    const chips = strip.findAll('button.hostile-chip');
    expect(chips).toHaveLength(2);
    expect(chips.filter((chip) => chip.attributes('aria-pressed') === 'true')).toHaveLength(1);
    expect(w.find('.context-rail').exists()).toBe(false);
  });

  // Was the Phase 48 'chips[0] is You, pressed' case: the self row is now the self target (51.1-15).
  it('shows the In combat tag and the self row target in the vitals strip', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(false, game);
    await settle();

    const strip = w.get('.vitals-strip');
    expect(strip.get('.in-combat-tag').text()).toBe('In combat · Round 3');
    expect(strip.find('button.ally-chip').exists()).toBe(false);
    expect(strip.text()).not.toContain('Party 2');
    const self = strip.get('button.self-target');
    expect(self.attributes('aria-pressed')).toBe('true');
    expect(self.attributes('aria-label')).toBe(
      'Target yourself with your next ability. Health 212 of 260, mana 80 of 120, stamina 50 of 90.',
    );
    expect(strip.find('.in-combat-tag').element.closest('button')).toBeNull();
    expect(strip.find('.xp-line').exists()).toBe(false);
    expect(strip.findAll('button button')).toHaveLength(0);
  });

  it('shows the round row in its stacked form above the hotbar, with the cooldown in rounds', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(false, game);
    await settle();

    const row = w.get('section.composer .round-row');
    expect(row.classes()).toContain('stacked');
    expect(row.classes()).toContain('mobile');
    expect(precedes(row.element, w.get('.hotbar-row').element)).toBe(true);
    expect(row.get('.choice-chip').text()).toBe('Auto-attack → Rotfang');
    expect(row.get('.seconds').text()).toBe('6s');
    expect(w.get('.hotbar-row button.slot .slot-rounds').text()).toBe('2 rounds');

    const feed = w.get('[role="log"]');
    expect(feed.get('.line-round').text()).toBe('Round 3');
    expect(feed.get('.line-windup').text()).toContain('winds up Bile Spray');
  });

  it('the encounter sheet shows the panel with the wind-up row and the threat block', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(false, game);
    await settle();
    await w.get('button.strip-open').trigger('click');
    await settle();

    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('.sheet-meta').text()).toBe('Round 3 · 6s');
    expect(dialog.findAll('.hostile-card')).toHaveLength(2);
    expect(dialog.get('.windup').text()).toContain('winds up Bile Spray');
    expect(dialog.get('.threat-heading').text()).toBe('Threat on Rotfang');
  });

  it('the account button opens a More sheet with only Log out', async () => {
    const { game } = combatGame(PLAIN);
    const w = mountFrame(false, game);
    await settle();
    await w.get('button.strip-account').trigger('click');
    await settle();

    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('h4').text()).toBe('More');
    const rows = dialog.findAll('button.more-row');
    expect(rows.map((row) => row.text())).toEqual(['Log out']);
    await rows[0].trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
  });

  it('renders every name surface as text: no img element in the frame or in the open sheet', async () => {
    const { game } = combatGame(HOSTILE_NAMES);
    const w = mountFrame(false, game);
    await settle();

    expect(w.findAll('img')).toHaveLength(0);
    expect(w.get('section.encounter-strip button.hostile-chip[aria-pressed="true"]').text()).toContain(XSS);
    expect(w.get('.hotbar-row button.slot .slot-name').text()).toBe(XSS);
    expect(w.get('.line-windup').text()).toBe(`${XSS} winds up ${XSS} → ${XSS} · lands in 2 rounds`);
    expect(w.get('[role="log"]').text()).toContain(XSS);

    await w.get('button.strip-open').trigger('click');
    await settle();
    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('.windup').text()).toBe(`${XSS} winds up ${XSS} → ${XSS} · lands in 2 rounds`);
    expect(dialog.get('.threat-row:not(.self) .threat-name').text()).toBe(XSS);
    expect(w.findAll('img')).toHaveLength(0);
    expect(document.body.querySelectorAll('img')).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
