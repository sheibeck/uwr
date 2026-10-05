// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import NoticeBars from './NoticeBars.vue';

const NOW = new Date('2026-01-01T00:00:00Z').getTime();
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

function mountBars(props: { reconnecting: boolean; nextRetryAt: number | null; versionPrompt: boolean }) {
  wrapper = mount(NoticeBars, { props });
  return wrapper;
}

describe('NoticeBars', () => {
  it('renders no bars when nothing is active', () => {
    const w = mountBars({ reconnecting: false, nextRetryAt: null, versionPrompt: false });
    expect(w.findAll('.notice-bar')).toHaveLength(0);
    expect(w.find('[role="status"]').exists()).toBe(false);
  });

  it('shows the Reconnecting bar with spinner and countdown', async () => {
    const w = mountBars({ reconnecting: true, nextRetryAt: NOW + 5000, versionPrompt: false });
    const bar = w.find('[role="status"]');
    expect(bar.attributes('aria-live')).toBe('polite');
    expect(bar.find('svg.spin').exists()).toBe(true);
    expect(bar.text()).toContain('Reconnecting…');
    expect(bar.text()).toContain('Next try in 5s');
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.find('[role="status"]').text()).toContain('Next try in 3s');
  });

  it('never counts below 0s', async () => {
    const w = mountBars({ reconnecting: true, nextRetryAt: NOW + 1000, versionPrompt: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(w.find('[role="status"]').text()).toContain('Next try in 0s');
  });

  it('omits the countdown when nextRetryAt is null', () => {
    const w = mountBars({ reconnecting: true, nextRetryAt: null, versionPrompt: false });
    const text = w.find('[role="status"]').text();
    expect(text).toContain('Reconnecting…');
    expect(text).not.toContain('Next try in');
  });

  it('shows the version bar and emits reload', async () => {
    const w = mountBars({ reconnecting: false, nextRetryAt: null, versionPrompt: true });
    expect(w.text()).toContain('A new version is ready.');
    const btn = w.find('button');
    expect(btn.text()).toBe('Reload');
    expect(btn.classes()).toContain('btn');
    expect(btn.classes()).toContain('btn-primary');
    await btn.trigger('click');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('lists Reconnecting before the version bar', () => {
    const w = mountBars({ reconnecting: true, nextRetryAt: NOW + 5000, versionPrompt: true });
    const bars = w.findAll('.notice-bar');
    expect(bars).toHaveLength(2);
    expect(bars[0].text()).toContain('Reconnecting…');
    expect(bars[1].text()).toContain('A new version is ready.');
  });

  it('clears the interval when reconnecting turns false and on unmount', async () => {
    const w = mountBars({ reconnecting: true, nextRetryAt: NOW + 5000, versionPrompt: false });
    expect(vi.getTimerCount()).toBe(1);
    await w.setProps({ reconnecting: false });
    expect(vi.getTimerCount()).toBe(0);
    await w.setProps({ reconnecting: true });
    expect(vi.getTimerCount()).toBe(1);
    w.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('declares the 32px bar and live region in source', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/frame/NoticeBars.vue'), 'utf8');
    expect(src).toContain('height: 32px');
    expect(src).toContain('role="status"');
    expect(src).toContain('Next try in');
  });
});
