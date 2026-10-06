<script setup lang="ts">
import { computed, inject, onBeforeUnmount, provide, watch } from 'vue';
import { createConsole } from '../console/useConsole';
import EncounterPanel from '../combat/EncounterPanel.vue';
import EncounterStrip from '../combat/EncounterStrip.vue';
import { sheetMeta } from '../combat/roundClock';
import { createCombatController } from '../combat/useCombatController';
import { COMBAT_KEY, CONSOLE_KEY, FRAME_KEY, GAME_KEY, createInertGame } from '../game/context';
import type { FrameControls } from '../game/context';
import { getScreen, type ScreenId } from '../screens/screens';
import type { FrameView } from '../session/frameView';
import ContextRail from './ContextRail.vue';
import Drawer from './Drawer.vue';
import FeedShell from './FeedShell.vue';
import HeaderBar from './HeaderBar.vue';
import LocationRow from './LocationRow.vue';
import MoreSheet from './MoreSheet.vue';
import NoticeBars from './NoticeBars.vue';
import Sheet from './Sheet.vue';
import TabBar from './TabBar.vue';
import { screenForTab, tabForScreen, type TabId } from './tabs';
import { useBreakpoint } from './useBreakpoint';
import { useKeyboardOpen } from './useKeyboardOpen';
import { useScreens } from './useScreens';
import VitalsRail from './VitalsRail.vue';
import VitalsStrip from './VitalsStrip.vue';

const props = defineProps<{
  view: FrameView;
  reconnecting: boolean;
  nextRetryAt: number | null;
  versionPrompt: boolean;
}>();

const emit = defineEmits<{ logout: []; reload: [] }>();

const { isDesktop } = useBreakpoint();
const game = inject(GAME_KEY, createInertGame());
// In combat only the encounter sheet and the More sheet can open (48-UI-SPEC A5).
const screens = useScreens({ locked: computed(() => game.combat.active.value) });

watch(isDesktop, (desktop) => screens.syncLayout(desktop));

// Built once; the console reuses it. Components reach it through FRAME_KEY.
const frameControls: FrameControls = {
  isDesktop,
  activeScreen: screens.active,
  openScreen(id: ScreenId | 'encounter') {
    const focused = document.activeElement;
    screens.open(id, focused instanceof HTMLElement ? focused : null);
  },
  closeScreen() {
    if (screens.active.value !== null) screens.close();
  },
};
provide(FRAME_KEY, frameControls);

// One console per frame: the composer and the feed keywords reach the same instance.
const consoleApi = createConsole({ game, frame: frameControls });
provide(CONSOLE_KEY, consoleApi);
onBeforeUnmount(() => consoleApi.dispose());

// One combat controller per frame: the rail, strip, round row, hotbar and party block share it.
const combatController = createCombatController({ game, frame: frameControls });
provide(COMBAT_KEY, combatController);
onBeforeUnmount(() => combatController.dispose());

// Software keyboard (mobile): the strip compacts and the location row hides so the feed keeps room.
const { keyboardOpen } = useKeyboardOpen(consoleApi.inputFocused);

const activeId = computed<ScreenId | null>(() => {
  const active = screens.active.value;
  return active === null || active === 'more' || active === 'encounter' ? null : active;
});
const activeDef = computed(() => (activeId.value === null ? null : getScreen(activeId.value)));
const sheetOpen = computed(() => screens.active.value !== null);
// Mobile combat layout (48-CONTEXT A5/A6): the tab bar and the location row give way to the
// encounter strip. Log out stays reachable through the strip's account button.
const combatActive = computed(() => game.combat.active.value);
const encounterMeta = computed(() => sheetMeta(game.combat.roundNumber.value, combatController.timer.value));

function onToggleScreen(id: ScreenId, opener: HTMLElement): void {
  screens.toggle(id, opener);
}

function onSelectTab(tab: TabId, opener: HTMLElement): void {
  const target = screenForTab(tab);
  if (target === null) {
    screens.close();
    return;
  }
  screens.open(target, opener);
}
</script>

<template>
  <div class="app-frame">
    <div class="sr-only target-status" role="status">{{ combatController.targetStatus.value }}</div>
    <template v-if="isDesktop">
      <HeaderBar
        :place-label="props.view.placeLabel"
        :time-of-day="props.view.timeOfDay"
        :level-up="props.view.levelUp"
        :new-skill="props.view.newSkill"
        :active-screen="activeId"
        :character-name="props.view.characterName"
        :account-line="props.view.accountLine"
        :in-combat="game.combat.active.value"
        :round-number="game.combat.roundNumber.value"
        @toggle-screen="onToggleScreen"
        @logout="emit('logout')"
      />
      <NoticeBars
        :reconnecting="props.reconnecting"
        :next-retry-at="props.nextRetryAt"
        :version-prompt="props.versionPrompt"
        @reload="emit('reload')"
      />
      <div class="frame-body">
        <VitalsRail
          :name="props.view.characterName"
          :avatar-initial="props.view.avatarInitial"
          :class-line="props.view.classLine"
          :hp="props.view.hp"
          :max-hp="props.view.maxHp"
          :mana="props.view.mana"
          :max-mana="props.view.maxMana"
          :stamina="props.view.stamina"
          :max-stamina="props.view.maxStamina"
        />
        <FeedShell />
        <ContextRail />
        <Drawer v-if="activeDef" :key="activeDef.id" :title="activeDef.title" @close="screens.close()">
          <component :is="activeDef.component" />
        </Drawer>
      </div>
    </template>
    <template v-else>
      <VitalsStrip
        :name="props.view.characterName"
        :avatar-initial="props.view.avatarInitial"
        :class-line="props.view.classLine"
        :hp="props.view.hp"
        :max-hp="props.view.maxHp"
        :mana="props.view.mana"
        :max-mana="props.view.maxMana"
        :stamina="props.view.stamina"
        :max-stamina="props.view.maxStamina"
        :level-up="props.view.levelUp"
        :new-skill="props.view.newSkill"
        :compact="sheetOpen || keyboardOpen"
      />
      <LocationRow
        v-if="!combatActive"
        v-show="!sheetOpen && !keyboardOpen"
        :location-name="props.view.locationName"
        :time-of-day="props.view.timeOfDay"
      />
      <NoticeBars
        :reconnecting="props.reconnecting"
        :next-retry-at="props.nextRetryAt"
        :version-prompt="props.versionPrompt"
        @reload="emit('reload')"
      />
      <EncounterStrip
        v-if="combatActive"
        v-show="!sheetOpen"
        :collapsed="keyboardOpen"
        @open="(opener) => screens.open('encounter', opener)"
        @account="(opener) => screens.open('more', opener)"
      />
      <FeedShell v-show="!sheetOpen" compact :safe-bottom="combatActive" />
      <MoreSheet
        v-if="screens.active.value === 'more'"
        :class="{ 'bottom-safe': combatActive }"
        :logout-only="combatActive"
        @select="screens.openFromMore"
        @logout="emit('logout')"
        @close="screens.close()"
      />
      <Sheet
        v-else-if="screens.active.value === 'encounter'"
        title="Encounter"
        :class="{ 'bottom-safe': combatActive }"
        @close="screens.close()"
      >
        <template #meta>
          <span class="sheet-meta">{{ encounterMeta }}</span>
        </template>
        <EncounterPanel variant="sheet" />
      </Sheet>
      <Sheet v-else-if="activeDef" :key="activeDef.id" :title="activeDef.title" @close="screens.close()">
        <component :is="activeDef.component" />
      </Sheet>
      <TabBar v-if="!combatActive" :active-tab="tabForScreen(screens.active.value)" :sheet-open="sheetOpen" @select="onSelectTab" />
    </template>
  </div>
</template>

<style scoped>
.app-frame {
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.sheet-meta {
  font-size: 12px;
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

/* The tab bar that normally covers the bottom inset is hidden in combat. */
:deep(.sheet.bottom-safe) {
  padding-bottom: env(safe-area-inset-bottom);
}

.frame-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
