import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_CREATION_STEPS,
  STEP_LABELS,
  deriveCreationStep,
  effectiveCreationStep,
  firstRegionFailed,
  mobileStepText,
  stepAnnouncement,
  stepMarkers,
} from './creationSteps';
import type { StepPosition } from './creationSteps';

interface Input {
  step: string | null;
  previousStep: string | null;
  regionFailed: boolean;
  lastKnown: StepPosition | null;
}

const base: Input = { step: null, previousStep: null, regionFailed: false, lastKnown: null };

type Row = [string, Partial<Input>, { position: StepPosition; error: boolean; working: boolean; known: boolean }];

const rows: Row[] = [
  ['no row yet', { step: null }, { position: 1, error: false, working: false, known: true }],
  ['AWAITING_RACE', { step: 'AWAITING_RACE' }, { position: 1, error: false, working: false, known: true }],
  ['GENERATING_RACE', { step: 'GENERATING_RACE' }, { position: 1, error: false, working: true, known: true }],
  ['AWAITING_ARCHETYPE', { step: 'AWAITING_ARCHETYPE' }, { position: 2, error: false, working: false, known: true }],
  ['GENERATING_CLASS', { step: 'GENERATING_CLASS' }, { position: 3, error: false, working: true, known: true }],
  ['CLASS_FILLING', { step: 'CLASS_FILLING' }, { position: 3, error: false, working: true, known: true }],
  ['CLASS_FILL_ERROR', { step: 'CLASS_FILL_ERROR' }, { position: 3, error: true, working: false, known: true }],
  ['CLASS_REVEALED', { step: 'CLASS_REVEALED' }, { position: 3, error: false, working: false, known: true }],
  ['AWAITING_NAME', { step: 'AWAITING_NAME' }, { position: 4, error: false, working: false, known: true }],
  ['CONFIRMING', { step: 'CONFIRMING' }, { position: 5, error: false, working: false, known: true }],
  [
    'CONFIRMING_GO_BACK shows AWAITING_ARCHETYPE position',
    { step: 'CONFIRMING_GO_BACK', previousStep: 'AWAITING_ARCHETYPE' },
    { position: 2, error: false, working: false, known: true },
  ],
  [
    'CONFIRMING_GO_BACK shows CLASS_REVEALED position',
    { step: 'CONFIRMING_GO_BACK', previousStep: 'CLASS_REVEALED' },
    { position: 3, error: false, working: false, known: true },
  ],
  [
    'CONFIRMING_GO_BACK from CLASS_FILL_ERROR is position 3, not error, not working',
    { step: 'CONFIRMING_GO_BACK', previousStep: 'CLASS_FILL_ERROR' },
    { position: 3, error: false, working: false, known: true },
  ],
  [
    'CONFIRMING_GO_BACK with no previousStep is position 1',
    { step: 'CONFIRMING_GO_BACK', previousStep: null },
    { position: 1, error: false, working: false, known: true },
  ],
  [
    'CONFIRMING_GO_BACK whose previousStep is itself is position 1',
    { step: 'CONFIRMING_GO_BACK', previousStep: 'CONFIRMING_GO_BACK' },
    { position: 1, error: false, working: false, known: true },
  ],
  [
    'CONFIRMING_GO_BACK with an unknown previousStep is position 1',
    { step: 'CONFIRMING_GO_BACK', previousStep: 'SOMETHING_NEW' },
    { position: 1, error: false, working: false, known: true },
  ],
  ['COMPLETE, first region forming', { step: 'COMPLETE', regionFailed: false }, { position: 5, error: false, working: true, known: true }],
  ['COMPLETE, first region failed', { step: 'COMPLETE', regionFailed: true }, { position: 5, error: true, working: false, known: true }],
  ['unknown value with no last known position', { step: 'SOMETHING_NEW' }, { position: 1, error: false, working: false, known: false }],
  ['unknown value keeps the last known position', { step: 'SOMETHING_NEW', lastKnown: 3 }, { position: 3, error: false, working: false, known: false }],
  ['a prototype key name is unknown, not a step', { step: 'constructor', lastKnown: 2 }, { position: 2, error: false, working: false, known: false }],
  ['toString is unknown too', { step: 'toString' }, { position: 1, error: false, working: false, known: false }],
  ['empty string is unknown', { step: '', lastKnown: 4 }, { position: 4, error: false, working: false, known: false }],
];

describe('deriveCreationStep', () => {
  it.each(rows)('%s', (_name, overrides, expected) => {
    const view = deriveCreationStep({ ...base, ...overrides });
    expect(view.position).toBe(expected.position);
    expect(view.error).toBe(expected.error);
    expect(view.working).toBe(expected.working);
    expect(view.known).toBe(expected.known);
    expect(view.label).toBe(STEP_LABELS[expected.position - 1]);
  });

  it('lists the five labels in order, with the name after Class', () => {
    expect([...STEP_LABELS]).toEqual(['Race', 'Archetype', 'Class', 'Name', 'Enter the realm']);
  });

  it('knows exactly the 11 server steps', () => {
    expect([...KNOWN_CREATION_STEPS].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('puts position 4 on AWAITING_NAME only, for every known step and every previousStep', () => {
    for (const step of KNOWN_CREATION_STEPS) {
      for (const previousStep of [null, ...KNOWN_CREATION_STEPS]) {
        for (const regionFailed of [false, true]) {
          const view = deriveCreationStep({ step, previousStep, regionFailed, lastKnown: null });
          if (view.position === 4) {
            // Only the name step itself, or a go-back whose previous step was the name step.
            expect(step === 'AWAITING_NAME' || (step === 'CONFIRMING_GO_BACK' && previousStep === 'AWAITING_NAME')).toBe(true);
          }
        }
      }
    }
    expect(deriveCreationStep({ ...base, step: 'CLASS_REVEALED' }).position).toBeLessThan(
      deriveCreationStep({ ...base, step: 'AWAITING_NAME' }).position,
    );
  });

  it('never throws on odd input', () => {
    for (const step of ['', ' ', '__proto__', 'hasOwnProperty', 'awaiting_race', 'COMPLETE ']) {
      expect(() => deriveCreationStep({ ...base, step, previousStep: step, lastKnown: null })).not.toThrow();
    }
  });
});

describe('stepMarkers', () => {
  it('at position 2 has Race done, Archetype current, the rest to do', () => {
    const markers = stepMarkers(deriveCreationStep({ ...base, step: 'AWAITING_ARCHETYPE' }));
    expect(markers.map(m => m.label)).toEqual(['Race', 'Archetype', 'Class', 'Name', 'Enter the realm']);
    expect(markers.map(m => m.state)).toEqual(['done', 'current', 'todo', 'todo', 'todo']);
    expect(markers[0].ariaLabel).toBe('Race, done');
    expect(markers[1].ariaLabel).toBe('Archetype, current');
    expect(markers[2].ariaLabel).toBe('Class, to do');
    expect(markers[4].ariaLabel).toBe('Enter the realm, to do');
  });

  it('at position 1 has nothing done', () => {
    const markers = stepMarkers(deriveCreationStep({ ...base, step: null }));
    expect(markers.map(m => m.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
  });

  it('at CLASS_FILL_ERROR the current marker is error and reads as current', () => {
    const markers = stepMarkers(deriveCreationStep({ ...base, step: 'CLASS_FILL_ERROR' }));
    expect(markers.map(m => m.state)).toEqual(['done', 'done', 'error', 'todo', 'todo']);
    expect(markers[2].ariaLabel).toBe('Class, current');
  });

  it('at a failed first region the last marker is error', () => {
    const markers = stepMarkers(deriveCreationStep({ ...base, step: 'COMPLETE', regionFailed: true }));
    expect(markers.map(m => m.state)).toEqual(['done', 'done', 'done', 'done', 'error']);
  });

  it('has exactly one current-or-error marker for every known step', () => {
    for (const step of KNOWN_CREATION_STEPS) {
      const markers = stepMarkers(deriveCreationStep({ ...base, step, previousStep: 'CLASS_REVEALED' }));
      expect(markers.filter(m => m.state === 'current' || m.state === 'error')).toHaveLength(1);
    }
  });
});

describe('step texts', () => {
  it('mobileStepText uses the middle dot', () => {
    expect(mobileStepText(deriveCreationStep({ ...base, step: 'AWAITING_ARCHETYPE' }))).toBe('Step 2 of 5 · Archetype');
  });

  it('stepAnnouncement uses a colon', () => {
    expect(stepAnnouncement(deriveCreationStep({ ...base, step: 'AWAITING_ARCHETYPE' }))).toBe('Step 2 of 5: Archetype');
    expect(stepAnnouncement(deriveCreationStep({ ...base, step: 'CONFIRMING' }))).toBe('Step 5 of 5: Enter the realm');
  });
});

describe('firstRegionFailed', () => {
  const rowsFor = (...steps: Array<[bigint, bigint, string]>) => steps.map(([id, characterId, step]) => ({ id, characterId, step }));
  const input = {
    genRows: rowsFor(),
    genApplied: true,
    characterId: 7n as bigint | null,
    worldJobActive: false,
  };

  it('is false until the gen binding applied', () => {
    expect(firstRegionFailed({ ...input, genApplied: false })).toBe(false);
  });

  it('is false with no character id', () => {
    expect(firstRegionFailed({ ...input, characterId: null })).toBe(false);
  });

  it('is false while a creation-scope job is active', () => {
    expect(firstRegionFailed({ ...input, worldJobActive: true, genRows: rowsFor([1n, 7n, 'ERROR']) })).toBe(false);
  });

  it('is true when the newest row for the character is ERROR', () => {
    expect(firstRegionFailed({ ...input, genRows: rowsFor([1n, 7n, 'GENERATING'], [2n, 7n, 'ERROR']) })).toBe(true);
  });

  it('uses the newest row (largest id) whatever the input order', () => {
    expect(firstRegionFailed({ ...input, genRows: rowsFor([2n, 7n, 'ERROR'], [1n, 7n, 'GENERATING']) })).toBe(true);
    expect(firstRegionFailed({ ...input, genRows: rowsFor([2n, 7n, 'COMPLETE'], [1n, 7n, 'ERROR']) })).toBe(false);
  });

  it('is true when no row exists for the character', () => {
    expect(firstRegionFailed({ ...input, genRows: rowsFor() })).toBe(true);
    expect(firstRegionFailed({ ...input, genRows: rowsFor([1n, 9n, 'ERROR']) })).toBe(true);
  });

  it('ignores other characters rows', () => {
    expect(firstRegionFailed({ ...input, genRows: rowsFor([5n, 9n, 'ERROR'], [1n, 7n, 'COMPLETE']) })).toBe(false);
  });

  it.each(['PENDING', 'GENERATING', 'COMPLETE'])('is false for %s', step => {
    expect(firstRegionFailed({ ...input, genRows: rowsFor([1n, 7n, step]) })).toBe(false);
  });
});

describe('effectiveCreationStep', () => {
  it('an unplaced active character is COMPLETE even with no state row', () => {
    expect(effectiveCreationStep(null, true)).toBe('COMPLETE');
    expect(effectiveCreationStep(undefined, true)).toBe('COMPLETE');
    expect(effectiveCreationStep('AWAITING_NAME', true)).toBe('COMPLETE');
  });

  it('otherwise gives the state step or null', () => {
    expect(effectiveCreationStep('AWAITING_NAME', false)).toBe('AWAITING_NAME');
    expect(effectiveCreationStep(null, false)).toBeNull();
    expect(effectiveCreationStep(undefined, false)).toBeNull();
  });
});

describe('dropped mock step', () => {
  it('is not mentioned in any non-test source file under src/creation', () => {
    const dir = resolve(process.cwd(), 'src/creation');
    const files = readdirSync(dir).filter(f => /\.(ts|vue)$/.test(f) && !/\.test\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const pattern = new RegExp('first' + '\\s+words', 'i');
    for (const file of files) {
      expect(pattern.test(readFileSync(resolve(dir, file), 'utf8'))).toBe(false);
    }
  });
});
