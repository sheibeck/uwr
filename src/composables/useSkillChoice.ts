import { computed, type ComputedRef, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';
import type { PendingSkill, Character } from '../module_bindings/types';

/**
 * Watches PendingSkill table for the current character, provides skill choice
 * actions, and exposes pending level-up state.
 *
 * NOTE: Skill offers are queued server-side: apply_level_up enqueues one for
 * the new level, and the [skills] command (request_skill_offer) asks for one
 * again after a failed offer. This composable never requests generation itself.
 */
export function useSkillChoice({
  selectedCharacter,
  pendingSkills,
}: {
  selectedCharacter: Ref<Character | null>;
  pendingSkills: Ref<PendingSkill[]>;
  connActive: ComputedRef<boolean>;
}) {
  const characterId = computed(() => selectedCharacter.value?.id ?? null);

  // Filter to current character's pending skills
  const myPendingSkills = computed(() => {
    if (!characterId.value) return [];
    const cid = characterId.value;
    return pendingSkills.value.filter(
      (s) => s.characterId === cid
    );
  });

  const hasPendingSkills = computed(() => myPendingSkills.value.length > 0);

  // Pending level-up state
  const pendingLevels = computed(() => selectedCharacter.value?.pendingLevels ?? 0n);
  const hasPendingLevels = computed(() => pendingLevels.value > 0n);

  // Choose a skill by clicking its name (case-insensitive match)
  function chooseSkill(skillName: string): boolean {
    const skill = myPendingSkills.value.find(
      (s) => s.name.toLowerCase() === skillName.toLowerCase()
    );
    if (!skill) return false;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return false;
    conn.reducers.chooseSkill({ pendingSkillId: skill.id });
    return true;
  }

  // Apply one pending level-up
  function applyLevelUp() {
    if (!characterId.value) return;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.applyLevelUp({ characterId: characterId.value });
  }

  return {
    myPendingSkills,
    hasPendingSkills,
    pendingLevels,
    hasPendingLevels,
    chooseSkill,
    applyLevelUp,
  };
}
