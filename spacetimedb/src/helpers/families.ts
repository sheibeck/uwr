// families.ts
// The creature family and pool seeding layer of Phase 51.3.1.1 (SC1, D-02, D-25, D-26, D-46, D-48,
// D-54, D-55):
//   - createFamily / linkFamilyToLocation / createRelations: a family from one definition (an AI reply
//     after validateFamilies, or the rule path), find-or-create by its key;
//   - isOrdinaryTemplate / familiesFromTemplates: today's enemy types grouped into families by rule;
//   - seedCreaturePools / seedResourcePools / addResourcePoolsForRegion: pools at a place, with home
//     densities set by rule only (the AI never sets a number, D-46);
//   - ensurePoolsForLocation: the lazy safety net that replaces ensureSpawnsForLocation (Plan 08);
//   - familyOfOne: a pool of its own for an AI-invented quest kill target (D-54).
//
// Every pool is created through pools.ts createPool. Stats come from enemyStatsForLevel and the role
// profiles, abilities from memberAbilities. Deterministic: seeded picks only, "now" is passed in.

import type { EnemyRole, FamilyRelation } from '../data/mechanical_vocabulary';
import { FAMILY_RELATIONS } from '../data/mechanical_vocabulary';
import { enemyStatsForLevel } from '../data/enemy_rules';
import {
  ROLE_ORDER,
  familyKey,
  fillerMemberName,
  iconKeyForCreatureType,
  memberAbilities,
  normalizeEnemyRole,
  nounsFromTemplateName,
  temperamentForCreatureType,
} from '../data/family_rules';
import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FamilyMemberDefinition {
  /** The canonical server role. */
  role: EnemyRole;
  name: string;
  /** An enemy_template that joins as this member (its role fields are rewritten to `role`). */
  existingTemplateId?: bigint;
  /** True when the server filled a missing role by rule. */
  filler: boolean;
}

export interface FamilyDefinition {
  /** creature_family.key: '<regionId>:<creatureType>' (rule), 'ai:<regionId>:<name>' (AI), 'quest:<id>'. */
  key: string;
  name: string;
  singularNoun: string;
  pluralNoun: string;
  creatureType: string;
  temperament: string;
  iconKey: string;
  ambushVerb: string;
  ambushRest: string;
  fitTerrains: string[];
  members: FamilyMemberDefinition[];
}

export interface FamilyRelationDef {
  otherKey: string;
  kind: FamilyRelation;
}

// ---------------------------------------------------------------------------
// Small rules
// ---------------------------------------------------------------------------

function byId(a: { id: bigint }, b: { id: bigint }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A comma list of terrains, trimmed, lowercased, deduplicated; 'any' is not a terrain. */
function splitTerrains(list: unknown): string[] {
  if (typeof list !== 'string') return [];
  const out: string[] = [];
  for (const part of list.split(',')) {
    const terrain = part.trim().toLowerCase();
    if (terrain && terrain !== 'any' && !out.includes(terrain)) out.push(terrain);
  }
  return out;
}

/** The region's base enemy level, as world generation computes it: dangerMultiplier / 100, at least 1. */
export function regionBaseLevel(ctx: any, regionId: bigint): bigint {
  const region = ctx.db.region.id.find(regionId);
  const level: bigint = (region?.dangerMultiplier ?? 100n) / 100n;
  return level < 1n ? 1n : level;
}

/** The names of World event enemies (data/world_event_data.ts), lowercased. */
const WORLD_EVENT_ENEMY_NAMES: ReadonlySet<string> = (() => {
  const names = new Set<string>();
  for (const def of Object.values(WORLD_EVENT_DEFINITIONS)) {
    for (const place of def.contentLocations) {
      for (const enemy of place.enemies) names.add(enemy.enemyTemplateKey.trim().toLowerCase());
    }
  }
  return names;
})();

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

function setTemplateRole(ctx: any, template: any, role: EnemyRole): void {
  if (template.role !== role || template.roleDetail !== role || template.abilityProfile !== role) {
    ctx.db.enemy_template.id.update({ ...template, role, roleDetail: role, abilityProfile: role });
  }
  const roleRows = [...ctx.db.enemy_role_template.by_template.filter(template.id)];
  if (roleRows.length === 0) {
    ctx.db.enemy_role_template.insert({
      id: 0n,
      enemyTemplateId: template.id,
      roleKey: role,
      displayName: template.name,
      role,
      roleDetail: role,
      abilityProfile: role,
    });
    return;
  }
  for (const row of roleRows) {
    if (row.role === role && row.roleKey === role && row.roleDetail === role && row.abilityProfile === role) continue;
    ctx.db.enemy_role_template.id.update({ ...row, roleKey: role, role, roleDetail: role, abilityProfile: role });
  }
}

function insertMemberTemplate(ctx: any, def: FamilyDefinition, member: FamilyMemberDefinition, role: EnemyRole, level: bigint): any {
  const { maxHp, baseDamage, xpReward, armorClass } = enemyStatsForLevel(level);
  const template = ctx.db.enemy_template.insert({
    id: 0n,
    name: member.name,
    role,
    roleDetail: role,
    abilityProfile: role,
    terrainTypes: def.fitTerrains.join(','),
    creatureType: def.creatureType,
    timeOfDay: 'any',
    socialGroup: def.name,
    socialRadius: 0n,
    awareness: 'normal',
    // Pools size the groups now (D-11), so a member template is always one creature.
    groupMin: 1n,
    groupMax: 1n,
    armorClass,
    level,
    maxHp,
    baseDamage,
    xpReward,
  });
  ctx.db.enemy_role_template.insert({
    id: 0n,
    enemyTemplateId: template.id,
    roleKey: role,
    displayName: member.name,
    role,
    roleDetail: role,
    abilityProfile: role,
  });
  for (const ability of memberAbilities(role)) {
    ctx.db.enemy_ability.insert({ id: 0n, enemyTemplateId: template.id, ...ability });
  }
  return template;
}

/**
 * A family from one definition (D-02, D-25, D-46). Find-or-create by `def.key`: when the family
 * exists, nothing is inserted except a member row for an existing template of the definition that is
 * in no family yet (a rerun inserts nothing). For a new family:
 *   - a member with `existingTemplateId` joins with its template's role fields (and its role template)
 *     rewritten to the canonical role, and keeps its own stats and abilities;
 *   - every other member gets a new enemy_template at `baseLevel` (at least 1) with stats from
 *     enemyStatsForLevel, one enemy_role_template and the rule abilities from memberAbilities.
 * Returns the creature_family row.
 */
export function createFamily(ctx: any, regionId: bigint, def: FamilyDefinition, baseLevel: bigint): any {
  const level = baseLevel < 1n ? 1n : baseLevel;
  const existing = ctx.db.creature_family.key.find(def.key);
  if (existing) {
    for (const member of def.members) {
      if (member.existingTemplateId === undefined) continue;
      const template = ctx.db.enemy_template.id.find(member.existingTemplateId);
      if (!template || [...ctx.db.family_member.by_template.filter(template.id)].length > 0) continue;
      const role = normalizeEnemyRole(member.role);
      setTemplateRole(ctx, template, role);
      ctx.db.family_member.insert({ id: 0n, familyId: existing.id, enemyTemplateId: template.id, role, filler: member.filler });
    }
    return existing;
  }

  const family = ctx.db.creature_family.insert({
    id: 0n,
    regionId,
    key: def.key,
    name: def.name,
    singularNoun: def.singularNoun,
    pluralNoun: def.pluralNoun,
    temperament: def.temperament,
    iconKey: def.iconKey,
    creatureType: def.creatureType,
    ambushVerb: def.ambushVerb,
    ambushRest: def.ambushRest,
    fitTerrains: def.fitTerrains.join(','),
  });

  const joined = new Set<bigint>();
  for (const member of def.members) {
    const role = normalizeEnemyRole(member.role);
    let template: any = null;
    if (member.existingTemplateId !== undefined) {
      if (joined.has(member.existingTemplateId)) continue;
      template = ctx.db.enemy_template.id.find(member.existingTemplateId) ?? null;
      if (template) setTemplateRole(ctx, template, role);
    }
    if (!template) template = insertMemberTemplate(ctx, def, member, role, level);
    joined.add(template.id);
    ctx.db.family_member.insert({ id: 0n, familyId: family.id, enemyTemplateId: template.id, role, filler: member.filler });
  }
  return family;
}

/**
 * Links every member of a family to a place (location_enemy_template), find-or-create, so NPC context
 * and the quest name resolver keep finding the family's types there. Returns the number of new links.
 */
export function linkFamilyToLocation(ctx: any, familyId: bigint, locationId: bigint): number {
  const linked = new Set<bigint>();
  for (const row of ctx.db.location_enemy_template.by_location.filter(locationId)) linked.add(row.enemyTemplateId);
  let added = 0;
  for (const member of [...ctx.db.family_member.by_family.filter(familyId)]) {
    if (linked.has(member.enemyTemplateId)) continue;
    ctx.db.location_enemy_template.insert({ id: 0n, locationId, enemyTemplateId: member.enemyTemplateId });
    linked.add(member.enemyTemplateId);
    added += 1;
  }
  return added;
}

/**
 * Stores a family's relations (D-20), find-or-create by (family, other family, kind). A self-relation
 * and a kind outside FAMILY_RELATIONS are ignored.
 */
export function createRelations(
  ctx: any,
  familyId: bigint,
  relations: readonly { otherFamilyId: bigint; kind: FamilyRelation }[],
): void {
  for (const relation of relations) {
    if (relation.otherFamilyId === familyId) continue;
    if (!(FAMILY_RELATIONS as readonly string[]).includes(relation.kind)) continue;
    const exists = [...ctx.db.family_relation.by_family.filter(familyId)].some(
      (row: any) => row.otherFamilyId === relation.otherFamilyId && row.kind === relation.kind,
    );
    if (exists) continue;
    ctx.db.family_relation.insert({ id: 0n, familyId, otherFamilyId: relation.otherFamilyId, kind: relation.kind });
  }
}

/**
 * Whether a template is an ordinary creature that may live in a pool (T-51.3.1.1-24, D-07). Not
 * ordinary: a missing template, a boss (`isBoss`), a named enemy's template, a boss_kill quest
 * target and a World event enemy (by name). kill and kill_loot targets stay ordinary (D-54).
 */
export function isOrdinaryTemplate(ctx: any, templateId: bigint): boolean {
  const template = ctx.db.enemy_template.id.find(templateId);
  if (!template) return false;
  if (template.isBoss === true) return false;
  if (WORLD_EVENT_ENEMY_NAMES.has(String(template.name ?? '').trim().toLowerCase())) return false;
  for (const quest of ctx.db.quest_template.by_enemy.filter(templateId)) {
    if ((quest.questType ?? '').trim().toLowerCase() === 'boss_kill') return false;
  }
  for (const named of ctx.db.named_enemy.iter()) {
    if (named.enemyTemplateId === templateId) return false;
  }
  return true;
}

/** The rule role of a template while grouping: first melee is the tank, further melee are damage. */
function ruleRole(role: unknown, tankTaken: boolean): EnemyRole {
  const word = String(role ?? '').trim().toLowerCase();
  if (word === 'melee' || word === 'tank') return tankTaken ? 'damage' : 'tank';
  return normalizeEnemyRole(word);
}

/**
 * Today's enemy types of a region grouped into families by creature type (D-25), one definition per
 * type, in the order of each type's lowest template id. Templates join in id order: the first melee
 * (or tank) is the tank, further melee and ranged are damage, caster is caster, healer and support
 * are healer. Missing roles among tank, damage, healer and caster are filled by rule (filler names
 * from fillerMemberName on the base member's name). Nouns from the base member (the lowest id),
 * temperament and icon by creature type, fitTerrains from the templates' terrain lists. The ambush
 * verb and rest are empty, so the line builder falls back to burst / out of the dark.
 */
export function familiesFromTemplates(ctx: any, regionId: bigint, templates: readonly any[]): FamilyDefinition[] {
  void ctx;
  const groups = new Map<string, any[]>();
  const seen = new Set<bigint>();
  for (const template of [...templates].sort(byId)) {
    if (!template || seen.has(template.id)) continue;
    seen.add(template.id);
    const type = String(template.creatureType ?? '').trim().toLowerCase() || 'beast';
    const group = groups.get(type) ?? [];
    group.push(template);
    groups.set(type, group);
  }

  const defs: FamilyDefinition[] = [];
  for (const [type, group] of groups) {
    const base = group[0]!;
    const nouns = nounsFromTemplateName(String(base.name ?? ''));
    const members: FamilyMemberDefinition[] = [];
    let tankTaken = false;
    for (const template of group) {
      const role = ruleRole(template.role, tankTaken);
      if (role === 'tank') tankTaken = true;
      members.push({ role, name: template.name, existingTemplateId: template.id, filler: false });
    }
    for (const role of ROLE_ORDER) {
      if (members.some((m) => m.role === role)) continue;
      members.push({ role, name: fillerMemberName(String(base.name ?? ''), role), filler: true });
    }
    const fitTerrains: string[] = [];
    for (const template of group) {
      for (const terrain of splitTerrains(template.terrainTypes)) if (!fitTerrains.includes(terrain)) fitTerrains.push(terrain);
    }
    defs.push({
      key: familyKey(regionId, type),
      name: nouns.familyName || String(base.name ?? ''),
      singularNoun: nouns.singular,
      pluralNoun: nouns.plural,
      creatureType: type,
      temperament: temperamentForCreatureType(type),
      iconKey: iconKeyForCreatureType(type),
      ambushVerb: '',
      ambushRest: '',
      fitTerrains,
      members,
    });
  }
  return defs;
}
