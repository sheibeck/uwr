export const effectiveGroupId = (character: any): bigint | null => character.groupId ?? null;

export const effectiveGroupKey = (character: any) =>
  character.groupId ? `group:${character.groupId.toString()}` : `solo:${character.id.toString()}`;

export const getGroupOrSoloParticipants = (ctx: any, character: any) => {
  const groupId = effectiveGroupId(character);
  if (!groupId) return [character];
  const participants: typeof character[] = [character];
  const seen = new Set([character.id.toString()]);
  for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
    if (seen.has(member.characterId.toString())) continue;
    const row = ctx.db.character.id.find(member.characterId);
    if (!row) continue;
    seen.add(row.id.toString());
    participants.push(row);
  }
  return participants;
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
