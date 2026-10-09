// The closed icon-key maps of the Nearby cards (51.3.1.1 UI-SPEC "Phosphor icons used by Phase
// 51.3.1.1"). The server sends a key from FAMILY_ICON_KEYS / RESOURCE_ICON_KEYS (mechanical
// vocabulary); the client maps it to a Phosphor 2.2.1 component. An unknown key falls back to
// PhSkull (families, today's enemy icon) or PhCube (resources, today's node icon). The lookup
// reads own keys only, so a key such as 'constructor' is unknown too.
import type { Component } from 'vue';
import {
  PhBird,
  PhBone,
  PhBug,
  PhCube,
  PhDiamond,
  PhDrop,
  PhFish,
  PhFlame,
  PhLeaf,
  PhMaskSad,
  PhPawPrint,
  PhPlant,
  PhSkull,
  PhSparkle,
  PhTree,
} from '@phosphor-icons/vue';
import type { FamilyIconKey, ResourceIconKey } from '@game-data/mechanical_vocabulary';

export const FAMILY_ICONS: Readonly<Record<FamilyIconKey, Component>> = {
  humanoid: PhMaskSad,
  beast: PhPawPrint,
  insect: PhBug,
  spirit: PhSparkle,
  undead: PhBone,
  avian: PhBird,
  aquatic: PhFish,
  elemental: PhFlame,
};

export const RESOURCE_ICONS: Readonly<Record<ResourceIconKey, Component>> = {
  mineral: PhCube,
  herb: PhPlant,
  gem: PhDiamond,
  wood: PhTree,
  fibre: PhLeaf,
  fluid: PhDrop,
};

function lookup<K extends string>(map: Readonly<Record<K, Component>>, key: string, fallback: Component): Component {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key as K] : fallback;
}

/** The family card icon for a server icon key; PhSkull for an unknown key. */
export function familyIcon(key: string): Component {
  return lookup(FAMILY_ICONS, key, PhSkull);
}

/** The resource card icon for a server icon key; PhCube for an unknown key. */
export function resourceIcon(key: string): Component {
  return lookup(RESOURCE_ICONS, key, PhCube);
}
