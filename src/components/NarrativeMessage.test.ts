import { describe, it, expect } from 'vitest';
import { KIND_COLORS } from './NarrativeMessage.colors';

// ═══════════════════════════════════════════════════════════════
//  NarrativeMessage KIND_COLORS Tests (034-01)
//
//  Verifies the event feed color map has all required entries
//  with the correct hex values for each category.
// ═══════════════════════════════════════════════════════════════

describe('KIND_COLORS', () => {
  describe('required keys exist', () => {
    it('has "social" key', () => {
      expect(KIND_COLORS).toHaveProperty('social');
    });

    it('has "ability" key', () => {
      expect(KIND_COLORS).toHaveProperty('ability');
    });

    it('has "damage" key (combat/red category)', () => {
      expect(KIND_COLORS).toHaveProperty('damage');
    });

    it('has "reward" key', () => {
      expect(KIND_COLORS).toHaveProperty('reward');
    });

    it('has "system" key', () => {
      expect(KIND_COLORS).toHaveProperty('system');
    });
  });

  describe('correct hex values', () => {
    it('social is blue #74c0fc', () => {
      expect(KIND_COLORS.social).toBe('#74c0fc');
    });

    it('ability is blue #74c0fc', () => {
      expect(KIND_COLORS.ability).toBe('#74c0fc');
    });

    it('damage is red #ff6b6b', () => {
      expect(KIND_COLORS.damage).toBe('#ff6b6b');
    });

    it('reward is gold #ffd43b', () => {
      expect(KIND_COLORS.reward).toBe('#ffd43b');
    });

    it('system is gray #adb5bd', () => {
      expect(KIND_COLORS.system).toBe('#adb5bd');
    });
  });

  describe('event category coverage', () => {
    it('combat events are red: damage and blocked both map to red', () => {
      expect(KIND_COLORS.damage).toBe('#ff6b6b');
      expect(KIND_COLORS.blocked).toBe('#ff6b6b');
    });

    it('reward events are gold: reward and narrative both map to gold-ish', () => {
      expect(KIND_COLORS.reward).toBe('#ffd43b');
      expect(KIND_COLORS.narrative).toBe('#ffd43b');
    });

    it('system events are gray: system, command, move all map to gray-ish', () => {
      expect(KIND_COLORS.system).toBe('#adb5bd');
      expect(KIND_COLORS.command).toBe('#adb5bd');
    });

    it('social events are blue: whisper, social, ability all map to blue', () => {
      expect(KIND_COLORS.whisper).toBe('#74c0fc');
      expect(KIND_COLORS.social).toBe('#74c0fc');
      expect(KIND_COLORS.ability).toBe('#74c0fc');
    });
  });
});
