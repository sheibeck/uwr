export const effectiveGroupId = (character: any): bigint | null => character.groupId ?? null;

export const effectiveGroupKey = (character: any) =>
  character.groupId ? `group:${character.groupId.toString()}` : `solo:${character.id.toString()}`;

/**
 * Who a fight pulls in (owner decision, Phase 51.1: offline members are never pulled into a fight):
 * the initiator always, then every other candidate who is online and standing at the initiator's
 * place, in the given order, without duplicates. getGroupOrSoloParticipants builds the list with it
 * and startCombatForSpawn applies it again, so every fight-start path (start_combat, pulls,
 * gathering ambushes, quest-item aggro, pull_named_enemy) keeps the same rule.
 */
export const fightRoster = (initiator: any, candidates: readonly any[]): any[] => {
  const roster: any[] = [initiator];
  const seen = new Set([initiator.id.toString()]);
  for (const row of candidates) {
    if (!row) continue;
    const key = row.id.toString();
    if (seen.has(key)) continue;
    if (row.locationId !== initiator.locationId) continue;
    if (row.online !== true) continue;
    seen.add(key);
    roster.push(row);
  }
  return roster;
};

/** The initiator plus the group members a fight pulls in (see fightRoster); solo: the initiator. */
export const getGroupOrSoloParticipants = (ctx: any, character: any) => {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const rows = [...ctx.db.group_member.by_group.filter(groupId)].map((member: any) =>
    ctx.db.character.id.find(member.characterId)
  );
  return fightRoster(character, rows);
};

export const requirePullerOrLog = (
  ctx: any,
  character: any,
  fail: (ctx: any, character: any, message: string, kind?: string) => void,
  message = 'Only the group puller can start combat.'
) => {
  const groupId = effectiveGroupId(character);
  if (!groupId) return { ok: true, groupId: null, group: null } as const;
  const group = ctx.db.group.id.find(groupId);
  if (!group) {
    fail(ctx, character, 'Group not found', 'combat');
    return { ok: false, groupId, group: null } as const;
  }
  const pullerId = group.pullerCharacterId ?? group.leaderCharacterId;
  if (pullerId !== character.id) {
    fail(ctx, character, message, 'combat');
    return { ok: false, groupId, group } as const;
  }
  return { ok: true, groupId, group } as const;
};
