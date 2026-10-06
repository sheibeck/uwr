// Local formatters for the info commands: renown, factions, faction <name>, events and group
// (INP-02). Each takes subscribed data and returns plain multi-line text. The first line is the
// title, so the feed renders the output as a titled scene block (local kind 'look', see 47-07).
//
// Content ported from the old client's command handlers (tag v2.2-client) without markup: no
// color tokens, no bracket links, no glyph progress bar (the percentage carries that
// information). Copy is plain: no exclamation marks and no Keeper voice (UI-SPEC copywriting).
// Group copy says /leave because a bare "leave" typed during a conversation ends the
// conversation (47-01).
//
// Pure: no Vue, no stores. Game tables come from the server through @game-data.

import { factionTier } from '@game-data/faction_rules';
import { RENOWN_RANKS } from '@game-data/renown_data';

type StandingRow = { factionId: bigint; standing: bigint };

/** 'Hated' .. 'Exalted', from the one shared tier rule the Stats screen uses too. */
export function standingLabel(standing: bigint): string {
  return factionTier(standing).label;
}

function standingText(standing: bigint): string {
  return `${standingLabel(standing)} (${standing})`;
}

export function formatRenown(input: {
  renown: { points: bigint; currentRank: bigint } | null;
  perks: readonly { rank: bigint; perkKey: string }[];
}): string {
  const points = input.renown ? input.renown.points : 0n;
  const rankNumber = input.renown ? Number(input.renown.currentRank) : 1;
  const current = RENOWN_RANKS.find((r) => r.rank === rankNumber);
  const next = RENOWN_RANKS.find((r) => r.rank === rankNumber + 1);

  const lines: string[] = ['Renown Status', ''];
  lines.push(`Rank ${rankNumber}: ${current ? current.name : 'Unknown'} (${points} points)`);
  if (next) {
    const needed = next.threshold - points;
    const percent = next.threshold > 0n ? Math.round((Number(points) / Number(next.threshold)) * 100) : 0;
    lines.push(`Next rank: ${next.name} (${needed > 0n ? needed : 0n} points needed, ${percent}%)`);
  } else {
    lines.push('Max rank achieved.');
  }
  if (input.perks.length > 0) {
    lines.push('', 'Active Perks:');
    for (const perk of input.perks) lines.push(`  Rank ${perk.rank}: ${perk.perkKey}`);
  }
  return lines.join('\n');
}

export function formatFactions(input: {
  standings: readonly StandingRow[];
  factions: readonly { id: bigint; name: string }[];
}): string {
  if (input.standings.length === 0) return 'Faction Standings\n\nNo faction standings yet.';
  const lines: string[] = ['Faction Standings', ''];
  for (const row of input.standings) {
    const faction = input.factions.find((f) => f.id === row.factionId);
    const name = faction ? faction.name : `Faction ${row.factionId}`;
    lines.push(`${name}: ${standingText(row.standing)}`);
  }
  return lines.join('\n');
}

export function formatFaction(
  name: string,
  input: {
    standings: readonly StandingRow[];
    factions: readonly { id: bigint; name: string; description: string }[];
  },
): string {
  const wanted = name.trim().toLowerCase();
  const faction = input.factions.find((f) => f.name.toLowerCase() === wanted);
  if (!faction) {
    return `No faction named ${name.trim()}. For a name with spaces, type /faction <name>.`;
  }
  const row = input.standings.find((s) => s.factionId === faction.id);
  const lines: string[] = [faction.name, '', `Standing: ${standingText(row ? row.standing : 0n)}`];
  if (faction.description.trim().length > 0) lines.push('', faction.description.trim());
  return lines.join('\n');
}

export function formatEvents(input: {
  events: readonly { id: bigint; name: string; regionId: bigint; status: string }[];
  regions: readonly { id: bigint; name: string }[];
  objectives: readonly { eventId: bigint; name: string; currentCount: bigint; targetCount: bigint }[];
}): string {
  const active = input.events.filter((e) => e.status === 'active');
  if (active.length === 0) return 'World Events\n\nNo active events.';
  const lines: string[] = ['World Events', ''];
  for (const event of active) {
    const region = input.regions.find((r) => r.id === event.regionId);
    lines.push(region ? `${event.name} (${region.name})` : event.name);
    for (const objective of input.objectives) {
      if (objective.eventId !== event.id) continue;
      lines.push(`  ${objective.name}: ${objective.currentCount}/${objective.targetCount}`);
    }
  }
  return lines.join('\n');
}

export function formatGroup(input: {
  inGroup: boolean;
  leaderId: bigint | null;
  members: readonly { id: bigint; name: string; level: bigint; className: string }[];
  inviterNames: readonly string[];
}): string {
  const invites = input.inviterNames.map((n) => `  ${n}: type accept ${n} or decline ${n}`);
  if (!input.inGroup) {
    if (invites.length === 0) return 'You are not in a group. Type invite <name> to start one.';
    return ['Group Invites', '', ...invites].join('\n');
  }
  const lines: string[] = ['Group', ''];
  for (const member of input.members) {
    const leader = input.leaderId !== null && member.id === input.leaderId ? ' (Leader)' : '';
    lines.push(`${member.name}, Lv ${member.level} ${member.className}${leader}`);
  }
  lines.push('', 'Type /leave to leave the group.');
  if (invites.length > 0) lines.push('', 'Pending Invites:', ...invites);
  return lines.join('\n');
}
