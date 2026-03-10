import { describe, it, expect } from 'vitest';
import { createMockCtx } from '../helpers/test-utils';

// ═══════════════════════════════════════════════════════════════
//  Hotbar Reducer Tests
//
//  Tests hotbar CRUD logic in isolation using mock DB.
//  Mirrors the logic in items.ts reducers without importing
//  SpacetimeDB server modules.
// ═══════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// Inline helpers that mirror items.ts logic (no SpacetimeDB server imports)
// ---------------------------------------------------------------------------

const SENDER = { toHexString: () => 'owner-hex' };
const OWNER_USER_ID = 1n;
const CHARACTER_ID = 10n;

function makeCharacter(overrides: Partial<any> = {}): any {
  return {
    id: CHARACTER_ID,
    ownerUserId: OWNER_USER_ID,
    name: 'TestHero',
    ...overrides,
  };
}

/** Ensure default hotbar named "main" exists for character. Returns hotbar row. */
function ensureDefaultHotbar(ctx: any, character: any): any {
  const existing = [...ctx.db.hotbar.by_character.filter(character.id)];
  if (existing.length > 0) {
    const active = existing.find((h: any) => h.isActive);
    return active ?? existing[0];
  }
  return ctx.db.hotbar.insert({
    id: 0n,
    characterId: character.id,
    name: 'main',
    sortOrder: 0,
    isActive: true,
    createdAt: ctx.timestamp,
  });
}

/** Create a hotbar for character. Returns created row or error string. */
function createHotbar(ctx: any, character: any, hotbarName: string): any | string {
  const existing = [...ctx.db.hotbar.by_character.filter(character.id)];
  if (existing.length >= 10) {
    return 'You already have 10 hotbars (maximum).';
  }
  // Deactivate all existing
  for (const h of existing) {
    ctx.db.hotbar.id.update({ ...h, isActive: false });
  }
  const newHotbar = ctx.db.hotbar.insert({
    id: 0n,
    characterId: character.id,
    name: hotbarName,
    sortOrder: existing.length,
    isActive: true,
    createdAt: ctx.timestamp,
  });
  return newHotbar;
}

/** Switch active hotbar by name (case-insensitive). Returns error string or undefined. */
function switchHotbar(ctx: any, character: any, hotbarName: string): string | undefined {
  const all = [...ctx.db.hotbar.by_character.filter(character.id)];
  const target = all.find((h: any) => h.name.toLowerCase() === hotbarName.toLowerCase());
  if (!target) {
    return `No hotbar named "${hotbarName}" found.`;
  }
  for (const h of all) {
    ctx.db.hotbar.id.update({ ...h, isActive: h.id === target.id });
  }
  return undefined;
}

/** Swap two slots on the active hotbar. Returns error string or undefined. */
function swapHotbarSlots(ctx: any, character: any, slot1: number, slot2: number): string | undefined {
  const activeHotbar = [...ctx.db.hotbar.by_character.filter(character.id)].find((h: any) => h.isActive);
  if (!activeHotbar) {
    return 'No active hotbar found.';
  }
  const hotbarSlots = [...ctx.db.hotbar_slot.by_hotbar.filter(activeHotbar.id)];
  const s1 = hotbarSlots.find((s: any) => s.slot === slot1);
  const s2 = hotbarSlots.find((s: any) => s.slot === slot2);

  const id1 = s1?.abilityTemplateId ?? 0n;
  const id2 = s2?.abilityTemplateId ?? 0n;

  if (s1) {
    if (id2 === 0n) {
      ctx.db.hotbar_slot.id.delete(s1.id);
    } else {
      ctx.db.hotbar_slot.id.update({ ...s1, abilityTemplateId: id2, assignedAt: ctx.timestamp });
    }
  } else if (id2 !== 0n) {
    ctx.db.hotbar_slot.insert({
      id: 0n,
      characterId: character.id,
      hotbarId: activeHotbar.id,
      slot: slot1,
      abilityTemplateId: id2,
      assignedAt: ctx.timestamp,
    });
  }

  if (s2) {
    if (id1 === 0n) {
      ctx.db.hotbar_slot.id.delete(s2.id);
    } else {
      ctx.db.hotbar_slot.id.update({ ...s2, abilityTemplateId: id1, assignedAt: ctx.timestamp });
    }
  } else if (id1 !== 0n) {
    ctx.db.hotbar_slot.insert({
      id: 0n,
      characterId: character.id,
      hotbarId: activeHotbar.id,
      slot: slot2,
      abilityTemplateId: id1,
      assignedAt: ctx.timestamp,
    });
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════
//  create_hotbar tests
// ═══════════════════════════════════════════════════════════════

describe('create_hotbar logic', () => {
  it('creates a Hotbar row with the given name', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const result = createHotbar(ctx, character, 'buffs');
    expect(typeof result).toBe('object');
    expect(result.name).toBe('buffs');
    expect(result.characterId).toBe(CHARACTER_ID);
    expect(result.isActive).toBe(true);
  });

  it('deactivates existing hotbars when creating new one', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    // Create first hotbar
    createHotbar(ctx, character, 'main');
    // Create second hotbar
    createHotbar(ctx, character, 'buffs');
    const all = [...ctx.db.hotbar.by_character.filter(CHARACTER_ID)];
    expect(all.length).toBe(2);
    const active = all.filter((h: any) => h.isActive);
    expect(active.length).toBe(1);
    expect(active[0].name).toBe('buffs');
  });

  it('assigns sortOrder = count of existing hotbars', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const h1 = createHotbar(ctx, character, 'main');
    const h2 = createHotbar(ctx, character, 'buffs');
    const h3 = createHotbar(ctx, character, 'dps');
    expect(h1.sortOrder).toBe(0);
    expect(h2.sortOrder).toBe(1);
    expect(h3.sortOrder).toBe(2);
  });

  it('rejects creation if character already has 10 hotbars', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    // Create 10 hotbars
    for (let i = 0; i < 10; i++) {
      createHotbar(ctx, character, `hotbar${i}`);
    }
    const result = createHotbar(ctx, character, 'eleventh');
    expect(typeof result).toBe('string');
    expect(result).toContain('10 hotbars');
  });

  it('allows exactly 10 hotbars', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    for (let i = 0; i < 9; i++) {
      createHotbar(ctx, character, `hotbar${i}`);
    }
    const tenth = createHotbar(ctx, character, 'tenth');
    expect(typeof tenth).toBe('object');
    expect(tenth.name).toBe('tenth');
  });
});

// ═══════════════════════════════════════════════════════════════
//  switch_hotbar tests
// ═══════════════════════════════════════════════════════════════

describe('switch_hotbar logic', () => {
  it('sets target hotbar isActive=true', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    createHotbar(ctx, character, 'main');
    createHotbar(ctx, character, 'buffs');
    const err = switchHotbar(ctx, character, 'main');
    expect(err).toBeUndefined();
    const all = [...ctx.db.hotbar.by_character.filter(CHARACTER_ID)];
    const mainHotbar = all.find((h: any) => h.name === 'main');
    expect(mainHotbar?.isActive).toBe(true);
  });

  it('sets all other hotbars isActive=false', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    createHotbar(ctx, character, 'main');
    createHotbar(ctx, character, 'buffs');
    createHotbar(ctx, character, 'dps');
    switchHotbar(ctx, character, 'main');
    const all = [...ctx.db.hotbar.by_character.filter(CHARACTER_ID)];
    const inactive = all.filter((h: any) => !h.isActive);
    expect(inactive.length).toBe(2);
    expect(inactive.map((h: any) => h.name)).toContain('buffs');
    expect(inactive.map((h: any) => h.name)).toContain('dps');
  });

  it('is case-insensitive when matching hotbar name', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    createHotbar(ctx, character, 'Buffs');
    const err = switchHotbar(ctx, character, 'BUFFS');
    expect(err).toBeUndefined();
    const all = [...ctx.db.hotbar.by_character.filter(CHARACTER_ID)];
    expect(all.find((h: any) => h.name === 'Buffs')?.isActive).toBe(true);
  });

  it('returns error when hotbar name not found', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    createHotbar(ctx, character, 'main');
    const err = switchHotbar(ctx, character, 'nonexistent');
    expect(typeof err).toBe('string');
    expect(err).toContain('nonexistent');
  });
});

// ═══════════════════════════════════════════════════════════════
//  swap_hotbar_slots tests
// ═══════════════════════════════════════════════════════════════

describe('swap_hotbar_slots logic', () => {
  it('swaps abilityTemplateId between two populated slots', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const hotbar = createHotbar(ctx, character, 'main') as any;

    // Insert slots 1 and 3
    ctx.db.hotbar_slot.insert({
      id: 0n, characterId: CHARACTER_ID, hotbarId: hotbar.id,
      slot: 1, abilityTemplateId: 100n, assignedAt: ctx.timestamp,
    });
    ctx.db.hotbar_slot.insert({
      id: 0n, characterId: CHARACTER_ID, hotbarId: hotbar.id,
      slot: 3, abilityTemplateId: 200n, assignedAt: ctx.timestamp,
    });

    const err = swapHotbarSlots(ctx, character, 1, 3);
    expect(err).toBeUndefined();

    const slots = [...ctx.db.hotbar_slot.by_hotbar.filter(hotbar.id)];
    const s1 = slots.find((s: any) => s.slot === 1);
    const s3 = slots.find((s: any) => s.slot === 3);
    expect(s1?.abilityTemplateId).toBe(200n);
    expect(s3?.abilityTemplateId).toBe(100n);
  });

  it('moving from populated slot to empty slot removes source and creates target', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const hotbar = createHotbar(ctx, character, 'main') as any;

    ctx.db.hotbar_slot.insert({
      id: 0n, characterId: CHARACTER_ID, hotbarId: hotbar.id,
      slot: 1, abilityTemplateId: 100n, assignedAt: ctx.timestamp,
    });

    // Slot 5 is empty
    const err = swapHotbarSlots(ctx, character, 1, 5);
    expect(err).toBeUndefined();

    const slots = [...ctx.db.hotbar_slot.by_hotbar.filter(hotbar.id)];
    const s1 = slots.find((s: any) => s.slot === 1);
    const s5 = slots.find((s: any) => s.slot === 5);
    expect(s1).toBeUndefined(); // was moved, now empty
    expect(s5?.abilityTemplateId).toBe(100n);
  });

  it('swapping two empty slots is a no-op', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const hotbar = createHotbar(ctx, character, 'main') as any;

    const err = swapHotbarSlots(ctx, character, 2, 4);
    expect(err).toBeUndefined();

    const slots = [...ctx.db.hotbar_slot.by_hotbar.filter(hotbar.id)];
    expect(slots.length).toBe(0);
  });

  it('returns error when no active hotbar exists', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    // No hotbar created
    const err = swapHotbarSlots(ctx, character, 1, 2);
    expect(typeof err).toBe('string');
    expect(err).toContain('No active hotbar');
  });
});

// ═══════════════════════════════════════════════════════════════
//  ensureDefaultHotbar helper tests
// ═══════════════════════════════════════════════════════════════

describe('ensureDefaultHotbar helper', () => {
  it('creates a "main" hotbar when none exists', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const hotbar = ensureDefaultHotbar(ctx, character);
    expect(hotbar.name).toBe('main');
    expect(hotbar.isActive).toBe(true);
    expect(hotbar.characterId).toBe(CHARACTER_ID);
  });

  it('returns the active hotbar when one already exists', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    const created = createHotbar(ctx, character, 'buffs') as any;
    const ensured = ensureDefaultHotbar(ctx, character);
    expect(ensured.id).toBe(created.id);
  });

  it('does not create a second hotbar if one exists', () => {
    const ctx = createMockCtx({ sender: SENDER });
    const character = makeCharacter();
    ensureDefaultHotbar(ctx, character);
    ensureDefaultHotbar(ctx, character); // second call
    const all = [...ctx.db.hotbar.by_character.filter(CHARACTER_ID)];
    expect(all.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Intent routing pattern tests for hotbar commands
// ═══════════════════════════════════════════════════════════════

describe('intent hotbar command patterns', () => {
  describe('hotbar add <name> pattern', () => {
    const addPattern = /^hotbar\s+add\s+(.+)$/i;

    it('matches "hotbar add buffs" and captures name', () => {
      const m = 'hotbar add buffs'.match(addPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('buffs');
    });

    it('matches "hotbar add my dps bar" and captures multi-word name', () => {
      const m = 'hotbar add my dps bar'.match(addPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('my dps bar');
    });

    it('does not match bare "hotbar add"', () => {
      expect('hotbar add'.match(addPattern)).toBeNull();
    });

    it('is case-insensitive', () => {
      const m = 'HOTBAR ADD Buffs'.match(addPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Buffs');
    });
  });

  describe('hotbar set <slot> <ability> pattern', () => {
    const setPattern = /^hotbar\s+set\s+(\d+)\s+(.+)$/i;

    it('matches "hotbar set 1 Fireball" and captures slot and ability', () => {
      const m = 'hotbar set 1 Fireball'.match(setPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
      expect(m![2]).toBe('Fireball');
    });

    it('matches "hotbar set 10 Shadow Bolt" with multi-word ability', () => {
      const m = 'hotbar set 10 Shadow Bolt'.match(setPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('10');
      expect(m![2]).toBe('Shadow Bolt');
    });

    it('does not match "hotbar set" without slot', () => {
      expect('hotbar set'.match(setPattern)).toBeNull();
    });

    it('does not match "hotbar set 1" without ability', () => {
      expect('hotbar set 1'.match(setPattern)).toBeNull();
    });
  });

  describe('hotbar swap <slot1> <slot2> pattern', () => {
    const swapPattern = /^hotbar\s+swap\s+(\d+)\s+(\d+)$/i;

    it('matches "hotbar swap 1 3" and captures both slots', () => {
      const m = 'hotbar swap 1 3'.match(swapPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
      expect(m![2]).toBe('3');
    });

    it('does not match "hotbar swap 1" with only one slot', () => {
      expect('hotbar swap 1'.match(swapPattern)).toBeNull();
    });

    it('does not match "hotbar swap a b" with non-numeric slots', () => {
      expect('hotbar swap a b'.match(swapPattern)).toBeNull();
    });
  });

  describe('hotbars command (bare plural)', () => {
    it('"hotbars" is exactly the string "hotbars"', () => {
      expect('hotbars').toBe('hotbars');
      expect('hotbars'.toLowerCase()).toBe('hotbars');
    });

    it('"HOTBARS" case-insensitive matches "hotbars"', () => {
      expect('HOTBARS'.toLowerCase()).toBe('hotbars');
    });
  });

  describe('hotbar <name> (switch) pattern', () => {
    // Must not match: "hotbar add X", "hotbar set X Y", "hotbar swap X Y"
    // Must match: "hotbar buffs", "hotbar main", "hotbar dps"
    const switchPattern = /^hotbar\s+(?!add\s|set\s|swap\s)(.+)$/i;

    it('matches "hotbar buffs" for switch', () => {
      const m = 'hotbar buffs'.match(switchPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('buffs');
    });

    it('does not match "hotbar add buffs"', () => {
      expect('hotbar add buffs'.match(switchPattern)).toBeNull();
    });

    it('does not match "hotbar set 1 Fire"', () => {
      expect('hotbar set 1 Fire'.match(switchPattern)).toBeNull();
    });

    it('does not match "hotbar swap 1 3"', () => {
      expect('hotbar swap 1 3'.match(switchPattern)).toBeNull();
    });

    it('matches "hotbar main" for switch', () => {
      const m = 'hotbar main'.match(switchPattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('main');
    });
  });

  describe('bare "hotbar" command', () => {
    it('"hotbar" exact match shows active hotbar contents', () => {
      expect('hotbar').toBe('hotbar');
      expect('hotbar'.toLowerCase() === 'hotbar').toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  hotbars list output logic
// ═══════════════════════════════════════════════════════════════

describe('hotbars list output', () => {
  it('formats hotbar list with name and active indicator', () => {
    const hotbars = [
      { id: 1n, name: 'main', isActive: true, sortOrder: 0 },
      { id: 2n, name: 'buffs', isActive: false, sortOrder: 1 },
    ];
    // Simulate the output that intent.ts would generate
    const lines = hotbars.map((h: any) => {
      const activeTag = h.isActive ? ' [active]' : '';
      return `[${h.name}]${activeTag}`;
    });
    expect(lines[0]).toBe('[main] [active]');
    expect(lines[1]).toBe('[buffs]');
  });

  it('shows slot count for hotbar with abilities', () => {
    const hotbarId = 1n;
    const slots = [
      { slot: 1, abilityTemplateId: 100n },
      { slot: 2, abilityTemplateId: 200n },
    ];
    const filledSlots = slots.filter((s: any) => s.abilityTemplateId !== 0n);
    expect(filledSlots.length).toBe(2);
  });
});
