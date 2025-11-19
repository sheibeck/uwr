<template>
  <form @submit.prevent="onSubmit" class="card">
    <div>
      <label>Name</label>
      <input v-model="form.name" required />
    </div>
    <div>
      <label>Race</label>
      <input v-model="form.race" />
    </div>
    <div>
      <label>Archetype</label>
      <input v-model="form.archetype" />
    </div>
    <div>
      <label>Starting region</label>
      <input v-model="form.starting_region" />
    </div>
    <div class="actions">
      <button type="submit">Create</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
const props = defineProps<{ ownerId?: string | undefined }>();
const emit = defineEmits<{ (e: 'created'): void }>();

const form = reactive({ name: '', race: '', archetype: '', starting_region: '' });

async function onSubmit() {
  try {
    await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ownerId: props.ownerId })
    });
    emit('created');
    form.name = ''; form.race = ''; form.archetype = ''; form.starting_region = '';
  } catch (e) {
    console.error('Create character failed', e);
  }
}
</script>

<style scoped>
.card { padding: 0.75rem; border: 1px solid #ddd; border-radius:6px; background:#fff }
label { display:block; font-size:0.85rem; margin-top:0.5rem }
input { width:100%; padding:0.4rem }
.actions { margin-top:0.75rem }
</style>
