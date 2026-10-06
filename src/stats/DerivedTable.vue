<script setup lang="ts">
// The Derived table (50-UI-SPEC "Derived"): a real table with a screen-reader caption, no header
// row, a row label per stat and a right-aligned tabular value. It is not interactive.
const props = defineProps<{
  rows: ReadonlyArray<{ label: string; text: string }>;
  caption: string;
}>();
</script>

<template>
  <table class="table derived">
    <caption class="sr-only">{{ props.caption }}</caption>
    <tbody>
      <tr v-for="row in props.rows" :key="row.label">
        <th scope="row">{{ row.label }}</th>
        <td class="value">{{ row.text }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.derived {
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

/* Nocturne's column header look (the h6 look) for any future thead; the row labels below are Label 12. */
.derived th {
  font-size: 10px;
  letter-spacing: 0.1em;
}

.derived th[scope='row'] {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--color-neutral-300);
}

.derived td.value {
  text-align: right;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
