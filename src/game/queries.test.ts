import { describe, expect, it } from 'vitest';
import { gameQueries } from './queries';

const q = gameQueries();

describe('gameQueries: event tables', () => {
  it('filters event_private by owner_user_id', () => {
    const sql = q.eventPrivate(7n);
    expect(sql).toContain('"event_private"');
    expect(sql).toContain('"owner_user_id" = 7');
  });

  it('filters event_location by location_id', () => {
    const sql = q.eventLocation(3n);
    expect(sql).toContain('"event_location"');
    expect(sql).toContain('"location_id" = 3');
  });

  it('filters event_group by group_id', () => {
    const sql = q.eventGroup(4n);
    expect(sql).toContain('"event_group"');
    expect(sql).toContain('"group_id" = 4');
  });

  it('leaves event_world global', () => {
    expect(q.eventWorld).toContain('"event_world"');
    expect(q.eventWorld).not.toContain('WHERE');
  });

  it('puts a WHERE on every private, location and group event query', () => {
    for (const sql of [q.eventPrivate(1n), q.eventLocation(1n), q.eventGroup(1n)]) {
      expect(sql).toContain('WHERE');
    }
  });
});

describe('gameQueries: keyed tables', () => {
  it('filters by location', () => {
    expect(q.npcsAt(3n)).toContain('"npc"');
    expect(q.npcsAt(3n)).toContain('"location_id" = 3');
    expect(q.resourceNodesAt(3n)).toContain('"resource_node"');
    expect(q.resourceNodesAt(3n)).toContain('"location_id" = 3');
    expect(q.charactersAt(3n)).toContain('"character"');
    expect(q.charactersAt(3n)).toContain('"location_id" = 3');
    expect(q.connectionsFrom(3n)).toContain('"location_connection"');
    expect(q.connectionsFrom(3n)).toContain('"from_location_id" = 3');
  });

  it('filters per-character tables by character_id', () => {
    const cases: Array<[string, string]> = [
      [q.hotbars(9n), 'hotbar'],
      [q.hotbarSlots(9n), 'hotbar_slot'],
      [q.abilityTemplates(9n), 'ability_template'],
      [q.abilityCooldowns(9n), 'ability_cooldown'],
      [q.eventContributions(9n), 'event_contribution'],
      [q.renown(9n), 'renown'],
      [q.renownPerks(9n), 'renown_perk'],
    ];
    for (const [sql, table] of cases) {
      expect(sql).toContain(`FROM "${table}"`);
      expect(sql).toContain('"character_id" = 9');
    }
  });

  it('filters group tables', () => {
    expect(q.group(4n)).toContain('FROM "group"');
    expect(q.group(4n)).toContain('"id" = 4');
    expect(q.groupMembers(4n)).toContain('"group_member"');
    expect(q.groupMembers(4n)).toContain('"group_id" = 4');
  });

  it('filters active world events by status', () => {
    expect(q.activeWorldEvents).toContain('"world_event"');
    expect(q.activeWorldEvents).toContain('"status" = ');
    expect(q.activeWorldEvents).toContain('active');
  });
});

describe('gameQueries: id lists', () => {
  it('joins an id list with OR', () => {
    const sql = q.charactersById([5n, 6n]);
    expect(sql).toContain('= 5');
    expect(sql).toContain('= 6');
    expect(sql).toContain(' OR ');
    expect(q.charactersById([5n])).not.toContain(' OR ');
  });

  it('builds quest template and event objective lists', () => {
    const quests = q.questTemplatesById([1n, 2n]);
    expect(quests).toContain('"quest_template"');
    expect(quests).toContain(' OR ');
    const objectives = q.eventObjectivesByEvent([8n, 9n]);
    expect(objectives).toContain('"event_objective"');
    expect(objectives).toContain('"event_id" = 8');
    expect(objectives).toContain('"event_id" = 9');
    expect(objectives).toContain(' OR ');
  });

  it('refuses an empty list', () => {
    expect(() => q.charactersById([])).toThrow();
    expect(() => q.questTemplatesById([])).toThrow();
    expect(() => q.eventObjectivesByEvent([])).toThrow();
  });
});

describe('gameQueries: unfiltered tables', () => {
  it('selects the views and faction whole, with no WHERE', () => {
    const cases: Array<[string, string]> = [
      [q.myCharacterEffects, 'my_character_effects'],
      [q.myQuests, 'my_quests'],
      [q.myLlmJobs, 'my_llm_jobs'],
      [q.myGroupInvites, 'my_group_invites'],
      [q.myFactionStandings, 'my_faction_standings'],
      [q.faction, 'faction'],
    ];
    for (const [sql, table] of cases) {
      expect(sql).toContain(`SELECT * FROM "${table}"`);
      expect(sql).not.toContain('WHERE');
    }
  });
});
