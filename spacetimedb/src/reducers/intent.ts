import { getAffinityForNpc } from '../helpers/npc_affinity';
import { getWorldState } from '../helpers/location';

export const registerIntentReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    appendPrivateEvent,
    appendLocationEvent,
    activeCombatIdForCharacter,
    areLocationsConnected,
    fail,
  } = deps;

  spacetimedb.reducer('submit_intent', { characterId: t.u64(), text: t.string() }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }

    const raw = args.text.trim();
    if (!raw) return fail(ctx, character, 'You stare into the void. It stares back.');

    // Slash commands: delegate to existing submit_command pipeline
    if (raw.startsWith('/')) {
      ctx.db.command.insert({
        id: 0n,
        ownerUserId: requirePlayerUserId(ctx),
        characterId: character.id,
        text: raw,
        status: 'pending',
        createdAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'command', `> ${raw}`);
      return;
    }

    const lower = raw.toLowerCase();

    // --- HELP ---
    if (lower === 'help' || lower === 'h' || lower === '?') {
      const helpText = [
        'Commands:',
        '  [look] (l) — Survey your surroundings. Shows location, NPCs, enemies, resources, exits.',
        '  [look] <name> — Inspect a specific NPC, enemy, or player.',
        '  [inventory] (inv, i) — View your equipped gear with stats.',
        '  [backpack] (bp, bag) — View your unequipped items.',
        '  go <place> — Travel to a connected location. You can also type the location name directly.',
        '  [travel] — List available destinations.',
        '  say <message> — Speak aloud for everyone at your location to hear.',
        '  whisper <name> <message> — Send a private message to another player.',
        '  hail <name> — Start a conversation with an NPC.',
        '  con <name> — Assess the threat level of an enemy or your standing with an NPC.',
        '  attack — Engage enemies at your location.',
        '  flee — Attempt to escape from combat.',
        '  [stats] — View your character stats.',
        '  [bank] — Access your bank vault (at locations with a banker).',
        '  [shop] — Browse a vendor\'s wares (at locations with a vendor).',
        '  [craft] — View and craft known recipes (at crafting stations).',
        '  [loot] — Check for lootable remains nearby.',
        '  deposit <item> — Deposit an item to your bank.',
        '  sell <item> — Sell an item to a vendor.',
        '  camp — Rest briefly.',
        '  [bind] — Bind to this location\'s bindstone. You will respawn here on death.',
        '  time — Check if it is day or night and how long until it changes.',
      ];
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', helpText.join('\n'));
      return;
    }

    // --- TIME ---
    if (lower === 'time') {
      const ws = getWorldState(ctx);
      if (ws) {
        const timeLeft = Number(ws.nextTransitionAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000;
        const mins = Math.floor(timeLeft / 60);
        const secs = Math.floor(timeLeft % 60);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `It is ${ws.isNight ? 'nighttime' : 'daytime'}. ${mins}m ${secs}s until ${ws.isNight ? 'dawn' : 'dusk'}.`);
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'Time has no meaning here.');
      }
      return;
    }

    // --- LOOK ---
    const lookMatch = raw.match(/^(?:look|l)(?:\s+(.+))?$/i);
    if (lookMatch) {
      const lookTarget = lookMatch[1]?.trim();

      if (!lookTarget) {
        // Bare "look" — full location overview
        const location = ctx.db.location.id.find(character.locationId);
        if (!location) return;

        const parts: string[] = [];

        // 1. Header + description
        parts.push(location.name);
        parts.push(location.description);

        // 2. Day/Night
        const worldState = getWorldState(ctx);
        if (worldState) {
          const timeLeft = Number(worldState.nextTransitionAtMicros - ctx.timestamp.microsSinceUnixEpoch) / 1_000_000;
          const mins = Math.floor(timeLeft / 60);
          const secs = Math.floor(timeLeft % 60);
          parts.push(`It is currently ${worldState.isNight ? 'nighttime' : 'daytime'}. (${mins}m ${secs}s until ${worldState.isNight ? 'dawn' : 'dusk'})`);
        }

        // 3. Safe area / Bind stone / Crafting
        if (location.isSafe) parts.push('This is a safe area.');
        if (location.bindStone) parts.push('A {{color:#ffd43b}}[bind]{{/color}} stone stands here, pulsing with faint energy.');
        if (location.craftingAvailable) parts.push('A crafting station is available, you can {{color:#f59e0b}}[craft]{{/color}} here.');

        // 4. NPCs
        const npcs = [...ctx.db.npc.by_location.filter(character.locationId)];
        if (npcs.length > 0) {
          const npcNames = npcs.map((n: any) => `{{color:#da77f2}}[${n.name}]{{/color}}`);
          if (npcNames.length === 1) {
            parts.push(`\nYou see ${npcNames[0]} here.`);
          } else {
            const last = npcNames.pop();
            parts.push(`\nYou see ${npcNames.join(', ')}, and ${last} here.`);
          }
          if (npcs.some((n: any) => n.npcType === 'banker')) {
            parts.push('A {{color:#ffd43b}}[bank]{{/color}} is available here.');
          }
          if (npcs.some((n: any) => n.npcType === 'vendor')) {
            parts.push('A {{color:#f59e0b}}[shop]{{/color}} is available here.');
          }
        }

        // 5. Other players
        const allChars = [...ctx.db.character.by_location.filter(character.locationId)];
        const otherPlayers = allChars.filter((c: any) => c.id !== character.id);
        if (otherPlayers.length > 0) {
          const playerNames = otherPlayers.map((c: any) => `{{color:#69db7c}}[${c.name}]{{/color}}`);
          if (playerNames.length === 1) {
            parts.push(`\n${playerNames[0]} is here.`);
          } else {
            const last = playerNames.pop();
            parts.push(`\n${playerNames.join(', ')}, and ${last} are here.`);
          }
        }

        // 6. Enemies (with con colors)
        const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
        const aliveSpawns = spawns.filter((s: any) => s.state === 'available' || s.state === 'engaged' || s.state === 'pulling');
        if (aliveSpawns.length > 0) {
          const enemyParts: string[] = [];
          for (const spawn of aliveSpawns) {
            const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
            if (!template) continue;
            const diff = Number(template.level) - Number(character.level);
            let color: string;
            if (diff <= -5) color = '#6b7280';
            else if (diff <= -3) color = '#b6f7c4';
            else if (diff <= -1) color = '#8bd3ff';
            else if (diff === 0) color = '#f8fafc';
            else if (diff <= 2) color = '#f6d365';
            else if (diff <= 4) color = '#f59e0b';
            else color = '#f87171';

            const countSuffix = spawn.groupCount > 1n ? ` x${spawn.groupCount}` : '';
            enemyParts.push(`{{color:${color}}}[${spawn.name}]${countSuffix} (Lv ${template.level}){{/color}}`);
          }
          if (enemyParts.length > 0) {
            parts.push(`\nEnemies nearby: ${enemyParts.join(', ')}.`);
          }
        }

        // 7. Resources
        const resources = [...ctx.db.resource_node.by_location.filter(character.locationId)]
          .filter((r: any) => r.state === 'available');
        if (resources.length > 0) {
          const resourceCounts = new Map<string, number>();
          for (const r of resources) {
            resourceCounts.set(r.name, (resourceCounts.get(r.name) || 0) + 1);
          }
          const resourceParts: string[] = [];
          for (const [name, count] of resourceCounts) {
            resourceParts.push(count > 1 ? `{{color:#22c55e}}[Gather ${name}]{{/color}} x${count}` : `{{color:#22c55e}}[Gather ${name}]{{/color}}`);
          }
          parts.push(`\nResources: ${resourceParts.join(', ')}.`);
        }

        // 8. Travel exits
        const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
        const exitNames = connections
          .map((c: any) => ctx.db.location.id.find(c.toLocationId))
          .filter(Boolean)
          .map((l: any) => `{{color:#4dabf7}}[${l.name}]{{/color}}`);
        if (exitNames.length > 0) {
          parts.push(`\nExits: ${exitNames.join(', ')}.`);
        }

        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
        return;
      }

      // "look <target>" — inspect specific target
      const targetLower = lookTarget.toLowerCase();

      // Check NPCs
      for (const npc of ctx.db.npc.by_location.filter(character.locationId)) {
        if ((npc as any).name.toLowerCase() === targetLower || (npc as any).name.toLowerCase().includes(targetLower)) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look',
            `[${(npc as any).name}]: ${(npc as any).description}`);
          return;
        }
      }

      // Check enemies
      const targetSpawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
      for (const spawn of targetSpawns) {
        if (spawn.name.toLowerCase().includes(targetLower)) {
          const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
          if (!template) continue;
          let desc = `You study ${spawn.name}. Level ${template.level}. ${template.role} ${template.creatureType}.`;
          if (template.isBoss) desc += ' This creature carries the weight of something ancient and terrible.';
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', desc);
          return;
        }
      }

      // Check other players
      const locationChars = [...ctx.db.character.by_location.filter(character.locationId)];
      for (const target of locationChars) {
        if (target.id !== character.id && target.name.toLowerCase().includes(targetLower)) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look',
            `${target.name}, Level ${target.level} ${target.race} ${target.className}.`);
          return;
        }
      }

      return fail(ctx, character, `You don't see "${lookTarget}" here.`);
    }

    // --- INVENTORY ---
    if (lower === 'inventory' || lower === 'inv' || lower === 'i') {
      const RARITY_COLORS: Record<string, string> = {
        common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
      };
      const SLOT_LABELS: Record<string, string> = {
        head: 'Head', chest: 'Chest', wrists: 'Wrists', hands: 'Hands',
        belt: 'Belt', legs: 'Legs', boots: 'Boots', earrings: 'Earrings',
        neck: 'Neck', cloak: 'Cloak', mainHand: 'Main Hand', offHand: 'Off Hand',
      };
      const SLOT_ORDER = ['head', 'chest', 'wrists', 'hands', 'belt', 'legs', 'boots', 'earrings', 'neck', 'cloak', 'mainHand', 'offHand'];

      const charItems = [...ctx.db.item_instance.by_owner.filter(character.id)];
      const parts: string[] = ['Equipment:'];

      for (const slotKey of SLOT_ORDER) {
        const label = SLOT_LABELS[slotKey] || slotKey;
        const instance = charItems.find((i: any) => i.equippedSlot === slotKey);
        if (!instance) {
          parts.push(`  ${label}: (empty)`);
          continue;
        }
        const template = ctx.db.item_template.id.find(instance.templateId);
        if (!template) {
          parts.push(`  ${label}: (empty)`);
          continue;
        }
        const itemName = instance.displayName || template.name;
        const rarity = (instance.qualityTier || template.rarity || 'common').toLowerCase();
        const color = RARITY_COLORS[rarity] || '#ffffff';

        // Build stat summary
        const statParts: string[] = [];
        const statMap: [string, bigint][] = [
          ['STR', template.strBonus], ['DEX', template.dexBonus], ['INT', template.intBonus],
          ['WIS', template.wisBonus], ['CHA', template.chaBonus], ['HP', template.hpBonus],
          ['Mana', template.manaBonus], ['AC', template.armorClassBonus], ['MR', template.magicResistanceBonus],
        ];
        for (const [name, val] of statMap) {
          if (val && val > 0n) statParts.push(`${name} +${val}`);
        }
        if (template.weaponBaseDamage && template.weaponBaseDamage > 0n) {
          statParts.push(`${template.weaponBaseDamage} dmg`);
        }
        const statsStr = statParts.length > 0 ? ` — ${statParts.join(', ')}` : '';

        parts.push(`  ${label}: {{color:${color}}}[${itemName}]{{/color}}${statsStr}`);
      }

      parts.push(`\nGold: ${character.gold ?? 0n}`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- BACKPACK ---
    if (lower === 'backpack' || lower === 'bp' || lower === 'bag') {
      const RARITY_COLORS: Record<string, string> = {
        common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
      };
      const RARITY_SORT: Record<string, number> = {
        legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4,
      };
      const MAX_SLOTS = 50;

      const charItems = [...ctx.db.item_instance.by_owner.filter(character.id)];
      const unequipped = charItems.filter((i: any) => !i.equippedSlot);
      const parts: string[] = [`Backpack (${unequipped.length}/${MAX_SLOTS}):`];

      if (unequipped.length === 0) {
        parts.push('  Your backpack is empty.');
      } else {
        // Build item entries with template data for sorting
        const entries: { text: string; raritySort: number; name: string }[] = [];
        for (const instance of unequipped) {
          const template = ctx.db.item_template.id.find(instance.templateId);
          if (!template) continue;
          const itemName = instance.displayName || template.name;
          const rarity = (instance.qualityTier || template.rarity || 'common').toLowerCase();
          const color = RARITY_COLORS[rarity] || '#ffffff';

          // Stats
          const statParts: string[] = [];
          const statMap: [string, bigint][] = [
            ['STR', template.strBonus], ['DEX', template.dexBonus], ['INT', template.intBonus],
            ['WIS', template.wisBonus], ['CHA', template.chaBonus], ['HP', template.hpBonus],
            ['Mana', template.manaBonus], ['AC', template.armorClassBonus], ['MR', template.magicResistanceBonus],
          ];
          for (const [name, val] of statMap) {
            if (val && val > 0n) statParts.push(`${name} +${val}`);
          }
          if (template.weaponBaseDamage && template.weaponBaseDamage > 0n) {
            statParts.push(`${template.weaponBaseDamage} dmg`);
          }
          const statsStr = statParts.length > 0 ? ` — ${statParts.join(', ')}` : '';
          const slotStr = template.slot ? ` — ${template.slot}` : '';
          const qtyStr = instance.quantity > 1n ? ` x${instance.quantity}` : '';

          let line = `  {{color:${color}}}[${itemName}]{{/color}}${slotStr}${statsStr}${qtyStr}`;
          if (template.description) {
            line += `\n    ${template.description}`;
          }

          entries.push({
            text: line,
            raritySort: RARITY_SORT[rarity] ?? 5,
            name: itemName.toLowerCase(),
          });
        }

        // Sort by rarity (legendary first) then name
        entries.sort((a, b) => a.raritySort !== b.raritySort ? a.raritySort - b.raritySort : a.name.localeCompare(b.name));
        for (const entry of entries) {
          parts.push(entry.text);
        }
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- STATS ---
    if (lower === 'stats') {
      const parts: string[] = [];
      parts.push(`Character Stats: ${character.name}, Level ${character.level} ${character.race} ${character.className}`);
      parts.push(`  HP: ${character.hp}/${character.maxHp}  Mana: ${character.mana}/${character.maxMana}  Stamina: ${character.stamina}/${character.maxStamina}`);
      parts.push(`  XP: ${character.xp}  Gold: ${character.gold ?? 0n}`);
      parts.push('');
      parts.push('  Base Stats:');
      parts.push(`    STR ${character.str}  DEX ${character.dex}  INT ${character.int}  WIS ${character.wis}  CHA ${character.cha}`);
      parts.push('');
      parts.push('  Combat:');
      parts.push(`    Armor Class: ${character.armorClass}  Magic Resist: ${character.magicResistance}`);
      parts.push(`    Attack Power: ${character.attackPower}  Spell Power: ${character.spellPower}`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- BANK ---
    if (lower === 'bank') {
      const RARITY_COLORS: Record<string, string> = {
        common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
      };
      const MAX_BANK_SLOTS = 40;
      const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
      const banker = npcsAtLoc.find((n: any) => n.npcType === 'banker');
      if (!banker) return fail(ctx, character, 'There is no bank here.');

      const userId = requirePlayerUserId(ctx);
      const bankSlots = [...ctx.db.bank_slot.by_owner.filter(userId)];
      const parts: string[] = [`Bank Vault (${bankSlots.length}/${MAX_BANK_SLOTS}):`];

      if (bankSlots.length === 0) {
        parts.push('  Your vault is empty.');
      } else {
        for (const slot of bankSlots) {
          const instance = ctx.db.item_instance.id.find(slot.itemInstanceId);
          if (!instance) continue;
          const template = ctx.db.item_template.id.find(instance.templateId);
          if (!template) continue;
          const itemName = instance.displayName || template.name;
          const rarity = (instance.qualityTier || template.rarity || 'common').toLowerCase();
          const color = RARITY_COLORS[rarity] || '#ffffff';

          const statParts: string[] = [];
          const statMap: [string, bigint][] = [
            ['STR', template.strBonus], ['DEX', template.dexBonus], ['INT', template.intBonus],
            ['WIS', template.wisBonus], ['CHA', template.chaBonus], ['HP', template.hpBonus],
            ['Mana', template.manaBonus], ['AC', template.armorClassBonus], ['MR', template.magicResistanceBonus],
          ];
          for (const [name, val] of statMap) {
            if (val && val > 0n) statParts.push(`${name} +${val}`);
          }
          if (template.weaponBaseDamage && template.weaponBaseDamage > 0n) {
            statParts.push(`${template.weaponBaseDamage} dmg`);
          }
          const statsStr = statParts.length > 0 ? ` — ${statParts.join(', ')}` : '';
          const qtyStr = (instance.quantity ?? 1n) > 1n ? ` x${instance.quantity}` : '';
          parts.push(`  {{color:${color}}}[Withdraw ${itemName}]{{/color}}${statsStr}${qtyStr}`);
        }
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- SHOP / VENDOR / STORE ---
    if (lower === 'shop' || lower === 'vendor' || lower === 'store') {
      const RARITY_COLORS: Record<string, string> = {
        common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
      };
      const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
      const vendorNpc = npcsAtLoc.find((n: any) => n.npcType === 'vendor');
      if (!vendorNpc) return fail(ctx, character, 'There is no shop here.');

      const vendorInv = [...ctx.db.vendor_inventory.by_vendor.filter(vendorNpc.id)];
      const parts: string[] = [`${vendorNpc.name}'s Wares:`];

      if (vendorInv.length === 0) {
        parts.push('  Nothing for sale.');
      } else {
        for (const vi of vendorInv) {
          const template = ctx.db.item_template.id.find(vi.itemTemplateId);
          if (!template) continue;
          const rarity = (vi.qualityTier || template.rarity || 'common').toLowerCase();
          const color = RARITY_COLORS[rarity] || '#ffffff';

          const statParts: string[] = [];
          const statMap: [string, bigint][] = [
            ['STR', template.strBonus], ['DEX', template.dexBonus], ['INT', template.intBonus],
            ['WIS', template.wisBonus], ['CHA', template.chaBonus], ['HP', template.hpBonus],
            ['Mana', template.manaBonus], ['AC', template.armorClassBonus], ['MR', template.magicResistanceBonus],
          ];
          for (const [name, val] of statMap) {
            if (val && val > 0n) statParts.push(`${name} +${val}`);
          }
          if (template.weaponBaseDamage && template.weaponBaseDamage > 0n) {
            statParts.push(`${template.weaponBaseDamage} dmg`);
          }
          const statsStr = statParts.length > 0 ? ` (${statParts.join(', ')})` : '';
          parts.push(`  {{color:${color}}}[Buy ${template.name}]{{/color}} — ${vi.price} gold${statsStr}`);
        }
      }
      parts.push(`\nYour gold: ${character.gold ?? 0n}`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- CRAFT / RECIPES ---
    if (lower === 'craft' || lower === 'recipes') {
      const location = ctx.db.location.id.find(character.locationId);
      if (!location || !location.craftingAvailable) {
        return fail(ctx, character, 'There is no crafting station here.');
      }

      const discovered = [...ctx.db.recipe_discovered.by_character.filter(character.id)];
      const parts: string[] = ['Crafting Station — Known Recipes:'];

      if (discovered.length === 0) {
        parts.push('  No recipes discovered yet. Try {{color:#f59e0b}}[Research Recipes]{{/color}} to discover recipes from your materials.');
      } else {
        for (const disc of discovered) {
          const recipe = ctx.db.recipe_template.id.find(disc.recipeTemplateId);
          if (!recipe) continue;

          // Check materials
          const reqParts: string[] = [];
          let hasMats = true;
          const req1 = ctx.db.item_template.id.find(recipe.req1TemplateId);
          const req1Count = [...ctx.db.item_instance.by_owner.filter(character.id)]
            .filter((i: any) => i.templateId === recipe.req1TemplateId && !i.equippedSlot)
            .reduce((sum: bigint, i: any) => sum + (i.quantity ?? 1n), 0n);
          if (req1) reqParts.push(`${req1.name} x${recipe.req1Count}`);
          if (req1Count < recipe.req1Count) hasMats = false;

          const req2 = ctx.db.item_template.id.find(recipe.req2TemplateId);
          const req2Count = [...ctx.db.item_instance.by_owner.filter(character.id)]
            .filter((i: any) => i.templateId === recipe.req2TemplateId && !i.equippedSlot)
            .reduce((sum: bigint, i: any) => sum + (i.quantity ?? 1n), 0n);
          if (req2) reqParts.push(`${req2.name} x${recipe.req2Count}`);
          if (req2Count < recipe.req2Count) hasMats = false;

          if (recipe.req3TemplateId != null) {
            const req3 = ctx.db.item_template.id.find(recipe.req3TemplateId);
            const req3Count = [...ctx.db.item_instance.by_owner.filter(character.id)]
              .filter((i: any) => i.templateId === recipe.req3TemplateId && !i.equippedSlot)
              .reduce((sum: bigint, i: any) => sum + (i.quantity ?? 1n), 0n);
            if (req3) reqParts.push(`${req3.name} x${recipe.req3Count ?? 0n}`);
            if (req3Count < (recipe.req3Count ?? 0n)) hasMats = false;
          }

          const status = hasMats ? '(ready)' : '(missing materials)';
          parts.push(`  {{color:#f59e0b}}[Craft ${recipe.name}]{{/color}} — requires: ${reqParts.join(', ')} ${status}`);
        }
      }
      parts.push(`  {{color:#f59e0b}}[Research Recipes]{{/color}} — discover new recipes from your materials`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- LOOT ---
    if (lower === 'loot') {
      const RARITY_COLORS: Record<string, string> = {
        common: '#ffffff', uncommon: '#22c55e', rare: '#3b82f6', epic: '#aa44ff', legendary: '#ff8800',
      };
      const lootRows = [...ctx.db.combat_loot.by_character.filter(character.id)];
      if (lootRows.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nothing to loot here.');
        return;
      }

      const parts: string[] = ['Loot available:'];
      for (const lootRow of lootRows) {
        const template = ctx.db.item_template.id.find(lootRow.itemTemplateId);
        if (!template) continue;
        const rarity = (lootRow.qualityTier || template.rarity || 'common').toLowerCase();
        const color = RARITY_COLORS[rarity] || '#ffffff';
        parts.push(`  {{color:${color}}}[Take ${template.name}]{{/color}}`);
      }

      if (parts.length === 1) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nothing to loot here.');
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      }
      return;
    }

    // --- DEPOSIT [item] ---
    if (lower.startsWith('deposit ')) {
      const itemNameTarget = raw.substring(8).trim();
      if (!itemNameTarget) return fail(ctx, character, 'Deposit what?');

      const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
      const banker = npcsAtLoc.find((n: any) => n.npcType === 'banker');
      if (!banker) return fail(ctx, character, 'There is no bank here.');

      const userId = requirePlayerUserId(ctx);

      // Find matching unequipped item in character inventory by name
      const charItems = [...ctx.db.item_instance.by_owner.filter(character.id)];
      let matchedInstance: any = null;
      let matchedTemplate: any = null;
      for (const inst of charItems) {
        if (inst.equippedSlot) continue;
        const tmpl = ctx.db.item_template.id.find(inst.templateId);
        if (!tmpl) continue;
        const name = inst.displayName || tmpl.name;
        if (name.toLowerCase() === itemNameTarget.toLowerCase()) {
          matchedInstance = inst;
          matchedTemplate = tmpl;
          break;
        }
      }
      if (!matchedInstance || !matchedTemplate) {
        return fail(ctx, character, `You don't have "${itemNameTarget}" in your backpack.`);
      }

      // Check for existing stack in bank to merge into
      const existingSlots = [...ctx.db.bank_slot.by_owner.filter(userId)];
      const MAX_BANK_SLOTS = 40n;
      if (matchedTemplate.stackable) {
        const existingBankStack = existingSlots
          .map((s: any) => ({ bankSlot: s, item: ctx.db.item_instance.id.find(s.itemInstanceId) }))
          .find(({ item }: any) => item && item.templateId === matchedInstance.templateId);

        if (existingBankStack) {
          ctx.db.item_instance.id.update({
            ...existingBankStack.item,
            quantity: ((existingBankStack.item as any).quantity ?? 1n) + (matchedInstance.quantity ?? 1n),
          });
          ctx.db.item_instance.id.delete(matchedInstance.id);
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            `You deposit ${matchedTemplate.name} into the bank.`);
          return;
        }
      }

      if (BigInt(existingSlots.length) >= MAX_BANK_SLOTS) {
        return fail(ctx, character, 'Bank is full (40 slots maximum).');
      }

      const usedSlots = new Set(existingSlots.map((s: any) => Number(s.slot)));
      let freeSlot = -1;
      for (let i = 0; i < 40; i++) {
        if (!usedSlots.has(i)) { freeSlot = i; break; }
      }
      if (freeSlot === -1) return fail(ctx, character, 'Bank is full.');

      ctx.db.item_instance.id.update({
        ...matchedInstance,
        ownerCharacterId: 0n,
        equippedSlot: undefined,
      });
      ctx.db.bank_slot.insert({
        id: 0n,
        ownerUserId: userId,
        slot: BigInt(freeSlot),
        itemInstanceId: matchedInstance.id,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `You deposit ${matchedTemplate.name} into the bank.`);
      return;
    }

    // --- SELL [item] ---
    if (lower.startsWith('sell ')) {
      const itemNameTarget = raw.substring(5).trim();
      if (!itemNameTarget) return fail(ctx, character, 'Sell what?');

      const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
      const vendorNpc = npcsAtLoc.find((n: any) => n.npcType === 'vendor');
      if (!vendorNpc) return fail(ctx, character, 'There is no vendor here.');

      // Find matching unequipped item in character inventory by name
      const charItems = [...ctx.db.item_instance.by_owner.filter(character.id)];
      let matchedInstance: any = null;
      let matchedTemplate: any = null;
      for (const inst of charItems) {
        if (inst.equippedSlot) continue;
        const tmpl = ctx.db.item_template.id.find(inst.templateId);
        if (!tmpl) continue;
        const name = inst.displayName || tmpl.name;
        if (name.toLowerCase() === itemNameTarget.toLowerCase()) {
          matchedInstance = inst;
          matchedTemplate = tmpl;
          break;
        }
      }
      if (!matchedInstance || !matchedTemplate) {
        return fail(ctx, character, `You don't have "${itemNameTarget}" in your backpack.`);
      }

      const baseValue = BigInt(matchedTemplate.vendorValue ?? 0) * BigInt(matchedInstance.quantity ?? 1);
      let value = baseValue;
      // Apply CHA vendor sell bonus
      if (character.vendorSellMod > 0n) {
        value = (value * (1000n + character.vendorSellMod)) / 1000n;
      }

      // Clean up any affixes before deleting
      for (const affix of ctx.db.item_affix.by_instance.filter(matchedInstance.id)) {
        ctx.db.item_affix.id.delete(affix.id);
      }
      const soldTemplateId = matchedInstance.templateId;
      const soldVendorValue = matchedTemplate.vendorValue ?? 0n;
      const soldQualityTier = matchedInstance.qualityTier ?? undefined;
      ctx.db.item_instance.id.delete(matchedInstance.id);
      ctx.db.character.id.update({
        ...character,
        gold: (character.gold ?? 0n) + value,
      });

      // Add sold item to vendor's inventory
      const alreadyListed = [...ctx.db.vendor_inventory.by_vendor.filter(vendorNpc.id)].find(
        (row: any) => row.itemTemplateId === soldTemplateId && (row.qualityTier ?? undefined) === soldQualityTier
      );
      if (!alreadyListed) {
        const resalePrice = soldVendorValue > 0n ? soldVendorValue * 2n : 10n;
        ctx.db.vendor_inventory.insert({
          id: 0n,
          npcId: vendorNpc.id,
          itemTemplateId: soldTemplateId,
          price: resalePrice,
          qualityTier: soldQualityTier,
        });
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
        `You sell ${matchedTemplate.name} for ${value} gold.`);
      return;
    }

    // --- CAMP / REST ---
    if (lower === 'camp' || lower === 'rest') {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You cannot rest while in combat.');
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You make camp and rest briefly. The world continues without you.');
      return;
    }

    // --- BIND ---
    if (lower === 'bind') {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You cannot bind while in combat.');
      }
      const location = ctx.db.location.id.find(character.locationId);
      if (!location || !location.bindStone) {
        return fail(ctx, character, 'There is no bindstone here.');
      }
      if (character.boundLocationId === location.id) {
        return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'You are already bound here.');
      }
      ctx.db.character.id.update({ ...character, boundLocationId: location.id });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `You bind your soul to the stone at ${location.name}. You will return here should you fall.`);
      return;
    }

    // --- EXPLORE: retry world gen at current uncharted location (only useful after errors) ---
    if (lower === 'explore') {
      const currentLoc = ctx.db.location.id.find(character.locationId);
      if (!currentLoc || currentLoc.terrainType !== 'uncharted') {
        return fail(ctx, character, 'There is nothing uncharted to explore here.');
      }
      const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(character.locationId)]
        .find((s: any) => s.step !== 'ERROR');
      if (existingGen) {
        if (existingGen.step === 'PENDING' || existingGen.step === 'GENERATING') {
          return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The world is already taking shape around you. Patience.');
        }
        return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'This region has already been explored.');
      }
      // Only reaches here if all existing states are ERROR — retry
      ctx.db.world_gen_state.insert({
        id: 0n,
        playerId: ctx.sender,
        characterId: args.characterId,
        sourceLocationId: character.locationId,
        sourceRegionId: currentLoc.regionId,
        step: 'PENDING',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
      return;
    }

    // --- TRAVEL: "go <place>", "travel [to] <place>", or single-word location match ---
    const goMatch = lower.match(/^go\s+(.+)$/);
    const travelMatch = lower.match(/^travel\s+(?:to\s+)?(.+)$/);
    const travelTarget = goMatch?.[1] || travelMatch?.[1];

    // Bare "travel" or "go" without target — show available destinations
    if (lower === 'travel' || lower === 'go') {
      const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
      const names = connections
        .map((c: any) => ctx.db.location.id.find(c.toLocationId))
        .filter(Boolean)
        .map((l: any) => `[${l.name}]`);
      if (names.length > 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You can travel to: ${names.join(', ')}.`);
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nowhere to go from here.');
      }
      return;
    }

    if (travelTarget) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'Cannot travel while in combat.');
      }
      const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
      if (activeGather) {
        return fail(ctx, character, 'Cannot travel while gathering.');
      }

      // Resolve location name from adjacent locations
      const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
      let matchedLocation: any = null;

      for (const conn of connections) {
        const loc = ctx.db.location.id.find(conn.toLocationId);
        if (!loc) continue;
        const locName = loc.name.toLowerCase();
        if (locName === travelTarget) {
          matchedLocation = loc;
          break;
        }
        if (locName.includes(travelTarget) && !matchedLocation) {
          matchedLocation = loc;
        }
      }

      if (!matchedLocation) {
        // List available destinations
        const names = connections
          .map((c: any) => ctx.db.location.id.find(c.toLocationId))
          .filter(Boolean)
          .map((l: any) => l.name);
        const hint = names.length > 0
          ? `Nearby: ${names.join(', ')}.`
          : 'There is nowhere to go from here.';
        return fail(ctx, character, `No path leads to "${travelTarget}". ${hint}`);
      }

      // Minimal inline move
      const originId = character.locationId;
      ctx.db.character.id.update({ ...character, locationId: matchedLocation.id });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'move',
        `You travel to ${matchedLocation.name}. ${matchedLocation.description}`);
      appendLocationEvent(ctx, originId, 'move', `${character.name} departs.`, character.id);
      appendLocationEvent(ctx, matchedLocation.id, 'move', `${character.name} arrives.`, character.id);

      // Trigger world generation if destination is uncharted
      if (matchedLocation.terrainType === 'uncharted') {
        const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(matchedLocation.id)]
          .find((s: any) => s.step !== 'ERROR');
        if (!existingGen) {
          ctx.db.world_gen_state.insert({
            id: 0n,
            playerId: ctx.sender,
            characterId: args.characterId,
            sourceLocationId: matchedLocation.id,
            sourceRegionId: matchedLocation.regionId,
            step: 'PENDING',
            createdAt: ctx.timestamp,
            updatedAt: ctx.timestamp,
          });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
        }
      }
      return;
    }

    // --- SAY ---
    const sayMatch = raw.match(/^say\s+(.+)$/i);
    if (sayMatch) {
      const message = sayMatch[1].trim();
      if (!message) return fail(ctx, character, 'Say what?');
      appendLocationEvent(ctx, character.locationId, 'say', `${character.name} says, "${message}"`);
      return;
    }

    // --- WHISPER / TELL ---
    const whisperMatch = raw.match(/^(?:whisper|tell|w)\s+(\S+)\s+(.+)$/i);
    if (whisperMatch) {
      const targetName = whisperMatch[1].trim();
      const message = whisperMatch[2].trim();
      if (!message) return fail(ctx, character, 'Whisper what?');

      let target: any = null;
      for (const row of ctx.db.character.iter()) {
        if (row.name.toLowerCase() === targetName.toLowerCase()) {
          target = row;
          break;
        }
      }
      if (!target) return fail(ctx, character, `No one named "${targetName}" can be found.`);

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'whisper',
        `You whisper to ${target.name}: "${message}"`);
      appendPrivateEvent(ctx, target.id, target.ownerUserId, 'whisper',
        `${character.name} whispers: "${message}"`);
      return;
    }

    // --- HAIL / TALK / SPEAK ---
    const hailMatch = raw.match(/^(?:talk|hail|speak)\s+(?:to\s+)?(.+)$/i);
    if (hailMatch) {
      const npcName = hailMatch[1].trim();
      if (!npcName) return fail(ctx, character, 'Talk to whom?');

      let npc: any = null;
      for (const row of ctx.db.npc.by_location.filter(character.locationId)) {
        if (row.name.toLowerCase() === npcName.toLowerCase()) {
          npc = row;
          break;
        }
      }
      if (!npc) return fail(ctx, character, `No one named "${npcName}" is here.`);

      // Display NPC greeting — further conversation goes through talk_to_npc reducer
      const greeting = npc.greeting || `${npc.name} regards you silently.`;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc',
        `${npc.name} says, "${greeting}"`);
      return;
    }

    // --- CONSIDER / CON ---
    const conMatch = raw.match(/^(?:consider|con)\s+(.+)$/i);
    if (conMatch) {
      const targetName = conMatch[1].trim().toLowerCase();
      if (!targetName) return fail(ctx, character, 'Consider whom?');

      // Check NPCs at this location
      let npc: any = null;
      for (const row of ctx.db.npc.by_location.filter(character.locationId)) {
        if (row.name.toLowerCase() === targetName) { npc = row; break; }
      }
      if (npc) {
        const affinity = Number(getAffinityForNpc(ctx, character.id, npc.id));
        let regard: string;
        if (affinity >= 100) regard = `${npc.name} is devoted to you. A rare and unshakeable bond.`;
        else if (affinity >= 75) regard = `${npc.name} considers you a close friend. Trust runs deep here.`;
        else if (affinity >= 50) regard = `${npc.name} regards you warmly. You have earned their respect.`;
        else if (affinity >= 25) regard = `${npc.name} recognizes you as a passing acquaintance. There is room to grow.`;
        else if (affinity >= 0) regard = `${npc.name} regards you with polite indifference. You are a stranger to them.`;
        else if (affinity >= -25) regard = `${npc.name} eyes you warily. Something about you puts them on edge.`;
        else if (affinity >= -50) regard = `${npc.name} makes no effort to hide their dislike. Tread carefully.`;
        else regard = `${npc.name} despises you. Every word you speak deepens their contempt.`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', regard);
        return;
      }

      // Check enemy spawns at this location
      const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
      for (const spawn of spawns) {
        if (spawn.name.toLowerCase().includes(targetName)) {
          const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
          if (!template) continue;
          const levelDiff = Number(template.level) - Number(character.level);
          let threat: string;
          if (levelDiff <= -10) threat = `${spawn.name} would be trivial prey. Hardly worth the effort.`;
          else if (levelDiff <= -5) threat = `${spawn.name} poses little threat. You could handle this in your sleep.`;
          else if (levelDiff <= -2) threat = `${spawn.name} is beneath you, but not entirely without teeth.`;
          else if (levelDiff <= 1) threat = `${spawn.name} appears to be an even match. A fair fight awaits.`;
          else if (levelDiff <= 4) threat = `${spawn.name} looks dangerous. Proceed with caution.`;
          else if (levelDiff <= 8) threat = `${spawn.name} radiates menace. This would be a brutal fight — you may not survive.`;
          else threat = `${spawn.name} would wipe the floor with you. Turn back unless you have a death wish.`;

          if (template.isBoss) threat += ' This creature carries the weight of something ancient and terrible.';
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', threat);
          return;
        }
      }

      return fail(ctx, character, `You see no one named "${conMatch[1].trim()}" here to consider.`);
    }

    // --- ATTACK / FIGHT / KILL ---
    const attackMatch = lower.match(/^(?:attack|fight|kill)\s*(.*)$/);
    if (attackMatch) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You are already in combat. Use your abilities.');
      }

      // Check for enemies at this location via enemy_spawn
      const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
      const aliveSpawns = spawns.filter((s: any) => s.state === 'available' || s.state === 'pulling');
      if (aliveSpawns.length === 0) {
        return fail(ctx, character, 'There is nothing to fight here.');
      }

      const targetName = attackMatch[1]?.trim().toLowerCase();
      let targetSpawn: any = null;

      if (targetName) {
        // Match by name
        for (const spawn of aliveSpawns) {
          if (spawn.name.toLowerCase() === targetName) { targetSpawn = spawn; break; }
          if (spawn.name.toLowerCase().includes(targetName) && !targetSpawn) { targetSpawn = spawn; }
        }
        if (!targetSpawn) {
          const names = aliveSpawns.map((s: any) => `[${s.name}]`).join(', ');
          return fail(ctx, character, `No enemy named "${attackMatch[1].trim()}" here. Nearby: ${names}.`);
        }
      } else {
        // No target specified — pick the first available
        targetSpawn = aliveSpawns[0];
      }

      const template = ctx.db.enemy_template.id.find(targetSpawn.enemyTemplateId);
      const enemyName = targetSpawn.name;
      const levelStr = template ? ` (L${template.level})` : '';

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat_prompt',
        `You prepare to engage ${enemyName}${levelStr}. Approach carefully or charge in?\n\n  [Careful Pull] — Measured approach, longer pull time\n  [Charge In] — Rush in immediately`);
      return;
    }

    // --- FLEE ---
    if (lower === 'flee' || lower === 'run') {
      if (!activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You are not in combat. There is nothing to flee from.');
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'Use the Flee button in combat to attempt an escape.');
      return;
    }

    // --- USE / CAST (ability hint) ---
    const useMatch = lower.match(/^(?:use|cast)\s+(.+)$/);
    if (useMatch) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'Use the ability bar to activate your abilities during combat.');
      return;
    }

    // --- IMPLICIT TRAVEL: bare location name match ---
    const allConnections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
    let implicitDest: any = null;
    for (const conn of allConnections) {
      const loc = ctx.db.location.id.find(conn.toLocationId);
      if (!loc) continue;
      if (loc.name.toLowerCase() === lower) { implicitDest = loc; break; }
      if (loc.name.toLowerCase().includes(lower) && !implicitDest) { implicitDest = loc; }
    }
    if (implicitDest) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'Cannot travel while in combat.');
      }
      const originId = character.locationId;
      ctx.db.character.id.update({ ...character, locationId: implicitDest.id });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'move',
        `You travel to ${implicitDest.name}. ${implicitDest.description}`);
      appendLocationEvent(ctx, originId, 'move', `${character.name} departs.`, character.id);
      appendLocationEvent(ctx, implicitDest.id, 'move', `${character.name} arrives.`, character.id);
      if (implicitDest.terrainType === 'uncharted') {
        const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(implicitDest.id)]
          .find((s: any) => s.step !== 'ERROR');
        if (!existingGen) {
          ctx.db.world_gen_state.insert({
            id: 0n, playerId: ctx.sender, characterId: args.characterId,
            sourceLocationId: implicitDest.id, sourceRegionId: implicitDest.regionId,
            step: 'PENDING', createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
          });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
        }
      }
      return;
    }

    // --- IMPLICIT HAIL: bare NPC name match ---
    for (const npc of ctx.db.npc.by_location.filter(character.locationId)) {
      if ((npc as any).name.toLowerCase() === lower || (npc as any).name.toLowerCase().includes(lower)) {
        const greeting = (npc as any).greeting || `${(npc as any).name} regards you silently.`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc',
          `${(npc as any).name} says, "${greeting}"`);
        return;
      }
    }

    // --- SARDONIC FALLBACK ---
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
      `The System regards you with mild contempt. "${raw}" means nothing here. Perhaps try [help].`);
  });
};
