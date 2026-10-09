<script setup lang="ts">
import { computed, inject } from 'vue';
import { PhCaretUp, PhDotsThree, PhHourglassMedium } from '@phosphor-icons/vue';
import { COMBAT_KEY, GAME_KEY, createInertCombat, createInertGame } from '../game/context';
import EffectChips from '../rails/EffectChips.vue';
import {
  STRIP_EFFECT_LIMIT,
  encounterHeadingParts,
  encounterRowOf,
  encounterTitle,
  hostileViews,
  livingHostileIds,
} from './hostiles';

// The mobile encounter strip (48-UI-SPEC "Mobile (390 x 844), combat", CMB-01, CMB-03, CMB-05): a
// header button that opens the encounter sheet, an account button that keeps Log out reachable
// while the tab bar is hidden, and one chip per hostile. Names are server or model text and render
// as text nodes only. The ring follows character.combatTargetEnemyId through the hostile view, so
// nothing here is optimistic. A defeated chip never targets. Each chip leads with its role icon (12,
// role colour, aria-hidden); the role word is in the chip's accessible name (51.3.1.1 D-40). The
// heading is the panel's string (family name and living count, D-32).
const props = withDefaults(defineProps<{ collapsed?: boolean }>(), { collapsed: false });
const emit = defineEmits<{ open: [opener: HTMLElement]; account: [opener: HTMLElement] }>();

const game = inject(GAME_KEY, createInertGame());
const controller = inject(COMBAT_KEY, createInertCombat());

const combat = game.combat;
const encounter = computed(() => encounterRowOf(combat));

const hostiles = computed(() =>
  hostileViews({
    enemies: combat.enemies.value,
    templates: combat.enemyTemplates.value,
    abilities: combat.enemyAbilities.value,
    casts: combat.casts.value,
    effects: combat.enemyEffects.value,
    currentRound: combat.roundNumber.value,
    playerLevel: game.character.value?.level ?? 0n,
    targetId: game.character.value?.combatTargetEnemyId ?? null,
    selfId: game.characterId.value,
    characterNames: combat.characterNames.value,
    petNames: combat.petNames.value,
    namedFight: encounter.value?.origin === 'named',
  }),
);

const heading = computed(() =>
  encounterHeadingParts(
    encounterTitle(encounter.value, hostiles.value),
    livingHostileIds(hostiles.value).length,
    combat.applied.value,
  ),
);
const showChips = computed(() => !props.collapsed && combat.applied.value);

function onOpen(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('open', event.currentTarget);
}

function onAccount(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('account', event.currentTarget);
}

function onChip(id: bigint, defeated: boolean): void {
  if (defeated) return;
  controller.requestTarget(id);
}
</script>

<template>
  <section class="encounter-strip" aria-label="Encounter">
    <div class="strip-head">
      <button type="button" class="strip-open" aria-label="Open encounter list" @click="onOpen">
        <!-- The count keeps its width; the title ellipsizes and the full heading is the title (IN-05). -->
        <span class="strip-label" :title="heading.text"
          ><span class="head-lead">{{ heading.lead }}</span
          ><span v-if="heading.count" class="head-count">{{ heading.count }}</span></span
        >
        <span class="strip-spacer"></span>
        <PhCaretUp class="strip-caret" :size="14" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-icon strip-account"
        aria-label="Account"
        title="Account"
        @click="onAccount"
      >
        <PhDotsThree :size="20" />
      </button>
    </div>
    <div v-if="showChips" class="chip-row">
      <button
        v-for="hostile in hostiles"
        :key="String(hostile.id)"
        type="button"
        class="hostile-chip"
        :class="{
          targeted: hostile.targeted,
          defeated: hostile.defeated,
          'has-effects': hostile.effects.length > 0,
        }"
        :aria-pressed="hostile.targeted"
        :aria-disabled="hostile.defeated ? 'true' : undefined"
        :aria-label="hostile.ariaLabel"
        @click="onChip(hostile.id, hostile.defeated)"
      >
        <span class="chip-top">
          <component :is="hostile.role.icon" class="chip-role" :class="hostile.role.cls" :size="12" aria-hidden="true" />
          <span class="chip-name" :class="hostile.con.className">{{ hostile.name }}</span>
          <PhHourglassMedium v-if="hostile.windups.length > 0" class="chip-windup" :size="12" aria-hidden="true" />
        </span>
        <EffectChips
          v-if="hostile.effects.length > 0"
          :effects="hostile.effects"
          :limit="STRIP_EFFECT_LIMIT"
          compact
          nowrap
          inline
        />
        <span class="sliver"><span class="sliver-fill" :style="{ width: hostile.widthPercent }"></span></span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.encounter-strip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 8px 16px 0;
}

.strip-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strip-open {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-neutral-400);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) {
  .strip-open:hover {
    background: color-mix(in srgb, var(--color-text) 7%, transparent);
  }
}

.strip-open:active {
  background: color-mix(in srgb, var(--color-text) 14%, transparent);
}

.strip-open:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.strip-label {
  display: flex;
  min-width: 0;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}

.head-lead {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The living count never shrinks; pre keeps its leading space at the flex item's start. */
.head-count {
  flex: none;
  white-space: pre;
}

.strip-spacer {
  flex: 1;
}

.strip-caret {
  flex-shrink: 0;
  color: var(--color-neutral-500);
}

.strip-account {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  color: var(--color-neutral-300);
}

/* One line that scrolls sideways; chips never wrap. */
.chip-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.hostile-chip {
  display: flex;
  flex: 1 0 96px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  min-width: 96px;
  min-height: 44px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: none;
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) {
  .hostile-chip:hover:not(.defeated) {
    background: color-mix(in srgb, var(--color-text) 7%, var(--color-surface));
  }
}

.hostile-chip:active:not(.defeated) {
  background: color-mix(in srgb, var(--color-text) 14%, var(--color-surface));
}

.hostile-chip:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}

.hostile-chip.targeted {
  box-shadow:
    inset 0 0 0 1px var(--color-accent),
    0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

/* A chip that carries effect chips sizes to its content so the chips are not clipped; the row scrolls. */
.hostile-chip.has-effects {
  flex-basis: auto;
}

.hostile-chip.defeated {
  opacity: 0.45;
  cursor: default;
}

.chip-top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.chip-name {
  min-width: 0;
  max-width: 144px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-role {
  flex-shrink: 0;
}

/* Role colours from existing tokens only (51.3.1.1 UI-SPEC Color table). */
.chip-role.role-tank {
  color: var(--color-neutral-200);
}

.chip-role.role-damage {
  color: var(--color-con-orange);
}

.chip-role.role-caster {
  color: var(--color-line-npc);
}

.chip-role.role-support {
  color: var(--color-con-light-green);
}

.chip-role.role-named {
  color: var(--color-line-quest);
}

.chip-role.role-boss {
  color: var(--color-con-red);
}

.chip-windup {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--color-con-orange);
}

.con-gray {
  color: var(--color-con-gray);
}

.con-light-green {
  color: var(--color-con-light-green);
}

.con-blue {
  color: var(--color-con-blue);
}

.con-white {
  color: var(--color-con-white);
}

.con-yellow {
  color: var(--color-con-yellow);
}

.con-orange {
  color: var(--color-con-orange);
}

.con-red {
  color: var(--color-con-red);
}

.sliver {
  display: block;
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
}

.sliver-fill {
  display: block;
  height: 100%;
  background: color-mix(in srgb, var(--color-health) 80%, var(--color-neutral-900));
}
</style>
