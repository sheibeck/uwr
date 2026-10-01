// Fixtures for the effort sweep (Phase 43, Plan 43-10). Data only: no I/O, no SDK, no secrets,
// no player data from the real game. Five varied, route-realistic inputs per swept route, shaped as
// RouteInputMap entries (spacetimedb/src/data/llm_layers.ts). The stage-2 routes (creation_class,
// world_gen) carry static fallback inputs; the harness feeds them from this run's stage-1 replies through
// classFillInputFrom and worldFillInputFrom and falls back to these when a stage-1 reply lacks a field.

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const NEIGHBORS = [
  [],
  [{ name: 'Harrow Basin', biome: 'plains', threats: 'bandit camps, wolves' }],
  [
    { name: 'The Sunken Terraces', biome: 'swamp', threats: 'bog wights, leeches' },
    { name: 'Kestrel Ridge', biome: 'mountains', threats: 'harpies, rockfalls' },
  ],
  [{ name: 'Ember Flats', biome: 'volcanic', threats: 'ash drakes' }],
  [{ name: 'Old Quarry', biome: 'ruins', threats: 'restless miners' }],
];

const WORLD_CONTEXT =
  'A world of scattered settlements that are only now being charted. Travel is slow, roads are rumors, and nobody agrees on what lies past the next ridge.';

const CLASS_REVEAL_FIXTURES = [
  {
    raceName: 'Tidewright',
    raceNarrative: 'River-dwelling tinkers with silver hair and webbed hands who build small machines from salvage.',
    archetype: 'warrior',
  },
  {
    raceName: 'Ashborn',
    raceNarrative: 'A soot-skinned folk raised in the lee of old volcanoes, proud and quick to anger.',
    archetype: 'mystic',
  },
  {
    raceName: 'Hollowfen Gnome',
    raceNarrative: 'Small, stubborn bog gnomes who trade in lanterns, rumors and exceptionally bad soup.',
    archetype: 'mystic',
  },
  {
    raceName: 'Stoneback Orc',
    raceNarrative: 'Broad, patient quarrymen with a grudge against anything that moves faster than they do.',
    archetype: 'warrior',
  },
  {
    raceName: 'Saltmarsh Elf',
    raceNarrative: 'Pale coast-dwellers who read tides the way others read letters, and trust neither.',
    archetype: 'warrior',
  },
];

const CLASS_FILL_FIXTURES = [
  {
    ...CLASS_REVEAL_FIXTURES[0],
    className: 'Gearbreaker',
    classDescription: 'A salvager who takes machines apart mid-swing. Efficient, loud and rarely invited back.',
    firstAbility: {
      name: 'Rivet Volley',
      description: 'Hurls a handful of rivets with unsettling accuracy.',
      kind: 'damage',
      damageType: 'physical',
      resourceType: 'stamina',
    },
  },
  {
    ...CLASS_REVEAL_FIXTURES[1],
    className: 'Cinderseer',
    classDescription: 'A fire-reader who divines by what burns and what refuses to. Mostly right, always smug.',
    firstAbility: {
      name: 'Ember Verdict',
      description: 'Names a foe aloud and lets the nearest fire agree.',
      kind: 'dot',
      damageType: 'fire',
      resourceType: 'mana',
    },
  },
  {
    ...CLASS_REVEAL_FIXTURES[2],
    className: 'Lanternwarden',
    classDescription: 'A guardian of small lights in large darkness. Brave, in the way a candle is brave.',
    firstAbility: {
      name: 'Hold the Glow',
      description: 'Steadies a flame that mends those standing in it.',
      kind: 'hot',
      damageType: 'none',
      resourceType: 'mana',
    },
  },
  {
    ...CLASS_REVEAL_FIXTURES[3],
    className: 'Quarrymaster',
    classDescription: 'A stone-cutter turned bruiser who treats every fight as a slow, deliberate excavation.',
    firstAbility: {
      name: 'Shear Strike',
      description: 'A single heavy blow aimed at the seam in whatever is in front of him.',
      kind: 'damage',
      damageType: 'physical',
      resourceType: 'stamina',
    },
  },
  {
    ...CLASS_REVEAL_FIXTURES[4],
    className: 'Tidecaller',
    classDescription: 'A coast-reader who pulls the sea along on a short leash. The sea resents it.',
    firstAbility: {
      name: 'Pull Under',
      description: 'Drags a foe toward the water that is not there yet.',
      kind: 'debuff',
      damageType: 'ice',
      resourceType: 'stamina',
    },
  },
];

const WORLD_START_FIXTURES = [
  {
    worldContext: WORLD_CONTEXT,
    characterRace: 'Tidewright',
    characterClass: 'Gearbreaker',
    characterArchetype: 'warrior',
    sourceRegionName: 'Ironwater Crossing',
    neighborRegions: NEIGHBORS[0],
  },
  {
    worldContext: WORLD_CONTEXT,
    characterRace: 'Ashborn',
    characterClass: 'Cinderseer',
    characterArchetype: 'mystic',
    sourceRegionName: 'Cairn Hollow',
    neighborRegions: NEIGHBORS[1],
  },
  {
    worldContext: WORLD_CONTEXT,
    characterRace: 'Hollowfen Gnome',
    characterClass: 'Lanternwarden',
    characterArchetype: 'mystic',
    sourceRegionName: 'Wickerside',
    neighborRegions: NEIGHBORS[2],
  },
  {
    worldContext: WORLD_CONTEXT,
    characterRace: 'Stoneback Orc',
    characterClass: 'Quarrymaster',
    characterArchetype: 'warrior',
    sourceRegionName: 'Greywater Quarry',
    neighborRegions: NEIGHBORS[3],
  },
  {
    worldContext: WORLD_CONTEXT,
    characterRace: 'Saltmarsh Elf',
    characterClass: 'Tidecaller',
    characterArchetype: 'warrior',
    sourceRegionName: 'Brineport',
    neighborRegions: NEIGHBORS[4],
  },
];

/** Static fallback values for the stage-2 world fill when a stage-1 reply lacks a field. */
const WORLD_FILL_FALLBACKS = [
  {
    regionName: 'Saltmere Reach',
    biome: 'coastal',
    startLocation: {
      name: 'Gullrest Landing',
      description: 'A weathered pier town where the fog arrives before the ferries do.',
      terrainType: 'town',
    },
    npcsPresent: [{ name: 'Maren Voss', npcType: 'questgiver', gender: 'female' }],
  },
  {
    regionName: 'The Cinder Steppe',
    biome: 'volcanic',
    startLocation: {
      name: 'Kettle Camp',
      description: 'A ring of tents around a vent that doubles as the cookfire.',
      terrainType: 'plains',
    },
    npcsPresent: [{ name: 'Orsk Dray', npcType: 'vendor', gender: 'male' }],
  },
  {
    regionName: 'Mossgate Fen',
    biome: 'swamp',
    startLocation: {
      name: 'Lantern Stilts',
      description: 'A village on stilts above black water, lit by hundreds of jars of glowing moss.',
      terrainType: 'town',
    },
    npcsPresent: [{ name: 'Pell Ambry', npcType: 'lore', gender: 'male' }],
  },
  {
    regionName: 'Brokenstone Heights',
    biome: 'mountains',
    startLocation: {
      name: 'Anvil Rest',
      description: 'A switchback inn cut into the cliff, loud with miners and louder with their complaints.',
      terrainType: 'mountains',
    },
    npcsPresent: [{ name: 'Hedda Brask', npcType: 'trainer', gender: 'female' }],
  },
  {
    regionName: 'The Pale Orchards',
    biome: 'forest',
    startLocation: {
      name: 'Windfall Green',
      description: 'A quiet clearing of fallen fruit and low stone walls, hushed in the way of places that remember something.',
      terrainType: 'woods',
    },
    npcsPresent: [{ name: 'Tobin Ashgrove', npcType: 'crafter', gender: 'male' }],
  },
];

const WORLD_FILL_FIXTURES = WORLD_START_FIXTURES.map((start, i) => ({
  ...WORLD_FILL_FALLBACKS[i],
  characterRace: start.characterRace,
  characterClass: start.characterClass,
  characterArchetype: start.characterArchetype,
  sourceRegionName: start.sourceRegionName,
  neighborRegions: start.neighborRegions,
}));

const RACE_FIXTURES = [
  { raceDescription: 'A quiet folk of river-dwelling tinkers with silver hair, webbed hands and a love of small machines.' },
  { raceDescription: 'Cyclops' },
  { raceDescription: 'fire goblin' },
  { raceDescription: 'Some kind of shadow creature that is mostly afraid of the dark itself.' },
  { raceDescription: 'Tall, sleepy tree-people who measure time in seasons and are always late.' },
];

const SKILL_FIXTURES = [
  {
    characterName: 'Brenna',
    race: 'Tidewright',
    className: 'Gearbreaker',
    archetype: 'warrior',
    level: 3n,
    existingAbilities: [{ name: 'Rivet Volley', kind: 'damage' }],
  },
  {
    characterName: 'Calder',
    race: 'Ashborn',
    className: 'Cinderseer',
    archetype: 'mystic',
    level: 5n,
    existingAbilities: [
      { name: 'Ember Verdict', kind: 'dot' },
      { name: 'Smoke Reading', kind: 'utility' },
    ],
  },
  {
    characterName: 'Pip',
    race: 'Hollowfen Gnome',
    className: 'Lanternwarden',
    archetype: 'mystic',
    level: 2n,
    existingAbilities: [{ name: 'Hold the Glow', kind: 'hot' }],
  },
  {
    characterName: 'Dagna',
    race: 'Stoneback Orc',
    className: 'Quarrymaster',
    archetype: 'warrior',
    level: 8n,
    existingAbilities: [
      { name: 'Shear Strike', kind: 'damage' },
      { name: 'Cleave Seam', kind: 'aoe_damage' },
      { name: 'Stand Like Rock', kind: 'buff' },
    ],
  },
  {
    characterName: 'Isolde',
    race: 'Saltmarsh Elf',
    className: 'Tidecaller',
    archetype: 'warrior',
    level: 4n,
    existingAbilities: [{ name: 'Pull Under', kind: 'debuff' }],
  },
];

const RENOWN_FIXTURES = [
  { characterName: 'Brenna', className: 'Gearbreaker', raceName: 'Tidewright', rank: 2, existingPerks: [] },
  { characterName: 'Calder', className: 'Cinderseer', raceName: 'Ashborn', rank: 3, existingPerks: [{ name: 'Merchant Favor' }] },
  { characterName: 'Pip', className: 'Lanternwarden', raceName: 'Hollowfen Gnome', rank: 2, existingPerks: [] },
  {
    characterName: 'Dagna',
    className: 'Quarrymaster',
    raceName: 'Stoneback Orc',
    rank: 5,
    existingPerks: [{ name: 'Whisper Network' }, { name: 'Steady Hands' }],
  },
  { characterName: 'Isolde', className: 'Tidecaller', raceName: 'Saltmarsh Elf', rank: 4, existingPerks: [{ name: 'Tide Tithe' }] },
];

const NPC_FIXTURES = [
  {
    npc: { name: 'Maren Voss', npcType: 'questgiver', gender: 'female' },
    region: { name: 'Saltmere Reach', biome: 'coastal', landmarks: 'the Drowned Lighthouse', threats: 'smugglers, sea wolves' },
    location: { name: 'Gullrest Landing' },
    personality: {
      traits: ['wary', 'dry-witted'],
      speechPattern: 'clipped sentences, never a wasted word',
      knowledgeDomains: ['shipping', 'local rumors'],
      secrets: ['She keeps a ledger of every ship that never arrived.'],
    },
    affinityTier: 'neutral',
    playerMessage: 'Is there any work going around here?',
    activeQuestCount: 0,
    maxQuests: 3,
    nearbyLocationNames: ['Drowned Lighthouse', 'Tarpit Shallows'],
    nearbyEnemies: [{ name: 'Sea Wolf', level: 2, location: 'Tarpit Shallows' }],
  },
  {
    npc: { name: 'Orsk Dray', npcType: 'vendor', gender: 'male' },
    region: { name: 'The Cinder Steppe', biome: 'volcanic', landmarks: 'the Kettle Vent', threats: 'ash drakes' },
    location: { name: 'Kettle Camp' },
    personality: {
      traits: ['boisterous', 'greedy'],
      speechPattern: 'booming, fond of numbers',
      knowledgeDomains: ['trade goods'],
      secrets: [],
    },
    affinityTier: 'friendly',
    playerMessage: 'What are you selling, and is any of it not on fire?',
    activeQuestCount: 1,
    maxQuests: 3,
  },
  {
    npc: { name: 'Pell Ambry', npcType: 'lore', gender: 'male' },
    region: { name: 'Mossgate Fen', biome: 'swamp', landmarks: 'the Sunken Chapel', threats: 'bog wights' },
    location: { name: 'Lantern Stilts' },
    personality: {
      traits: ['absent-minded', 'kind'],
      speechPattern: 'rambling, circles back to the point eventually',
      knowledgeDomains: ['old stories', 'fen lore'],
      secrets: ['He once read the name on the chapel bell, and has not slept well since.'],
    },
    affinityTier: 'trusted',
    memory: { topics: ['the Sunken Chapel'], impression: 'curious' },
    playerMessage: 'You mentioned a chapel. Tell me about the bell.',
    activeQuestCount: 2,
    maxQuests: 3,
    completedQuestNames: ['Jars for Pell'],
  },
  {
    npc: { name: 'Hedda Brask', npcType: 'trainer', gender: 'female' },
    region: { name: 'Brokenstone Heights', biome: 'mountains', landmarks: 'the Anvil Stair', threats: 'harpies' },
    location: { name: 'Anvil Rest' },
    personality: {
      traits: ['stern', 'fair'],
      speechPattern: 'blunt and a little hoarse from shouting over forges',
      knowledgeDomains: ['combat drills'],
      secrets: [],
    },
    affinityTier: 'unfriendly',
    playerMessage: 'Teach me something useful.',
    activeQuestCount: 3,
    maxQuests: 3,
    activeQuestFromThisNpc: false,
  },
  {
    npc: { name: 'Tobin Ashgrove', npcType: 'crafter', gender: 'male' },
    region: { name: 'The Pale Orchards', biome: 'forest', landmarks: 'the Hundred-Year Tree', threats: 'thorn stalkers' },
    location: { name: 'Windfall Green' },
    personality: {
      traits: ['patient', 'superstitious'],
      speechPattern: 'soft-spoken, talks to his tools',
      knowledgeDomains: ['woodcraft', 'orchard lore'],
      secrets: ['The Hundred-Year Tree has not bloomed since he carved it.'],
    },
    affinityTier: 'bonded',
    playerMessage: 'Do you ever regret carving it?',
    activeQuestCount: 0,
    maxQuests: 3,
  },
];

/** A victory or defeat outro summary (the only narration types production sends since Plan 41-11). */
function outro(type, playerNames, enemyNames, locationName, deaths) {
  const players = playerNames.map((name, i) => ({
    name,
    hp: deaths.includes(name) ? 0n : BigInt(30 + i * 5),
    maxHp: 60n,
    isEnemy: false,
  }));
  const enemies = enemyNames.map((name) => ({
    name,
    hp: deaths.includes(name) ? 0n : 12n,
    maxHp: 40n,
    isEnemy: true,
  }));
  return {
    combatId: 1n,
    roundNumber: 0n,
    narrativeType: type,
    playerActions: [],
    enemyActions: [],
    effectsApplied: [],
    effectsExpired: [],
    deaths,
    nearDeathNames: [],
    hasCrit: false,
    hasKill: type === 'victory',
    hasNearDeath: false,
    participantHpSummary: [...players, ...enemies],
    locationName,
    enemyNames,
    playerNames,
  };
}

const NARRATION_FIXTURES = [
  outro('victory', ['Brenna'], ['Gravel Hound', 'Gravel Hound'], 'Tarpit Shallows', ['Gravel Hound', 'Gravel Hound']),
  outro('defeat', ['Calder'], ['Ash Drake'], 'The Kettle Vent', ['Calder']),
  outro('victory', ['Pip', 'Dagna'], ['Bog Wight'], 'The Sunken Chapel', ['Bog Wight']),
  outro('defeat', ['Isolde', 'Dagna'], ['Harpy Matron', 'Harpy'], 'The Anvil Stair', ['Isolde', 'Dagna']),
  outro('victory', ['Dagna'], ['Thorn Stalker'], 'Windfall Green', ['Thorn Stalker']),
];

/** Exactly five inputs per swept route, in the order the sweep walks them. */
export const SWEEP_FIXTURES = deepFreeze({
  creation_race: RACE_FIXTURES,
  creation_class_reveal: CLASS_REVEAL_FIXTURES,
  creation_class: CLASS_FILL_FIXTURES,
  world_gen_start: WORLD_START_FIXTURES,
  world_gen: WORLD_FILL_FIXTURES,
  skill_gen: SKILL_FIXTURES,
  renown_perk_gen: RENOWN_FIXTURES,
  npc_conversation: NPC_FIXTURES,
  combat_narration: NARRATION_FIXTURES,
});

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x) => (typeof x === 'string' && x.trim() !== '' ? x : undefined);

/**
 * The stage-2 world fill input from a stage-1 reply (world_gen_start) and the stage-1 input.
 * Any field the reply lacks falls back to `fallback` (the static fixture for the same index).
 */
export function worldFillInputFrom(startReply, worldInput, fallback = WORLD_FILL_FIXTURES[0]) {
  const r = isObject(startReply) ? startReply : {};
  const start = isObject(r.startLocation) ? r.startLocation : {};
  const npc = isObject(r.firstNpc) ? r.firstNpc : {};
  const input = isObject(worldInput) ? worldInput : {};
  const fb = isObject(fallback) ? fallback : WORLD_FILL_FIXTURES[0];
  const fbStart = isObject(fb.startLocation) ? fb.startLocation : {};
  const fbNpc = Array.isArray(fb.npcsPresent) && isObject(fb.npcsPresent[0]) ? fb.npcsPresent[0] : {};
  const gender = npc.gender === 'male' || npc.gender === 'female' ? npc.gender : fbNpc.gender;
  return {
    regionName: str(r.regionName) ?? fb.regionName,
    biome: str(r.biome) ?? fb.biome,
    startLocation: {
      name: str(start.name) ?? fbStart.name,
      description: str(start.description) ?? fbStart.description,
      terrainType: str(start.terrainType) ?? fbStart.terrainType,
    },
    npcsPresent: [
      {
        name: str(npc.name) ?? fbNpc.name,
        npcType: str(npc.npcType) ?? fbNpc.npcType,
        gender,
      },
    ],
    characterRace: str(input.characterRace) ?? fb.characterRace,
    characterClass: str(input.characterClass) ?? fb.characterClass,
    characterArchetype: str(input.characterArchetype) ?? fb.characterArchetype,
    sourceRegionName: str(input.sourceRegionName) ?? fb.sourceRegionName,
    neighborRegions: Array.isArray(input.neighborRegions) ? input.neighborRegions : fb.neighborRegions,
  };
}

/**
 * The stage-2 class fill input from a stage-1 reply (creation_class_reveal) and the stage-1 input.
 * Any field the reply lacks falls back to `fallback` (the static fixture for the same index).
 */
export function classFillInputFrom(revealReply, classInput, fallback = CLASS_FILL_FIXTURES[0]) {
  const r = isObject(revealReply) ? revealReply : {};
  const ability = isObject(r.firstAbility) ? r.firstAbility : {};
  const input = isObject(classInput) ? classInput : {};
  const fb = isObject(fallback) ? fallback : CLASS_FILL_FIXTURES[0];
  const fbAbility = isObject(fb.firstAbility) ? fb.firstAbility : {};
  return {
    raceName: str(input.raceName) ?? fb.raceName,
    raceNarrative: str(input.raceNarrative) ?? fb.raceNarrative,
    archetype: str(input.archetype) ?? fb.archetype,
    className: str(r.className) ?? fb.className,
    classDescription: str(r.classDescription) ?? fb.classDescription,
    firstAbility: {
      name: str(ability.name) ?? fbAbility.name,
      description: str(ability.description) ?? fbAbility.description,
      kind: str(ability.kind) ?? fbAbility.kind,
      damageType: str(ability.damageType) ?? fbAbility.damageType,
      resourceType: str(ability.resourceType) ?? fbAbility.resourceType,
    },
  };
}
