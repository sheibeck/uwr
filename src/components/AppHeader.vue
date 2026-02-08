<template>
  <header :style="styles.header">
    <div>
      <div :style="styles.title">Unwritten Realms</div>
      <div :style="styles.subtle">
        Status:
        <span :style="connActive ? styles.statusOnline : styles.statusOffline">
          {{ connActive ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </div>
    <div :style="styles.headerRight">
      <div v-if="selectedCharacter" :style="styles.subtle">
        {{ selectedCharacter.name }} - Lv {{ selectedCharacter.level }} -
        {{ selectedCharacter.race }} {{ selectedCharacter.className }}
      </div>
      <div v-else :style="styles.subtle">No character selected</div>
      <div v-if="currentLocation" :style="styles.subtle">
        Location: {{ currentLocation.name }}
      </div>
      <div :style="styles.authRow">
        <form
          v-if="!isLoggedIn"
          @submit.prevent="$emit('login')"
          :style="styles.authForm"
        >
          <input
            type="email"
            placeholder="Email"
            :value="email"
            :disabled="!connActive"
            :style="styles.authInput"
            @input="onEmailInput"
          />
          <button
            type="submit"
            :disabled="!connActive || !email.trim()"
            :style="styles.ghostButton"
          >
            Login
          </button>
        </form>
        <div v-else :style="styles.authLoggedIn">
          <span :style="styles.authEmail">
            {{ loggedInEmail ?? 'Logged in' }}
          </span>
          <button
            type="button"
            :disabled="!connActive"
            :style="styles.ghostButton"
            @click="$emit('logout')"
          >
            Logout
          </button>
        </div>
        <div v-if="authMessage" :style="styles.authMessage">{{ authMessage }}</div>
        <div v-if="authError" :style="styles.authError">{{ authError }}</div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { CharacterRow, LocationRow } from '../module_bindings';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  currentLocation: LocationRow | null;
  email: string;
  isLoggedIn: boolean;
  loggedInEmail: string | null;
  authMessage: string;
  authError: string;
}>();

const emit = defineEmits<{
  (e: 'update:email', value: string): void;
  (e: 'login'): void;
  (e: 'logout'): void;
}>();

const onEmailInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:email', value);
};
</script>
