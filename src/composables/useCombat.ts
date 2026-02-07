import { computed, ref, type Ref } from 'vue';
import { reducers, type CharacterRow, type CombatRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseCombatArgs = {
  connActive: Ref<boolean>;
  selectedCharacter: Ref<CharacterRow | null>;
  combats: Ref<CombatRow[]>;
};

export const useCombat = ({ connActive, selectedCharacter, combats }: UseCombatArgs) => {
  const startCombatReducer = useReducer(reducers.startCombat);
  const attackReducer = useReducer(reducers.attack);
  const endCombatReducer = useReducer(reducers.endCombat);

  const attackDamage = ref(6);

  const activeCombat = computed(() => {
    if (!selectedCharacter.value) return null;
    return (
      combats.value.find(
        (row) =>
          row.characterId === selectedCharacter.value?.id && row.status === 'active'
      ) ?? null
    );
  });

  const startCombat = (enemyId: bigint) => {
    if (!connActive.value || !selectedCharacter.value) return;
    startCombatReducer({ characterId: selectedCharacter.value.id, enemyId });
  };

  const attack = () => {
    if (!connActive.value || !activeCombat.value) return;
    const damage = BigInt(Math.max(1, Number(attackDamage.value)));
    attackReducer({ combatId: activeCombat.value.id, damage });
  };

  const endCombat = () => {
    if (!connActive.value || !activeCombat.value) return;
    endCombatReducer({ combatId: activeCombat.value.id, reason: 'fled' });
  };

  return {
    attackDamage,
    activeCombat,
    startCombat,
    attack,
    endCombat,
  };
};
