<template>
  <div>
    <div :style="styles.panelSectionTitle">Friends</div>
    <div v-if="!isLoggedIn" :style="styles.subtle">
      Login to manage friends.
    </div>
    <div v-else>
      <div :style="styles.panelSectionTitle">Add Friend</div>
      <form @submit.prevent="$emit('send-request')" :style="styles.panelForm">
        <input
          type="email"
          placeholder="Friend email"
          :value="friendEmail"
          :disabled="!connActive"
          :style="styles.input"
          @input="onEmailInput"
        />
        <button
          type="submit"
          :disabled="!connActive || !friendEmail.trim()"
          :style="styles.primaryButton"
        >
          Send Request
        </button>
      </form>

      <div :style="styles.panelSectionTitle">Incoming Requests</div>
      <div v-if="incomingRequests.length === 0" :style="styles.subtle">
        No incoming requests.
      </div>
      <ul v-else :style="styles.list">
        <li v-for="req in incomingRequests" :key="req.id.toString()">
          <span>{{ emailByUserId(req.fromUserId) }}</span>
          <div :style="styles.buttonWrap">
            <button :style="styles.primaryButton" @click="$emit('accept', req.fromUserId)">
              Accept
            </button>
            <button :style="styles.ghostButton" @click="$emit('reject', req.fromUserId)">
              Reject
            </button>
          </div>
        </li>
      </ul>

      <div :style="styles.panelSectionTitle">Sent Requests</div>
      <div v-if="outgoingRequests.length === 0" :style="styles.subtle">
        No pending sent requests.
      </div>
      <ul v-else :style="styles.list">
        <li v-for="req in outgoingRequests" :key="req.id.toString()">
          <span>{{ emailByUserId(req.toUserId) }}</span>
          <span :style="styles.subtle">Pending</span>
        </li>
      </ul>

      <div :style="styles.panelSectionTitle">Friends</div>
      <div v-if="friends.length === 0" :style="styles.subtle">
        No friends yet.
      </div>
      <ul v-else :style="styles.list">
        <li v-for="friend in friends" :key="friend.id.toString()">
          <span>{{ emailByUserId(friend.friendUserId) }}</span>
          <button :style="styles.ghostButton" @click="$emit('remove', friend.friendUserId)">
            Remove
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FriendRequest, Friend } from '../module_bindings/types';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  isLoggedIn: boolean;
  friendEmail: string;
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  friends: Friend[];
  emailByUserId: (id: bigint) => string;
}>();

const emit = defineEmits<{
  (e: 'update:friendEmail', value: string): void;
  (e: 'send-request'): void;
  (e: 'accept', fromUserId: bigint): void;
  (e: 'reject', fromUserId: bigint): void;
  (e: 'remove', friendUserId: bigint): void;
}>();

const onEmailInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:friendEmail', value);
};
</script>
