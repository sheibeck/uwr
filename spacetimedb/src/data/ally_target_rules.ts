// The out-of-combat ally rule, shared by the server and the client so the two can never disagree.
// This file imports nothing so the browser can import it.
//
// Owner, 2026-10-08: tap (or click) a party member to target them, everywhere, in and out of
// fights. Out of combat a heal or buff may land on an ally only while the ally is in your party,
// online, at your place and standing. The server enforces this in use_ability (before any
// cooldown, cast or effect) and again in tick_casts when a cast completes; the client imports it
// through @game-data/ally_target_rules for its selection rule (src/combat/ally.ts).
//
// Out of combat only: the in-fight rule ('That target is not in this fight.') stays in
// submitCombatChoice.

/** The caster, as far as the rule needs it. */
export interface AllyCaster {
  id: bigint;
  groupId?: bigint | null;
  locationId: bigint;
}

/** The ally target row, as far as the rule needs it. */
export interface AllyTarget extends AllyCaster {
  name: string;
  online: boolean;
  hp: bigint;
}

export type PeaceAllyReason = 'ok' | 'missing' | 'not_in_party' | 'offline' | 'elsewhere' | 'fallen';

/**
 * Why an out-of-combat ally target can or cannot be used. Checked in this order: missing, you
 * (always ok), not in your party, offline, not here, fallen. A stranger who is offline elsewhere
 * at 0 HP therefore reads as not in your party, so a guessed id never reveals more.
 */
export function peaceAllyReason(caster: AllyCaster, target: AllyTarget | null | undefined): PeaceAllyReason {
  if (target === null || target === undefined) return 'missing';
  if (target.id === caster.id) return 'ok';
  if (caster.groupId === null || caster.groupId === undefined || target.groupId !== caster.groupId) {
    return 'not_in_party';
  }
  if (target.online !== true) return 'offline';
  if (target.locationId !== caster.locationId) return 'elsewhere';
  if (!(target.hp > 0n)) return 'fallen';
  return 'ok';
}

/**
 * The player-facing refusal line for a reason, or null for 'ok'. Missing and not-in-party share
 * one line with no name; the other lines name the target, who is then one of your party.
 */
export function peaceAllyRefusal(reason: PeaceAllyReason, targetName: string): string | null {
  switch (reason) {
    case 'ok':
      return null;
    case 'missing':
    case 'not_in_party':
      return 'That target is not in your party.';
    case 'offline':
      return `${targetName} is offline.`;
    case 'elsewhere':
      return `${targetName} is not here.`;
    case 'fallen':
      return `${targetName} has fallen.`;
  }
}
