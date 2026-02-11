import { computed, type Ref } from 'vue';

type CombatRosterLike = {
  id: bigint;
  status: string;
};

type UseCombatLockArgs = {
  selectedCharacter: Ref<{ id: bigint; hp: bigint } | null>;
  activeCombat: Ref<unknown | null>;
  activeResult: Ref<unknown | null>;
  combatRoster: Ref<CombatRosterLike[]>;
};

export const useCombatLock = ({
  selectedCharacter,
  activeCombat,
  activeResult,
  combatRoster,
}: UseCombatLockArgs) => {
  const inCombat = computed(() => Boolean(activeCombat.value));

  const canActInCombat = computed(() => {
    if (!selectedCharacter.value || !inCombat.value) return false;
    if (selectedCharacter.value.hp === 0n) return false;
    const participant = combatRoster.value.find(
      (row) => row.id.toString() === selectedCharacter.value?.id.toString()
    );
    return participant?.status === 'active';
  });

  const combatLocked = computed(() => Boolean(activeCombat.value || activeResult.value));
  const lockInventoryEdits = computed(() => combatLocked.value);
  const lockHotbarEdits = computed(() => combatLocked.value);
  const lockCrafting = computed(() => inCombat.value);

  return {
    inCombat,
    canActInCombat,
    combatLocked,
    lockInventoryEdits,
    lockHotbarEdits,
    lockCrafting,
  };
};
