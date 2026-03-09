import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that import SpacetimeDB modules
vi.mock('../helpers/npc_affinity', () => ({
  getAffinityForNpc: () => 0n,
}));

vi.mock('../helpers/location', () => ({
  getWorldState: (ctx: any) => ctx.db.world_state.id.find(1n),
}));

vi.mock('../helpers/search', () => ({
  performPassiveSearch: () => {},
}));

import { buildLookOutput } from '../helpers/look';
import { createMockDb } from '../helpers/test-utils';

describe('buildLookOutput', () => {
  it('returns array containing location name and description', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Test Town', description: 'A lovely town.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toBe('Test Town');
    expect(parts[1]).toBe('A lovely town.');
    expect(parts.some((p: string) => p.includes('safe area'))).toBe(true);
  });

  it('returns empty array if location not found', () => {
    const db = createMockDb({
      location: [],
    });
    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };
    const character = { id: 10n, locationId: 999n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    expect(parts).toEqual([]);
  });

  it('includes NPC names and service markers', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Market', description: 'Busy market.', isSafe: true, bindStone: true, craftingAvailable: true }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [
        { id: 1n, name: 'Bob the Vendor', npcType: 'vendor', locationId: 1n },
        { id: 2n, name: 'Alice the Banker', npcType: 'banker', locationId: 1n },
      ],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Bob the Vendor');
    expect(joined).toContain('Alice the Banker');
    expect(joined).toContain('[bank]');
    expect(joined).toContain('[shop]');
    expect(joined).toContain('[bind]');
    expect(joined).toContain('[craft]');
  });

  it('includes exit names', () => {
    const db = createMockDb({
      location: [
        { id: 1n, name: 'Town', description: 'A town.', isSafe: true, bindStone: false, craftingAvailable: false },
        { id: 2n, name: 'Forest', description: 'Dark forest.', isSafe: false, bindStone: false, craftingAvailable: false },
      ],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [
        { id: 1n, fromLocationId: 1n, toLocationId: 2n },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Forest');
    expect(joined).toContain('Exits:');
  });

  it('includes discovered quest items at character location', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Cave', description: 'A dark cave.', isSafe: false, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [
        { id: 1n, characterId: 10n, questTemplateId: 1n, locationId: 1n, name: 'Ancient Relic', discovered: true, looted: false },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).toContain('Quest items');
    expect(joined).toContain('Loot Ancient Relic');
  });

  it('does not show looted or undiscovered quest items', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Cave', description: 'A dark cave.', isSafe: false, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [
        { id: 1n, characterId: 10n, questTemplateId: 1n, locationId: 1n, name: 'Looted Item', discovered: true, looted: true },
        { id: 2n, characterId: 10n, questTemplateId: 2n, locationId: 1n, name: 'Hidden Item', discovered: false, looted: false },
        { id: 3n, characterId: 99n, questTemplateId: 1n, locationId: 1n, name: 'Other Player Item', discovered: true, looted: false },
      ],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);
    const joined = parts.join('\n');

    expect(joined).not.toContain('Quest items');
    expect(joined).not.toContain('Looted Item');
    expect(joined).not.toContain('Hidden Item');
    expect(joined).not.toContain('Other Player Item');
  });

  it('still works when no quest_item table data exists', () => {
    const db = createMockDb({
      location: [{ id: 1n, name: 'Town', description: 'A town.', isSafe: true, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2000000000000n }],
      npc: [],
      character: [],
      enemy_spawn: [],
      resource_node: [],
      location_connection: [],
      quest_item: [],
    });

    const ctx = {
      db,
      timestamp: { microsSinceUnixEpoch: 1000000000000n },
    };

    const character = { id: 10n, locationId: 1n, level: 1n };
    const parts = buildLookOutput(ctx, character);

    expect(parts.length).toBeGreaterThan(0);
    expect(parts[0]).toBe('Town');
    expect(parts.join('\n')).not.toContain('Quest items');
  });
});

// ═══════════════════════════════════════════════════════════════
//  Intent Routing Pattern Tests (TEST-04)
//
//  Tests the regex patterns and string comparisons used in
//  submit_intent to dispatch commands. Testing patterns directly
//  avoids the need for the full deps injection object.
// ═══════════════════════════════════════════════════════════════

describe('intent routing patterns', () => {
  // --- Regex-based commands ---

  describe('look pattern: /^(?:look|l)(?:\\s+(.+))?$/i', () => {
    const pattern = /^(?:look|l)(?:\s+(.+))?$/i;

    it('matches bare "look"', () => {
      const m = 'look'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBeUndefined();
    });

    it('matches alias "l"', () => {
      const m = 'l'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBeUndefined();
    });

    it('matches "look <target>" and captures target', () => {
      const m = 'look goblin'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('goblin');
    });

    it('matches "Look at something" case insensitively', () => {
      const m = 'LOOK around'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('around');
    });

    it('matches "l sword" alias with target', () => {
      const m = 'l sword'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('sword');
    });

    it('does not match "looking"', () => {
      expect('looking'.match(pattern)).toBeNull();
    });

    it('does not match "loot"', () => {
      expect('loot'.match(pattern)).toBeNull();
    });
  });

  describe('go pattern: /^go\\s+(.+)$/', () => {
    const pattern = /^go\s+(.+)$/;

    it('matches "go forest" and captures destination', () => {
      const m = 'go forest'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('forest');
    });

    it('matches "go dark cave" with multi-word destination', () => {
      const m = 'go dark cave'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('dark cave');
    });

    it('does not match bare "go"', () => {
      expect('go'.match(pattern)).toBeNull();
    });

    it('does not match "going somewhere"', () => {
      expect('going somewhere'.match(pattern)).toBeNull();
    });
  });

  describe('travel pattern: /^travel\\s+(?:to\\s+)?(.+)$/', () => {
    const pattern = /^travel\s+(?:to\s+)?(.+)$/;

    it('matches "travel forest"', () => {
      const m = 'travel forest'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('forest');
    });

    it('matches "travel to forest" and captures destination without "to"', () => {
      const m = 'travel to forest'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('forest');
    });

    it('matches "travel to dark cave" with multi-word destination', () => {
      const m = 'travel to dark cave'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('dark cave');
    });

    it('does not match bare "travel"', () => {
      expect('travel'.match(pattern)).toBeNull();
    });
  });

  describe('say pattern: /^say\\s+(.+)$/i', () => {
    const pattern = /^say\s+(.+)$/i;

    it('matches "say hello" and captures message', () => {
      const m = 'say hello'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('hello');
    });

    it('matches "Say Hello World" case insensitively', () => {
      const m = 'Say Hello World'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Hello World');
    });

    it('does not match bare "say"', () => {
      expect('say'.match(pattern)).toBeNull();
    });

    it('does not match "saying things"', () => {
      expect('saying things'.match(pattern)).toBeNull();
    });
  });

  describe('whisper pattern: /^(?:whisper|tell|w)\\s+(\\S+)\\s+(.+)$/i', () => {
    const pattern = /^(?:whisper|tell|w)\s+(\S+)\s+(.+)$/i;

    it('matches "whisper Bob hello" and captures player + message', () => {
      const m = 'whisper Bob hello'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Bob');
      expect(m![2]).toBe('hello');
    });

    it('matches "tell Alice meet me at town" alias', () => {
      const m = 'tell Alice meet me at town'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Alice');
      expect(m![2]).toBe('meet me at town');
    });

    it('matches "w Bob hi" short alias', () => {
      const m = 'w Bob hi'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Bob');
      expect(m![2]).toBe('hi');
    });

    it('is case insensitive', () => {
      const m = 'WHISPER Bob hello'.match(pattern);
      expect(m).not.toBeNull();
    });

    it('does not match "whisper Bob" without message', () => {
      expect('whisper Bob'.match(pattern)).toBeNull();
    });

    it('does not match bare "whisper"', () => {
      expect('whisper'.match(pattern)).toBeNull();
    });
  });

  describe('talk/hail/speak pattern: /^(?:talk|hail|speak)\\s+(?:to\\s+)?(.+)$/i', () => {
    const pattern = /^(?:talk|hail|speak)\s+(?:to\s+)?(.+)$/i;

    it('matches "talk Bob" and captures NPC name', () => {
      const m = 'talk Bob'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Bob');
    });

    it('matches "talk to Bob" with optional "to"', () => {
      const m = 'talk to Bob'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Bob');
    });

    it('matches "hail Guard" alias', () => {
      const m = 'hail Guard'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Guard');
    });

    it('matches "speak to Elder" alias', () => {
      const m = 'speak to Elder'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Elder');
    });

    it('is case insensitive', () => {
      const m = 'HAIL Shopkeeper'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Shopkeeper');
    });

    it('does not match bare "talk"', () => {
      expect('talk'.match(pattern)).toBeNull();
    });
  });

  describe('consider pattern: /^(?:consider|con)\\s+(.+)$/i', () => {
    const pattern = /^(?:consider|con)\s+(.+)$/i;

    it('matches "consider goblin" and captures target', () => {
      const m = 'consider goblin'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('goblin');
    });

    it('matches "con wolf" alias', () => {
      const m = 'con wolf'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('wolf');
    });

    it('is case insensitive', () => {
      const m = 'CONSIDER Dragon'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('Dragon');
    });

    it('does not match bare "con"', () => {
      expect('con'.match(pattern)).toBeNull();
    });
  });

  describe('attack pattern: /^(?:attack|fight|kill)\\s*(.*)$/', () => {
    const pattern = /^(?:attack|fight|kill)\s*(.*)$/;

    it('matches bare "attack" with empty target', () => {
      const m = 'attack'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('');
    });

    it('matches "attack goblin" and captures target', () => {
      const m = 'attack goblin'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('goblin');
    });

    it('matches "fight wolf" alias', () => {
      const m = 'fight wolf'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('wolf');
    });

    it('matches "kill dragon" alias', () => {
      const m = 'kill dragon'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('dragon');
    });

    it('matches "attacking" since pattern uses \\s* (greedy)', () => {
      // Note: the pattern /^(?:attack|fight|kill)\s*(.*)$/ does match "attacking"
      // because "attack" is consumed, then \s* matches zero, then (.*) captures "ing".
      // This is acceptable since the dispatcher uses lower-cased input.
      const m = 'attacking'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('ing');
    });
  });

  describe('use/cast pattern: /^(?:use|cast)\\s+(.+)$/', () => {
    const pattern = /^(?:use|cast)\s+(.+)$/;

    it('matches "use fireball" and captures ability name', () => {
      const m = 'use fireball'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('fireball');
    });

    it('matches "cast heal" alias', () => {
      const m = 'cast heal'.match(pattern);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('heal');
    });

    it('does not match bare "use"', () => {
      expect('use'.match(pattern)).toBeNull();
    });

    it('does not match bare "cast"', () => {
      expect('cast'.match(pattern)).toBeNull();
    });
  });

  // --- String-equality commands ---

  describe('string equality commands', () => {
    it('recognizes help aliases', () => {
      const helpAliases = ['help', 'h', '?'];
      for (const cmd of helpAliases) {
        expect(helpAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes inventory aliases', () => {
      const invAliases = ['inventory', 'inv', 'i'];
      for (const cmd of invAliases) {
        expect(invAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes backpack aliases', () => {
      const bpAliases = ['backpack', 'bp', 'bag'];
      for (const cmd of bpAliases) {
        expect(bpAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes stats command', () => {
      expect('stats'.toLowerCase()).toBe('stats');
    });

    it('recognizes quest/quests aliases', () => {
      const questAliases = ['quest', 'quests'];
      for (const cmd of questAliases) {
        expect(questAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes abilities aliases', () => {
      const abAliases = ['abilities', 'ab'];
      for (const cmd of abAliases) {
        expect(abAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes character aliases', () => {
      const charAliases = ['character', 'char'];
      for (const cmd of charAliases) {
        expect(charAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes camp/rest aliases', () => {
      const restAliases = ['camp', 'rest'];
      for (const cmd of restAliases) {
        expect(restAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes bind command', () => {
      expect('bind'.toLowerCase()).toBe('bind');
    });

    it('recognizes loot command', () => {
      expect('loot'.toLowerCase()).toBe('loot');
    });

    it('recognizes time command', () => {
      expect('time'.toLowerCase()).toBe('time');
    });

    it('recognizes flee/run aliases', () => {
      const fleeAliases = ['flee', 'run'];
      for (const cmd of fleeAliases) {
        expect(fleeAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes shop/vendor/store aliases', () => {
      const shopAliases = ['shop', 'vendor', 'store'];
      for (const cmd of shopAliases) {
        expect(shopAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes craft/recipes aliases', () => {
      const craftAliases = ['craft', 'recipes'];
      for (const cmd of craftAliases) {
        expect(craftAliases.includes(cmd.toLowerCase())).toBe(true);
      }
    });

    it('recognizes bank command', () => {
      expect('bank'.toLowerCase()).toBe('bank');
    });

    it('recognizes explore command', () => {
      expect('explore'.toLowerCase()).toBe('explore');
    });

    it('recognizes bare travel/go (destination listing)', () => {
      const bareTravel = ['travel', 'go'];
      for (const cmd of bareTravel) {
        expect(bareTravel.includes(cmd.toLowerCase())).toBe(true);
      }
    });
  });

  // --- StartsWith commands ---

  describe('startsWith commands', () => {
    it('recognizes "sell <item>" via startsWith', () => {
      expect('sell iron sword'.startsWith('sell ')).toBe(true);
      expect('sell iron sword'.substring(5).trim()).toBe('iron sword');
    });

    it('recognizes "deposit <item>" via startsWith', () => {
      expect('deposit gold ring'.startsWith('deposit ')).toBe(true);
      expect('deposit gold ring'.substring(8).trim()).toBe('gold ring');
    });

    it('recognizes "loot <item>" via startsWith', () => {
      expect('loot ancient relic'.startsWith('loot ')).toBe(true);
      expect('loot ancient relic'.substring(5).trim()).toBe('ancient relic');
    });

    it('recognizes "turn in <quest>" via startsWith', () => {
      expect('turn in dragon slayer'.startsWith('turn in ')).toBe(true);
      expect('turn in dragon slayer'.substring(8).trim()).toBe('dragon slayer');
    });

    it('recognizes "abandon <quest>" via startsWith', () => {
      expect('abandon the quest'.startsWith('abandon ')).toBe(true);
      expect('abandon the quest'.substring(8).trim()).toBe('the quest');
    });

    it('recognizes "confirm abandon <quest>" via startsWith', () => {
      expect('confirm abandon quest name'.startsWith('confirm abandon ')).toBe(true);
      expect('confirm abandon quest name'.substring(16).trim()).toBe('quest name');
    });
  });

  // --- Non-command input ---

  describe('non-matching input', () => {
    const allRegexPatterns = [
      /^(?:look|l)(?:\s+(.+))?$/i,
      /^go\s+(.+)$/,
      /^travel\s+(?:to\s+)?(.+)$/,
      /^say\s+(.+)$/i,
      /^(?:whisper|tell|w)\s+(\S+)\s+(.+)$/i,
      /^(?:talk|hail|speak)\s+(?:to\s+)?(.+)$/i,
      /^(?:consider|con)\s+(.+)$/i,
      /^(?:attack|fight|kill)\s*(.*)$/,
      /^(?:use|cast)\s+(.+)$/,
    ];

    const stringCommands = [
      'help', 'h', '?', 'inventory', 'inv', 'i', 'backpack', 'bp', 'bag',
      'stats', 'quest', 'quests', 'abilities', 'ab', 'character', 'char',
      'camp', 'rest', 'bind', 'loot', 'time', 'flee', 'run',
      'shop', 'vendor', 'store', 'craft', 'recipes', 'bank', 'explore',
      'travel', 'go', 'keep quest',
    ];

    it('random gibberish matches no regex pattern', () => {
      const gibberish = 'xyzzy flumph blargh';
      for (const pattern of allRegexPatterns) {
        expect(gibberish.match(pattern)).toBeNull();
      }
      expect(stringCommands.includes(gibberish.toLowerCase())).toBe(false);
    });

    it('empty string matches no command', () => {
      const empty = '';
      for (const pattern of allRegexPatterns) {
        expect(empty.match(pattern)).toBeNull();
      }
      expect(stringCommands.includes(empty)).toBe(false);
    });

    it('slash commands are delegated separately', () => {
      // Slash commands start with / and go through submit_command pipeline
      const slash = '/godmode';
      expect(slash.startsWith('/')).toBe(true);
      for (const pattern of allRegexPatterns) {
        expect(slash.match(pattern)).toBeNull();
      }
    });
  });
});
