// NPC conversation helper functions for LLM-driven dialogue system

import { NPC_AFFINITY_THRESHOLDS } from '../data/mechanical_vocabulary';

/** Maximum number of active quests per player */
export const MAX_ACTIVE_QUESTS = 4;

/** Default empty memory structure */
function emptyMemory(): {
  topics: string[];
  questsCompleted: string[];
  secretsShared: string[];
  giftsGiven: string[];
  lastConversationSummary: string;
} {
  return {
    topics: [],
    questsCompleted: [],
    secretsShared: [],
    giftsGiven: [],
    lastConversationSummary: '',
  };
}

/**
 * Find or create an NpcMemory row for a character-NPC pair.
 * Returns the memory row (existing or newly created).
 */
export function getOrCreateNpcMemory(ctx: any, characterId: bigint, npcId: bigint): any {
  // Search by_character index and match npcId
  for (const row of ctx.db.npc_memory.by_character.filter(characterId)) {
    if (row.npcId === npcId) return row;
  }

  // Create a new empty memory row
  return ctx.db.npc_memory.insert({
    id: 0n,
    characterId,
    npcId,
    memoryJson: JSON.stringify(emptyMemory()),
    lastUpdated: ctx.timestamp,
  });
}

/**
 * Update NPC memory with data from LLM conversation response.
 * Merges new topics/secrets into existing memory, capping arrays at 10.
 */
export function updateNpcMemory(
  ctx: any,
  memoryRow: any,
  memoryUpdate: { addTopics?: string[]; addSecret?: string | null },
  internalThought?: string,
): void {
  let memory: ReturnType<typeof emptyMemory>;
  try {
    memory = JSON.parse(memoryRow.memoryJson);
  } catch {
    memory = emptyMemory();
  }

  // Add new topics (deduplicate)
  if (memoryUpdate.addTopics && memoryUpdate.addTopics.length > 0) {
    for (const topic of memoryUpdate.addTopics) {
      if (!memory.topics.includes(topic)) {
        memory.topics.push(topic);
      }
    }
    // Cap at 10, drop oldest
    if (memory.topics.length > 10) {
      memory.topics = memory.topics.slice(memory.topics.length - 10);
    }
  }

  // Add secret if shared
  if (memoryUpdate.addSecret) {
    if (!memory.secretsShared.includes(memoryUpdate.addSecret)) {
      memory.secretsShared.push(memoryUpdate.addSecret);
    }
    if (memory.secretsShared.length > 10) {
      memory.secretsShared = memory.secretsShared.slice(memory.secretsShared.length - 10);
    }
  }

  // Update last conversation summary from LLM internal thought
  if (internalThought) {
    memory.lastConversationSummary = internalThought;
  }

  ctx.db.npc_memory.id.update({
    ...memoryRow,
    memoryJson: JSON.stringify(memory),
    lastUpdated: ctx.timestamp,
  });
}

/**
 * Map numeric affinity value to tier name string.
 * Uses NPC_AFFINITY_THRESHOLDS from mechanical vocabulary.
 */
export function getAffinityTierForConversation(affinity: bigint): string {
  if (affinity >= NPC_AFFINITY_THRESHOLDS.bonded) return 'bonded';
  if (affinity >= NPC_AFFINITY_THRESHOLDS.trusted) return 'trusted';
  if (affinity >= NPC_AFFINITY_THRESHOLDS.friendly) return 'friendly';
  if (affinity >= NPC_AFFINITY_THRESHOLDS.neutral) return 'neutral';
  if (affinity >= NPC_AFFINITY_THRESHOLDS.unfriendly) return 'unfriendly';
  return 'hostile';
}

/**
 * Count non-completed QuestInstance rows for a character.
 */
export function getActiveQuestCount(ctx: any, characterId: bigint): number {
  let count = 0;
  for (const qi of ctx.db.quest_instance.by_character.filter(characterId)) {
    if (!qi.completed) count++;
  }
  return count;
}

/** Maximum number of active quests per NPC per player */
export const MAX_QUESTS_PER_NPC = 1;

/**
 * Count non-completed QuestInstance rows where the quest_template's npcId matches.
 */
export function getActiveQuestCountForNpc(ctx: any, characterId: bigint, npcId: bigint): number {
  let count = 0;
  for (const qi of ctx.db.quest_instance.by_character.filter(characterId)) {
    if (qi.completed) continue;
    const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
    if (qt && qt.npcId === npcId) count++;
  }
  return count;
}

/**
 * Extract completed quest names from NpcMemory for a character+NPC pair.
 */
export function getCompletedQuestNamesForNpc(ctx: any, characterId: bigint, npcId: bigint): string[] {
  const memory = getOrCreateNpcMemory(ctx, characterId, npcId);
  try {
    const data = JSON.parse(memory.memoryJson);
    return Array.isArray(data.questsCompleted) ? data.questsCompleted : [];
  } catch {
    return [];
  }
}

/**
 * Collect enemy templates from the character's current location AND connected locations.
 * Returns up to 15 entries with name, level, and location name.
 */
export function getNearbyEnemyContext(
  ctx: any,
  locationId: bigint,
): { name: string; level: number; location: string }[] {
  const results: { name: string; level: number; location: string }[] = [];

  // Collect location IDs: current + connected
  const locationIds: bigint[] = [locationId];
  for (const conn of ctx.db.location_connection.by_from.filter(locationId)) {
    locationIds.push(conn.toLocationId);
  }

  for (const locId of locationIds) {
    if (results.length >= 15) break;
    const loc = ctx.db.location.id.find(locId);
    if (!loc) continue;
    for (const ref of ctx.db.location_enemy_template.by_location.filter(locId)) {
      if (results.length >= 15) break;
      const et = ctx.db.enemy_template.id.find(ref.enemyTemplateId);
      if (et) {
        results.push({ name: et.name, level: Number(et.level), location: loc.name });
      }
    }
  }

  return results;
}

/**
 * Record a completed quest name in NPC memory for narrative continuity.
 * Deduplicates and caps at 10 entries.
 */
export function recordQuestCompletion(ctx: any, characterId: bigint, npcId: bigint, questName: string): void {
  const memoryRow = getOrCreateNpcMemory(ctx, characterId, npcId);
  let memory: ReturnType<typeof emptyMemory>;
  try {
    memory = JSON.parse(memoryRow.memoryJson);
  } catch {
    memory = emptyMemory();
  }

  if (!Array.isArray(memory.questsCompleted)) {
    memory.questsCompleted = [];
  }

  // Deduplicate
  if (!memory.questsCompleted.includes(questName)) {
    memory.questsCompleted.push(questName);
  }

  // Cap at 10, drop oldest
  if (memory.questsCompleted.length > 10) {
    memory.questsCompleted = memory.questsCompleted.slice(memory.questsCompleted.length - 10);
  }

  ctx.db.npc_memory.id.update({
    ...memoryRow,
    memoryJson: JSON.stringify(memory),
    lastUpdated: ctx.timestamp,
  });
}

/**
 * Safely parse personalityJson from an Npc row.
 * Returns a default personality object if the field is empty, null, or invalid JSON.
 */
export function parseNpcPersonality(npc: any): {
  traits: string[];
  speechPattern: string;
  knowledgeDomains: string[];
  secrets: string[];
  affinityMultiplier: number;
} {
  const defaults = {
    traits: ['reserved'],
    speechPattern: 'speaks plainly',
    knowledgeDomains: ['local area'],
    secrets: [],
    affinityMultiplier: 1.0,
  };

  if (!npc.personalityJson) return defaults;

  try {
    const parsed = JSON.parse(npc.personalityJson);
    return {
      traits: Array.isArray(parsed.traits) ? parsed.traits : defaults.traits,
      speechPattern: parsed.speechPattern || defaults.speechPattern,
      knowledgeDomains: Array.isArray(parsed.knowledgeDomains) ? parsed.knowledgeDomains : defaults.knowledgeDomains,
      secrets: Array.isArray(parsed.secrets) ? parsed.secrets : defaults.secrets,
      affinityMultiplier: typeof parsed.affinityMultiplier === 'number' ? parsed.affinityMultiplier : defaults.affinityMultiplier,
    };
  } catch {
    return defaults;
  }
}
