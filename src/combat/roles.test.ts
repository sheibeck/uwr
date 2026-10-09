import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PhCrownSimple, PhFirstAidKit, PhMagicWand, PhShield, PhSkull, PhSword } from '@phosphor-icons/vue';
import { ROLE_ORDER } from '@game-data/family_rules';
import { roleView } from './roles';

// Role chips on enemy cards (51.3.1.1 UI-SPEC "Enemy card", D-40): the server role healer reads
// Support, and Named and Boss take precedence over the member role.

describe('roleView', () => {
  it('maps the four server roles to their words, icons and classes', () => {
    expect(roleView('tank')).toMatchObject({ key: 'tank', word: 'Tank', icon: PhShield, cls: 'role-tank' });
    expect(roleView('damage')).toMatchObject({ key: 'damage', word: 'Damage', icon: PhSword, cls: 'role-damage' });
    expect(roleView('caster')).toMatchObject({ key: 'caster', word: 'Caster', icon: PhMagicWand, cls: 'role-caster' });
    expect(roleView('healer')).toMatchObject({ key: 'support', word: 'Support', icon: PhFirstAidKit, cls: 'role-support' });
  });

  it('reads legacy and prompt role words through the shared normaliser', () => {
    expect(roleView('melee').word).toBe('Damage');
    expect(roleView('ranged').word).toBe('Damage');
    expect(roleView('dps').word).toBe('Damage');
    expect(roleView('support').word).toBe('Support');
    expect(roleView(' Healer ').word).toBe('Support');
    expect(roleView('').word).toBe('Damage');
    expect(roleView(undefined).word).toBe('Damage');
  });

  it('gives Named and Boss precedence, Boss over Named', () => {
    expect(roleView('healer', { named: true })).toMatchObject({ key: 'named', word: 'Named', icon: PhCrownSimple, cls: 'role-named' });
    expect(roleView('tank', { boss: true })).toMatchObject({ key: 'boss', word: 'Boss', icon: PhSkull, cls: 'role-boss' });
    expect(roleView('tank', { named: true, boss: true }).key).toBe('boss');
    expect(roleView('tank', { named: false, boss: false }).key).toBe('tank');
  });

  it('covers every server role in ROLE_ORDER', () => {
    for (const role of ROLE_ORDER) expect(roleView(role).word).not.toBe('');
  });

  it('returns stable frozen views', () => {
    expect(roleView('tank')).toBe(roleView('tank'));
    expect(Object.isFrozen(roleView('tank'))).toBe(true);
  });

  it('roles.ts uses normalizeEnemyRole and holds the only Support word', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/combat/roles.ts'), 'utf8');
    expect(source).toContain('normalizeEnemyRole');
    expect(source).toContain("'Support'");
  });
});
