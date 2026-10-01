// ============================================================================
// JSON Schemas for the Claude JSON routes (pure module)
// ============================================================================
//
// Every schema is built ONCE at module load and deep-frozen: Anthropic caches
// the compiled grammar keyed on the byte-identical schema, so a schema that is
// rebuilt or mutated per request would defeat the cache (RESEARCH Pitfall 5).
//
// Enums come from mechanical_vocabulary (the server is the source of truth).
// The region schemas keep the proven Phase 39 spike enums (biome, npcType, ...).
//
// Staged generation (Phase 43): class creation and world generation each run
// as two requests. The stage-1 schema is the smallest one that serves the
// reveal (WORLD_START_SCHEMA, CLASS_REVEAL_SCHEMA); the stage-2 schema fills in
// the rest (REGION_FILL_SCHEMA, CLASS_FILL_SCHEMA). Stage 1 facts reach stage 2
// only through the volatile user message.
//
// Structured-output subset: no numeric/string bounds, no array-valued `type`,
// nullable fields are `anyOf: [X, { type: 'null' }]`. See helpers/schema_lint.ts.
// ============================================================================

import {
  STAT_TYPES,
  ABILITY_KINDS,
  RESOURCE_TYPES,
  DAMAGE_TYPES,
  SCALING_TYPES,
  TARGET_RULES,
  ARMOR_TYPES,
  WEAPON_TYPES,
} from './mechanical_vocabulary';
import { NPC_GENDERS } from './npc_gender';

/** Recursively freeze a value (arrays and plain objects). Returns the same reference. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

type Node = Record<string, any>;

/** Object node where every property is required and no extras are allowed. */
function obj(props: Record<string, Node>): Node {
  return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
}

const S: Node = { type: 'string' };
const NUM: Node = { type: 'number' };
const INT: Node = { type: 'integer' };
const BOOL: Node = { type: 'boolean' };
const strs: Node = { type: 'array', items: S };

function str(description: string): Node {
  return { type: 'string', description };
}
function num(description: string): Node {
  return { type: 'number', description };
}
function enumOf(values: readonly string[], description?: string): Node {
  return { type: 'string', enum: [...values], ...(description ? { description } : {}) };
}
/** Nullable via anyOf (array-valued `type` is outside the subset). */
function nullable(inner: Node, description?: string): Node {
  return { ...(description ? { description } : {}), anyOf: [inner, { type: 'null' }] };
}

const STATS = enumOf(STAT_TYPES);

// ----------------------------------------------------------------------------
// Race interpretation
// ----------------------------------------------------------------------------

export const RACE_SCHEMA: Node = deepFreeze(
  obj({
    raceName: str(
      "Use the EXACT race name the player gave. Do NOT expand, embellish, or add adjectives. If the player said 'Cyclops', the raceName is 'Cyclops'. If the player said 'fire goblin', the raceName is 'Fire Goblin' (just capitalize). Only invent a name if the player gave a vague description like 'some kind of shadow creature' rather than a specific race name.",
    ),
    narrative: str('2-3 sentences of sardonic Keeper commentary about this race'),
    bonuses: obj({
      primary: obj({ stat: STATS, value: { type: 'integer', description: 'Typically 2' } }),
      secondary: obj({ stat: STATS, value: { type: 'integer', description: 'Typically 1' } }),
      flavor: str('One unique racial trait description'),
    }),
  }),
);

// ----------------------------------------------------------------------------
// Class generation (two stages)
// ----------------------------------------------------------------------------

const CLASS_ABILITY: Node = obj({
  name: str('2-3 words max, punchy action name'),
  description: str('Sardonic description of the ability'),
  kind: enumOf(ABILITY_KINDS),
  damageType: enumOf(DAMAGE_TYPES),
  targetRule: enumOf(['single_enemy', 'single_ally', 'self']),
  resourceType: enumOf(['mana', 'stamina', 'none']),
  resourceCost: num("Mana abilities: 10-30, stamina abilities: 5-15, 0 for 'none' resource type"),
  castSeconds: num(
    'Cast time in seconds. Mana abilities MUST be >= 1 (use 1-3). Only stamina/physical abilities can be 0 (instant).',
  ),
  cooldownSeconds: num('4-12'),
  value1: num('8-15 for level 1, primary power value'),
  scaling: enumOf(STAT_TYPES),
  effectType: nullable(S, 'For dot/hot/buff/debuff kinds (e.g. dot, regen, str_bonus, armor_down, stun). null for damage/heal.'),
  effectMagnitude: nullable(NUM, 'Effect strength per tick. null for damage/heal.'),
  effectDuration: nullable(
    NUM,
    'Duration in seconds. Combat rounds are 3s, so dot/hot/buff/debuff need 9-12 for 3-4 ticks. Stun uses 3. null for damage/heal.',
  ),
});

const CLASS_STATS: Node = obj({
  primaryStat: STATS,
  secondaryStat: enumOf([...STAT_TYPES, 'none']),
  bonusHp: num('0-20, warrior types get more'),
  bonusMana: num('0-30, mystic types get more'),
  weaponProficiencies: {
    type: 'array',
    items: enumOf(WEAPON_TYPES),
    description: '2-4 allowed weapon types that fit the class fantasy',
  },
  armorProficiencies: {
    type: 'array',
    items: enumOf(ARMOR_TYPES.filter((a) => a !== 'shield')),
    description: '1-2 allowed armor types; warriors get heavier, mystics get lighter',
  },
  usesMana: BOOL,
});

/** Stage 1: the name, the description and the first ability, so the player sees the class fast. */
export const CLASS_REVEAL_SCHEMA: Node = deepFreeze(
  obj({
    className: str(
      "1-2 words, no adjective phrases (e.g. 'Gatebreaker', 'Pyroclast', 'Voidcaller' -- NOT 'Mire-Crowned Gatebreaker')",
    ),
    classDescription: str('2-3 sentences of sardonic class description'),
    firstAbility: CLASS_ABILITY,
  }),
);

/** Stage 2: the stats and the two remaining abilities, for the class stage 1 already named. */
export const CLASS_FILL_SCHEMA: Node = deepFreeze(
  obj({
    stats: CLASS_STATS,
    abilities: { type: 'array', items: CLASS_ABILITY, description: 'Exactly 2 more abilities' },
  }),
);

// ----------------------------------------------------------------------------
// World generation (two stages; Phase 39 spike schema plus the NPC gender enum (Plan 41-18); compiled live on Sonnet 5.5)
// ----------------------------------------------------------------------------

const REGION_BIOME: Node = {
  type: 'string',
  enum: ['volcanic', 'forest', 'tundra', 'desert', 'swamp', 'mountains', 'plains', 'coastal', 'cavern', 'ruins'],
};

const LOCATION_TERRAIN: Node = {
  type: 'string',
  enum: ['mountains', 'woods', 'plains', 'swamp', 'dungeon', 'town', 'city'],
};

const NPC_TYPE: Node = {
  type: 'string',
  enum: ['vendor', 'questgiver', 'lore', 'trainer', 'guard', 'crafter', 'banker'],
};

const NPC_PERSONALITY: Node = obj({
  traits: strs,
  speechPattern: S,
  knowledgeDomains: strs,
  secrets: strs,
  affinityMultiplier: NUM,
});

/** A region location with its safety flag and the names it connects to (stage 2). */
const LOCATION_ITEM: Node = obj({
  name: S,
  description: S,
  terrainType: LOCATION_TERRAIN,
  isSafe: BOOL,
  levelOffset: INT,
  connectsTo: strs,
});

/** A region NPC with the location they stand in (stage 2). */
const REGION_NPC_ITEM: Node = obj({
  name: S,
  gender: enumOf(NPC_GENDERS),
  npcType: NPC_TYPE,
  locationName: S,
  description: S,
  greeting: S,
  personality: NPC_PERSONALITY,
});

const ENEMY_ITEM: Node = obj({
  name: S,
  creatureType: { type: 'string', enum: ['beast', 'undead', 'humanoid', 'elemental', 'construct', 'aberration'] },
  role: { type: 'string', enum: ['melee', 'ranged', 'caster'] },
  terrainTypes: S,
  groupMin: INT,
  groupMax: INT,
  level: INT,
});

/**
 * Stage 1: the region's name and look, the safe place a traveler arrives and
 * the first person met there. The start location is always safe (the bind
 * stone and crafting go there), so it has no isSafe and no connectsTo; the
 * first NPC always stands in the start location, so it has no locationName.
 */
export const WORLD_START_SCHEMA: Node = deepFreeze(
  obj({
    regionName: S,
    regionDescription: S,
    biome: REGION_BIOME,
    startLocation: obj({
      name: S,
      description: S,
      terrainType: LOCATION_TERRAIN,
      levelOffset: INT,
    }),
    firstNpc: obj({
      name: S,
      gender: enumOf(NPC_GENDERS),
      npcType: NPC_TYPE,
      description: S,
      greeting: S,
      personality: NPC_PERSONALITY,
    }),
  }),
);

/** Stage 2: everything else in the region, for the region and arrival point stage 1 already named. */
export const REGION_FILL_SCHEMA: Node = deepFreeze(
  obj({
    dominantFaction: S,
    landmarks: strs,
    threats: strs,
    locations: { type: 'array', items: LOCATION_ITEM },
    npcs: { type: 'array', items: REGION_NPC_ITEM },
    enemies: { type: 'array', items: ENEMY_ITEM },
  }),
);

// ----------------------------------------------------------------------------
// Skill generation (the inner schema of the legacy buildSkillGenResponseFormat)
// ----------------------------------------------------------------------------

const SKILL_ITEM: Node = obj({
  name: str('2-3 words max, punchy action name'),
  description: str('Sardonic Keeper narrator description, 1-2 sentences'),
  kind: enumOf(
    ABILITY_KINDS,
    'damage=single-hit direct damage, dot=damage over time (burning, bleeding, poisoning), hot=heal over time, heal=instant heal, buff=apply positive effect, debuff=apply negative effect, shield=absorb barrier, taunt=force target, aoe_damage=multi-target damage, aoe_heal=multi-target heal, cc=crowd control, drain=damage+self-heal, execute=bonus vs low HP, utility=non-combat, song=toggle party-wide persistent buff (bards), aura=passive area effect from caster, travel=movement speed/reveal buff, fear=CC causing enemy to flee/stun, bandage=self-heal consumable-like (long cooldown), potion=self-heal/buff consumable-like (long cooldown), food_summon=conjure food items for buffs, resurrect=revive dead party member, group_heal=heal all party members, craft_boost=boost next crafting quality, gather_boost=boost next gathering yield, pet_command=command active pet',
  ),
  targetRule: enumOf(TARGET_RULES.filter((r) => r !== 'corpse')),
  resourceType: enumOf(RESOURCE_TYPES),
  resourceCost: num('Resource cost (mana: 10-30, stamina: 5-15, 0 for none)'),
  castSeconds: num(
    'Cast time in seconds. MANDATORY: if resourceType is mana, castSeconds MUST be >= 1 (use 1-3). Only stamina/none abilities may use 0. Powerful spells should use 2-3.',
  ),
  cooldownSeconds: num('Cooldown in seconds'),
  scaling: enumOf(SCALING_TYPES),
  value1: num('Primary power value (damage, heal amount, etc.)'),
  value2: nullable(NUM, 'Secondary value (DoT ticks, drain heal%, etc.)'),
  damageType: enumOf(DAMAGE_TYPES, 'Required for damage-dealing kinds'),
  effectType: nullable(S, 'Effect type for buff/debuff/dot/hot kinds (e.g. str_bonus, dot, damage_up, stun, regen)'),
  effectMagnitude: nullable(NUM, 'Effect strength'),
  effectDuration: nullable(
    NUM,
    'Effect duration in seconds. Combat rounds are 3s, so dot/hot/buff/debuff MUST use 9-12s (3-4 ticks). Only cc (stun/root) should use short durations.',
  ),
});

export const SKILL_GENERATION_SCHEMA: Node = deepFreeze(
  obj({ skills: { type: 'array', items: SKILL_ITEM } }),
);

// ----------------------------------------------------------------------------
// Renown perk generation
// ----------------------------------------------------------------------------

const RENOWN_PERK_ITEM: Node = obj({
  name: str("2-3 words, punchy reputation-flavored name (e.g. 'Merchant's Favor', 'Whisper Network')"),
  description: str('Sardonic Keeper narrator description, 1-2 sentences'),
  kind: enumOf(['', ...ABILITY_KINDS], 'Ability kind, OR empty string for a passive bonus perk'),
  targetRule: enumOf(['single_enemy', 'single_ally', 'self', 'all_enemies', 'all_allies', 'all_party']),
  resourceType: enumOf(RESOURCE_TYPES),
  resourceCost: num('Resource cost (mana: 10-30, stamina: 5-15, 0 for passive/none)'),
  castSeconds: num('Cast time (0 for passive or instant stamina abilities; mana abilities must be >= 1)'),
  cooldownSeconds: num('Cooldown in seconds (0 for passive)'),
  scaling: enumOf(SCALING_TYPES),
  value1: num('Primary power value (0 for pure passive)'),
  value2: nullable(NUM),
  damageType: nullable(enumOf(DAMAGE_TYPES)),
  effectType: nullable(S, 'For buff/debuff/dot/hot'),
  effectMagnitude: nullable(NUM),
  effectDuration: nullable(NUM, 'In seconds (9-12 for meaningful buffs/debuffs)'),
  perkEffectJson: nullable(
    S,
    'JSON object string for passive bonuses: {maxHp, str, dex, int, wis, cha, armorClass, gatherDoubleChance, gatherSpeedBonus, craftQualityBonus, rareGatherChance, npcAffinityGainBonus, vendorBuyDiscount, vendorSellBonus, travelCooldownReduction, goldFindBonus, xpBonus}. Only for passive perks (kind is empty).',
  ),
  perkDomain: enumOf(['combat', 'crafting', 'social']),
});

export const RENOWN_PERK_SCHEMA: Node = deepFreeze(
  obj({ perks: { type: 'array', items: RENOWN_PERK_ITEM } }),
);

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

export const LLM_JSON_SCHEMAS = deepFreeze({
  race: RACE_SCHEMA,
  classReveal: CLASS_REVEAL_SCHEMA,
  classFill: CLASS_FILL_SCHEMA,
  worldStart: WORLD_START_SCHEMA,
  regionFill: REGION_FILL_SCHEMA,
  skill: SKILL_GENERATION_SCHEMA,
  renown: RENOWN_PERK_SCHEMA,
});
