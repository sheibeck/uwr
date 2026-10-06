// Ally targeting rules (48-CONTEXT "Ally targeting (A7, A26)", RESEARCH Pitfall 2, CMB-05).
//
// The server refuses a dead or departed ally for any ability, so the client sends the selected
// ally only for single-ally abilities and only while the ally is an active participant with HP
// above 0. Otherwise the id is omitted and the ability still goes through (the player never
// loses the choice to a stale selection). The rule name is typed against the server vocabulary
// so a server rename breaks the type check; the rule list itself is never copied here.
import type { TargetRule } from '@game-data/mechanical_vocabulary';

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
 * True when the ally selection must go back to the player: the fight ended, the selected
 * ally has no participant row any more, or the ally left the party. A dead ally (row still
 * present, status 'dead') stays selected for resurrection abilities.
 */
export function allyResetNeeded(input: {
  selectedId: bigint | null;
  selfId: bigint | null;
  active: boolean;
  participants: readonly { characterId: bigint }[];
  partyIds: ReadonlySet<bigint>;
}): boolean {
  if (!input.active) return true;
  const { selectedId } = input;
  if (selectedId === null) return false;
  if (input.selfId !== null && selectedId === input.selfId) return false;
  if (!input.participants.some((p) => p.characterId === selectedId)) return true;
  if (!input.partyIds.has(selectedId)) return true;
  return false;
}
