<template>
  <aside class="context-rail" aria-label="Context">
    <section>
      <h6>Here</h6>
      <p class="empty">Your location appears here.</p>
    </section>
    <section>
      <h6>Nearby</h6>
      <p class="empty">No one is nearby.</p>
    </section>
    <section>
      <h6>Tracking</h6>
      <p class="empty">No quests tracked.</p>
    </section>
  </aside>
</template>

<style scoped>
.context-rail {
  width: 288px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  min-height: 0;
  overflow-y: auto;
  background: color-mix(in srgb, var(--color-surface) 30%, transparent);
}

h6 {
  color: var(--color-neutral-400);
}

.empty {
  margin: 0;
  font-size: 12px;
  color: var(--color-neutral-500);
}
</style>
