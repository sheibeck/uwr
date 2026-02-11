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
            @contextmenu.prevent="$emit('character-action', member.id)"
          >
          <span>
            {{ member.name }} (Lv {{ member.level }}) - {{ member.className }}
            <span v-if="member.id === leaderId" :style="styles.subtle">· Leader</span>
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
              {{ effectLabel(effect) }} ({{ effectDurationLabel(effect) }})
            </span>
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
          {{ effectLabel(effect) }} ({{ effectDurationLabel(effect) }})
        </span>
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
  isLeader: boolean;
  followLeader: boolean;
  selectedTargetId: bigint | null;
  nowMicros?: number;
}>();

defineEmits<{
  (e: 'leave'): void;
  (e: 'accept', fromName: string): void;
  (e: 'reject', fromName: string): void;
  (e: 'kick', targetName: string): void;
  (e: 'toggle-follow', follow: boolean): void;
  (e: 'target', characterId: bigint): void;
  (e: 'character-action', characterId: bigint): void;
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

const effectLabel = (effect: {
  effectType: string;
  magnitude: bigint;
  roundsRemaining: bigint;
  sourceAbility?: string;
}) => {
  if (effect.sourceAbility) return effect.sourceAbility;
  switch (effect.effectType) {
    case 'regen':
      return 'Totem of Vigor';
    case 'ac_bonus':
      return 'Ancestral Ward';
    default:
      return effect.effectType.replace(/_/g, ' ');
  }
};

const effectTimers = new Map<
  string,
  { seenAtMicros: number; rounds: bigint; tickSeconds: number }
>();

const effectDurationLabel = (effect: { id: bigint; roundsRemaining: bigint; effectType: string }) => {
  const tickSeconds = effect.effectType === 'regen' || effect.effectType === 'dot' ? 3 : 10;
  const totalSeconds = Number(effect.roundsRemaining) * tickSeconds;
  const key = effect.id.toString();
  const now = props.nowMicros ?? Date.now() * 1000;
  const existing = effectTimers.get(key);
  if (!existing || existing.rounds !== effect.roundsRemaining || existing.tickSeconds !== tickSeconds) {
    effectTimers.set(key, { seenAtMicros: now, rounds: effect.roundsRemaining, tickSeconds });
  }
  const entry = effectTimers.get(key);
  const elapsedSeconds = entry ? (now - entry.seenAtMicros) / 1_000_000 : 0;
  const remaining = Math.max(0, Math.ceil(totalSeconds - elapsedSeconds));
  return `${remaining}s`;
};
</script>
