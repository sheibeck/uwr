import { getWorldState } from './location';
import { getGroupOrSoloParticipants } from './group';
import {
  creaturePoolsByDanger,
  individualsHere,
  levelRangeLabel,
  resourcePoolsNow,
  rosterLevel,
} from './encounters';
import { creatureLine, densityWord, placeNounFor, ratingLine, resourceLine } from '../data/density_lines';
import { placeRating } from '../data/place_rating';

/** The label of the look safety line (PROPOSED, D-58: listed in 51.3.1.1-16-SUMMARY.md). */
export const SAFETY_LABEL = 'Safety:';

/**
 * The con colour of an enemy level against a character level (the existing table: grey far below,
 * green and blue below, white even, yellow, orange and red above).
 */
export function conColor(level: bigint, characterLevel: bigint): string {
  const diff = Number(level) - Number(characterLevel);
  if (diff <= -5) return '#6b7280';
  if (diff <= -3) return '#b6f7c4';
  if (diff <= -1) return '#8bd3ff';
  if (diff === 0) return '#f8fafc';
  if (diff <= 2) return '#f6d365';
  if (diff <= 4) return '#f59e0b';
  return '#f87171';
}

/**
 * Build the full LOOK output for a character at their current location.
 * Returns an array of text parts that can be joined with '\n'.
 */
export function buildLookOutput(ctx: any, character: any): string[] {
  const location = ctx.db.location.id.find(character.locationId);
  if (!location) return [];

  const parts: string[] = [];

  // 1. Header + description
  parts.push(`{{color:#fbbf24}}${location.name}{{/color}}`);
  parts.push(location.description);

  // 2. Day/Night
  const worldState = getWorldState(ctx);
  if (worldState) {
    const timeLeft = Number(worldState.nextTransitionAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000;
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    parts.push(`It is currently ${worldState.isNight ? 'nighttime' : 'daytime'}. (${mins}m ${secs}s until ${worldState.isNight ? 'dawn' : 'dusk'})`);
  }

  // 3. Safe area / Bind stone / Crafting
  if (location.isSafe) parts.push('This is a safe area.');
  if (location.bindStone) parts.push('A {{color:#ffd43b}}[bind]{{/color}} stone stands here, pulsing with faint energy.');
  if (location.craftingAvailable) parts.push('A crafting station is available, you can {{color:#f59e0b}}[craft]{{/color}} here.');

  // 4. NPCs
  const npcs = [...ctx.db.npc.by_location.filter(character.locationId)];
  if (npcs.length > 0) {
    const npcNames = npcs.map((n: any) => `{{color:#da77f2}}[${n.name}]{{/color}}`);
    if (npcNames.length === 1) {
      parts.push(`\nYou see ${npcNames[0]} here.`);
    } else {
      const last = npcNames.pop();
      parts.push(`\nYou see ${npcNames.join(', ')}, and ${last} here.`);
    }
    if (npcs.some((n: any) => n.npcType === 'banker')) {
      parts.push('A {{color:#ffd43b}}[bank]{{/color}} is available here.');
    }
    if (npcs.some((n: any) => n.npcType === 'vendor')) {
      parts.push('A {{color:#f59e0b}}[shop]{{/color}} is available here.');
    }
  }

  // 5. Other players
  const allChars = [...ctx.db.character.by_location.filter(character.locationId)];
  // Offline characters drop out of the line (CONTEXT Area 2).
  const otherPlayers = allChars.filter((c: any) => c.id !== character.id && c.online === true);
  if (otherPlayers.length > 0) {
    const playerNames = otherPlayers.map((c: any) => `{{color:#69db7c}}[${c.name}]{{/color}}`);
    if (playerNames.length === 1) {
      parts.push(`\n${playerNames[0]} is here.`);
    } else {
      const last = playerNames.pop();
      parts.push(`\n${playerNames.join(', ')}, and ${last} are here.`);
    }
  }

  // 6. Safety (D-34, UI-SPEC P2): the shared rating rule, for the party's LOWEST level here (D-56).
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const individuals = individualsHere(ctx, character);
  const creatures = creaturePoolsByDanger(ctx, character.locationId, now);
  const rating = placeRating({
    isSafe: location.isSafe === true,
    isUncharted: location.terrainType === 'uncharted',
    ready: true,
    families: creatures.map((h) => ({ level: h.level, lvHi: h.lvHi })),
    playerLevel: rosterLevel(getGroupOrSoloParticipants(ctx, character)),
    bossOrNamedHere: individuals.some((i) => i.kind === 'named' || i.template?.isBoss === true),
  });
  if (rating.word) {
    const line = ratingLine(rating.key);
    parts.push(`\n${SAFETY_LABEL} ${rating.word}.${line ? ` ${line}` : ''}`);
  }

  // 6a. Individuals (D-07): the character's living named enemies here and individual spawns (World
  // event enemies, bosses), in the old "Enemies nearby" form. Ordinary creatures are never listed.
  if (individuals.length > 0) {
    const enemyParts = individuals.map((i) => {
      const countSuffix = i.spawn && i.spawn.groupCount > 1n ? ` x${i.spawn.groupCount}` : '';
      return `{{color:${conColor(i.level, character.level)}}}[${i.name}]${countSuffix} (Lv ${i.level}){{/color}}`;
    });
    parts.push(`\nEnemies nearby: ${enemyParts.join(', ')}.`);
  }

  // 6b. Creature families (D-03, D-22), in danger order: keyword, level range and density word, then
  // the density line. A wiped-out family shows only its line (nothing to pull).
  const place = placeNounFor(location);
  creatures.forEach((h, index) => {
    const line = creatureLine({
      plural: h.family.pluralNoun,
      singular: h.family.singularNoun,
      temperament: h.family.temperament,
      level: h.level,
      place,
    });
    const lead = index === 0 ? '\n' : '';
    if (h.level === 0) {
      parts.push(`${lead}${line}`);
    } else {
      const label = `${levelRangeLabel(h.lvLo, h.lvHi)}, ${densityWord('creature', h.level)}`;
      parts.push(`${lead}{{color:${conColor(h.lvHi, character.level)}}}[${h.family.name}]{{/color}} (${label}). ${line}`);
    }
  });

  // 7. Resources available at this time of day (D-26, D-55): Gather keyword and supply word, then the
  // line. An Exhausted resource shows only its line.
  const resources = resourcePoolsNow(ctx, character.locationId, worldState?.isNight === true, now);
  resources.forEach((r, index) => {
    const line = resourceLine({ resource: r.name, level: r.level, place });
    const lead = index === 0 ? '\n' : '';
    if (r.level === 0) {
      parts.push(`${lead}${line}`);
    } else {
      parts.push(`${lead}{{color:#22c55e}}[Gather ${r.name}]{{/color}} (${densityWord('resource', r.level)}). ${line}`);
    }
  });

  // 7.5 Quest items (discovered but not yet looted)
  const questItems = [...ctx.db.quest_item.by_location.filter(character.locationId)]
    .filter((qi: any) => qi.characterId === character.id && qi.discovered && !qi.looted);
  if (questItems.length > 0) {
    const qiParts = questItems.map((qi: any) =>
      `{{color:#fbbf24}}[Loot ${qi.name}]{{/color}}`
    );
    parts.push(`\nQuest items: ${qiParts.join(', ')}.`);
  }

  // 8. Travel exits
  const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
  const exitNames = connections
    .map((c: any) => ctx.db.location.id.find(c.toLocationId))
    .filter(Boolean)
    .map((l: any) => `{{color:#4dabf7}}[${l.name}]{{/color}}`);
  if (exitNames.length > 0) {
    parts.push(`\nExits: ${exitNames.join(', ')}.`);
  }

  return parts;
}
