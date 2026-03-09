import { getWorldState } from './location';

/**
 * Build the full LOOK output for a character at their current location.
 * Returns an array of text parts that can be joined with '\n'.
 */
export function buildLookOutput(ctx: any, character: any): string[] {
  const location = ctx.db.location.id.find(character.locationId);
  if (!location) return [];

  const parts: string[] = [];

  // 1. Header + description
  parts.push(location.name);
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
  const otherPlayers = allChars.filter((c: any) => c.id !== character.id);
  if (otherPlayers.length > 0) {
    const playerNames = otherPlayers.map((c: any) => `{{color:#69db7c}}[${c.name}]{{/color}}`);
    if (playerNames.length === 1) {
      parts.push(`\n${playerNames[0]} is here.`);
    } else {
      const last = playerNames.pop();
      parts.push(`\n${playerNames.join(', ')}, and ${last} are here.`);
    }
  }

  // 6. Enemies (with con colors)
  const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
  const aliveSpawns = spawns.filter((s: any) => s.state === 'available' || s.state === 'engaged' || s.state === 'pulling');
  if (aliveSpawns.length > 0) {
    const enemyParts: string[] = [];
    for (const spawn of aliveSpawns) {
      const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
      if (!template) continue;
      const diff = Number(template.level) - Number(character.level);
      let color: string;
      if (diff <= -5) color = '#6b7280';
      else if (diff <= -3) color = '#b6f7c4';
      else if (diff <= -1) color = '#8bd3ff';
      else if (diff === 0) color = '#f8fafc';
      else if (diff <= 2) color = '#f6d365';
      else if (diff <= 4) color = '#f59e0b';
      else color = '#f87171';

      const countSuffix = spawn.groupCount > 1n ? ` x${spawn.groupCount}` : '';
      enemyParts.push(`{{color:${color}}}[${spawn.name}]${countSuffix} (Lv ${template.level}){{/color}}`);
    }
    if (enemyParts.length > 0) {
      parts.push(`\nEnemies nearby: ${enemyParts.join(', ')}.`);
    }
  }

  // 7. Resources
  const resources = [...ctx.db.resource_node.by_location.filter(character.locationId)]
    .filter((r: any) => r.state === 'available');
  if (resources.length > 0) {
    const resourceCounts = new Map<string, number>();
    for (const r of resources) {
      resourceCounts.set(r.name, (resourceCounts.get(r.name) || 0) + 1);
    }
    const resourceParts: string[] = [];
    for (const [name, count] of resourceCounts) {
      resourceParts.push(count > 1 ? `{{color:#22c55e}}[Gather ${name}]{{/color}} x${count}` : `{{color:#22c55e}}[Gather ${name}]{{/color}}`);
    }
    parts.push(`\nResources: ${resourceParts.join(', ')}.`);
  }

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
