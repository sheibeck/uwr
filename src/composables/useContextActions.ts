import { computed, type Ref } from 'vue';
import type { Character, CombatEncounter, Location, Npc } from '../module_bindings/types';

export type ContextAction = {
  label: string;
  command: string;
  category: 'combat' | 'explore' | 'social' | 'ability';
  disabled?: boolean;
  detail?: string;
  active?: boolean;
};

type HotbarSlotInfo = {
  slot: number;
  abilityTemplateId: bigint;
  name: string;
  kind: string;
  cooldownRemaining: number;
};

type UseContextActionsArgs = {
  selectedCharacter: Ref<Character | null>;
  activeCombat: Ref<CombatEncounter | null>;
  connectedLocations: Ref<Location[]>;
  npcsHere: Ref<Npc[]>;
  hotbarDisplay: Ref<HotbarSlotInfo[]>;
  isCasting: Ref<boolean>;
  canActInCombat: Ref<boolean>;
  conversationNpcId: Ref<bigint | null>;
};

export function useContextActions(deps: UseContextActionsArgs) {
  const isInCombat = computed(() => {
    const combat = deps.activeCombat.value;
    return combat != null && combat.state === 'active';
  });

  const actions = computed<ContextAction[]>(() => {
    const char = deps.selectedCharacter.value;
    if (!char) return [];

    // Hide context action bar during active combat -- actions are inline in the narrative stream
    if (isInCombat.value) return [];

    const result: ContextAction[] = [];

    // Exploration context: adjacent locations
    for (const loc of deps.connectedLocations.value) {
      result.push({
        label: loc.name,
        command: `go ${loc.name.toLowerCase()}`,
        category: 'explore',
      });
    }

    // Look action
    result.push({ label: 'Look', command: 'look', category: 'explore' });

    // NPCs present
    for (const npc of deps.npcsHere.value) {
      const isConversing = deps.conversationNpcId.value?.toString() === npc.id.toString();
      result.push({
        label: isConversing ? `End conversation` : `Talk to ${npc.name}`,
        command: isConversing ? 'bye' : `hail ${npc.name.toLowerCase()}`,
        category: 'social',
        active: isConversing,
      });
    }

    return result;
  });

  return actions;
}
