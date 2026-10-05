import type { Component } from 'vue';
import {
  PhBackpack,
  PhGlobeHemisphereWest,
  PhHammer,
  PhMapTrifold,
  PhStorefront,
  PhUserCircle,
  PhUsersThree,
} from '@phosphor-icons/vue';
import CraftingScreen from './CraftingScreen.vue';
import InventoryScreen from './InventoryScreen.vue';
import MapScreen from './MapScreen.vue';
import SocialScreen from './SocialScreen.vue';
import StatsScreen from './StatsScreen.vue';
import VendorScreen from './VendorScreen.vue';
import WorldEventsScreen from './WorldEventsScreen.vue';

export type ScreenId = 'map' | 'bag' | 'stats' | 'craft' | 'social' | 'events' | 'vendor';

export interface ScreenDef {
  id: ScreenId;
  /** Drawer / sheet title. */
  title: string;
  /** Desktop header button label. */
  label: string;
  /** Phosphor component. */
  icon: Component;
  /** Body component (empty-state shell in Phase 45). */
  component: Component;
  /** Has a desktop header button. */
  inHeader: boolean;
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'map', title: 'Map', label: 'Map', icon: PhMapTrifold, component: MapScreen, inHeader: true },
  { id: 'bag', title: 'Inventory', label: 'Bag', icon: PhBackpack, component: InventoryScreen, inHeader: true },
  { id: 'stats', title: 'Stats', label: 'Stats', icon: PhUserCircle, component: StatsScreen, inHeader: true },
  { id: 'craft', title: 'Crafting', label: 'Craft', icon: PhHammer, component: CraftingScreen, inHeader: true },
  { id: 'social', title: 'Social', label: 'Social', icon: PhUsersThree, component: SocialScreen, inHeader: true },
  {
    id: 'events',
    title: 'World events',
    label: 'Events',
    icon: PhGlobeHemisphereWest,
    component: WorldEventsScreen,
    inHeader: true,
  },
  { id: 'vendor', title: 'Vendor', label: 'Vendor', icon: PhStorefront, component: VendorScreen, inHeader: false },
];

export const HEADER_SCREENS: readonly ScreenDef[] = SCREENS.filter((screen) => screen.inHeader);

export function getScreen(id: ScreenId): ScreenDef {
  const screen = SCREENS.find((candidate) => candidate.id === id);
  if (!screen) throw new Error(`Unknown screen: ${id}`);
  return screen;
}
