<template>
  <div>
    <div :style="styles.panelSectionTitle"></div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view group details.
    </div>
    <div v-else-if="currentGroup">
      <ul :style="styles.list">
        <li
          v-for="member in sortedMembers"
          :key="member.id.toString()"
          :style="[
            styles.memberCard,
            selectedTargetId === member.id ? styles.memberCardTargeted : {},
          ]"
          @click="$emit('target', member.id)"
          @contextmenu.prevent="$emit('character-action', member.id)"
        >
          <span>
            {{ member.name }} (Lv {{ member.level }}) - {{ member.className }}
            <span v-if="member.id === leaderId" :style="styles.subtle">· Leader</span>
            <span v-if="member.id === pullerId" :style="styles.subtle">· Puller</span>
          </span>
          <div :style="styles.hpBar">
            <div :style="{ ...styles.hpFill, width: `${percent(member.hp, member.maxHp)}%` }"></div>
            <span :style="styles.barText">{{ member.hp }} / {{ member.maxHp }}</span>
          </div>
          <template v-if="member.maxMana > 0">
            <div :style="styles.hpBar">
              <div :style="{ ...styles.manaFill, width: `${percent(member.mana, member.maxMana)}%` }"></div>
              <span :style="styles.barText">{{ member.mana }} / {{ member.maxMana }}</span>
            </div>
          </template>
          <div :style="styles.hpBar">
            <div
              :style="{ ...styles.staminaFill, width: `${percent(member.stamina, member.maxStamina)}%` }"
            ></div>
            <span :style="styles.barText">{{ member.stamina }} / {{ member.maxStamina }}</span>
          </div>
          <div v-if="effectsFor(member.id).length" :style="styles.effectRow">
            <span
              v-for="effect in effectsFor(member.id)"
              :key="effect.id.toString()"
              :style="styles.effectBadge"
            >
              {{ effectLabelForDisplay(effect) }} ({{ effectDurationLabel(effect) }})
            </span>
          </div>
          <div v-for="pet in petsFor(member.id)" :key="pet.id.toString()" :style="styles.petCard">
            <span>{{ pet.name }}</span>
            <div :style="styles.hpBar">
              <div :style="{ ...styles.hpFill, width: `${percent(pet.currentHp, pet.maxHp)}%` }"></div>
              <span :style="styles.barText">{{ pet.currentHp }} / {{ pet.maxHp }}</span>
            </div>
          </div>
        </li>
      </ul>
      <div v-if="isLeader" :style="styles.checkboxRow">
        <span :style="styles.subtle">Puller</span>
        <select
          :style="styles.input"
          :value="pullerName"
          @change="$emit('set-puller', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="member in sortedMembers" :key="member.id.toString()" :value="member.name">
            {{ member.name }}
          </option>
        </select>
      </div>
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
      <div v-if="selectedCharacter" :style="styles.hpBar">
        <div
          :style="{ ...styles.hpFill, width: `${percent(selectedCharacter.hp, selectedCharacter.maxHp)}%` }"
        ></div>
        <span :style="styles.barText">
          {{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}
        </span>
      </div>
      <template v-if="selectedCharacter && selectedCharacter.maxMana > 0">
        <div :style="styles.hpBar">
          <div
            :style="{ ...styles.manaFill, width: `${percent(selectedCharacter.mana, selectedCharacter.maxMana)}%` }"
          ></div>
          <span :style="styles.barText">
            {{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}
          </span>
        </div>
      </template>
      <div v-if="selectedCharacter" :style="styles.hpBar">
        <div
          :style="{ ...styles.staminaFill, width: `${percent(selectedCharacter.stamina, selectedCharacter.maxStamina)}%` }"
        ></div>
        <span :style="styles.barText">
          {{ selectedCharacter.stamina }} / {{ selectedCharacter.maxStamina }}
        </span>
      </div>
      <div v-if="selectedCharacter && effectsFor(selectedCharacter.id).length" :style="styles.effectRow">
        <span
          v-for="effect in effectsFor(selectedCharacter.id)"
          :key="effect.id.toString()"
          :style="styles.effectBadge"
        >
          {{ effectLabelForDisplay(effect) }} ({{ effectDurationLabel(effect) }})
        </span>
      </div>
      <div v-for="pet in petsFor(selectedCharacter.id)" :key="pet.id.toString()" :style="styles.petCard">
        <span>{{ pet.name }}</span>
        <div :style="styles.hpBar">
          <div :style="{ ...styles.hpFill, width: `${percent(pet.currentHp, pet.maxHp)}%` }"></div>
          <span :style="styles.barText">{{ pet.currentHp }} / {{ pet.maxHp }}</span>
        </div>
      </div>

      <div v-if="inviteSummaries.length === 0" :style="styles.subtle">
        <div :style="styles.subtle">
          Type <code>/invite &lt;character&gt;</code> to invite someone to your group.
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
import { effectLabel, effectRemainingSeconds } from '../ui/effectTimers';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentGroup: GroupRow | null;
   groupMembers: CharacterRow[];
  characterEffects: {
    id: bigint;
    characterId: bigint;
    effectType: string;
    magnitude: bigint;
    roundsRemaining: bigint;
    sourceAbility?: string;
  }[];
  inviteSummaries: { invite: { id: bigint }; fromName: string; groupName: string }[];
  leaderId: bigint | null;
  pullerId: bigint | null;
  isLeader: boolean;
  followLeader: boolean;
  selectedTargetId: bigint | null;
  nowMicros?: number;
  combatPets: {
    id: bigint;
    combatId: bigint;
    ownerCharacterId: bigint;
    name: string;
    currentHp: bigint;
    maxHp: bigint;
  }[];
}>();

defineEmits<{
  (e: 'leave'): void;
  (e: 'accept', fromName: string): void;
  (e: 'reject', fromName: string): void;
  (e: 'kick', targetName: string): void;
  (e: 'toggle-follow', follow: boolean): void;
  (e: 'target', characterId: bigint): void;
  (e: 'character-action', characterId: bigint): void;
  (e: 'set-puller', targetName: string): void;
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

const pullerName = computed(() => {
  if (!props.pullerId) return props.selectedCharacter?.name ?? '';
  const puller = props.groupMembers.find((member) => member.id === props.pullerId);
  return puller?.name ?? props.selectedCharacter?.name ?? '';
});

const petsFor = (characterId: bigint) =>
  props.combatPets.filter((pet) => pet.ownerCharacterId === characterId);

const effectsFor = (characterId: bigint) =>
  props.characterEffects.filter((effect) => effect.characterId === characterId);

const effectTimers = new Map<
  string,
  { seenAtMicros: number; rounds: bigint; tickSeconds: number }
>();

const effectDurationLabel = (effect: { id: bigint; roundsRemaining: bigint; effectType: string }) => {
  const now = props.nowMicros ?? Date.now() * 1000;
  return `${effectRemainingSeconds(effect, now, effectTimers)}s`;
};

const effectLabelForDisplay = (effect: {
  effectType: string;
  sourceAbility?: string;
}) => effectLabel(effect);
</script>
