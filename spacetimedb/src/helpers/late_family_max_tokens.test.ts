/**
 * Phase 51.3.1.2 review A WR-01: a late family-mode region_economy job (one family's drop, trophy and
 * gear) does not inherit the 20000-token region-creation cap (D-19). It takes LATE_FAMILY_MAX_TOKENS,
 * and the request builder and the budget reservation both read it through llm_routes.jobMaxTokens, so
 * the in-flight reservation matches the call. Region-mode region_economy keeps the shared cap.
 * Pure tests: no ctx, no LLM call.
 */
import { describe, it, expect } from 'vitest';
import { LATE_FAMILY_MAX_TOKENS, REGION_CREATION_MAX_TOKENS } from '../data/llm_tuning';
import { LLM_ROUTES, LLM_ROUTE_NAMES, jobMaxTokens } from '../data/llm_routes';
import { ROUTE_BLOCKS } from '../data/llm_layers';
import { MAX_NAME_CHARS } from '../data/economy_design_rules';
import { estimatePromptChars, reservationMicroUsd } from './llm_budget';
import { reserveCostMicroUsd } from './measurement';
import { buildClaudeRequest } from './claude_request';

const familyRequest = (mode: 'family' | 'enemy' | 'region') =>
  JSON.stringify({
    regionId: '1',
    mode,
    familyId: '2',
    characterId: '10',
    input: { mode, regionId: '1', regionName: 'The Salt Pans', biome: 'coastal', families: [], enemies: [] },
  });

describe('jobMaxTokens (review A WR-01)', () => {
  it('names a small cap of its own, under the region-creation cap', () => {
    expect(LATE_FAMILY_MAX_TOKENS).toBe(4096);
    expect(LATE_FAMILY_MAX_TOKENS).toBeLessThan(REGION_CREATION_MAX_TOKENS);
  });

  it('a family-mode (or stored 51.3 enemy-mode) region_economy job takes LATE_FAMILY_MAX_TOKENS', () => {
    expect(jobMaxTokens('region_economy', { mode: 'family' })).toBe(LATE_FAMILY_MAX_TOKENS);
    expect(jobMaxTokens('region_economy', { mode: 'enemy' })).toBe(LATE_FAMILY_MAX_TOKENS);
  });

  it('a region-mode region_economy job keeps the shared region-creation cap', () => {
    expect(jobMaxTokens('region_economy', { mode: 'region' })).toBe(REGION_CREATION_MAX_TOKENS);
    expect(LLM_ROUTES.region_economy.maxTokens).toBe(REGION_CREATION_MAX_TOKENS);
    for (const input of [undefined, null, 'family', {}, { mode: 'FAMILY' }]) {
      expect(jobMaxTokens('region_economy', input)).toBe(REGION_CREATION_MAX_TOKENS);
    }
  });

  it('every other route keeps its route cap, whatever the input says', () => {
    for (const route of LLM_ROUTE_NAMES) {
      if (route === 'region_economy') continue;
      expect(jobMaxTokens(route, { mode: 'family' }), route).toBe(LLM_ROUTES[route].maxTokens);
    }
  });
});

describe('the reservation and the request agree on the late-family cap (review A WR-01)', () => {
  it('a family-mode request reserves at LATE_FAMILY_MAX_TOKENS, a region-mode one at the shared cap', () => {
    for (const mode of ['family', 'enemy'] as const) {
      const json = familyRequest(mode);
      expect(reservationMicroUsd('region_economy', json), mode).toBe(
        BigInt(reserveCostMicroUsd(LATE_FAMILY_MAX_TOKENS, estimatePromptChars('region_economy', json))),
      );
    }
    const region = familyRequest('region');
    expect(reservationMicroUsd('region_economy', region)).toBe(
      BigInt(reserveCostMicroUsd(REGION_CREATION_MAX_TOKENS, estimatePromptChars('region_economy', region))),
    );
  });

  it('a family job reserves several times less than a region job of the same size (no $0.20 hold per family)', () => {
    const family = reservationMicroUsd('region_economy', familyRequest('family'));
    const region = reservationMicroUsd('region_economy', familyRequest('region'));
    expect(family * 3n).toBeLessThan(region);
    // 4096 output tokens at $10/MTok is about $0.04; the input share is small for one family.
    expect(family).toBeLessThan(60_000n);
  });

  it('an unreadable request JSON falls back to the route cap (never throws)', () => {
    expect(reservationMicroUsd('region_economy', '{not json')).toBe(
      BigInt(reserveCostMicroUsd(REGION_CREATION_MAX_TOKENS, estimatePromptChars('region_economy', '{not json'))),
    );
  });

  it('buildClaudeRequest sends the job cap when given, else the route cap', () => {
    const layers = { routeBlock: ROUTE_BLOCKS.region_economy, volatile: 'Region: The Salt Pans.' };
    const late = buildClaudeRequest('region_economy', layers, jobMaxTokens('region_economy', { mode: 'family' }));
    expect(late.body.max_tokens).toBe(LATE_FAMILY_MAX_TOKENS);
    const whole = buildClaudeRequest('region_economy', layers, jobMaxTokens('region_economy', { mode: 'region' }));
    expect(whole.body.max_tokens).toBe(REGION_CREATION_MAX_TOKENS);
    expect(buildClaudeRequest('region_economy', layers).body.max_tokens).toBe(REGION_CREATION_MAX_TOKENS);
  });
});

describe('the largest one-family reply fits the late-family cap (sanity, not a tuned budget)', () => {
  it('4 members x 4 gear slots with names and descriptions at their caps stays under 80% of the cap', () => {
    const name = 'N'.repeat(MAX_NAME_CHARS);
    const description = 'd'.repeat(240); // economy_design_rules MAX_DESCRIPTION_CHARS
    const gear = [];
    for (let m = 0; m < 4; m += 1) {
      for (const slot of ['weapon', 'chest', 'legs', 'boots']) {
        gear.push({ member: `E1.m${m}`, name, slot, weaponType: 'sword', armorType: 'plate', description });
      }
    }
    const reply = {
      region: null,
      lateFamily: { family: 'E1', drop: { name, kind: 'hide', description }, trophy: { name, description }, gear },
    };
    const estimate = Math.ceil(JSON.stringify(reply).length / 3);
    expect(estimate, `estimate ${estimate} tokens vs cap ${LATE_FAMILY_MAX_TOKENS}`).toBeLessThanOrEqual(0.8 * LATE_FAMILY_MAX_TOKENS);
  });
});
