import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import * as phosphor from '@phosphor-icons/vue';

// Design source guards for the party and social folder (51.1-09; UI-SPEC "Design System
// additions"). Every non-test .ts and .vue file under src/social is scanned, so files added by
// later plans (and by Phase 52.2) are covered without editing a list. Source text only; behaviour
// is covered by the component tests. The global style guards (src/styles) cover the CSS.
const SOCIAL_DIR = resolve(process.cwd(), 'src/social');
const BANNED_WORD = ['rip', 'ple'].join('');
const ALLOWED_SIZES = new Set(['10px', '12px', '14px', '20px']);

function productionFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(path));
    else if (/\.(ts|vue)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = productionFiles(SOCIAL_DIR);

function relativeName(file: string): string {
  return relative(SOCIAL_DIR, file).split(sep).join('/');
}

// Every Phosphor icon Phase 51.1 uses (UI-SPEC icon table), checked against @phosphor-icons/vue 2.2.1.
const PHASE_ICONS = [
  'PhFlagBanner',
  'PhPersonSimple',
  'PhPawPrint',
  'PhFootprints',
  'PhDotsThree',
  'PhUserMinus',
  'PhSignOut',
  'PhChatCircleDots',
  'PhChatCircle',
  'PhHeart',
  'PhCrosshairSimple',
  'PhXCircle',
  'PhHourglassMedium',
  'PhWarningCircle',
  'PhUsersThree',
  'PhCrownSimple',
  'PhUserPlus',
  'PhEye',
];

describe('src/social source guards', () => {
  it('finds the party helpers and components', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(12);
    const names = FILES.map((file) => relativeName(file));
    for (const expected of ['follow.ts', 'playerMenu.ts', 'PetRow.vue', 'PetTag.vue', 'TravelSwitch.vue']) {
      expect(names).toContain(expected);
    }
  });

  for (const file of FILES) {
    const name = relativeName(file);
    const source = readFileSync(file, 'utf8');

    it(`${name} avoids v-html, inline svg and literal colors`, () => {
      expect(source).not.toContain('v-html');
      expect(source).not.toContain('<svg');
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/);
    });

    it(`${name} avoids replaceAll, .at( and Object.hasOwn`, () => {
      expect(source).not.toContain('replaceAll');
      expect(source).not.toMatch(/\.at\(/);
      expect(source).not.toContain('Object.hasOwn');
    });

    it(`${name} avoids the banned World-events word`, () => {
      expect(source.toLowerCase()).not.toContain(BANNED_WORD);
    });

    it(`${name} uses only the type sizes 10, 12, 14 and 20 and weights 400 and 500`, () => {
      for (const match of source.matchAll(/font-size:\s*([0-9.]+px)/g)) {
        expect(ALLOWED_SIZES.has(match[1]), `${name} ${match[1]}`).toBe(true);
      }
      for (const match of source.matchAll(/font-weight:\s*(\d+)/g)) {
        expect(['400', '500']).toContain(match[1]);
      }
    });

    it(`${name} appends to the feed only with the shared send-error text`, () => {
      for (const line of source.split('\n')) {
        if (/\bappendLocal\(/.test(line)) expect(line, `${name}: ${line.trim()}`).toContain('SEND_ERROR_TEXT');
      }
    });

    it(`${name} imports only Phosphor icons that exist`, () => {
      const exported = phosphor as unknown as Record<string, unknown>;
      for (const match of source.matchAll(/\bPh[A-Z][A-Za-z0-9]*\b/g)) {
        expect(exported[match[0]], `${name}: ${match[0]}`).toBeDefined();
      }
    });
  }

  describe('Phosphor icons of the phase', () => {
    const exported = phosphor as unknown as Record<string, unknown>;
    for (const icon of PHASE_ICONS) {
      it(`${icon} is exported by @phosphor-icons/vue`, () => {
        expect(exported[icon]).toBeDefined();
      });
    }
  });
});

// Review client-social IN-06: an icon that carries a name (the leader crown) needs role="img", or
// several screen-reader and browser pairs ignore aria-label on an svg. Decorative icons are aria-hidden.
describe('labelled icons have role="img"', () => {
  const HOSTS = ['src/frame/VitalsRail.vue', 'src/frame/VitalsStrip.vue'].map((path) => resolve(process.cwd(), path));
  for (const file of [...FILES, ...HOSTS]) {
    const source = readFileSync(file, 'utf8');
    const name = relative(process.cwd(), file).split(sep).join('/');
    it(`${name}: every <Ph… aria-label> also has role="img"`, () => {
      for (const match of source.matchAll(/<Ph[A-Z][^>]*>/g)) {
        if (!/\saria-label=/.test(match[0])) continue;
        expect(match[0], name).toContain('role="img"');
      }
    });
  }
});

// Review client-social IN-08: radii come from the tokens (circles excepted), the disabled state is
// 45% opacity everywhere, the pet tag sets its own on-scale padding over the global .tag recipe
// (3px 10px), and the Party invite kicker is Micro 10 / 400.
describe('design contract details', () => {
  for (const file of FILES.filter((path) => path.endsWith('.vue'))) {
    const source = readFileSync(file, 'utf8');
    const name = relativeName(file);
    it(`${name}: radii are tokens or 50%, opacities of disabled states are 0.45`, () => {
      for (const match of source.matchAll(/border-radius:\s*([^;]+);/g)) {
        for (const part of match[1].trim().split(/\s+/)) {
          expect(part, `${name}: ${match[0]}`).toMatch(/^(var\(--radius-(sm|md|lg)\)|50%|0)$/);
        }
      }
      for (const match of source.matchAll(/opacity:\s*([^;]+);/g)) {
        expect(match[1].trim(), name).toBe('0.45');
      }
    });
  }

  it('PetTag pads 0 8px and the invite kicker is weight 400', () => {
    const tag = readFileSync(join(SOCIAL_DIR, 'PetTag.vue'), 'utf8');
    expect(tag).toMatch(/\.pet-tag \{[^}]*padding: 0 8px;/);
    const card = readFileSync(join(SOCIAL_DIR, 'InviteCard.vue'), 'utf8');
    expect(card).toMatch(/\.kicker-label \{[^}]*font-weight: 400;/);
  });
});
