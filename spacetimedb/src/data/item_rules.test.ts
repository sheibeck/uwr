import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  QUEST_ITEM_SALE_REFUSAL,
  USABLE_ITEM_KEYS,
  USE_ITEM_KEYS,
  isQuestItemTemplate,
  isRecipeScrollName,
  isSalvageableTemplate,
  isUsableItemName,
} from './item_rules';
import { EQUIPMENT_SLOTS } from './mechanical_vocabulary';

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('isQuestItemTemplate', () => {
  it('is true only for the quest slot', () => {
    expect(isQuestItemTemplate({ slot: 'quest' })).toBe(true);
    for (const slot of ['material', 'chest', '', null, undefined]) {
      expect(isQuestItemTemplate({ slot })).toBe(false);
    }
  });
});

describe('QUEST_ITEM_SALE_REFUSAL', () => {
  it("is exactly the owner's line", () => {
    expect(QUEST_ITEM_SALE_REFUSAL).toBe("Quest items can't be sold.");
  });
});

describe('use keys', () => {
  it('USE_ITEM_KEYS is the 10 names use_item accepts', () => {
    expect([...USE_ITEM_KEYS]).toEqual([
      'bandage',
      'basic_poultice',
      'travelers_tea',
      'simple_rations',
      'torch',
      'whetstone',
      'kindling_bundle',
      'rough_rope',
      'charcoal',
      'crude_poison',
    ]);
  });

  it('USABLE_ITEM_KEYS are the four effect names and a subset of USE_ITEM_KEYS', () => {
    expect([...USABLE_ITEM_KEYS]).toEqual(['bandage', 'basic_poultice', 'travelers_tea', 'simple_rations']);
    for (const key of USABLE_ITEM_KEYS) expect((USE_ITEM_KEYS as readonly string[]).indexOf(key)).not.toBe(-1);
  });

  it('isUsableItemName goes through the item key', () => {
    expect(isUsableItemName('Basic Poultice')).toBe(true);
    expect(isUsableItemName('Bandage')).toBe(true);
    expect(isUsableItemName('Travelers Tea')).toBe(true);
    expect(isUsableItemName('Simple  Rations')).toBe(true);
    expect(isUsableItemName('Torch')).toBe(false);
    expect(isUsableItemName('Iron Sword')).toBe(false);
    expect(isUsableItemName('')).toBe(false);
  });
});

describe('isSalvageableTemplate', () => {
  it('a non-junk template in each of the 12 equipment slots is salvageable', () => {
    for (const slot of EQUIPMENT_SLOTS) expect(isSalvageableTemplate({ slot, isJunk: false })).toBe(true);
    expect(isSalvageableTemplate({ slot: 'chest' })).toBe(true);
  });

  it('a junk template is not salvageable even in an equipment slot', () => {
    expect(isSalvageableTemplate({ slot: 'chest', isJunk: true })).toBe(false);
  });

  it('non-equipment slots are not salvageable', () => {
    for (const slot of ['consumable', 'food', 'resource', 'quest', 'junk', 'material', '', null, undefined]) {
      expect(isSalvageableTemplate({ slot, isJunk: false })).toBe(false);
    }
  });
});

describe('isRecipeScrollName', () => {
  it('matches the Scroll: prefix only', () => {
    expect(isRecipeScrollName('Scroll: Iron Helm')).toBe(true);
    expect(isRecipeScrollName('Iron Helm')).toBe(false);
    expect(isRecipeScrollName('scroll: Iron Helm')).toBe(false);
    expect(isRecipeScrollName('')).toBe(false);
  });
});

describe('import pin', () => {
  it('item_rules imports only ./crafting_rules and ./mechanical_vocabulary', () => {
    expect(new Set(importSpecifiers('item_rules.ts'))).toEqual(
      new Set(['./crafting_rules', './mechanical_vocabulary']),
    );
  });
});
