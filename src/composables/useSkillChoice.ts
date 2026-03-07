import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';
import type { PendingSkill, Character } from '../module_bindings/types';

/**
 * Watches PendingSkill table for the current character, provides skill choice
 * actions, and auto-triggers skill generation on level-up.
 */
export function useSkillChoice({
  selectedCharacter,
  pendingSkills,
  connActive,
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

  // Trigger skill generation for a level-up
  function requestSkillGen() {
    if (!characterId.value) return;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.prepareSkillGen({ characterId: characterId.value });
  }

  // Auto-trigger skill gen when level increases and no pending skills exist
  watch(
    () => selectedCharacter.value?.level,
    (newLevel, oldLevel) => {
      if (
        newLevel != null &&
        oldLevel != null &&
        newLevel > oldLevel &&
        !hasPendingSkills.value &&
        connActive.value
      ) {
        requestSkillGen();
      }
    }
  );

  return {
    myPendingSkills,
    hasPendingSkills,
    chooseSkill,
    requestSkillGen,
  };
}
