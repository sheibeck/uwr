<template>
  <div
    :style="{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9500 }"
    @click.self="$emit('close')"
  >
    <div :style="{ background: '#141821', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '1.5rem', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 16px 40px rgba(0,0,0,0.7)' }">

      <!-- Header -->
      <div :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }">
        <div :style="{ fontSize: '1rem', fontWeight: 'bold', color: '#e6e8ef', textTransform: 'uppercase', letterSpacing: '0.07em' }">
          Bug Report
        </div>
        <button :style="{ background: 'transparent', border: 'none', color: '#888', fontSize: '1.2rem', cursor: 'pointer', padding: '0 4px' }" @click="$emit('close')">x</button>
      </div>

      <!-- Screenshot preview -->
      <div :style="{ marginBottom: '0.75rem' }">
        <div :style="labelStyle">Screenshot</div>
        <div :style="{ background: '#0b0c10', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80px' }">
          <img
            v-if="screenshotDataUrl"
            :src="screenshotDataUrl"
            :style="{ maxHeight: '200px', objectFit: 'contain', width: '100%', display: 'block', borderRadius: '4px' }"
          />
          <div v-else :style="{ color: '#555', fontSize: '0.8rem' }">No screenshot available</div>
        </div>
      </div>

      <!-- Title input -->
      <div :style="{ marginBottom: '0.75rem' }">
        <div :style="labelStyle">Title</div>
        <input
          type="text"
          v-model="title"
          placeholder="Brief summary of the bug"
          :style="inputStyle"
        />
      </div>

      <!-- Description textarea -->
      <div :style="{ marginBottom: '0.75rem' }">
        <div :style="labelStyle">Description</div>
        <textarea
          v-model="description"
          placeholder="Steps to reproduce, what you expected vs what happened..."
          rows="4"
          :style="{ ...inputStyle, resize: 'vertical' }"
        ></textarea>
      </div>

      <!-- Action row -->
      <div :style="{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }">
        <button
          @click="$emit('close')"
          :style="{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#888', padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }"
        >
          Cancel
        </button>
        <button
          @click="handleSubmit"
          :disabled="!title.trim() || isSubmitting"
          :style="{
            background: title.trim() && !isSubmitting ? '#2563eb' : '#1e3a5f',
            border: 'none',
            borderRadius: '6px',
            color: title.trim() && !isSubmitting ? '#fff' : '#666',
            padding: '6px 14px',
            fontSize: '13px',
            cursor: title.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
          }"
        >
          Submit to GitHub
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  screenshotDataUrl: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const title = ref('');
const description = ref('');
const isSubmitting = ref(false);

const labelStyle = {
  fontSize: '0.75rem',
  color: '#666',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  marginBottom: '4px',
};

const inputStyle = {
  background: '#1a202c',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '4px',
  color: '#d0d3dc',
  padding: '6px 8px',
  fontSize: '13px',
  width: '100%',
  boxSizing: 'border-box' as const,
  outline: 'none',
  fontFamily: 'inherit',
};

const handleSubmit = async () => {
  if (!title.value.trim() || isSubmitting.value) return;
  isSubmitting.value = true;

  const body = `**Bug Report**

${description.value}

---
**Screenshot:** _(screenshot was captured but cannot be attached via URL -- please paste from clipboard if needed)_

_Submitted from in-game bug reporter_`;

  const url = `https://github.com/sheibeck/uwr/issues/new?title=${encodeURIComponent(title.value)}&body=${encodeURIComponent(body)}`;

  // Try to copy screenshot to clipboard for easy pasting into the GitHub issue
  if (props.screenshotDataUrl) {
    try {
      const blob = await (await fetch(props.screenshotDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // Clipboard write may fail in some browsers, that's OK
    }
  }

  window.open(url, '_blank');
  emit('close');
};
</script>
