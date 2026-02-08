<template>
  <div>
    <div :style="styles.panelSectionTitle">Group</div>
    <div v-if="!selectedCharacter" :style="styles.subtle">
      Select a character to view group details.
    </div>
    <div v-else-if="currentGroup">
      <div :style="styles.subtle">Group: {{ currentGroup.name }}</div>
      <div :style="styles.panelSectionTitle">Members</div>
      <ul :style="styles.list">
        <li v-for="member in groupMembers" :key="member.id.toString()">
          <span>
            {{ member.name }} (Lv {{ member.level }}) - {{ member.className }}
            <span v-if="member.id === leaderId" :style="styles.subtle">· Leader</span>
          </span>
          <div v-if="isLeader && member.id !== leaderId" :style="styles.buttonWrap">
            <button
              :style="styles.ghostButton"
              @click="$emit('kick', member.name)"
            >
              Kick
            </button>
            <button
              :style="styles.primaryButton"
              @click="$emit('promote', member.name)"
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
import type { CharacterRow, GroupRow } from '../module_bindings';

defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentGroup: GroupRow | null;
  groupMembers: CharacterRow[];
  inviteSummaries: { invite: { id: bigint }; fromName: string; groupName: string }[];
  leaderId: bigint | null;
  isLeader: boolean;
  followLeader: boolean;
}>();

defineEmits<{
  (e: 'leave'): void;
  (e: 'accept', fromName: string): void;
  (e: 'reject', fromName: string): void;
  (e: 'kick', targetName: string): void;
  (e: 'promote', targetName: string): void;
  (e: 'toggle-follow', follow: boolean): void;
}>();
</script>
