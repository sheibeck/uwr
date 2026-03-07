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
  const actions = computed<ContextAction[]>(() => {
    const char = deps.selectedCharacter.value;
    if (!char) return [];

    const result: ContextAction[] = [];

    if (deps.activeCombat.value) {
      // Combat context: abilities from hotbar
      for (const slot of deps.hotbarDisplay.value) {
        if (!slot.abilityTemplateId) continue;
        const isDisabled =
          slot.cooldownRemaining > 0 ||
          deps.isCasting.value ||
          !deps.canActInCombat.value;

        result.push({
          label: slot.name,
          command: `use ${slot.name.toLowerCase()}`,
          category: 'ability',
          disabled: isDisabled,
          detail: slot.cooldownRemaining > 0 ? `${slot.cooldownRemaining}s` : undefined,
        });
      }

      result.push({ label: 'Flee', command: 'flee', category: 'combat' });
    } else {
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
    }

    return result;
  });

  return actions;
}
