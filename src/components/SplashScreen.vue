<template>
  <div :style="styles.splashOverlay">
<pre :style="styles.splashAsciiTitle">
█    █ █▄  █ █   █  █▀▀█ █ ▀█▀ ▀█▀ █▀▀▀ █▄  █
 █    █ █ █ █ █   █  █  █ █  █   █  █    █ █ █ 
█    █ █  ██ █ ▄ █  █▀█▀ █  █   █  █▀▀  █  ██
 █    █ █  ▐█ ██ ██  █ ▐█ █  █   █  █    █   █ 
▀▀▀▀▀  ▀   ▀ ▀▀ ▀▀  ▀  ▀ ▀  ▀   ▀  ▀▀▀▀ ▀   ▀

  ██▀▀█                         
      █   ▄▀  █▀▀▀  ▀▀█ █    █▀█▀█  ▄▀▀▀
       █▀▀▀▀█  █▀▀  █▀▀█ █    █   █   ▀▀▀█
      █    █  ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀   ▀  ▀▀▀▀
</pre>

<pre :style="styles.splashAsciiDungeon">
╔════════════════╗
  ║░░░░░░░░░░░░░░░░░║
╔═══╝░░░░░░░░░░░░░░░░╚═══╗
║░░░░░░░░░▒▒▒▒░░░░░░░░░░░║
║░░░░░░░▒▒▒▒▒▒▒▒░░░░░░░░░║
║░░░░░░▒▒▒▒▓▓▓▓▒▒▒▒░░░░░░║
║░░░░░░▒▒▒▒▓▓▓▓▒▒▒▒░░░░░░║
║░░░░░░░▒▒▒▒▒▒▒▒▒▒░░░░░░░║
║░░░░░░░░░▒▒▒▒▒▒░░░░░░░░░║
║░░░░░░░░░░░░░░░░░░░░░░░░║
║░░░░░░░░░░░╔════╗░░░░░░║
║░░░░░░░░░░░║ ▒▒ ║░░░░░░║
║░░░░░░░░░░░║ ▒▒ ║░░░░░░║
╚════════════╩════╩════════╝
</pre>

    <button
      type="button"
      :style="styles.splashLogin"
      :disabled="!connActive"
      @click="$emit('login')"
    >
      Login &gt;
    </button>

    <div v-if="authMessage" :style="styles.authMessage">{{ authMessage }}</div>
    <div v-if="authError" :style="styles.authError">{{ authError }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  styles: Record<string, any>;
  connActive: boolean;
  authMessage: string;
  authError: string;
}>();

defineEmits<{
  login: [];
}>();
</script>
