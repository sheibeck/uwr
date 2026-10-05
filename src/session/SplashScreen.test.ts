// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import SplashScreen from './SplashScreen.vue';
import type { SplashState } from './deriveScreen';
import { parseDecls, sfcStyleBlocks } from '../styles/cssContract';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountSplash(state: SplashState) {
  wrapper = mount(SplashScreen, { props: { state } });
  return wrapper;
}

const SOURCE_PATH = resolve(process.cwd(), 'src/session/SplashScreen.vue');
const LOGO_PATH = resolve(process.cwd(), 'public/assets/logo.png');

interface Row {
  state: SplashState;
  button: 'enabled' | 'disabled' | 'hidden';
  status: string | null;
  error: string | null;
}

const ROWS: Row[] = [
  { state: 'idle', button: 'enabled', status: null, error: null },
  { state: 'redirecting', button: 'disabled', status: 'Redirecting to SpacetimeAuth…', error: null },
  { state: 'connecting', button: 'hidden', status: 'Connecting…', error: null },
  { state: 'signingIn', button: 'hidden', status: 'Signing in…', error: null },
  { state: 'sessionExpired', button: 'enabled', status: null, error: 'Your session expired. Sign in again.' },
  { state: 'signInFailed', button: 'enabled', status: null, error: 'Sign-in failed. Try again.' },
  { state: 'unreachable', button: 'enabled', status: "Can't reach the server. Retrying…", error: null },
];

describe('SplashScreen logo', () => {
  it('renders the key art with intrinsic size, alt and a BASE_URL-relative src', () => {
    const img = mountSplash('idle').find('img');
    expect(img.attributes('alt')).toBe('Unwritten Realms');
    expect(img.attributes('width')).toBe('1672');
    expect(img.attributes('height')).toBe('941');
    expect(img.classes()).toContain('lighten');
    expect(img.classes()).toContain('splash-logo');
    const src = img.attributes('src') ?? '';
    expect(src.endsWith('assets/logo.png')).toBe(true);
    expect(src.startsWith(import.meta.env.BASE_URL)).toBe(true);
  });

  it('pins the 16:9 sizing rule and never touches image smoothing', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const decls = sfcStyleBlocks(source).flatMap((block) => parseDecls(block, 'SplashScreen.vue'));
    const rule = Object.fromEntries(
      decls.filter((d) => d.selector === '.splash-logo').map((d) => [d.prop, d.value]),
    );
    expect(rule['width']).toBe('min(960px, 100%)');
    expect(rule['max-height']).toBe('calc(100dvh - 176px)');
    expect(rule['aspect-ratio']).toBe('16 / 9');
    expect(rule['object-fit']).toBe('contain');
    expect(rule['height']).toBe('auto');
    expect(rule['flex-shrink']).toBe('0');
    expect(source).not.toMatch(/image-rendering/);
  });

  it('ships a 1672x941 PNG', () => {
    const bytes = readFileSync(LOGO_PATH);
    expect(bytes.readUInt32BE(16)).toBe(1672);
    expect(bytes.readUInt32BE(20)).toBe(941);
  });
});

describe('SplashScreen states', () => {
  for (const row of ROWS) {
    it(`renders ${row.state} per the state table`, () => {
      const w = mountSplash(row.state);
      const button = w.find('button.sign-in');
      if (row.button === 'hidden') {
        expect(button.exists()).toBe(false);
      } else {
        expect(button.exists()).toBe(true);
        expect(button.text()).toContain('Sign in');
        expect(button.attributes('disabled') !== undefined).toBe(row.button === 'disabled');
      }

      const status = w.find('[aria-live="polite"]');
      expect(status.exists()).toBe(true);
      if (row.status === null) {
        expect(status.text()).toBe('');
        expect(status.find('svg.spin').exists()).toBe(false);
      } else {
        expect(status.text()).toBe(row.status);
        expect(status.find('svg.spin').exists()).toBe(true);
      }

      const error = w.find('[role="alert"]');
      if (row.error === null) {
        expect(error.exists()).toBe(false);
      } else {
        expect(error.text()).toBe(row.error);
      }
    });
  }
});

describe('SplashScreen sign-in', () => {
  it('emits sign-in on click', async () => {
    const w = mountSplash('idle');
    await w.find('button.sign-in').trigger('click');
    expect(w.emitted('sign-in')).toHaveLength(1);
  });

  const enterStates: Array<[SplashState, number]> = [
    ['idle', 1],
    ['sessionExpired', 1],
    ['signInFailed', 1],
    ['unreachable', 1],
    ['redirecting', 0],
    ['connecting', 0],
    ['signingIn', 0],
  ];
  for (const [state, count] of enterStates) {
    it(`Enter on the window emits ${count} sign-in in ${state}`, () => {
      const w = mountSplash(state);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(w.emitted('sign-in')?.length ?? 0).toBe(count);
    });
  }

  it('ignores other keys and stops listening after unmount', () => {
    const w = mountSplash('idle');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(w.emitted('sign-in')).toBeUndefined();
    w.unmount();
    wrapper = null;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(w.emitted('sign-in')).toBeUndefined();
  });
});
