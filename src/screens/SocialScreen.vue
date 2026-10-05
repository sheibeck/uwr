<script setup lang="ts">
import { PhUsersThree } from '@phosphor-icons/vue';
import EmptyState from './EmptyState.vue';
</script>

<template>
  <EmptyState :icon="PhUsersThree" title="No friends or party yet." body="This screen is still being built." />
</template>
