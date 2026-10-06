<script setup lang="ts">
import { computed, provide, watch } from 'vue';
import { FRAME_KEY } from '../game/context';
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
const screens = useScreens();

watch(isDesktop, (desktop) => screens.syncLayout(desktop));

// Built once; the console (47-09) reuses it. Components reach it through FRAME_KEY.
const frameControls: FrameControls = {
  isDesktop,
  activeScreen: screens.active,
  openScreen(id) {
    const focused = document.activeElement;
    screens.open(id, focused instanceof HTMLElement ? focused : null);
  },
  closeScreen() {
    if (screens.active.value !== null) screens.close();
  },
};
provide(FRAME_KEY, frameControls);

const activeId = computed<ScreenId | null>(() => {
  const active = screens.active.value;
  return active === null || active === 'more' ? null : active;
});
const activeDef = computed(() => (activeId.value === null ? null : getScreen(activeId.value)));
const sheetOpen = computed(() => screens.active.value !== null);

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
    <template v-if="isDesktop">
      <HeaderBar
        :place-label="props.view.placeLabel"
        :time-of-day="props.view.timeOfDay"
        :level-up="props.view.levelUp"
        :new-skill="props.view.newSkill"
        :active-screen="activeId"
        :character-name="props.view.characterName"
        :account-line="props.view.accountLine"
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
        :compact="sheetOpen"
      />
      <LocationRow v-show="!sheetOpen" :location-name="props.view.locationName" :time-of-day="props.view.timeOfDay" />
      <NoticeBars
        :reconnecting="props.reconnecting"
        :next-retry-at="props.nextRetryAt"
        :version-prompt="props.versionPrompt"
        @reload="emit('reload')"
      />
      <FeedShell v-show="!sheetOpen" compact />
      <MoreSheet
        v-if="screens.active.value === 'more'"
        @select="screens.openFromMore"
        @logout="emit('logout')"
        @close="screens.close()"
      />
      <Sheet v-else-if="activeDef" :key="activeDef.id" :title="activeDef.title" @close="screens.close()">
        <component :is="activeDef.component" />
      </Sheet>
      <TabBar :active-tab="tabForScreen(screens.active.value)" :sheet-open="sheetOpen" @select="onSelectTab" />
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

.frame-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
