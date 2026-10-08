// Ally targeting rules (48-CONTEXT "Ally targeting (A7, A26)", RESEARCH Pitfall 2, CMB-05).
//
// The server refuses a dead or departed ally for any ability, so the client sends the selected
// ally only for single-ally abilities and only while the ally is an active participant with HP
// above 0. Otherwise the id is omitted and the ability still goes through (the player never
// loses the choice to a stale selection). The rule name is typed against the server vocabulary
// so a server rename breaks the type check; the rule list itself is never copied here.
//
// Owner 2026-10-08: tap a party member to target them, everywhere. Out of combat the selection
// persists and follows the shared server rule imported below (same party, online, here,
// standing), which the server enforces in use_ability and tick_casts: allyTargetFor and
// allyResetNeeded are the in-fight rule, peaceAllyTargetFor and peaceAllyResetNeeded the
// out-of-combat one.
import type { TargetRule } from '@game-data/mechanical_vocabulary';
import { peaceAllyReason, type AllyCaster, type AllyTarget } from '@game-data/ally_target_rules';

const SINGLE_ALLY: TargetRule = 'single_ally';

/** Character id to send as the ally target, or undefined to omit it. */
export function allyTargetFor(input: {
  targetRule: string;
  selectedId: bigint | null;
  participants: readonly { characterId: bigint; status: string }[];
  hpOf: (characterId: bigint) => bigint | null;
}): bigint | undefined {
  if (input.targetRule !== SINGLE_ALLY) return undefined;
  const { selectedId } = input;
  if (selectedId === null) return undefined;
  const row = input.participants.find((p) => p.characterId === selectedId);
  if (row === undefined || row.status !== 'active') return undefined;
  const hp = input.hpOf(selectedId);
  if (hp === null || hp <= 0n) return undefined;
  return selectedId;
}

/**
 * The in-fight rule: true when the ally selection must go back to the player because the
 * selected ally has no participant row any more, or left the party. A dead ally (row still
 * present, status 'dead') stays selected for resurrection abilities. Out of combat it is
 * always false: the controller asks peaceAllyResetNeeded there, so the end of a fight no longer
 * drops an ally who is still with you (owner 2026-10-08).
 */
export function allyResetNeeded(input: {
  selectedId: bigint | null;
  selfId: bigint | null;
  active: boolean;
  participants: readonly { characterId: bigint }[];
  partyIds: ReadonlySet<bigint>;
}): boolean {
  if (!input.active) return false;
  const { selectedId } = input;
  if (selectedId === null) return false;
  if (input.selfId !== null && selectedId === input.selfId) return false;
  if (!input.participants.some((p) => p.characterId === selectedId)) return true;
  if (!input.partyIds.has(selectedId)) return true;
  return false;
}

/**
 * The out-of-combat rule: true when the selected ally must go back to the player because the
 * row is gone, or the ally left your party, went offline or is not at your place. Nothing
 * selected, you selected, and a fallen ally (kept, as in a fight) are false.
 */
export function peaceAllyResetNeeded(input: {
  selectedId: bigint | null;
  self: AllyCaster | null;
  target: AllyTarget | null | undefined;
}): boolean {
  const { selectedId, self } = input;
  if (selectedId === null || self === null || selectedId === self.id) return false;
  const reason = peaceAllyReason(self, input.target);
  return reason === 'missing' || reason === 'not_in_party' || reason === 'offline' || reason === 'elsewhere';
}

/**
 * The out-of-combat ally id to send, or undefined to omit it: only for single_ally, only for a
 * selected ally who is not you, and only while the shared rule says 'ok'. You selected sends no
 * id, so the server's own default still reads 'on yourself'.
 */
export function peaceAllyTargetFor(input: {
  targetRule: string;
  selectedId: bigint | null;
  self: AllyCaster | null;
  target: AllyTarget | null | undefined;
}): bigint | undefined {
  if (input.targetRule !== SINGLE_ALLY) return undefined;
  const { selectedId, self } = input;
  if (selectedId === null || self === null || selectedId === self.id) return undefined;
  return peaceAllyReason(self, input.target) === 'ok' ? selectedId : undefined;
}
