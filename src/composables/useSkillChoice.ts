import { computed, type ComputedRef, type Ref } from 'vue';
import type { DbConnection } from '../module_bindings';
import type { PendingSkill, Character } from '../module_bindings/types';

/**
 * Watches PendingSkill table for the current character, provides skill choice
 * actions, and exposes pending level-up state.
 *
 * NOTE: Auto-trigger of skill gen on level-up has been removed — the
 * apply_level_up reducer now handles skill generation server-side.
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

  // Trigger skill generation for a level-up (manual fallback)
  function requestSkillGen() {
    if (!characterId.value) return;
    const conn = window.__db_conn as DbConnection | undefined;
    if (!conn) return;
    conn.reducers.prepareSkillGen({ characterId: characterId.value });
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
    requestSkillGen,
    applyLevelUp,
  };
}
