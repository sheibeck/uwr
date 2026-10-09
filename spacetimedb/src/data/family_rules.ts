// family_rules.ts
// The family rules of Phase 51.3.1.1: one role vocabulary (D-53), the rule-built member abilities,
// filler member names, family nouns, and the temperament and icon defaults.
//
// Pure module: imports only the mechanical vocabulary. Shared by the server (world fill, migration,
// encounter groups) and, where needed, the client through `@game-data/family_rules`.
// The player-facing "Support" display word is NOT here: src/combat/roles.ts owns it.
// Ability names and filler role words are PROPOSED copy (D-58) until the owner's wording review.

import type {
  AbilityKind,
  EnemyRole,
  FamilyIconKey,
  FamilyPromptRole,
  FamilyTemperament,
  ResourceIconKey,
  TargetRule,
} from './mechanical_vocabulary';
import { FAMILY_ICON_KEYS } from './mechanical_vocabulary';

// ---------------------------------------------------------------------------
// Roles (D-53)
// ---------------------------------------------------------------------------

/** The four server roles, in the order a group is listed (tank first). */
export const ROLE_ORDER: readonly EnemyRole[] = Object.freeze(['tank', 'damage', 'healer', 'caster'] as EnemyRole[]);

const ROLE_ALIASES: Record<string, EnemyRole> = {
  tank: 'tank',
  damage: 'damage',
  dps: 'damage',
  melee: 'damage',
  ranged: 'damage',
  healer: 'healer',
  support: 'healer',
  caster: 'caster',
};

/**
 * Maps any role word the world writes (melee, ranged, dps, support, ...) onto the four server roles.
 * Case-insensitive and trimmed; anything unknown is damage.
 */
export function normalizeEnemyRole(role: string | null | undefined): EnemyRole {
  const key = (role ?? '').trim().toLowerCase();
  return ROLE_ALIASES[key] ?? 'damage';
}

/** The generation prompt says support; the server says healer. */
export function promptRoleToServer(role: string): EnemyRole {
  return normalizeEnemyRole(role);
}

/** The server role as the prompt word (healer reads support). */
export function serverRoleToPrompt(role: string): FamilyPromptRole {
  const server = normalizeEnemyRole(role);
  return server === 'healer' ? 'support' : server;
}

// ---------------------------------------------------------------------------
// Member abilities (D-53, RESEARCH Section 2 and A6: no taunt or cc)
// ---------------------------------------------------------------------------

export interface MemberAbility {
  abilityKey: string;
  name: string;
  kind: AbilityKind;
  castSeconds: bigint;
  cooldownSeconds: bigint;
  targetRule: TargetRule;
}

const MEMBER_ABILITIES: Record<EnemyRole, readonly MemberAbility[]> = {
  damage: [
    { abilityKey: 'family_slash', name: 'Slash', kind: 'damage', castSeconds: 0n, cooldownSeconds: 0n, targetRule: 'single_enemy' },
    { abilityKey: 'family_rend', name: 'Rend', kind: 'dot', castSeconds: 0n, cooldownSeconds: 12n, targetRule: 'single_enemy' },
  ],
  tank: [
    { abilityKey: 'family_bash', name: 'Bash', kind: 'damage', castSeconds: 0n, cooldownSeconds: 0n, targetRule: 'single_enemy' },
    { abilityKey: 'family_brace', name: 'Brace', kind: 'shield', castSeconds: 0n, cooldownSeconds: 12n, targetRule: 'self' },
  ],
  healer: [
    { abilityKey: 'family_strike', name: 'Strike', kind: 'damage', castSeconds: 0n, cooldownSeconds: 0n, targetRule: 'single_enemy' },
    { abilityKey: 'family_mend', name: 'Mend', kind: 'heal', castSeconds: 2n, cooldownSeconds: 10n, targetRule: 'lowest_hp_ally' },
  ],
  caster: [
    { abilityKey: 'family_bolt', name: 'Bolt', kind: 'damage', castSeconds: 2n, cooldownSeconds: 0n, targetRule: 'single_enemy' },
    { abilityKey: 'family_siphon', name: 'Siphon', kind: 'drain', castSeconds: 2n, cooldownSeconds: 12n, targetRule: 'single_enemy' },
  ],
};

/** The rule-built ability pair of a member by role (fresh rows; insert as enemy_ability rows). */
export function memberAbilities(role: string): MemberAbility[] {
  return MEMBER_ABILITIES[normalizeEnemyRole(role)].map((a) => ({ ...a }));
}

// ---------------------------------------------------------------------------
// Filler member names (PROPOSED, D-58)
// ---------------------------------------------------------------------------

export const ROLE_NAME_WORD: Record<EnemyRole, string> = {
  tank: 'Warder',
  damage: 'Raider',
  healer: 'Mender',
  caster: 'Hexer',
};

function lastWord(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w);
  return words.length > 0 ? words[words.length - 1]! : '';
}

/** A filler member's name: the base template's last word plus the role word ('Skitterer Mender'). */
export function fillerMemberName(baseTemplateName: string, role: string): string {
  const word = ROLE_NAME_WORD[normalizeEnemyRole(role)];
  const base = lastWord(baseTemplateName);
  return base ? `${base} ${word}` : word;
}

// ---------------------------------------------------------------------------
// Nouns
// ---------------------------------------------------------------------------

const IRREGULAR_PLURALS: Record<string, string> = {
  man: 'men',
  woman: 'women',
  mouse: 'mice',
  louse: 'lice',
  child: 'children',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
  wolf: 'wolves',
  elf: 'elves',
  dwarf: 'dwarves',
  thief: 'thieves',
  sheep: 'sheep',
  deer: 'deer',
  fish: 'fish',
};

/** Compound endings that take the irregular plural (werewolf, swordsman, catfish). */
const IRREGULAR_SUFFIXES = ['wolf', 'man', 'woman', 'fish', 'mouse', 'louse', 'goose', 'sheep', 'deer'];
/** Words ending in "man" that are regular. */
const REGULAR_MAN_WORDS = ['human', 'shaman', 'talisman', 'caiman', 'cayman', 'german', 'ottoman'];

function matchCase(source: string, plural: string): string {
  if (source && source === source.toUpperCase() && source !== source.toLowerCase()) return plural.toUpperCase();
  if (source.charAt(0) !== source.charAt(0).toLowerCase()) return plural.charAt(0).toUpperCase() + plural.slice(1);
  return plural;
}

function pluralLower(word: string): string {
  const irregular = IRREGULAR_PLURALS[word];
  if (irregular) return irregular;
  if (!REGULAR_MAN_WORDS.some((w) => word.endsWith(w))) {
    for (const suffix of IRREGULAR_SUFFIXES) {
      if (word.endsWith(suffix)) return word.slice(0, word.length - suffix.length) + IRREGULAR_PLURALS[suffix]!;
    }
  }
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** English plural of one noun: regular rules plus an irregular map; keeps the word's capitalization. */
export function pluralize(noun: string): string {
  const word = noun.trim();
  if (!word) return '';
  return matchCase(word, pluralLower(word.toLowerCase()));
}

/**
 * Family nouns from a template name: the family name is every word but the last plus the pluralized
 * last word, as written ('Salt-Crust Skitterers'); the singular and plural nouns are lowercase.
 */
export function nounsFromTemplateName(name: string): { familyName: string; singular: string; plural: string } {
  const words = name.trim().split(/\s+/).filter((w) => w);
  if (words.length === 0) return { familyName: '', singular: '', plural: '' };
  const last = words[words.length - 1]!;
  const pluralLast = pluralize(last);
  return {
    familyName: [...words.slice(0, -1), pluralLast].join(' '),
    singular: last.toLowerCase(),
    plural: pluralLast.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Defaults by creature type and material kind (RESEARCH Section 4)
// ---------------------------------------------------------------------------

const TEMPERAMENT_BY_TYPE: Record<string, FamilyTemperament> = {
  beast: 'aggressive',
  undead: 'aggressive',
  elemental: 'aggressive',
  humanoid: 'wary',
  construct: 'wary',
  aberration: 'wary',
};

/** A family's default temperament from its creature type; unknown types are wary. */
export function temperamentForCreatureType(creatureType: string): FamilyTemperament {
  return TEMPERAMENT_BY_TYPE[creatureType.trim().toLowerCase()] ?? 'wary';
}

const ICON_BY_TYPE: Record<string, FamilyIconKey> = {
  beast: 'beast',
  undead: 'undead',
  humanoid: 'humanoid',
  elemental: 'elemental',
  aberration: 'spirit',
};

/**
 * A family's default icon key from its creature type. A type that is itself an icon key keeps it;
 * construct and unknown types give '' (the client draws the unknown icon).
 */
export function iconKeyForCreatureType(creatureType: string): FamilyIconKey | '' {
  const type = creatureType.trim().toLowerCase();
  const mapped = ICON_BY_TYPE[type];
  if (mapped) return mapped;
  return (FAMILY_ICON_KEYS as readonly string[]).includes(type) ? (type as FamilyIconKey) : '';
}

const RESOURCE_ICON_BY_KIND: Record<string, ResourceIconKey> = {
  metal: 'mineral',
  trinket: 'gem',
  wood: 'wood',
  cloth: 'fibre',
  hide: 'fibre',
  edible: 'herb',
  base: 'fluid',
};

/** A resource's icon key from its material kind; unknown kinds read mineral. */
export function resourceIconKey(materialKind: string): ResourceIconKey {
  return RESOURCE_ICON_BY_KIND[materialKind.trim().toLowerCase()] ?? 'mineral';
}

// ---------------------------------------------------------------------------
// Family keys
// ---------------------------------------------------------------------------

/** The key of a region family: region id and creature type ('7:beast'). */
export function familyKey(regionId: bigint, creatureType: string): string {
  return `${regionId.toString()}:${creatureType.trim().toLowerCase()}`;
}

/** The key of a quest kill target's family of one (D-54): 'quest:42'. */
export function questFamilyKey(templateId: bigint): string {
  return `quest:${templateId.toString()}`;
}

// ---------------------------------------------------------------------------
// Rule families and rule histories (D-66, D-68, D-70). PROPOSED copy (D-58): Plan 27 lists every
// name, noun, ambush phrase and history template below for the owner's one wording review.
// ---------------------------------------------------------------------------

/** One family the server makes by rule when the AI reply has fewer families than the region needs. */
export interface RuleFamilyEntry {
  name: string;
  singularNoun: string;
  pluralNoun: string;
  creatureType: string;
  iconKey: FamilyIconKey;
  temperament: FamilyTemperament;
  ambushVerb: string;
  ambushRest: string;
  fitTerrains: readonly string[];
}

function ruleEntry(
  name: string,
  singularNoun: string,
  pluralNoun: string,
  creatureType: string,
  iconKey: FamilyIconKey,
  temperament: FamilyTemperament,
  ambushVerb: string,
  ambushRest: string,
  fitTerrains: string[],
): RuleFamilyEntry {
  return Object.freeze({
    name,
    singularNoun,
    pluralNoun,
    creatureType,
    iconKey,
    temperament,
    ambushVerb,
    ambushRest,
    fitTerrains: Object.freeze(fitTerrains),
  });
}

/** The rule family list (D-66): each wild terrain is covered by at least two entries. PROPOSED (D-58). */
export const RULE_FAMILY_BANK: readonly RuleFamilyEntry[] = Object.freeze([
  ruleEntry('Ridge Wolves', 'wolf', 'wolves', 'beast', 'beast', 'aggressive', 'lunge', 'out of the long grass', ['plains', 'woods', 'mountains']),
  ruleEntry('Thornback Boars', 'boar', 'boars', 'beast', 'beast', 'wary', 'charge', 'out of the brush', ['woods', 'plains']),
  ruleEntry('Mire Crawlers', 'crawler', 'crawlers', 'aberration', 'insect', 'aggressive', 'surge', 'up out of the mud', ['swamp', 'coastal']),
  ruleEntry('Barrow Wights', 'wight', 'wights', 'undead', 'undead', 'aggressive', 'rise', 'from the cold earth', ['swamp', 'dungeon']),
  ruleEntry('Cave Shriekers', 'shrieker', 'shriekers', 'beast', 'avian', 'skittish', 'swoop', 'down from the dark', ['dungeon', 'mountains']),
  ruleEntry('Rubble Golems', 'golem', 'golems', 'construct', 'elemental', 'wary', 'shamble', 'out of the rubble', ['dungeon', 'mountains']),
  ruleEntry('Ember Wisps', 'wisp', 'wisps', 'elemental', 'elemental', 'skittish', 'flare', 'out of the haze', ['mountains', 'dungeon']),
  ruleEntry('Roadside Brigands', 'brigand', 'brigands', 'humanoid', 'humanoid', 'aggressive', 'step', 'out from cover', ['plains', 'woods']),
  ruleEntry('Shore Harriers', 'harrier', 'harriers', 'beast', 'avian', 'wary', 'dive', 'out of the glare', ['coastal', 'plains']),
  ruleEntry('Reef Snappers', 'snapper', 'snappers', 'beast', 'aquatic', 'wary', 'snap', 'up from the shallows', ['coastal', 'swamp']),
  ruleEntry('Grave Hounds', 'hound', 'hounds', 'undead', 'undead', 'aggressive', 'lope', 'out of the fog', ['swamp', 'plains']),
  ruleEntry('Crag Lurkers', 'lurker', 'lurkers', 'aberration', 'insect', 'wary', 'drop', 'from the rocks above', ['mountains', 'dungeon']),
]);

/** A family name without a leading "The ", so a template never reads "the The ...". */
function bareFamilyName(name: string): string {
  return name.trim().replace(/^the\s+/i, '');
}

/**
 * The rule history line of a family with no usable AI history (D-68), naming the feud when the family
 * is in one (D-70). PROPOSED (D-58). No pronoun in either template: the pronoun guard scans names.
 */
export function ruleFamilyHistory(args: { familyName: string; regionName: string; feudNames?: readonly string[] }): string {
  const family = bareFamilyName(args.familyName);
  const base = `The ${family} have roamed ${args.regionName.trim()} for longer than any traveler remembers.`;
  const feud = (args.feudNames ?? []).map(bareFamilyName).filter((name) => name);
  if (feud.length === 0) return base;
  const all = [family, ...feud].map((name) => `the ${name}`);
  const listed = `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
  return `${base} No truce has ever held between ${listed}.`;
}
