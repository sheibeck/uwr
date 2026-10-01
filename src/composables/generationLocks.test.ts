import { describe, expect, it } from 'vitest';
// This tsconfig loads @types/node, and vitest runs the file in Node.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LLM_INPUT_LOCKING_CREATION_STEPS,
  LLM_INPUT_LOCKING_WORLD_GEN_STEPS,
} from '../../spacetimedb/src/data/llm_indicator_lines';

// ============================================================================
// Stage-2 steps never lock input (Plan 43-09, LAT-03 / LAT-04)
// ============================================================================
//
// The region is playable while stage 2 fills it in and after a failed fill; the class reveal is
// answered by the server with a patience line while the class fill runs. So the narrative input
// lock reads its step lists from server data, and those lists exclude every stage-2 step.
// ============================================================================

const STAGE_2_STEPS = ['FILLING', 'FILL_ERROR', 'CLASS_FILLING', 'CLASS_FILL_ERROR'];

function readSource(name: string): string {
  const path = fileURLToPath(new URL(`./${name}`, import.meta.url));
  return readFileSync(path, 'utf8');
}

/** Source with line and block comments removed, so prose mentioning a step is not a comparison. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
}

describe('input-locking step lists', () => {
  it('lock only the stage-1 steps', () => {
    expect([...LLM_INPUT_LOCKING_WORLD_GEN_STEPS]).toEqual(['PENDING', 'GENERATING']);
    expect([...LLM_INPUT_LOCKING_CREATION_STEPS]).toEqual(['GENERATING_RACE', 'GENERATING_CLASS']);
  });

  it.each(STAGE_2_STEPS)('%s never locks the world-gen or the creation input', (step) => {
    expect(LLM_INPUT_LOCKING_WORLD_GEN_STEPS.includes(step)).toBe(false);
    expect(LLM_INPUT_LOCKING_CREATION_STEPS.includes(step)).toBe(false);
  });
});

describe('composables read the step lists from server data', () => {
  it('useWorldGeneration imports LLM_INPUT_LOCKING_WORLD_GEN_STEPS and has no step literals of its own', () => {
    const source = readSource('useWorldGeneration.ts');
    expect(source).toContain('spacetimedb/src/data/llm_indicator_lines');
    expect(source).toContain('LLM_INPUT_LOCKING_WORLD_GEN_STEPS');
    const code = codeOnly(source);
    expect(code).not.toMatch(/['"]GENERATING['"]/);
    expect(code).not.toMatch(/['"]PENDING['"]/);
    for (const step of STAGE_2_STEPS) expect(code).not.toContain(step);
  });

  it('useCharacterCreation imports LLM_INPUT_LOCKING_CREATION_STEPS and has no GENERATING_* literals of its own', () => {
    const source = readSource('useCharacterCreation.ts');
    expect(source).toContain('spacetimedb/src/data/llm_indicator_lines');
    expect(source).toContain('LLM_INPUT_LOCKING_CREATION_STEPS');
    const code = codeOnly(source);
    expect(code).not.toMatch(/['"]GENERATING_RACE['"]/);
    expect(code).not.toMatch(/['"]GENERATING_CLASS['"]/);
    for (const step of STAGE_2_STEPS) expect(code).not.toContain(step);
  });
});
