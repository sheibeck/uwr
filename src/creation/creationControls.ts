// Pure per-step controls for the creation composer (CRE-01): the quick row, the decision row,
// the input text and lock, and which choice block shows. A function of the server step and a few
// flags only. No client-side validation of names or choices: the server's creation_error lines
// are the contract. Every word a button sends is pinned against the server by serverWords.test.ts.

import { KNOWN_CREATION_STEPS } from './creationSteps';

/**
 * What a decision button does. `dismiss` closes the Start over confirmation and sends nothing
 * (added beyond the plan's three variants so the Keep button of START_OVER_CONFIRMATION has a
 * well-typed, inert action).
 */
export type DecisionAction =
  | { type: 'send'; text: string }
  | { type: 'start' }
  | { type: 'askStartOver' }
  | { type: 'dismiss' };

export interface DecisionButton {
  id: string;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
  icon: 'retry' | 'back' | null;
  action: DecisionAction;
  danger: boolean;
}

export interface CreationControls {
  quick: { label: string; sends: string } | null;
  decisions: DecisionButton[];
  placeholder: string;
  mobilePlaceholder: string;
  locked: boolean;
  disabled: boolean;
  choice: 'race' | 'archetype' | 'ability' | null;
  nameHint: string | null;
}

export const SURPRISE_ME_TEXT = 'Surprise me.';
export const NAME_HINT = '3 to 20 letters. One word.';

const WORKING_TEXT = 'The Keeper is working…';
const OFFLINE_TEXT = 'Reconnecting…';

const GO_BACK_BUTTON: DecisionButton = {
  id: 'go-back',
  label: 'Go back a step',
  variant: 'ghost',
  icon: 'back',
  action: { type: 'send', text: 'go back' },
  danger: false,
};

const RETRY_CLASS_BUTTON: DecisionButton = {
  id: 'retry-class',
  label: 'Retry class details',
  variant: 'primary',
  icon: 'retry',
  action: { type: 'send', text: 'retry' },
  danger: false,
};

const RETRY_REGION_BUTTON: DecisionButton = {
  id: 'retry-region',
  label: 'Retry finding a region',
  variant: 'primary',
  icon: 'retry',
  action: { type: 'send', text: 'explore' },
  danger: false,
};

const RETRY_START_BUTTON: DecisionButton = {
  id: 'retry-start',
  label: 'Retry',
  variant: 'primary',
  icon: 'retry',
  action: { type: 'start' },
  danger: false,
};

const ENTER_REALM_BUTTON: DecisionButton = {
  id: 'enter-realm',
  label: 'Enter the realm',
  variant: 'primary',
  icon: null,
  action: { type: 'send', text: 'Confirm' },
  danger: false,
};

const START_OVER_BUTTON: DecisionButton = {
  id: 'start-over',
  label: 'Start over',
  variant: 'secondary',
  icon: null,
  action: { type: 'askStartOver' },
  danger: false,
};

const YES_GO_BACK_BUTTON: DecisionButton = {
  id: 'go-back-yes',
  label: 'Yes, go back',
  variant: 'secondary',
  icon: null,
  action: { type: 'send', text: 'yes' },
  danger: false,
};

const KEEP_BUTTON: DecisionButton = {
  id: 'go-back-keep',
  label: 'Keep my choices',
  variant: 'primary',
  icon: null,
  action: { type: 'send', text: 'no' },
  danger: false,
};

/** The inline confirmation that replaces the decision row after Start over (UI-SPEC A12). */
export const START_OVER_CONFIRMATION: { prompt: string; yes: DecisionButton; keep: DecisionButton } = {
  prompt: 'Start over? Your race, class and ability are discarded.',
  yes: {
    id: 'start-over-yes',
    label: 'Yes, start over',
    variant: 'secondary',
    icon: null,
    action: { type: 'send', text: 'start over' },
    danger: true,
  },
  keep: {
    id: 'start-over-keep',
    label: 'Keep my choices',
    variant: 'primary',
    icon: null,
    action: { type: 'dismiss' },
    danger: false,
  },
};

export const ARCHETYPE_CHOICES: ReadonlyArray<{
  id: 'warrior' | 'mystic';
  name: string;
  description: string;
  ariaLabel: string;
  sends: string;
  icon: 'sword' | 'wand';
}> = [
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
];

interface StepControls {
  quick?: { label: string; sends: string };
  decisions?: DecisionButton[];
  placeholder: string;
  mobilePlaceholder?: string;
  locked: boolean;
  choice?: 'race' | 'archetype' | 'ability';
  nameHint?: string;
}

function forStep(step: string | null, known: boolean, regionFailed: boolean, startFailed: boolean): StepControls {
  if (step === null) {
    return { decisions: startFailed ? [RETRY_START_BUTTON] : [], placeholder: 'Starting…', locked: true };
  }
  if (!known || KNOWN_CREATION_STEPS.indexOf(step) === -1) {
    return { placeholder: WORKING_TEXT, locked: true };
  }
  switch (step) {
    case 'AWAITING_RACE':
      return {
        quick: { label: 'Surprise me', sends: SURPRISE_ME_TEXT },
        placeholder: 'Describe a race, or choose one…',
        mobilePlaceholder: 'Describe, choose, or tap…',
        locked: false,
        choice: 'race',
      };
    case 'AWAITING_ARCHETYPE':
      return { decisions: [GO_BACK_BUTTON], placeholder: 'Warrior or Mystic…', locked: false, choice: 'archetype' };
    case 'CLASS_FILL_ERROR':
      return {
        decisions: [RETRY_CLASS_BUTTON, GO_BACK_BUTTON],
        placeholder: 'Say anything to try again…',
        locked: false,
      };
    case 'CLASS_REVEALED':
      return { decisions: [GO_BACK_BUTTON], placeholder: 'Name an ability…', locked: false, choice: 'ability' };
    case 'AWAITING_NAME':
      return { placeholder: 'Choose a name…', locked: false, nameHint: NAME_HINT };
    case 'CONFIRMING':
      return {
        decisions: [ENTER_REALM_BUTTON, START_OVER_BUTTON],
        placeholder: 'Confirm or start over…',
        locked: false,
      };
    case 'CONFIRMING_GO_BACK':
      return {
        decisions: [YES_GO_BACK_BUTTON, KEEP_BUTTON],
        placeholder: 'Yes, or anything else to continue…',
        locked: false,
      };
    case 'COMPLETE':
      return {
        decisions: regionFailed ? [RETRY_REGION_BUTTON] : [],
        placeholder: 'Entering the realm…',
        locked: true,
      };
    default:
      // GENERATING_RACE, GENERATING_CLASS, CLASS_FILLING: the server only answers with a patience line.
      return { placeholder: WORKING_TEXT, locked: true };
  }
}

export function controlsFor(input: {
  step: string | null;
  known: boolean;
  regionFailed: boolean;
  startFailed: boolean;
  connected: boolean;
}): CreationControls {
  const s = forStep(input.step, input.known, input.regionFailed, input.startFailed);
  const offline = !input.connected;
  const placeholder = offline ? OFFLINE_TEXT : s.placeholder;
  return {
    quick: s.quick ? { ...s.quick } : null,
    decisions: s.decisions ? s.decisions.map(d => ({ ...d })) : [],
    placeholder,
    mobilePlaceholder: offline ? OFFLINE_TEXT : s.mobilePlaceholder ?? s.placeholder,
    locked: offline || s.locked,
    disabled: offline,
    choice: s.choice ?? null,
    nameHint: s.nameHint ?? null,
  };
}
