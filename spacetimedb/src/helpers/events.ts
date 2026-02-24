import { SenderError } from 'spacetimedb/server';
import { effectiveGroupId } from './group';

export function tableHasRows<T>(iter: IterableIterator<T>): boolean {
  for (const _row of iter) return true;
  return false;
}

export const EVENT_TRIM_MAX = 200;
export const EVENT_TRIM_AGE_MICROS = 3_600_000_000n; // 1 hour

export const trimEventRows = <T extends { id: bigint; createdAt: { microsSinceUnixEpoch: bigint } }>(
  rows: T[],
  deleteFn: (id: bigint) => void,
  nowMicros: bigint
) => {
  const cutoff = nowMicros - EVENT_TRIM_AGE_MICROS;

  if (rows.length <= EVENT_TRIM_MAX) {
    for (const row of rows) {
      if (row.createdAt.microsSinceUnixEpoch < cutoff) {
        deleteFn(row.id);
      }
    }
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    const diff = a.createdAt.microsSinceUnixEpoch - b.createdAt.microsSinceUnixEpoch;
    return diff < 0n ? -1 : diff > 0n ? 1 : 0;
  });

  const excess = sorted.length - EVENT_TRIM_MAX;
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (i < excess || row.createdAt.microsSinceUnixEpoch < cutoff) {
      deleteFn(row.id);
    }
  }
};

export function requirePlayerUserId(ctx: any): bigint {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) throw new SenderError('Login required');
  return player.userId;
}

export function requireCharacterOwnedBy(ctx: any, characterId: bigint) {
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  const userId = requirePlayerUserId(ctx);
  if (character.ownerUserId !== userId) {
    throw new SenderError('Not your character');
  }
  return character;
}

export function activeCombatIdForCharacter(ctx: any, characterId: bigint): bigint | null {
  for (const participant of ctx.db.combat_participant.by_character.filter(characterId)) {
    const combat = ctx.db.combat_encounter.id.find(participant.combatId);
    if (combat && combat.state === 'active') return combat.id;
  }
  return null;
}

export function appendWorldEvent(ctx: any, kind: string, message: string) {
  const row = ctx.db.event_world.insert({
    id: 0n,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.event_world.iter()];
  trimEventRows(rows, (id) => ctx.db.event_world.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

export function appendLocationEvent(
  ctx: any,
  locationId: bigint,
  kind: string,
  message: string,
  excludeCharacterId?: bigint
) {
  const row = ctx.db.event_location.insert({
    id: 0n,
    locationId,
    kind,
    message,
    excludeCharacterId,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.event_location.by_location.filter(locationId)];
  trimEventRows(rows, (id) => ctx.db.event_location.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

export function appendPrivateEvent(
  ctx: any,
  characterId: bigint,
  ownerUserId: bigint,
  kind: string,
  message: string
) {
  const row = ctx.db.event_private.insert({
    id: 0n,
    ownerUserId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.event_private.by_owner_user.filter(ownerUserId)];
  trimEventRows(rows, (id) => ctx.db.event_private.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}

export function appendSystemMessage(ctx: any, character: any, message: string) {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', message);
}

export function logPrivateAndGroup(
  ctx: any,
  character: any,
  kind: string,
  privateMessage: string,
  groupMessage?: string
) {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, kind, privateMessage);
  const groupId = effectiveGroupId(character);
  if (!groupId) return;
  appendGroupEvent(ctx, groupId, character.id, kind, groupMessage ?? privateMessage);
}

export function appendPrivateAndGroupEvent(
  ctx: any,
  character: any,
  kind: string,
  message: string,
  groupMessage?: string
) {
  logPrivateAndGroup(ctx, character, kind, message, groupMessage);
}

export function fail(ctx: any, character: any, message: string, kind = 'system') {
  appendPrivateEvent(ctx, character.id, character.ownerUserId, kind, message);
}

export function appendNpcDialog(ctx: any, characterId: bigint, npcId: bigint, text: string) {
  const cutoff = ctx.timestamp.microsSinceUnixEpoch - 60_000_000n;
  for (const row of ctx.db.npc_dialog.by_character.filter(characterId)) {
    if (row.npcId !== npcId) continue;
    if (row.text !== text) continue;
    if (row.createdAt.microsSinceUnixEpoch >= cutoff) {
      return;
    }
  }
  ctx.db.npc_dialog.insert({
    id: 0n,
    characterId,
    npcId,
    text,
    createdAt: ctx.timestamp,
  });
}

export function appendGroupEvent(
  ctx: any,
  groupId: bigint,
  characterId: bigint,
  kind: string,
  message: string
) {
  const row = ctx.db.event_group.insert({
    id: 0n,
    groupId,
    characterId,
    kind,
    message,
    createdAt: ctx.timestamp,
  });
  const rows = [...ctx.db.event_group.by_group.filter(groupId)];
  trimEventRows(rows, (id) => ctx.db.event_group.id.delete(id), ctx.timestamp.microsSinceUnixEpoch);
  return row;
}
