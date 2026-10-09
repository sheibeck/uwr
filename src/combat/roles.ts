// Role chips on enemy cards and strip chips (51.3.1.1 UI-SPEC "Enemy card", D-40, D-45).
//
// The server writes four member roles (tank, damage, healer, caster); world text may still carry
// older words (melee, ranged, dps, support), so every role goes through the shared normaliser first.
// The server role `healer` displays as `Support`: that display word lives here and nowhere else.
// Named and Boss take precedence over the member role for an individual enemy (Boss first).
import type { Component } from 'vue';
import { PhCrownSimple, PhFirstAidKit, PhMagicWand, PhShield, PhSkull, PhSword } from '@phosphor-icons/vue';
import { normalizeEnemyRole } from '@game-data/family_rules';

export type RoleKey = 'tank' | 'damage' | 'caster' | 'support' | 'named' | 'boss';

export interface RoleView {
  readonly key: RoleKey;
  /** The chip word (PROPOSED copy, D-58). */
  readonly word: string;
  /** Phosphor 2.2.1 icon; an indicator, never an action. */
  readonly icon: Component;
  /** Scoped colour class: role-tank, role-damage, role-caster, role-support, role-named, role-boss. */
  readonly cls: string;
}

function view(key: RoleKey, word: string, icon: Component): RoleView {
  return Object.freeze({ key, word, icon, cls: `role-${key}` });
}

const ROLE_VIEWS: Readonly<Record<RoleKey, RoleView>> = Object.freeze({
  tank: view('tank', 'Tank', PhShield),
  damage: view('damage', 'Damage', PhSword),
  caster: view('caster', 'Caster', PhMagicWand),
  support: view('support', 'Support', PhFirstAidKit),
  named: view('named', 'Named', PhCrownSimple),
  boss: view('boss', 'Boss', PhSkull),
});

export interface RoleFlags {
  named?: boolean;
  boss?: boolean;
}

/** The chip view for a server (or legacy) role word; Boss, then Named, win over the member role. */
export function roleView(role: string | null | undefined, flags: RoleFlags = {}): RoleView {
  if (flags.boss === true) return ROLE_VIEWS.boss;
  if (flags.named === true) return ROLE_VIEWS.named;
  const server = normalizeEnemyRole(role);
  return ROLE_VIEWS[server === 'healer' ? 'support' : server];
}
