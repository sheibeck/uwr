<template>
  <div>
    <div :style="styles.panelSectionTitle">Group</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to manage groups.
    </div>
    <div v-else>
      <div v-if="currentGroup">
        <div :style="styles.subtle">Group: {{ currentGroup.name }}</div>
        <div :style="styles.panelSectionTitle">Members</div>
        <ul :style="styles.list">
          <li v-for="member in groupMembers" :key="member.id.toString()">
            {{ member.name }} (Lv {{ member.level }})
          </li>
        </ul>
        <button :style="styles.ghostButton" @click="$emit('leave')">
          Leave Group
        </button>
      </div>
      <div v-else>
        <div :style="styles.panelSectionTitle">Create Group</div>
        <form @submit.prevent="$emit('create')" :style="styles.panelForm">
          <input
            type="text"
            placeholder="Group name"
            :value="groupName"
            :disabled="!connActive"
            :style="styles.input"
            @input="onGroupNameInput"
          />
          <button
            type="submit"
            :disabled="!connActive || !groupName.trim()"
            :style="styles.primaryButton"
          >
            Create
          </button>
        </form>
        <div :style="styles.panelSectionTitle">Join Group</div>
        <div v-if="groups.length === 0" :style="styles.subtle">
          No groups available.
        </div>
        <ul v-else :style="styles.list">
          <li v-for="group in groups" :key="group.id.toString()">
            <span>{{ group.name }}</span>
            <button
              :style="styles.ghostButton"
              @click="$emit('join', group.id)"
              :disabled="!connActive"
            >
              Join
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CharacterRow, GroupRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentGroup: GroupRow | null;
  groupMembers: CharacterRow[];
  groups: GroupRow[];
  groupName: string;
}>();

const emit = defineEmits<{
  (e: 'create'): void;
  (e: 'join', groupId: bigint): void;
  (e: 'leave'): void;
  (e: 'update:groupName', value: string): void;
}>();

const onGroupNameInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:groupName', value);
};
</script>
