import { computed, type ComputedRef, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';
import type { Character } from '../module_bindings/types';

/**
 * Watches PendingRenownPerk table for the current character, provides perk choice
 * actions, and exposes the pending rank for display.
 *
 * Mirrors the useSkillChoice pattern for level-up skill selection.
 */
export function useRenownPerks({
  selectedCharacter,
  pendingRenownPerks,
  connActive: _connActive,
}: {
  selectedCharacter: Ref<Character | null>;
  pendingRenownPerks: Ref<any[]>;
  connActive: ComputedRef<boolean>;
}) {
  const characterId = computed(() => selectedCharacter.value?.id ?? null);

  // Filter to current character's pending renown perks
  const myPendingRenownPerks = computed(() => {
    if (!characterId.value) return [];
    const cid = characterId.value;
    return pendingRenownPerks.value.filter(
      (p) => p.characterId === cid
    );
  });

  const hasPendingRenownPerks = computed(() => myPendingRenownPerks.value.length > 0);

  // Rank of the pending perk batch (all pending perks for one rank-up share the same rank)
  const pendingRenownRank = computed(() => {
    if (!myPendingRenownPerks.value.length) return null;
    return myPendingRenownPerks.value[0].rank;
  });

  // Choose a perk by clicking its name (case-insensitive match)
  function chooseRenownPerk(perkName: string): boolean {
    const perk = myPendingRenownPerks.value.find(
      (p) => p.name.toLowerCase() === perkName.toLowerCase()
    );
    if (!perk) return false;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return false;
    conn.reducers.chooseRenownPerk({ characterId: perk.characterId, perkId: perk.id });
    return true;
  }

  return {
    myPendingRenownPerks,
    hasPendingRenownPerks,
    pendingRenownRank,
    chooseRenownPerk,
  };
}
