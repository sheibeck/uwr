import type { Component } from 'vue';
import { PhBackpack, PhDotsThree, PhMapTrifold, PhScroll, PhUsersThree } from '@phosphor-icons/vue';
import type { ScreenId } from '../screens/screens';

export type TabId = 'story' | 'map' | 'bag' | 'party' | 'more';

export const TABS: readonly { id: TabId; label: string; icon: Component }[] = [
  { id: 'story', label: 'Story', icon: PhScroll },
  { id: 'map', label: 'Map', icon: PhMapTrifold },
  { id: 'bag', label: 'Bag', icon: PhBackpack },
  { id: 'party', label: 'Party', icon: PhUsersThree },
  { id: 'more', label: 'More', icon: PhDotsThree },
];

/** Which sheet a tab opens: Story opens none, More opens the More sheet. */
export function screenForTab(tab: TabId): ScreenId | 'more' | null {
  switch (tab) {
    case 'story':
      return null;
    case 'map':
      return 'map';
    case 'bag':
      return 'bag';
    case 'party':
      return 'social';
    case 'more':
      return 'more';
  }
}

/** Which tab is active for the open sheet; screens without a tab belong to More. */
export function tabForScreen(active: ScreenId | 'more' | null): TabId {
  switch (active) {
    case null:
      return 'story';
    case 'map':
      return 'map';
    case 'bag':
      return 'bag';
    case 'social':
      return 'party';
    default:
      return 'more';
  }
}
