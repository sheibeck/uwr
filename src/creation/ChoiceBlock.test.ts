// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import ChoiceBlock from './ChoiceBlock.vue';
import { NO_RACES_LINE } from './raceCards';
import type { RaceCard } from './raceCards';
import type { AbilityCard } from './abilityCards';
import { ARCHETYPE_CHOICES } from './creationControls';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function raceCard(id: bigint, name: string, tags: string[] = ['+2 DEX', '+1 WIS'], description = `About ${name}.`): RaceCard {
  return {
    id,
    name,
    description,
    tags,
    ariaLabel: `${name}, ${tags.join(', ')}. Choose this race.`,
    sends: name,
  };
}

function abilityCard(key: string, name: string, kind = 'damage'): AbilityCard {
  return {
    key,
    name,
    description: `${name} hits hard.`,
    kind,
    tags: [kind, '12 stamina', '6s cooldown'],
    ariaLabel: `${name}. Start with this ability.`,
    sends: name,
  };
}

const THREE = [raceCard(3n, 'Saltkin'), raceCard(2n, 'Emberfolk', ['+2 STR']), raceCard(1n, 'Mossborn', [])];

function mountBlock(props: Record<string, unknown>) {
  wrapper = mount(ChoiceBlock, {
    props: { kind: 'race', inert: false, desktop: true, ...props } as never,
  });
  return wrapper;
}

describe('ChoiceBlock: race cards', () => {
  it('renders a group "Race suggestions" with a labelled button per card showing name, description and tags', () => {
    const w = mountBlock({ raceCards: THREE });
    const group = w.find('[role="group"]');
    expect(group.attributes('aria-label')).toBe('Race suggestions');
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].attributes('aria-label')).toBe('Saltkin, +2 DEX, +1 WIS. Choose this race.');
    expect(buttons[0].text()).toContain('Saltkin');
    expect(buttons[0].text()).toContain('About Saltkin.');
    const tags = buttons[0].findAll('.tag');
    expect(tags.map((t) => t.text())).toEqual(['+2 DEX', '+1 WIS']);
    expect(buttons[2].findAll('.tag')).toHaveLength(0);
  });

  it('emits choose with the race name on click', async () => {
    const w = mountBlock({ raceCards: THREE });
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('choose')).toEqual([['Emberfolk']]);
  });

  it('is inert while sending: aria-disabled true, still focusable, no emit', async () => {
    const w = mountBlock({ raceCards: THREE, inert: true });
    const buttons = w.findAll('button');
    for (const button of buttons) {
      expect(button.attributes('aria-disabled')).toBe('true');
      expect(button.attributes('disabled')).toBeUndefined();
    }
    await buttons[0].trigger('click');
    expect(w.emitted('choose')).toBeUndefined();
  });

  it('is not aria-disabled when it is not inert', () => {
    const w = mountBlock({ raceCards: THREE });
    expect(w.find('button').attributes('aria-disabled')).toBeUndefined();
  });

  it('renders nothing while the race cards are not applied (null)', () => {
    const w = mountBlock({ raceCards: null });
    expect(w.find('div').exists()).toBe(false);
    expect(w.text()).toBe('');
  });

  it('renders nothing when the race cards prop is missing', () => {
    const w = mountBlock({});
    expect(w.text()).toBe('');
  });

  it('renders only the no-races line for an empty list', () => {
    const w = mountBlock({ raceCards: [] });
    expect(w.text()).toBe('No races have been written yet. Describe one, or choose Surprise me.');
    expect(w.text()).toBe(NO_RACES_LINE);
    expect(w.findAll('button')).toHaveLength(0);
  });

  it('renders only the cards it was given when there are fewer than three', () => {
    const w = mountBlock({ raceCards: [THREE[0]] });
    expect(w.findAll('button')).toHaveLength(1);
  });
});

describe('ChoiceBlock: archetype cards', () => {
  it('renders a group "Archetype" with Warrior and Mystic, icons and descriptions', async () => {
    const w = mountBlock({ kind: 'archetype' });
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Archetype');
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('aria-label')).toBe('Warrior. Choose this archetype.');
    expect(buttons[1].attributes('aria-label')).toBe('Mystic. Choose this archetype.');
    expect(buttons[0].text()).toContain(ARCHETYPE_CHOICES[0].description);
    expect(buttons[1].text()).toContain(ARCHETYPE_CHOICES[1].description);
    expect(buttons[0].find('.icon-sword').exists()).toBe(true);
    expect(buttons[1].find('.icon-wand').exists()).toBe(true);
    expect(buttons[0].findAll('.tag')).toHaveLength(0);
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(w.emitted('choose')).toEqual([['Warrior'], ['Mystic']]);
  });

  it('is inert while sending', async () => {
    const w = mountBlock({ kind: 'archetype', inert: true });
    await w.findAll('button')[0].trigger('click');
    expect(w.emitted('choose')).toBeUndefined();
    expect(w.findAll('button')[0].attributes('aria-disabled')).toBe('true');
  });
});

describe('ChoiceBlock: ability cards', () => {
  it('renders a group "Starting ability" with the kind icon, name, description and tags; click emits the name', async () => {
    const w = mountBlock({
      kind: 'ability',
      abilityCards: [abilityCard('0', 'Cleave'), abilityCard('1', 'Mend', 'heal')],
    });
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Starting ability');
    const buttons = w.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('aria-label')).toBe('Cleave. Start with this ability.');
    expect(buttons[0].text()).toContain('Cleave hits hard.');
    expect(buttons[0].find('.ability-icon').exists()).toBe(true);
    expect(buttons[0].findAll('.tag').map((t) => t.text())).toEqual(['damage', '12 stamina', '6s cooldown']);
    await buttons[1].trigger('click');
    expect(w.emitted('choose')).toEqual([['Mend']]);
  });

  it('renders nothing for an empty or missing ability list', () => {
    expect(mountBlock({ kind: 'ability', abilityCards: [] }).text()).toBe('');
    wrapper?.unmount();
    wrapper = null;
    const w = mountBlock({ kind: 'ability' });
    expect(w.find('div').exists()).toBe(false);
  });
});

describe('ChoiceBlock: layout and text', () => {
  it('uses the multi-column grid on desktop and the single column on mobile', () => {
    const desktop = mountBlock({ raceCards: THREE, desktop: true });
    expect(desktop.find('[role="group"]').classes()).toContain('grid-multi');
    expect(desktop.find('[role="group"]').classes()).not.toContain('grid-single');
    desktop.unmount();
    wrapper = null;
    const mobile = mountBlock({ raceCards: THREE, desktop: false });
    expect(mobile.find('[role="group"]').classes()).toContain('grid-single');
    expect(mobile.find('[role="group"]').classes()).not.toContain('grid-multi');
  });

  it('puts the tags on the name row on mobile and under the description on desktop', () => {
    const desktop = mountBlock({ raceCards: [THREE[0]], desktop: true });
    expect(desktop.find('.name-row .tag').exists()).toBe(false);
    expect(desktop.find('.tags').exists()).toBe(true);
    desktop.unmount();
    wrapper = null;
    const mobile = mountBlock({ raceCards: [THREE[0]], desktop: false });
    expect(mobile.find('.name-row .tag').exists()).toBe(true);
  });

  it('renders an img-onerror race name, description and ability name as text, never an element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const race = mountBlock({ raceCards: [raceCard(1n, evil, ['+2 DEX'], evil)] });
    expect(race.text()).toContain(evil);
    expect(race.element.querySelector('img')).toBeNull();
    race.unmount();
    wrapper = null;
    const ability = mountBlock({ kind: 'ability', abilityCards: [abilityCard('0', evil)] });
    expect(ability.text()).toContain(evil);
    expect(ability.element.querySelector('img')).toBeNull();
  });
});
