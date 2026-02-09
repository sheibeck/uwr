<template>
  <div>
    <div :style="styles.panelSectionTitle"></div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view group details.
    </div>
    <div v-else-if="currentGroup">
      <div :style="styles.subtle">Group: {{ currentGroup.name }}</div>
      <div :style="styles.panelSectionTitle">Members</div>
        <ul :style="styles.list">
          <li
            v-for="member in sortedMembers"
            :key="member.id.toString()"
            :style="[
              styles.memberCard,
              selectedTargetId === member.id ? styles.memberCardTargeted : {},
            ]"
            @click="$emit('target', member.id)"
          >
          <span>
            {{ member.name }} (Lv {{ member.level }}) - {{ member.className }}
            <span v-if="member.id === leaderId" :style="styles.subtle">· Leader</span>
          </span>
          <div :style="styles.subtle">HP {{ member.hp }} / {{ member.maxHp }}</div>
          <div :style="styles.hpBar">
            <div :style="{ ...styles.hpFill, width: `${percent(member.hp, member.maxHp)}%` }"></div>
          </div>
          <div :style="styles.subtle">Mana {{ member.mana }} / {{ member.maxMana }}</div>
          <div :style="styles.hpBar">
            <div :style="{ ...styles.manaFill, width: `${percent(member.mana, member.maxMana)}%` }"></div>
          </div>
          <div :style="styles.subtle">Stamina {{ member.stamina }} / {{ member.maxStamina }}</div>
          <div :style="styles.hpBar">
            <div
              :style="{ ...styles.staminaFill, width: `${percent(member.stamina, member.maxStamina)}%` }"
            ></div>
          </div>
          <div v-if="effectsFor(member.id).length" :style="styles.effectRow">
            <span
              v-for="effect in effectsFor(member.id)"
              :key="effect.id.toString()"
              :style="styles.effectBadge"
            >
              {{ effect.effectType }}
            </span>
          </div>
          <div v-if="isLeader && member.id !== leaderId" :style="styles.buttonWrap">
            <button
              :style="styles.ghostButton"
              @click.stop="$emit('kick', member.name)"
            >
              Kick
            </button>
            <button
              :style="styles.primaryButton"
              @click.stop="$emit('promote', member.name)"
            >
              Promote
            </button>
          </div>
        </li>
      </ul>
      <label v-if="!isLeader" :style="styles.checkboxRow">
        <input
          type="checkbox"
          :checked="followLeader"
          @change="$emit('toggle-follow', !followLeader)"
        />
        <span>Follow leader movement</span>
      </label>
      <button :style="styles.ghostButton" @click="$emit('leave')">
        Leave Group
      </button>
    </div>
    <div v-else>
      <div v-if="selectedCharacter" :style="styles.panelSectionTitle"></div>
      <div
        v-if="selectedCharacter"
        :style="[
          styles.subtle,
          selectedTargetId === selectedCharacter.id ? styles.memberCardTargeted : {},
        ]"
        @click="$emit('target', selectedCharacter.id)"
      >
        {{ selectedCharacter.name }} (Lv {{ selectedCharacter.level }}) -
        {{ selectedCharacter.className }}
      </div>
      <div v-if="selectedCharacter" :style="styles.subtle">
        HP {{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}
      </div>
      <div v-if="selectedCharacter" :style="styles.hpBar">
        <div
          :style="{ ...styles.hpFill, width: `${percent(selectedCharacter.hp, selectedCharacter.maxHp)}%` }"
        ></div>
      </div>
      <div v-if="selectedCharacter" :style="styles.subtle">
        Mana {{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}
      </div>
      <div v-if="selectedCharacter" :style="styles.hpBar">
        <div
          :style="{ ...styles.manaFill, width: `${percent(selectedCharacter.mana, selectedCharacter.maxMana)}%` }"
        ></div>
      </div>
      <div v-if="selectedCharacter" :style="styles.subtle">
        Stamina {{ selectedCharacter.stamina }} / {{ selectedCharacter.maxStamina }}
      </div>
      <div v-if="selectedCharacter" :style="styles.hpBar">
        <div
          :style="{ ...styles.staminaFill, width: `${percent(selectedCharacter.stamina, selectedCharacter.maxStamina)}%` }"
        ></div>
      </div>
      <div v-if="selectedCharacter && effectsFor(selectedCharacter.id).length" :style="styles.effectRow">
        <span
          v-for="effect in effectsFor(selectedCharacter.id)"
          :key="effect.id.toString()"
          :style="styles.effectBadge"
        >
          {{ effect.effectType }}
        </span>
      </div>

      <div v-if="inviteSummaries.length === 0" :style="styles.subtle">
        You are not currently in a group.
        <div :style="styles.subtle">
          Invite someone with <code>/invite &lt;character&gt;</code> in the command bar.
        </div>
      </div>
      <div v-else>
        <div :style="styles.panelSectionTitle">Pending Invites</div>
        <ul :style="styles.list">
          <li v-for="summary in inviteSummaries" :key="summary.invite.id.toString()">
            <span>{{ summary.fromName }} invited you to {{ summary.groupName }}</span>
            <div :style="styles.buttonWrap">
              <button
                :style="styles.primaryButton"
                @click="$emit('accept', summary.fromName)"
              >
                Accept
              </button>
              <button
                :style="styles.ghostButton"
                @click="$emit('reject', summary.fromName)"
              >
                Decline
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CharacterRow, GroupRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentGroup: GroupRow | null;
   groupMembers: CharacterRow[];
   characterEffects: { id: bigint; characterId: bigint; effectType: string; magnitude: bigint; roundsRemaining: bigint }[];
  inviteSummaries: { invite: { id: bigint }; fromName: string; groupName: string }[];
  leaderId: bigint | null;
  isLeader: boolean;
  followLeader: boolean;
  selectedTargetId: bigint | null;
}>();

defineEmits<{
  (e: 'leave'): void;
  (e: 'accept', fromName: string): void;
  (e: 'reject', fromName: string): void;
  (e: 'kick', targetName: string): void;
  (e: 'promote', targetName: string): void;
  (e: 'toggle-follow', follow: boolean): void;
  (e: 'target', characterId: bigint): void;
}>();

const percent = (current: bigint, max: bigint) => {
  if (!max) return 0;
  const value = (Number(current) / Number(max)) * 100;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const sortedMembers = computed(() => {
  if (!props.selectedCharacter) return props.groupMembers;
  const selectedId = props.selectedCharacter.id.toString();
  const mine = props.groupMembers.filter((member) => member.id.toString() === selectedId);
  const others = props.groupMembers.filter((member) => member.id.toString() !== selectedId);
  return [...mine, ...others];
});

const effectsFor = (characterId: bigint) =>
  props.characterEffects.filter((effect) => effect.characterId === characterId);
</script>

