<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue';
import { GAME_KEY, createInertGame } from './game/context';
import AppFrame from './frame/AppFrame.vue';
import CharacterPicker from './session/CharacterPicker.vue';
import NoCharactersNote from './session/NoCharactersNote.vue';
import SplashScreen from './session/SplashScreen.vue';
import { createDefaultSession } from './session/useSession';
import type { Session } from './session/useSession';

const props = defineProps<{ callbackError?: unknown; session?: Session }>();

// A session prop exists for tests; otherwise the app owns a fresh controller.
const session: Session =
  props.session ?? createDefaultSession({ callbackError: props.callbackError ?? null });

// Components reach the game data hub by injection; a session without one gets an inert hub.
provide(GAME_KEY, session.game ?? createInertGame());

// Plain-object refs are not auto-unwrapped in the template: alias them here.
const { screen, frame, characters, pickerPendingId, pickerFailed, reconnecting, nextRetryAt, versionPrompt } =
  session;

onMounted(() => session.start());
// Also runs on a Vite hot update, so no connection survives a reload.
onBeforeUnmount(() => session.dispose());
</script>

<template>
  <div class="app-root">
    <SplashScreen
      v-if="screen.kind === 'splash'"
      :state="screen.state"
      @sign-in="session.signIn()"
    />
    <CharacterPicker
      v-else-if="screen.kind === 'picker'"
      :characters="characters"
      :pending-id="pickerPendingId"
      :failed="pickerFailed"
      @select="session.selectCharacter"
      @logout="session.logout()"
    />
    <NoCharactersNote v-else-if="screen.kind === 'noCharacters'" @logout="session.logout()" />
    <AppFrame
      v-else-if="screen.kind === 'frame' && frame"
      :view="frame"
      :reconnecting="reconnecting"
      :next-retry-at="nextRetryAt"
      :version-prompt="versionPrompt"
      @logout="session.logout()"
      @reload="session.reload()"
    />
  </div>
</template>
