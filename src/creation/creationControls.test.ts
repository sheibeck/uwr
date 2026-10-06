import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_CHOICES,
  NAME_HINT,
  START_OVER_CONFIRMATION,
  SURPRISE_ME_TEXT,
  controlsFor,
} from './creationControls';
import type { DecisionButton } from './creationControls';
import { KNOWN_CREATION_STEPS } from './creationSteps';

interface Input {
  step: string | null;
  known: boolean;
  regionFailed: boolean;
  startFailed: boolean;
  connected: boolean;
  endedWithoutCharacter?: boolean;
}

const base: Input = { step: null, known: true, regionFailed: false, startFailed: false, connected: true };

const controls = (overrides: Partial<Input>) => controlsFor({ ...base, ...overrides });

const summary = (buttons: DecisionButton[]) =>
  buttons.map(b => [b.label, b.variant, b.action.type === 'send' ? b.action.text : b.action.type]);

describe('controlsFor: no state row', () => {
  it('shows Starting and locks the input', () => {
    const c = controls({ step: null });
    expect(c.quick).toBeNull();
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('Starting…');
    expect(c.locked).toBe(true);
    expect(c.disabled).toBe(false);
    expect(c.choice).toBeNull();
    expect(c.nameHint).toBeNull();
  });

  it('offers one Retry that starts the interview again when the start failed', () => {
    const c = controls({ step: null, startFailed: true });
    expect(c.decisions).toHaveLength(1);
    expect(c.decisions[0].label).toBe('Retry');
    expect(c.decisions[0].variant).toBe('primary');
    expect(c.decisions[0].icon).toBe('retry');
    expect(c.decisions[0].action).toEqual({ type: 'start' });
    expect(c.locked).toBe(true);
  });

  it('does not offer the start Retry once a state row exists', () => {
    expect(controls({ step: 'AWAITING_RACE', startFailed: true }).decisions).toEqual([]);
  });
});

describe('controlsFor: per step', () => {
  it('AWAITING_RACE offers Surprise me, the race cards and a free text input', () => {
    const c = controls({ step: 'AWAITING_RACE' });
    expect(c.quick).toEqual({ label: 'Surprise me', sends: 'Surprise me.' });
    expect(SURPRISE_ME_TEXT).toBe('Surprise me.');
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('Describe a race, or choose one…');
    expect(c.mobilePlaceholder).toBe('Describe, choose, or tap…');
    expect(c.locked).toBe(false);
    expect(c.choice).toBe('race');
  });

  it.each(['GENERATING_RACE', 'GENERATING_CLASS', 'CLASS_FILLING'])('%s offers nothing and locks', step => {
    const c = controls({ step });
    expect(c.quick).toBeNull();
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('The Keeper is working…');
    expect(c.mobilePlaceholder).toBe('The Keeper is working…');
    expect(c.locked).toBe(true);
    expect(c.choice).toBeNull();
  });

  it('an unknown value offers nothing and locks', () => {
    const c = controls({ step: 'SOMETHING_NEW', known: false });
    expect(c.quick).toBeNull();
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('The Keeper is working…');
    expect(c.locked).toBe(true);
    expect(c.choice).toBeNull();
  });

  it('known false wins even when the step text looks known', () => {
    const c = controls({ step: 'AWAITING_RACE', known: false });
    expect(c.quick).toBeNull();
    expect(c.locked).toBe(true);
    expect(c.choice).toBeNull();
  });

  it('AWAITING_ARCHETYPE offers Go back a step and the archetype cards', () => {
    const c = controls({ step: 'AWAITING_ARCHETYPE' });
    expect(c.quick).toBeNull();
    expect(summary(c.decisions)).toEqual([['Go back a step', 'ghost', 'go back']]);
    expect(c.decisions[0].icon).toBe('back');
    expect(c.placeholder).toBe('Warrior or Mystic…');
    expect(c.locked).toBe(false);
    expect(c.choice).toBe('archetype');
  });

  it('CLASS_FILL_ERROR offers Retry class details then Go back a step', () => {
    const c = controls({ step: 'CLASS_FILL_ERROR' });
    expect(summary(c.decisions)).toEqual([
      ['Retry class details', 'primary', 'retry'],
      ['Go back a step', 'ghost', 'go back'],
    ]);
    expect(c.decisions[0].icon).toBe('retry');
    expect(c.placeholder).toBe('Say anything to try again…');
    expect(c.locked).toBe(false);
    expect(c.choice).toBeNull();
  });

  it('CLASS_REVEALED offers Go back a step and the ability cards', () => {
    const c = controls({ step: 'CLASS_REVEALED' });
    expect(summary(c.decisions)).toEqual([['Go back a step', 'ghost', 'go back']]);
    expect(c.placeholder).toBe('Name an ability…');
    expect(c.choice).toBe('ability');
    expect(c.locked).toBe(false);
  });

  it('AWAITING_NAME has no decisions, a name placeholder and the hint', () => {
    const c = controls({ step: 'AWAITING_NAME' });
    expect(c.decisions).toEqual([]);
    expect(c.quick).toBeNull();
    expect(c.placeholder).toBe('Choose a name…');
    expect(c.nameHint).toBe('3 to 20 letters. One word.');
    expect(NAME_HINT).toBe('3 to 20 letters. One word.');
    expect(c.choice).toBeNull();
    expect(c.locked).toBe(false);
  });

  it('only AWAITING_NAME carries the name hint', () => {
    for (const step of KNOWN_CREATION_STEPS) {
      if (step === 'AWAITING_NAME') continue;
      expect(controls({ step }).nameHint).toBeNull();
    }
  });

  it('CONFIRMING offers Enter the realm and Start over', () => {
    const c = controls({ step: 'CONFIRMING' });
    expect(summary(c.decisions)).toEqual([
      ['Enter the realm', 'primary', 'Confirm'],
      ['Start over', 'secondary', 'askStartOver'],
    ]);
    expect(c.placeholder).toBe('Confirm or start over…');
    expect(c.locked).toBe(false);
    expect(c.choice).toBeNull();
    // Start over sends nothing by itself.
    expect(c.decisions[1].action).toEqual({ type: 'askStartOver' });
    expect(c.decisions[1].danger).toBe(false);
  });

  it('CONFIRMING_GO_BACK offers Yes, go back and Keep my choices', () => {
    const c = controls({ step: 'CONFIRMING_GO_BACK' });
    expect(summary(c.decisions)).toEqual([
      ['Yes, go back', 'secondary', 'yes'],
      ['Keep my choices', 'primary', 'no'],
    ]);
    expect(c.placeholder).toBe('Yes, or anything else to continue…');
    expect(c.locked).toBe(false);
    expect(c.choice).toBeNull();
  });

  it('COMPLETE with the region forming offers nothing and locks', () => {
    const c = controls({ step: 'COMPLETE', regionFailed: false });
    expect(c.quick).toBeNull();
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('Entering the realm…');
    expect(c.locked).toBe(true);
    expect(c.choice).toBeNull();
  });

  it('COMPLETE with a failed region offers Retry finding a region and still locks the input', () => {
    const c = controls({ step: 'COMPLETE', regionFailed: true });
    expect(summary(c.decisions)).toEqual([['Retry finding a region', 'primary', 'explore']]);
    expect(c.decisions[0].icon).toBe('retry');
    expect(c.placeholder).toBe('Entering the realm…');
    expect(c.locked).toBe(true);
    expect(c.disabled).toBe(false);
  });
});

describe('controlsFor: COMPLETE with no character (IN-05)', () => {
  it('offers nothing, locks the input and does not say Entering the realm', () => {
    const c = controls({ step: 'COMPLETE', regionFailed: false, endedWithoutCharacter: true });
    expect(c.decisions).toEqual([]);
    expect(c.placeholder).toBe('No character to enter…');
    expect(c.mobilePlaceholder).toBe('No character to enter…');
    expect(c.locked).toBe(true);
    expect(c.choice).toBeNull();
  });

  it('is ignored at every other step', () => {
    expect(controls({ step: 'AWAITING_RACE', endedWithoutCharacter: true }).locked).toBe(false);
  });
});

describe('controlsFor: offline', () => {
  it.each([null, ...KNOWN_CREATION_STEPS])('%s keeps its buttons but disables everything', step => {
    const online = controls({ step, regionFailed: true });
    const offline = controls({ step, regionFailed: true, connected: false });
    expect(offline.disabled).toBe(true);
    expect(offline.locked).toBe(true);
    expect(offline.placeholder).toBe('Reconnecting…');
    expect(offline.mobilePlaceholder).toBe('Reconnecting…');
    expect(offline.decisions).toEqual(online.decisions);
    expect(offline.quick).toEqual(online.quick);
    expect(offline.choice).toBe(online.choice);
    expect(offline.nameHint).toBe(online.nameHint);
  });

  it('an unknown step offline also reads Reconnecting', () => {
    const c = controls({ step: 'SOMETHING_NEW', known: false, connected: false });
    expect(c.disabled).toBe(true);
    expect(c.placeholder).toBe('Reconnecting…');
  });

  it('is enabled online at every known step', () => {
    for (const step of KNOWN_CREATION_STEPS) {
      expect(controls({ step }).disabled).toBe(false);
    }
  });
});

describe('Go back placement', () => {
  it('appears at exactly AWAITING_ARCHETYPE, CLASS_REVEALED and CLASS_FILL_ERROR', () => {
    const withGoBack = KNOWN_CREATION_STEPS.filter(step =>
      [true, false].some(regionFailed =>
        controls({ step, regionFailed }).decisions.some(d => d.action.type === 'send' && d.action.text === 'go back'),
      ),
    );
    expect([...withGoBack].sort()).toEqual(['AWAITING_ARCHETYPE', 'CLASS_FILL_ERROR', 'CLASS_REVEALED']);
  });

  it('is a ghost button with the back icon wherever it shows', () => {
    for (const step of ['AWAITING_ARCHETYPE', 'CLASS_REVEALED', 'CLASS_FILL_ERROR']) {
      const goBack = controls({ step }).decisions.find(d => d.action.type === 'send' && d.action.text === 'go back');
      expect(goBack?.variant).toBe('ghost');
      expect(goBack?.icon).toBe('back');
    }
  });

  it('every decision button has a unique id within a step', () => {
    for (const step of [null, ...KNOWN_CREATION_STEPS]) {
      const ids = controls({ step, regionFailed: true, startFailed: true }).decisions.map(d => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('quick row', () => {
  it('shows only at AWAITING_RACE', () => {
    for (const step of [null, ...KNOWN_CREATION_STEPS]) {
      const c = controls({ step, regionFailed: true });
      if (step === 'AWAITING_RACE') expect(c.quick).not.toBeNull();
      else expect(c.quick).toBeNull();
    }
  });

  it('mobile placeholder differs only at AWAITING_RACE', () => {
    for (const step of [null, ...KNOWN_CREATION_STEPS]) {
      const c = controls({ step });
      if (step === 'AWAITING_RACE') expect(c.mobilePlaceholder).not.toBe(c.placeholder);
      else expect(c.mobilePlaceholder).toBe(c.placeholder);
    }
  });
});

describe('START_OVER_CONFIRMATION', () => {
  it('carries the prompt, a danger Yes that sends start over, and a Keep that sends nothing', () => {
    expect(START_OVER_CONFIRMATION.prompt).toBe('Start over? Your race, class and ability are discarded.');
    expect(START_OVER_CONFIRMATION.yes.label).toBe('Yes, start over');
    expect(START_OVER_CONFIRMATION.yes.action).toEqual({ type: 'send', text: 'start over' });
    expect(START_OVER_CONFIRMATION.yes.danger).toBe(true);
    expect(START_OVER_CONFIRMATION.yes.variant).toBe('secondary');
    expect(START_OVER_CONFIRMATION.keep.label).toBe('Keep my choices');
    expect(START_OVER_CONFIRMATION.keep.variant).toBe('primary');
    expect(START_OVER_CONFIRMATION.keep.action.type).not.toBe('send');
    expect(START_OVER_CONFIRMATION.keep.danger).toBe(false);
  });
});

describe('ARCHETYPE_CHOICES', () => {
  it('lists Warrior then Mystic with the UI-SPEC copy', () => {
    expect(ARCHETYPE_CHOICES).toEqual([
      {
        id: 'warrior',
        name: 'Warrior',
        description: 'Steel, stamina and stubborn survival.',
        ariaLabel: 'Warrior. Choose this archetype.',
        sends: 'Warrior',
        icon: 'sword',
      },
      {
        id: 'mystic',
        name: 'Mystic',
        description: 'Mana, lore and bending reality.',
        ariaLabel: 'Mystic. Choose this archetype.',
        sends: 'Mystic',
        icon: 'wand',
      },
    ]);
  });
});

describe('copy', () => {
  it('uses the single ellipsis character and no exclamation marks', () => {
    for (const step of [null, ...KNOWN_CREATION_STEPS]) {
      const c = controls({ step });
      for (const text of [c.placeholder, c.mobilePlaceholder]) {
        expect(text).not.toContain('...');
        expect(text).not.toContain('!');
      }
    }
  });
});
