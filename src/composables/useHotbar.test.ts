import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════
//  useHotbar Multi-Hotbar Behavioral Tests (034-03)
//
//  Tests the multi-hotbar composable logic:
//    - hotbarList sorted by sortOrder
//    - prevHotbar wraps from first to last
//    - nextHotbar wraps from last to first
//    - hotbarDisplay always returns exactly 10 slots
//    - activeHotbar returns isActive=true hotbar or first
//
//  These tests extract and exercise the pure hotbar list/navigation
//  logic independently of the full composable.
// ═══════════════════════════════════════════════════════════════

// ── Helper: replicate hotbarList logic ──────────────────────────
// Returns hotbars filtered by characterId, sorted by sortOrder.
function computeHotbarList(hotbars: any[], characterId: bigint) {
  return hotbars
    .filter((h) => h.characterId === characterId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ── Helper: replicate activeHotbar logic ──────────────────────────
// Returns hotbar where isActive=true, or first in sorted list if none.
function computeActiveHotbar(hotbarList: any[]) {
  if (!hotbarList.length) return null;
  return hotbarList.find((h) => h.isActive) ?? hotbarList[0];
}

// ── Helper: replicate prevHotbar index logic ───────────────────
// Returns index of previous hotbar (wraps from 0 to last).
function prevHotbarIndex(hotbarList: any[], currentId: bigint): number {
  const idx = hotbarList.findIndex((h) => h.id === currentId);
  if (idx <= 0) return hotbarList.length - 1;
  return idx - 1;
}

// ── Helper: replicate nextHotbar index logic ───────────────────
// Returns index of next hotbar (wraps from last to 0).
function nextHotbarIndex(hotbarList: any[], currentId: bigint): number {
  const idx = hotbarList.findIndex((h) => h.id === currentId);
  if (idx < 0 || idx >= hotbarList.length - 1) return 0;
  return idx + 1;
}

// ── Helper: replicate hotbarDisplay slot count logic ──────────
// Always returns exactly 10 slots, filling empty slots where no assignment.
function computeHotbarDisplay(hotbarSlots: any[], activeHotbarId: bigint | null) {
  const slots: any[] = [];
  for (let i = 1; i <= 10; i++) {
    slots.push({ slot: i, abilityTemplateId: 0n, name: 'Empty' });
  }
  if (activeHotbarId == null) return slots;
  for (const row of hotbarSlots) {
    if (row.hotbarId !== activeHotbarId) continue;
    const target = slots[row.slot - 1];
    if (!target) continue;
    target.abilityTemplateId = row.abilityTemplateId;
    target.name = row.name ?? 'Unknown';
  }
  return slots;
}

// ── Mock data ──────────────────────────────────────────────────
const CHARACTER_ID = 42n;

const mockHotbars = [
  { id: 10n, characterId: CHARACTER_ID, name: 'main',   sortOrder: 0, isActive: true,  createdAt: { microsSinceUnixEpoch: 0n } },
  { id: 11n, characterId: CHARACTER_ID, name: 'buffs',  sortOrder: 1, isActive: false, createdAt: { microsSinceUnixEpoch: 0n } },
  { id: 12n, characterId: CHARACTER_ID, name: 'spells', sortOrder: 2, isActive: false, createdAt: { microsSinceUnixEpoch: 0n } },
];

// Out-of-order sortOrder to verify sorting
const mockHotbarsUnsorted = [
  { id: 12n, characterId: CHARACTER_ID, name: 'spells', sortOrder: 2, isActive: false, createdAt: { microsSinceUnixEpoch: 0n } },
  { id: 10n, characterId: CHARACTER_ID, name: 'main',   sortOrder: 0, isActive: true,  createdAt: { microsSinceUnixEpoch: 0n } },
  { id: 11n, characterId: CHARACTER_ID, name: 'buffs',  sortOrder: 1, isActive: false, createdAt: { microsSinceUnixEpoch: 0n } },
];

// Hotbar for a different character — should be filtered out
const otherCharHotbar = {
  id: 99n, characterId: 999n, name: 'other', sortOrder: 0, isActive: true, createdAt: { microsSinceUnixEpoch: 0n },
};

// Hotbar slots on active hotbar (id 10n)
const mockHotbarSlots = [
  { id: 100n, characterId: CHARACTER_ID, hotbarId: 10n, slot: 1, abilityTemplateId: 501n, name: 'Fireball', assignedAt: { microsSinceUnixEpoch: 0n } },
  { id: 101n, characterId: CHARACTER_ID, hotbarId: 10n, slot: 5, abilityTemplateId: 502n, name: 'Heal',     assignedAt: { microsSinceUnixEpoch: 0n } },
  { id: 102n, characterId: CHARACTER_ID, hotbarId: 11n, slot: 1, abilityTemplateId: 503n, name: 'Haste',    assignedAt: { microsSinceUnixEpoch: 0n } },
];

// ── Tests ──────────────────────────────────────────────────────

describe('hotbarList', () => {
  it('returns hotbars sorted by sortOrder regardless of insert order', () => {
    const list = computeHotbarList([...mockHotbarsUnsorted, otherCharHotbar], CHARACTER_ID);
    expect(list.map((h) => h.sortOrder)).toEqual([0, 1, 2]);
  });

  it('filters out hotbars belonging to other characters', () => {
    const list = computeHotbarList([...mockHotbars, otherCharHotbar], CHARACTER_ID);
    expect(list).toHaveLength(3);
    expect(list.every((h) => h.characterId === CHARACTER_ID)).toBe(true);
  });

  it('returns empty array when character has no hotbars', () => {
    const list = computeHotbarList(mockHotbars, 9999n);
    expect(list).toHaveLength(0);
  });
});

describe('activeHotbar', () => {
  it('returns the hotbar where isActive is true', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const active = computeActiveHotbar(list);
    expect(active?.name).toBe('main');
    expect(active?.isActive).toBe(true);
  });

  it('returns the first hotbar when none have isActive=true', () => {
    const noActiveHotbars = mockHotbars.map((h) => ({ ...h, isActive: false }));
    const list = computeHotbarList(noActiveHotbars, CHARACTER_ID);
    const active = computeActiveHotbar(list);
    // First by sortOrder is 'main' (sortOrder: 0)
    expect(active?.name).toBe('main');
  });

  it('returns null when hotbarList is empty', () => {
    const active = computeActiveHotbar([]);
    expect(active).toBeNull();
  });
});

describe('prevHotbar navigation', () => {
  it('returns last hotbar index when current is first (sortOrder 0)', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const firstId = list[0].id; // sortOrder=0 => id=10n
    const prevIdx = prevHotbarIndex(list, firstId);
    expect(prevIdx).toBe(2); // wraps to last (sortOrder=2)
  });

  it('returns previous hotbar index from middle', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const middleId = list[1].id; // sortOrder=1 => id=11n
    const prevIdx = prevHotbarIndex(list, middleId);
    expect(prevIdx).toBe(0);
  });

  it('returns previous hotbar name "buffs" when wrapping from "spells"', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const lastId = list[2].id; // 'spells'
    const prevIdx = prevHotbarIndex(list, lastId);
    expect(list[prevIdx].name).toBe('buffs');
  });
});

describe('nextHotbar navigation', () => {
  it('returns first hotbar index when current is last (wraps to beginning)', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const lastId = list[2].id; // sortOrder=2 => 'spells'
    const nextIdx = nextHotbarIndex(list, lastId);
    expect(nextIdx).toBe(0); // wraps to first
  });

  it('returns next hotbar index from beginning', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const firstId = list[0].id; // 'main'
    const nextIdx = nextHotbarIndex(list, firstId);
    expect(nextIdx).toBe(1);
  });

  it('returns next hotbar name "spells" when advancing from "buffs"', () => {
    const list = computeHotbarList(mockHotbars, CHARACTER_ID);
    const buffId = list[1].id; // 'buffs'
    const nextIdx = nextHotbarIndex(list, buffId);
    expect(list[nextIdx].name).toBe('spells');
  });
});

describe('hotbarDisplay slot count', () => {
  it('always returns exactly 10 slots even with no assignments', () => {
    const display = computeHotbarDisplay([], null);
    expect(display).toHaveLength(10);
  });

  it('always returns exactly 10 slots with partial assignments', () => {
    const activeId = 10n;
    const display = computeHotbarDisplay(mockHotbarSlots, activeId);
    expect(display).toHaveLength(10);
  });

  it('populates assigned slot 1 with Fireball', () => {
    const activeId = 10n;
    const display = computeHotbarDisplay(mockHotbarSlots, activeId);
    expect(display[0].abilityTemplateId).toBe(501n);
    expect(display[0].name).toBe('Fireball');
  });

  it('leaves unassigned slots with empty abilityTemplateId (0n)', () => {
    const activeId = 10n;
    const display = computeHotbarDisplay(mockHotbarSlots, activeId);
    // Slot 2 through 4 should be empty (slot index 1,2,3)
    expect(display[1].abilityTemplateId).toBe(0n);
    expect(display[1].name).toBe('Empty');
  });

  it('does not show slots from other hotbars (hotbarId 11n)', () => {
    const activeId = 10n;
    const display = computeHotbarDisplay(mockHotbarSlots, activeId);
    // hotbarId 11n has Haste in slot 1 — should NOT appear since we're viewing hotbar 10n
    // slot 1 for hotbar 10n is Fireball
    expect(display[0].name).toBe('Fireball');
  });
});
