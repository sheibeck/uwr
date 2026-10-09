import { describe, expect, it } from 'vitest';
import { tables } from '../module_bindings';
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
    expect(q.enemySpawnsAt(3n)).toContain('"enemy_spawn"');
    expect(q.enemySpawnsAt(3n)).toContain('"location_id" = 3');
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
      [q.resourceGathers(9n), 'resource_gather'],
      [q.characterCasts(9n), 'character_cast'],
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

describe('gameQueries: combat', () => {
  it('filters the own participant and own choice rows by character_id', () => {
    expect(q.combatParticipantsOf(5n)).toContain('FROM "combat_participant"');
    expect(q.combatParticipantsOf(5n)).toContain('"character_id" = 5');
    expect(q.combatActions(5n)).toContain('FROM "combat_action"');
    expect(q.combatActions(5n)).toContain('"character_id" = 5');
  });

  it('filters the fight tables by combat_id', () => {
    const cases: Array<[string, string]> = [
      [q.combatParticipants(10n), 'combat_participant'],
      [q.combatEnemies(10n), 'combat_enemy'],
      [q.combatRounds(10n), 'combat_round'],
      [q.combatCasts(10n), 'combat_enemy_cast'],
      [q.combatNarratives(10n), 'combat_narrative'],
      [q.combatEnemyEffects(10n), 'combat_enemy_effect'],
    ];
    for (const [sql, table] of cases) {
      expect(sql).toContain(`FROM "${table}"`);
      expect(sql).toContain('"combat_id" = 10');
    }
  });

  it('selects the own fight combat_encounter row by its id, the combat id (51.3.1.1-31)', () => {
    const sql = q.combatEncounter(10n);
    expect(sql).toContain('FROM "combat_encounter"');
    expect(sql).toContain('"id" = 10');
    expect(sql).not.toContain(' OR ');
  });

  it('selects the fight pets through the fight roster, never a literal on the optional combat_id', () => {
    // active_pet.combat_id is u64 OPTIONAL: SpacetimeDB rejects `combat_id = 10` ("cannot be parsed as
    // type (some: U64 | none: ())"), so pets came through no subscription (51.3.1.1-31). The pets of the
    // fight are the pets of its participants: a semijoin on the indexed character_id columns.
    const sql = q.combatPets(10n);
    expect(sql).toBe(
      'SELECT "active_pet".* FROM "combat_participant" JOIN "active_pet" ON "combat_participant"."character_id" = "active_pet"."character_id" WHERE "combat_participant"."combat_id" = 10',
    );
    expect(sql).not.toContain('"active_pet"."combat_id"');
  });

  it('builds OR chains for enemy templates and enemy abilities', () => {
    const templates = q.enemyTemplatesById([3n, 4n]);
    expect(templates).toContain('FROM "enemy_template"');
    expect(templates).toContain('"id" = 3');
    expect(templates).toContain('"id" = 4');
    expect(templates).toContain(' OR ');
    const abilities = q.enemyAbilitiesByTemplate([3n, 4n]);
    expect(abilities).toContain('FROM "enemy_ability"');
    expect(abilities).toContain('"enemy_template_id" = 3');
    expect(abilities).toContain('"enemy_template_id" = 4');
    expect(abilities).toContain(' OR ');
    expect(q.enemyTemplatesById([3n])).not.toContain(' OR ');
  });

  it('refuses an empty template or ability list', () => {
    expect(() => q.enemyTemplatesById([])).toThrow();
    expect(() => q.enemyAbilitiesByTemplate([])).toThrow();
  });

  it('selects the threat view whole, with no WHERE', () => {
    expect(q.myCombatAggro).toContain('SELECT * FROM "my_combat_aggro"');
    expect(q.myCombatAggro).not.toContain('WHERE');
  });

  it('selects the loot view whole, with no WHERE (quick 261008-f3m)', () => {
    expect(q.myCombatLoot).toContain('SELECT * FROM "my_combat_loot"');
    expect(q.myCombatLoot).not.toContain('WHERE');
  });

  it('puts a WHERE on every keyed combat query', () => {
    for (const sql of [
      q.combatParticipantsOf(1n),
      q.combatActions(1n),
      q.combatParticipants(1n),
      q.combatEnemies(1n),
      q.combatRounds(1n),
      q.combatCasts(1n),
      q.combatNarratives(1n),
      q.combatPets(1n),
      q.combatEnemyEffects(1n),
      q.combatEncounter(1n),
      q.enemyTemplatesById([1n]),
      q.enemyAbilitiesByTemplate([1n]),
    ]) {
      expect(sql).toContain('WHERE');
    }
  });
});

describe('gameQueries: density pools (51.3.1.1-18)', () => {
  it('selects pool_level by region with an OR chain on region_id', () => {
    const sql = q.poolLevelsInRegions([1n, 2n]);
    expect(sql).toContain('FROM "pool_level"');
    expect(sql).toContain('"region_id" = 1');
    expect(sql).toContain('"region_id" = 2');
    expect(sql).toContain(' OR ');
    expect(q.poolLevelsInRegions([4n])).not.toContain(' OR ');
  });

  it('refuses an empty region list', () => {
    expect(() => q.poolLevelsInRegions([])).toThrow();
  });

  it('selects the own named enemies by character_id', () => {
    const sql = q.namedEnemiesOf(7n);
    expect(sql).toContain('FROM "named_enemy"');
    expect(sql).toContain('"character_id" = 7');
  });

  it('selects the harvest-cap and visited-place views whole, with no WHERE', () => {
    expect(q.myHarvestCaps).toContain('SELECT * FROM "my_harvest_caps"');
    expect(q.myHarvestCaps).not.toContain('WHERE');
    expect(q.myVisitedLocations).toContain('SELECT * FROM "my_visited_locations"');
    expect(q.myVisitedLocations).not.toContain('WHERE');
  });

  it('has no resource_node query any more', () => {
    expect((q as unknown as Record<string, unknown>).resourceNodesAt).toBeUndefined();
    for (const value of Object.values(q)) {
      if (typeof value === 'string') expect(value).not.toContain('resource_node');
    }
  });
});

describe('gameQueries: every literal compares a column the server can parse it as (51.3.1.1-31)', () => {
  type Column = { typeBuilder: { algebraicType: { tag: string; value?: { variants?: Array<{ name: string }> } } }; columnMetadata?: { name?: string } };
  type TableLike = { sourceName: string; columns: Record<string, Column> };

  const bySource = new Map<string, TableLike>();
  for (const table of Object.values(tables) as unknown as TableLike[]) bySource.set(table.sourceName, table);

  function columnOf(table: string, column: string): Column | undefined {
    const def = bySource.get(table);
    if (def === undefined) return undefined;
    for (const [key, col] of Object.entries(def.columns)) {
      if ((col.columnMetadata?.name ?? key) === column) return col;
    }
    return undefined;
  }

  function isOption(col: Column): boolean {
    const type = col.typeBuilder.algebraicType;
    const variants = type.tag === 'Sum' ? (type.value?.variants ?? []) : [];
    return variants.length === 2 && variants[0].name === 'some' && variants[1].name === 'none';
  }

  /** Every SQL string gameQueries can build, with sample ids. */
  function everySql(): string[] {
    const out: string[] = [];
    for (const value of Object.values(q) as unknown[]) {
      if (typeof value === 'string') {
        out.push(value);
        continue;
      }
      const build = value as (arg: unknown) => string;
      try {
        out.push(build(7n));
      } catch {
        out.push(build([7n, 8n]));
      }
    }
    return out;
  }

  const LITERAL = /"(\w+)"\."(\w+)" (?:=|<>|<=|>=|<|>) (?:-?\d+|'(?:[^']|'')*'|TRUE|FALSE|NULL|0x[0-9a-fA-F]+)/g;

  it('finds the tables and columns of every comparison', () => {
    let compared = 0;
    for (const sql of everySql()) {
      for (const match of sql.matchAll(LITERAL)) {
        compared += 1;
        expect(columnOf(match[1], match[2]), `${match[1]}.${match[2]}`).toBeDefined();
      }
    }
    expect(compared).toBeGreaterThan(30);
  });

  it('never compares an optional column with a bare literal', () => {
    const optional: string[] = [];
    for (const sql of everySql()) {
      for (const match of sql.matchAll(LITERAL)) {
        const col = columnOf(match[1], match[2]);
        if (col !== undefined && isOption(col)) optional.push(match[0]);
      }
    }
    expect(optional).toEqual([]);
  });
});
