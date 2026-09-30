// ============================================================================
// JSON Schemas for the five Claude JSON routes (pure module)
// ============================================================================
//
// Every schema is built ONCE at module load and deep-frozen: Anthropic caches
// the compiled grammar keyed on the byte-identical schema, so a schema that is
// rebuilt or mutated per request would defeat the cache (RESEARCH Pitfall 5).
//
// Enums come from mechanical_vocabulary (the server is the source of truth).
// The region schema is the proven Phase 39 spike schema and keeps its own
// biome/npcType enums.
//
// Structured-output subset: no numeric/string bounds, no array-valued `type`,
// nullable fields are `anyOf: [X, { type: 'null' }]`. See helpers/schema_lint.ts.
//
// NOTE: REGION_GENERATION_SCHEMA and SKILL_GENERATION_SCHEMA deliberately reuse
// the identifiers that also exist as legacy strings in llm_prompts.ts. Never
// import both into one module without aliasing.
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
      "Use the EXACT race name the player gave. Do NOT expand, embellish, or add adjectives. If they said 'Cyclops', the raceName is 'Cyclops'. If they said 'fire goblin', the raceName is 'Fire Goblin' (just capitalize). Only invent a name if the player gave a vague description like 'some kind of shadow creature' rather than a specific race name.",
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
// Class generation
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

export const CLASS_SCHEMA: Node = deepFreeze(
  obj({
    className: str(
      "1-2 words, no adjective phrases (e.g. 'Gatebreaker', 'Pyroclast', 'Voidcaller' -- NOT 'Mire-Crowned Gatebreaker')",
    ),
    classDescription: str('2-3 sentences of sardonic class description'),
    stats: obj({
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
    }),
    abilities: { type: 'array', items: CLASS_ABILITY, description: 'Exactly 3 abilities' },
  }),
);

// ----------------------------------------------------------------------------
// Region generation (Phase 39 spike schema, verbatim; compiled live on Sonnet 5.5)
// ----------------------------------------------------------------------------

const REGION_CORE_PROPS: Record<string, Node> = {
  regionName: S,
  regionDescription: S,
  biome: {
    type: 'string',
    enum: ['volcanic', 'forest', 'tundra', 'desert', 'swamp', 'mountains', 'plains', 'coastal', 'cavern', 'ruins'],
  },
  dominantFaction: S,
  landmarks: strs,
  threats: strs,
  locations: {
    type: 'array',
    items: obj({
      name: S,
      description: S,
      terrainType: { type: 'string', enum: ['mountains', 'woods', 'plains', 'swamp', 'dungeon', 'town', 'city'] },
      isSafe: BOOL,
      levelOffset: INT,
      connectsTo: strs,
    }),
  },
};

const REGION_POPULATION_PROPS: Record<string, Node> = {
  npcs: {
    type: 'array',
    items: obj({
      name: S,
      npcType: { type: 'string', enum: ['vendor', 'questgiver', 'lore', 'trainer', 'guard', 'crafter', 'banker'] },
      locationName: S,
      description: S,
      greeting: S,
      personality: obj({
        traits: strs,
        speechPattern: S,
        knowledgeDomains: strs,
        secrets: strs,
        affinityMultiplier: NUM,
      }),
    }),
  },
  enemies: {
    type: 'array',
    items: obj({
      name: S,
      creatureType: { type: 'string', enum: ['beast', 'undead', 'humanoid', 'elemental', 'construct', 'aberration'] },
      role: { type: 'string', enum: ['melee', 'ranged', 'caster'] },
      terrainTypes: S,
      groupMin: INT,
      groupMax: INT,
      level: INT,
    }),
  },
};

export const REGION_GENERATION_SCHEMA: Node = deepFreeze(obj({ ...REGION_CORE_PROPS, ...REGION_POPULATION_PROPS }));

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
  class: CLASS_SCHEMA,
  region: REGION_GENERATION_SCHEMA,
  skill: SKILL_GENERATION_SCHEMA,
  renown: RENOWN_PERK_SCHEMA,
});
