// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import AppFrame from './AppFrame.vue';
import type { FrameView } from '../session/frameView';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';

// The assembled frame with a populated game, at desktop and mobile widths (47-12 Task 3).
// Fixtures are built here, with bigint ids and { microsSinceUnixEpoch } timestamps, and cast once
// at the provide boundary like the other 47 component tests.

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
const MINUTE = 60_000_000n;

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

interface Reducers {
  submitIntent: ReturnType<typeof vi.fn>;
  inviteToGroup: ReturnType<typeof vi.fn>;
  acceptGroupInvite: ReturnType<typeof vi.fn>;
  rejectGroupInvite: ReturnType<typeof vi.fn>;
  moveCharacter: ReturnType<typeof vi.fn>;
  useAbility: ReturnType<typeof vi.fn>;
  switchHotbar: ReturnType<typeof vi.fn>;
}

function populatedGame(): { game: GameData; reducers: Reducers } {
  const base = createInertGame();
  const reducers: Reducers = {
    submitIntent: vi.fn().mockResolvedValue(undefined),
    inviteToGroup: vi.fn().mockResolvedValue(undefined),
    acceptGroupInvite: vi.fn().mockResolvedValue(undefined),
    rejectGroupInvite: vi.fn().mockResolvedValue(undefined),
    moveCharacter: vi.fn().mockResolvedValue(undefined),
    useAbility: vi.fn().mockResolvedValue(undefined),
    switchHotbar: vi.fn().mockResolvedValue(undefined),
  };

  const character = {
    id: CHARACTER_ID,
    name: 'Brannoch',
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
  };
  const mara = {
    id: 2n,
    name: 'Mara',
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
  const serrin = { ...mara, id: 5n, name: 'Serrin', className: 'Cleric' };

  const abilities = [
    { id: 11n, characterId: CHARACTER_ID, name: 'Firebolt', kind: 'damage', resourceType: 'mana', resourceCost: 10n, cooldownSeconds: 6n },
    { id: 12n, characterId: CHARACTER_ID, name: 'Mend', kind: 'heal', resourceType: 'mana', resourceCost: 12n, cooldownSeconds: 8n },
  ];

  const game = {
    ...base,
    connected: ref(true),
    character: ref(character),
    characterId: ref(CHARACTER_ID),
    locations: ref([
      { id: 10n, name: 'Ember Gate', regionId: 1n, isSafe: false, levelOffset: 0n },
      { id: 11n, name: 'Gloamwood', regionId: 1n, isSafe: false, levelOffset: 1n },
    ]),
    regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }]),
    connections: ref([{ id: 1n, fromLocationId: 10n, toLocationId: 11n }]),
    npcsHere: ref([{ id: 2n, name: 'The Ferryman', npcType: 'vendor' }]),
    nodesHere: ref([{ id: 20n, name: 'Iron Vein', state: 'available', characterId: null }]),
    playersHere: ref([character, { id: 4n, name: 'Marisol', level: 3n }]),
    effects: ref([
      { id: 1n, characterId: CHARACTER_ID, effectType: 'armor_up', magnitude: 2n, roundsRemaining: 3n, sourceAbility: 'Bless' },
    ]),
    quests: ref([
      {
        id: 1n,
        characterId: CHARACTER_ID,
        questTemplateId: 100n,
        progress: 2n,
        completed: false,
        acceptedAt: { microsSinceUnixEpoch: 1n },
      },
    ]),
    questTemplates: ref([{ id: 100n, name: 'Wolf pelts', requiredCount: 5n, description: 'Bring pelts.' }]),
    groupInvites: ref([
      { id: 1n, groupId: 9n, fromCharacterId: 5n, toCharacterId: CHARACTER_ID, createdAt: { microsSinceUnixEpoch: 1n } },
    ]),
    group: ref({ id: 1n, leaderCharacterId: 2n }),
    groupMembers: ref([
      { id: 11n, groupId: 1n, characterId: CHARACTER_ID, joinedAt: { microsSinceUnixEpoch: 100n } },
      { id: 12n, groupId: 1n, characterId: 2n, joinedAt: { microsSinceUnixEpoch: 200n } },
    ]),
    knownCharacters: ref([mara, serrin]),
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
        startedAtMicros: nowMicros(),
        durationMicros: 6_000_000n,
      },
    ]),
    worldEvents: ref([
      {
        id: 1n,
        name: 'The Hollowmere Siege',
        regionId: 1n,
        status: 'active',
        deadlineAtMicros: nowMicros() + 134n * MINUTE,
        successCounter: 0n,
        failureCounter: 0n,
      },
    ]),
    eventObjectives: ref([{ id: 11n, eventId: 1n, name: 'Defeat the Invaders', currentCount: 12n, targetCount: 20n }]),
    contributions: ref([
      { id: 1n, eventId: 1n, characterId: CHARACTER_ID, count: 4n, regionEnteredAt: { microsSinceUnixEpoch: 1n } },
    ]),
    privateEventsApplied: ref(true),
    reducers: ref(reducers),
  } as unknown as GameData;

  game.feed.setCharacter(CHARACTER_ID);
  let id = 0n;
  const at = (): { id: bigint; createdAt: { microsSinceUnixEpoch: bigint } } => {
    id += 1n;
    return { id, createdAt: { microsSinceUnixEpoch: id } };
  };
  game.feed.ingest('location', {
    ...at(),
    kind: 'look',
    message: 'Ember Gate\nA cracked archway opens onto the ash road.',
  });
  game.feed.ingest('location', {
    ...at(),
    kind: 'npc',
    message: '',
    segments: [
      { kind: 'narration', speaker: 'The Keeper', text: 'Mist hangs over the road to Gloamwood.' },
      { kind: 'dialogue', speaker: 'The Ferryman', text: 'Mind the current.', speakerNpcId: 2n },
    ],
  });
  game.feed.ingest('private', { ...at(), kind: 'whisper', message: 'Mara whispers: Meet me at the gate.', characterId: CHARACTER_ID });
  game.feed.ingest('world', { ...at(), kind: 'world', message: 'A horn sounds across the Wilds.' });
  game.feed.flush();

  return { game, reducers };
}

let wrapper: VueWrapper | null = null;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.innerHTML = '';
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
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

async function typeAndSend(w: VueWrapper, text: string): Promise<void> {
  const input = w.get('input.composer-input');
  await input.setValue(text);
  await input.trigger('keydown', { key: 'Enter' });
  await settle();
}

function sentIntents(reducers: Reducers): string[] {
  return reducers.submitIntent.mock.calls.map((call) => (call[0] as { text: string }).text);
}

describe('populated frame, desktop', () => {
  it('renders the labelled feed, keywords, hotbar, vitals rail and context rail', async () => {
    const { game } = populatedGame();
    const w = mountFrame(true, game);
    await settle();

    // Feed: labelled Keeper narration, a spoken NPC line, a whisper and a World event.
    const feed = w.get('[role="log"]');
    expect(feed.text()).toContain('The Keeper');
    expect(feed.text()).toContain('The Ferryman says, “Mind the current.”');
    expect(feed.text()).toContain('Meet me at the gate.');
    expect(feed.text()).toContain('A horn sounds across the Wilds.');
    expect(feed.text()).toContain('A cracked archway opens onto the ash road.');
    expect(feed.text()).not.toContain('Your story will appear here.');
    expect(w.findAll('button.keyword').map((b) => b.attributes('aria-label'))).toContain('Travel to Gloamwood');

    // Hotbar: ten slots, two filled.
    const slots = w.findAll('button.slot');
    expect(slots).toHaveLength(10);
    expect(slots[0].get('.slot-name').text()).toBe('Firebolt');
    expect(slots[0].find('.sweep').exists()).toBe(true);

    // Vitals rail: Experience bar, one effect chip, one party member card.
    const rail = w.get('.vitals-rail');
    expect(rail.find('[aria-label="Experience"]').exists()).toBe(true);
    expect(rail.findAll('.effect-chips .tag')).toHaveLength(1);
    expect(rail.get('.effect-chips').text()).toContain('Bless');
    expect(rail.findAll('.member')).toHaveLength(1);
    expect(rail.get('.member').text()).toContain('Mara');

    // Context rail: a route row, Nearby rows, a tracked quest and the world event card.
    const context = w.get('.context-rail');
    expect(context.findAll('button.route-row').map((r) => r.get('.route-name').text())).toEqual(['Gloamwood']);
    expect(context.findAll('.nearby-row').map((r) => r.get('.row-name').text())).toEqual([
      'The Ferryman',
      'Iron Vein',
      'Marisol',
    ]);
    expect(context.get('.quest-name').text()).toBe('Wolf pelts');
    expect(context.get('.event-card').text()).toContain('The Hollowmere Siege');
    expect(context.get('.event-card').text()).toContain('Your contribution');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sends one automatic look once the private events applied', async () => {
    const { game, reducers } = populatedGame();
    mountFrame(true, game);
    await settle();
    expect(sentIntents(reducers)).toEqual(['look']);
  });

  it('a route tap travels with the same reducer the keyword uses', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(true, game);
    await w.get('.context-rail button.route-row').trigger('click');
    await settle();
    expect(reducers.moveCharacter).toHaveBeenCalledWith({ characterId: CHARACTER_ID, locationId: 11n });
  });
});

describe('populated frame, composer end to end (INP-01, INP-02)', () => {
  it('"Accept my apology" is a Keeper intent, never a group accept', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(true, game);
    await typeAndSend(w, 'Accept my apology');
    expect(reducers.submitIntent).toHaveBeenCalledWith({ characterId: CHARACTER_ID, text: 'Accept my apology' });
    expect(reducers.acceptGroupInvite).not.toHaveBeenCalled();
    expect(reducers.rejectGroupInvite).not.toHaveBeenCalled();
    expect((w.get('input.composer-input').element as HTMLInputElement).value).toBe('');
  });

  it('"invite Bob" calls inviteToGroup with the target name', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(true, game);
    await typeAndSend(w, 'invite Bob');
    expect(reducers.inviteToGroup).toHaveBeenCalledWith({ characterId: CHARACTER_ID, targetName: 'Bob' });
    expect(sentIntents(reducers)).not.toContain('invite Bob');
  });

  it('"/who" calls submitIntent with the text "who"', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(true, game);
    await typeAndSend(w, '/who');
    expect(reducers.submitIntent).toHaveBeenCalledWith({ characterId: CHARACTER_ID, text: 'who' });
  });

  it('accepting a pending inviter by name still calls acceptGroupInvite', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(true, game);
    await typeAndSend(w, 'accept Serrin');
    expect(reducers.acceptGroupInvite).toHaveBeenCalledWith({ characterId: CHARACTER_ID, fromName: 'Serrin' });
  });
});

describe('populated frame, mobile', () => {
  it('shows the strip chip row and XP line, and the hotbar and composer above the tab bar', async () => {
    const { game } = populatedGame();
    const w = mountFrame(false, game);
    await settle();

    const strip = w.get('.vitals-strip');
    expect(strip.find('.chip-row').exists()).toBe(true);
    expect(strip.get('.chip-row').text()).toContain('Party 2');
    expect(strip.get('.chip-row').text()).toContain('Bless');
    expect(strip.find('[aria-label="Experience"]').exists()).toBe(true);

    const hotbar = w.get('.hotbar-row').element;
    const composer = w.get('.composer-box').element;
    const tabBar = w.get('.tab-bar').element;
    expect(w.findAll('button.slot')).toHaveLength(10);
    expect(hotbar.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(composer.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(w.get('[role="log"]').text()).toContain('The Keeper');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('the Map sheet shows the rail content and a route tap closes the sheet', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(false, game);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.findAll('button.route-row')).toHaveLength(1);
    expect(sheet.findAll('.nearby-row')).toHaveLength(3);
    expect(sheet.get('.quest-name').text()).toBe('Wolf pelts');
    expect(sheet.get('.event-card').text()).toContain('The Hollowmere Siege');

    await sheet.get('button.route-row').trigger('click');
    await settle();
    expect(reducers.moveCharacter).toHaveBeenCalledWith({ characterId: CHARACTER_ID, locationId: 11n });
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('the Social sheet shows the party and a Nearby invite closes the sheet before sending', async () => {
    const { game, reducers } = populatedGame();
    const w = mountFrame(false, game);
    await w.get('button[data-tab="party"]').trigger('click');
    await settle();
    expect(w.get('[role="dialog"]').get('h6').text()).toBe('Party · 2');
    expect(w.get('[role="dialog"]').text()).toContain('Mara');

    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await w.get('[role="dialog"] [aria-label="Invite Marisol"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(reducers.inviteToGroup).toHaveBeenCalledWith({ characterId: CHARACTER_ID, targetName: 'Marisol' });
  });

  it('a pre-fill from a sheet closes it and puts the text in the input', async () => {
    const { game } = populatedGame();
    const w = mountFrame(false, game);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await w.get('[role="dialog"] [aria-label="Whisper Marisol"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect((w.get('input.composer-input').element as HTMLInputElement).value).toBe('whisper Marisol ');
  });
});

describe('first frame before any rows arrive', () => {
  it('shows the Phase 45 empty lines and the empty feed line with no spinner', async () => {
    const w = mountFrame(true, createInertGame());
    await settle();
    expect(w.get('[role="log"]').text()).toBe('Your story will appear here.');
    expect(w.get('.context-rail').text()).toContain('Your location appears here.');
    expect(w.get('.context-rail').text()).toContain('No one is nearby.');
    expect(w.get('.context-rail').text()).toContain('No quests tracked.');
    // The hidden combat target status (48-05) is a status element too; no loading status shows.
    expect(w.find('[role="status"]:not(.target-status)').exists()).toBe(false);
    expect(w.find('.spinner').exists()).toBe(false);
  });
});

describe('text rendering', () => {
  it('renders markup in a feed line, an NPC name and a quest name as text', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { game } = populatedGame();
    (game.questTemplates as unknown as { value: unknown[] }).value = [
      { id: 100n, name: payload, requiredCount: 5n, description: payload },
    ];
    game.feed.ingest('world', { id: 99n, kind: 'world', message: payload, createdAt: { microsSinceUnixEpoch: 99n } });
    game.feed.flush();
    const w = mountFrame(true, game);
    await settle();
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.context-rail .quest-name').text()).toBe(payload);
    expect(w.get('[role="log"]').text()).toContain(payload);
  });
});
