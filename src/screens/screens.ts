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
import CraftingMeta from '../crafting/CraftingMeta.vue';
import CraftingScreen from '../crafting/CraftingScreen.vue';
import InventoryActions from '../inventory/InventoryActions.vue';
import InventoryMeta from '../inventory/InventoryMeta.vue';
import InventoryScreen from '../inventory/InventoryScreen.vue';
import MapActions from '../map/MapActions.vue';
import MapMeta from '../map/MapMeta.vue';
import MapScreen from '../map/MapScreen.vue';
import StatsMeta from '../stats/StatsMeta.vue';
import StatsScreen from '../stats/StatsScreen.vue';
import VendorMeta from '../vendor/VendorMeta.vue';
import VendorScreen from '../vendor/VendorScreen.vue';
import SocialScreen from './SocialScreen.vue';
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
  /** Body component: the real Ledger screen, or an empty-state shell (Social, World events). */
  component: Component;
  /** Header meta (slots, gold, station); rendered in the drawer and sheet #meta slot. */
  meta?: Component;
  /** Header actions after the spacer (Inventory: gold and Organize); rendered in the drawer and sheet #actions slot. */
  actions?: Component;
  /** Has a desktop header button. */
  inHeader: boolean;
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'map',
    title: 'Map',
    label: 'Map',
    icon: PhMapTrifold,
    component: MapScreen,
    meta: MapMeta,
    actions: MapActions,
    inHeader: true,
  },
  {
    id: 'bag',
    title: 'Inventory',
    label: 'Bag',
    icon: PhBackpack,
    component: InventoryScreen,
    meta: InventoryMeta,
    actions: InventoryActions,
    inHeader: true,
  },
  {
    id: 'stats',
    title: 'Stats',
    label: 'Stats',
    icon: PhUserCircle,
    component: StatsScreen,
    meta: StatsMeta,
    inHeader: true,
  },
  {
    id: 'craft',
    title: 'Crafting',
    label: 'Craft',
    icon: PhHammer,
    component: CraftingScreen,
    meta: CraftingMeta,
    inHeader: true,
  },
  { id: 'social', title: 'Social', label: 'Social', icon: PhUsersThree, component: SocialScreen, inHeader: true },
  {
    id: 'events',
    title: 'World events',
    label: 'Events',
    icon: PhGlobeHemisphereWest,
    component: WorldEventsScreen,
    inHeader: true,
  },
  // The More row reads Vendor; the drawer and sheet are titled Trade (UI-SPEC A6).
  {
    id: 'vendor',
    title: 'Trade',
    label: 'Vendor',
    icon: PhStorefront,
    component: VendorScreen,
    meta: VendorMeta,
    inHeader: false,
  },
];

export const HEADER_SCREENS: readonly ScreenDef[] = SCREENS.filter((screen) => screen.inHeader);

export function getScreen(id: ScreenId): ScreenDef {
  const screen = SCREENS.find((candidate) => candidate.id === id);
  if (!screen) throw new Error(`Unknown screen: ${id}`);
  return screen;
}
