/**
 * Phase 51.3.1.1 Plan 05 (D-53, threat T-51.3.1.1-14): the source pin of every write of
 * combat_enemy.currentHp in the server source.
 *
 * An enemy damage_shield must absorb every player damage path. Every `combat_enemy.id.update(...)`
 * whose argument sets `currentHp` is therefore either
 *   - PROTECTED: an `absorbEnemyShield(` call comes before it in the same function (the nearest
 *     definition at indent 0 or 2 above it: `function x(`, `const x = (`, `spacetimedb.reducer(`,
 *     `scheduledReducers[...]`), or
 *   - ALLOWED: on the list below with a reason (enemy heals, the DoT tick, known gaps).
 * A new damage path fails here until it calls absorbEnemyShield or is listed with a reason. Each
 * allow-list entry must match exactly one write, so the list cannot go stale silently.
 */
import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';

const SRC_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..'); // spacetimedb/src

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir) as string[]) {
    if (name === 'node_modules' || name === '__fixtures__') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(SRC_ROOT, path).split(sep).join('/');

type Site = { file: string; line: number; text: string; arg: string; protectedByAbsorb: boolean };

/** A definition at indent 0 or 2: the scope a write belongs to. */
const DEFINITION =
  /^(export )?(async )?function \w+|^(export )?const \w+ = |^  (const \w+ = (async )?\(|scheduledReducers\[|spacetimedb\.reducer\()/;

/** The argument text of the call whose `(` is at `open` (balanced parentheses). */
function callArgument(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

function sitesIn(path: string): Site[] {
  const src = (readFileSync(path, 'utf-8') as string).replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const out: Site[] = [];
  const needle = 'combat_enemy.id.update(';
  for (let at = src.indexOf(needle); at >= 0; at = src.indexOf(needle, at + needle.length)) {
    const arg = callArgument(src, at + needle.length - 1);
    if (!/\bcurrentHp\b/.test(arg)) continue;
    const lineIndex = src.slice(0, at).split('\n').length - 1;
    let start = lineIndex;
    while (start > 0 && !DEFINITION.test(lines[start])) start--;
    const scope = lines.slice(start, lineIndex).join('\n');
    out.push({
      file: rel(path),
      line: lineIndex + 1,
      text: lines[lineIndex].trim(),
      arg,
      protectedByAbsorb: scope.includes('absorbEnemyShield('),
    });
  }
  return out;
}

const SITES: Site[] = walk(SRC_ROOT).flatMap(sitesIn);

/** Writes of combat_enemy.currentHp that may skip absorbEnemyShield, each with its reason. */
const ALLOWED: { file: string; contains: string; reason: string }[] = [
  {
    file: 'helpers/combat.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...current, currentHp: nextHp });',
    reason: 'enemy heal (D-53): raises an ally enemy\'s HP, not damage',
  },
  {
    file: 'helpers/combat.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...caster, currentHp: nextHp });',
    reason: 'enemy drain (D-53): heals the casting enemy, not damage',
  },
  {
    file: 'reducers/combat.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...enemy, currentHp: nextHp });',
    reason: 'the DoT tick on an enemy bypasses its shield (RESEARCH Section 2: DoT may bypass)',
  },
  {
    file: 'helpers/combat_perks.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });\n        totalBonusDamage += bonusDmg;\n        appendPrivateEvent(\n          ctx,\n          character.id,\n          character.ownerUserId,\n          \'damage\',\n          `Your ${perkName} triggered! Bonus strike',
    reason: 'KNOWN GAP: perk proc bonus strike bypasses enemy shields (combat_perks.ts is outside Plan 05\'s files; follow-up)',
  },
  {
    file: 'helpers/combat_perks.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });\n      totalBonusDamage += bonusDmg;\n      appendPrivateEvent(\n        ctx,\n        character.id,\n        character.ownerUserId,\n        \'damage\',\n        `Your ${perkName} triggered! Bonus damage',
    reason: 'KNOWN GAP: perk proc flat bonus damage bypasses enemy shields (combat_perks.ts is outside Plan 05\'s files; follow-up)',
  },
  {
    file: 'helpers/combat_perks.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...otherEnemy, currentHp: newHp });',
    reason: 'KNOWN GAP: on-kill AoE perk bypasses enemy shields (combat_perks.ts is outside Plan 05\'s files; follow-up)',
  },
  {
    file: 'helpers/combat_perks.ts',
    contains: 'ctx.db.combat_enemy.id.update({ ...enemy, currentHp: newHp });\n    const enemyTemplate',
    reason: 'KNOWN GAP: an active perk strike (damagePercent) bypasses enemy shields (combat_perks.ts is outside Plan 05\'s files; follow-up)',
  },
];

/** The text from the site's line to the end of its file, to match multi-line allow-list entries. */
function textFrom(site: Site): string {
  const src = (readFileSync(join(SRC_ROOT, site.file), 'utf-8') as string).replace(/\r\n/g, '\n');
  return src.split('\n').slice(site.line - 1).join('\n').trimStart();
}

const allowedEntryFor = (site: Site) =>
  ALLOWED.find((entry) => entry.file === site.file && textFrom(site).startsWith(entry.contains));

describe('every write of combat_enemy.currentHp passes an enemy shield or is listed (D-53, T-51.3.1.1-14)', () => {
  it('finds the writes it guards (the scan is not empty)', () => {
    expect(SITES.length).toBeGreaterThanOrEqual(8);
    expect(SITES.some((s) => s.file === 'reducers/combat.ts')).toBe(true);
    expect(SITES.some((s) => s.file === 'helpers/combat.ts')).toBe(true);
  });

  it('every write is protected by absorbEnemyShield or on the allow list', () => {
    const unguarded = SITES.filter((s) => !s.protectedByAbsorb && !allowedEntryFor(s)).map(
      (s) => `${s.file}:${s.line} ${s.text}`,
    );
    expect(unguarded).toEqual([]);
  });

  it('each allow-list entry matches exactly one write', () => {
    const counts = ALLOWED.map((entry) => ({
      entry: `${entry.file}: ${entry.contains.split('\n')[0]}`,
      matches: SITES.filter((s) => s.file === entry.file && textFrom(s).startsWith(entry.contains)).length,
    }));
    expect(counts.filter((c) => c.matches !== 1)).toEqual([]);
  });

  it('every allow-list entry carries a reason', () => {
    for (const entry of ALLOWED) expect(entry.reason.length).toBeGreaterThan(10);
  });

  it.each([
    ['reducers/combat.ts', '{ ...targetEnemy, currentHp: nextHp }', 'player auto-attack'],
    ['reducers/combat.ts', '{ ...current, currentHp: updatedHp }', 'pet auto-attack'],
    ['reducers/combat.ts', '{ ...en, currentHp: nextHp }', 'bard Discordant Note'],
    ['helpers/combat.ts', '{ ...enemy, currentHp: nextHp }', 'player and pet abilities (applyDamageToEnemy)'],
  ])('%s: the %s write (%s) is protected, not allow-listed', (file, fragment) => {
    const site = SITES.find((s) => s.file === file && s.text.includes(fragment) && !allowedEntryFor(s));
    expect(site, `${file} ${fragment}`).toBeDefined();
    expect(site!.protectedByAbsorb).toBe(true);
  });
});
