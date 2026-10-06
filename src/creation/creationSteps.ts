// Pure derivations for the creation step bar (CRE-01). Everything here is a function of the
// server's character_creation_state row (plus placement and the first-region state): no
// optimistic state, no Vue runtime, no SDK, no DOM.

export const STEP_LABELS = ['Race', 'Archetype', 'Class', 'Name', 'Enter the realm'] as const;

export type StepPosition = 1 | 2 | 3 | 4 | 5;

/** The 11 step values the reducer writes (the schema comment in tables.ts is stale; the reducer is the truth). */
export const KNOWN_CREATION_STEPS: readonly string[] = [
  'AWAITING_RACE',
  'GENERATING_RACE',
  'AWAITING_ARCHETYPE',
  'GENERATING_CLASS',
  'CLASS_FILLING',
  'CLASS_FILL_ERROR',
  'CLASS_REVEALED',
  'AWAITING_NAME',
  'CONFIRMING',
  'CONFIRMING_GO_BACK',
  'COMPLETE',
];

export interface CreationStepView {
  position: StepPosition;
  label: string;
  error: boolean;
  working: boolean;
  /** False when the server step is not one of KNOWN_CREATION_STEPS (the input locks). */
  known: boolean;
}

interface StepInfo {
  position: StepPosition;
  error: boolean;
  working: boolean;
}

const STEP_TABLE: Record<string, StepInfo> = {
  AWAITING_RACE: { position: 1, error: false, working: false },
  GENERATING_RACE: { position: 1, error: false, working: true },
  AWAITING_ARCHETYPE: { position: 2, error: false, working: false },
  GENERATING_CLASS: { position: 3, error: false, working: true },
  CLASS_FILLING: { position: 3, error: false, working: true },
  CLASS_FILL_ERROR: { position: 3, error: true, working: false },
  CLASS_REVEALED: { position: 3, error: false, working: false },
  AWAITING_NAME: { position: 4, error: false, working: false },
  CONFIRMING: { position: 5, error: false, working: false },
};

function lookup(step: string | null): StepInfo | null {
  if (step === null) return null;
  return Object.prototype.hasOwnProperty.call(STEP_TABLE, step) ? STEP_TABLE[step] : null;
}

function view(position: StepPosition, error: boolean, working: boolean, known: boolean): CreationStepView {
  return { position, label: STEP_LABELS[position - 1], error, working, known };
}

export function deriveCreationStep(input: {
  step: string | null;
  previousStep: string | null;
  regionFailed: boolean;
  lastKnown: StepPosition | null;
  /** COMPLETE with no character behind it: step 5 is stuck, not working. */
  endedWithoutCharacter?: boolean;
}): CreationStepView {
  const { step, previousStep, regionFailed, lastKnown } = input;
  // start_creation is in flight: no row yet.
  if (step === null) return view(1, false, false, true);
  if (step === 'CONFIRMING_GO_BACK') {
    // A go-back awaits its yes: show where the player was (position 1 when that is missing or odd).
    const previous = lookup(previousStep);
    return view(previous ? previous.position : 1, false, false, true);
  }
  if (step === 'COMPLETE' && input.endedWithoutCharacter === true) return view(5, true, false, true);
  if (step === 'COMPLETE') return view(5, regionFailed, !regionFailed, true);
  const info = lookup(step);
  if (info) return view(info.position, info.error, info.working, true);
  return view(lastKnown ?? 1, false, false, false);
}

export interface StepMarker {
  label: string;
  state: 'done' | 'current' | 'error' | 'todo';
  ariaLabel: string;
}

export function stepMarkers(stepView: CreationStepView): StepMarker[] {
  return STEP_LABELS.map((label, index) => {
    const position = index + 1;
    if (position < stepView.position) {
      return { label, state: 'done' as const, ariaLabel: `${label}, done` };
    }
    if (position === stepView.position) {
      // The error state reads as current to assistive tech.
      return { label, state: stepView.error ? ('error' as const) : ('current' as const), ariaLabel: `${label}, current` };
    }
    return { label, state: 'todo' as const, ariaLabel: `${label}, to do` };
  });
}

export function mobileStepText(stepView: CreationStepView): string {
  return `Step ${stepView.position} of 5 · ${stepView.label}`;
}

export function stepAnnouncement(stepView: CreationStepView): string {
  return `Step ${stepView.position} of 5: ${stepView.label}`;
}

/**
 * True when the first region did not form for an unplaced character. The world_gen_state row is
 * the second source (a lagging jobs list never flashes a false error): nothing is decided before
 * the binding applied, while a creation-scope job is active, or without a character.
 */
export function firstRegionFailed(input: {
  genRows: readonly { id: bigint; characterId: bigint; step: string }[];
  genApplied: boolean;
  characterId: bigint | null;
  worldJobActive: boolean;
}): boolean {
  if (!input.genApplied || input.characterId === null || input.worldJobActive) return false;
  let newest: { id: bigint; step: string } | null = null;
  for (const row of input.genRows) {
    if (row.characterId !== input.characterId) continue;
    if (newest === null || row.id > newest.id) newest = row;
  }
  if (newest === null) return true;
  return newest.step === 'ERROR';
}

/** An unplaced active character is always at step 5, even with no state row. */
export function effectiveCreationStep(stateStep: string | null | undefined, unplacedActive: boolean): string | null {
  if (unplacedActive) return 'COMPLETE';
  return stateStep ?? null;
}
