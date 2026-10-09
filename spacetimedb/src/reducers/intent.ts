import { getAffinityForNpc, awardNpcAffinity } from '../helpers/npc_affinity';
import { performTravel, travelDeps } from '../helpers/travel';
import { buildLookOutput } from '../helpers/look';
import { parseLookCommand, describeLookTarget, lookMissLine } from '../helpers/examine';
import { flattenLineBreaks } from '../helpers/chat_text';
import { sellInstanceToVendor } from '../helpers/vendor_sale';
import { appliedSellBonusPercent, listingBuyPrice, sellPayout } from '../data/vendor_pricing';
import { isQuestItemTemplate, QUEST_ITEM_SALE_REFUSAL } from '../data/item_rules';
import { recipeRequirements } from '../data/crafting_rules';
import { formatLootLine, LOOT_AVAILABLE_LEAD } from '../data/loot_line';
import { getPerkBonusByField } from '../helpers/renown';
import { requestSkillOffer } from '../helpers/skill_offer';
import {
  nowhereToGoLine,
  retryStarterWorldGen,
  retryWorldFill,
  startWorldGeneration,
  STARTER_RETRY_MESSAGES,
  WORLD_FILL_RETRY_LINE,
} from '../helpers/world_gen';
import { npcGender, npcPronouns, npcRegardLine } from '../data/npc_gender';
import { getWorldState } from '../helpers/location';
import { densityWord } from '../data/density_lines';
import { conColor } from '../helpers/look';
import {
  FIGHT_TEXT,
  creaturePoolsByDanger,
  familyConLine,
  fightIndividualFor,
  findFightTarget,
  firstFightTarget,
  individualConLine,
  individualsHere,
  levelRangeLabel,
  nearbyFightNames,
  pullFamilyFor,
} from '../helpers/encounters';
import { findRaceDefinition } from '../data/race_bonuses';
import { RESPAWN_COMMAND, allowedWhileDead } from '../data/death_lines';
import { refuseWhileDead, respawnDeadCharacter } from '../helpers/character';
import { turnInCompletedQuest, turnInQuestsAtNpc, questTurnInNpcId, pickUpQuestItem, isQuestTurnedIn } from './quests';

// Re-export for any existing consumers that import from intent.ts
export { buildLookOutput } from '../helpers/look';

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
    ScheduleAt,
  } = deps;

  spacetimedb.reducer('submit_intent', { characterId: t.u64(), text: t.string() }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }

    // One line only: say, whisper, the command echo and the fallback all echo this text.
    const raw = flattenLineBreaks(args.text);
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

    // --- RESPAWN: the placeholder for a death screen (owner, 2026-10-09); the death prompt's [respawn] sends it ---
    if (lower === RESPAWN_COMMAND) {
      respawnDeadCharacter(ctx, character);
      return;
    }

    // --- DEAD: only help, look and talk (owner, 2026-10-09: "Respawning should be the only action you can take") ---
    if (character.hp === 0n && !allowedWhileDead(lower)) {
      refuseWhileDead(ctx, character);
      return;
    }

    // --- HELP ---
    if (lower === 'help' || lower === 'h' || lower === '?') {
      const helpText = [
        'Commands:',
        '  [abilities] (ab) — View your abilities with descriptions and costs.',
        '  attack — Engage enemies at your location.',
        '  [backpack] (bp, bag) — View your unequipped items.',
        '  [bank] — Access your bank vault (at locations with a banker).',
        '  [bind] — Bind to this location\'s bindstone. You will respawn here on death.',
        '  camp — Make camp and log out after 10 seconds.',
        '  [character] (char) — View your race and class info with bonuses.',
        '  [consider] (con) <name> — Assess the threat level of an enemy or your standing with an NPC.',
        '  [craft] — View and craft known recipes (at crafting stations).',
        '  deposit <item> — Deposit an item to your bank.',
        '  [enemies] (mobs) — List all enemies at your location with levels and threat.',
        '  [events] — View active and recent world events.',
        '  [factions] — View your faction standings.',
        '  flee — Attempt to escape from combat.',
        '  go <place> — Travel to a connected location. You can also type the location name directly.',
        '  [group] — View group status, members, and pending invites.',
        '  [hail] <name> — Start a conversation with an NPC.',
        '  [inventory] (inv, i) — View your equipped gear with stats.',
        '  [look] (l) — Survey your surroundings, or [look] <name> to inspect a specific target.',
        '  [loot] — Check for lootable remains nearby.',
        '  [players] (who) — List all players at your location.',
        '  [quests] — View your active quests and progress.',
        '  [renown] — View your renown rank, progress, and perks.',
        '  say <message> — Speak aloud for everyone at your location to hear.',
        '  sell <item> — Sell an item to a vendor.',
        '  [shop] — Browse a vendor\'s wares (at locations with a vendor).',
        '  [skills] — Ask the Keeper for a new ability offer (level 2 and up).',
        '  [hotbars] — List all your hotbars with slot contents.',
        '  {{color:#c9a227}}hotbar add {name}{{/color}} — Create a new named hotbar (max 10).',
        '  {{color:#c9a227}}hotbar delete {name}{{/color}} — Delete a hotbar and all its slots.',
        '  {{color:#c9a227}}hotbar {name}{{/color}} — Switch to a hotbar by name.',
        '  {{color:#c9a227}}hotbar set {slot} {ability}{{/color}} — Assign ability to slot 1–10 of active hotbar.',
        '  {{color:#c9a227}}hotbar swap {slot1} {slot2}{{/color}} — Swap two hotbar slots.',
        '  {{color:#c9a227}}hotbar clear {slot}{{/color}} — Remove ability from a hotbar slot.',
        '  [stats] — View your full character stats and combat values.',
        '  time — Check if it is day or night and how long until it changes.',
        '  [travel] — List available destinations.',
        '  [whisper] (w) <name> <message> — Send a private message to another player.',
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
    const lookTarget = parseLookCommand(raw);
    if (lookTarget !== null) {
      if (lookTarget === '') {
        // Bare "look" — full location overview (uses shared buildLookOutput)
        const parts = buildLookOutput(ctx, character);
        if (parts.length > 0) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
        }
        return;
      }

      // "look <target>" — NPC, enemy, player, resource node, then own inventory item
      const text = describeLookTarget(ctx, character, lookTarget);
      if (text !== null) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', text);
        return;
      }

      return fail(ctx, character, lookMissLine(lookTarget));
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
      const parts: string[] = ['{{color:#fbbf24}}Equipment:{{/color}}'];

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
        if (template.description) {
          parts.push(`    ${template.description}`);
        }
      }

      parts.push(`\n{{color:#fbbf24}}Gold:{{/color}} ${character.gold ?? 0n}`);
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
      const fmtPct = (v: bigint) => (Number(v) / 10).toFixed(2) + '%';
      const parts: string[] = [];
      parts.push(`{{color:#fbbf24}}${character.name} — Level ${character.level} ${character.race} ${character.className}{{/color}}`);
      parts.push('');
      parts.push('{{color:#fbbf24}}Resources:{{/color}}');
      parts.push(`  HP: ${character.hp}/${character.maxHp}  Mana: ${character.mana}/${character.maxMana}  Stamina: ${character.stamina}/${character.maxStamina}`);
      parts.push(`  XP: ${character.xp}  Gold: ${character.gold ?? 0n}`);
      parts.push('');
      parts.push('{{color:#fbbf24}}Base Stats:{{/color}}');
      parts.push(`  STR ${character.str}  DEX ${character.dex}  INT ${character.int}  WIS ${character.wis}  CHA ${character.cha}`);
      parts.push('');
      parts.push('{{color:#fbbf24}}Combat:{{/color}}');
      parts.push(`  Hit: ${fmtPct(character.hitChance)}  Dodge: ${fmtPct(character.dodgeChance)}  Parry: ${fmtPct(character.parryChance)}`);
      parts.push(`  Crit (Melee): ${fmtPct(character.critMelee)}  Crit (Ranged): ${fmtPct(character.critRanged)}`);
      parts.push(`  Crit (Divine): ${fmtPct(character.critDivine)}  Crit (Arcane): ${fmtPct(character.critArcane)}`);
      parts.push(`  Armor Class: ${character.armorClass}  Perception: ${character.perception}`);
      parts.push(`  CC Power: ${fmtPct(character.ccPower)}`);
      parts.push(`  Vendor Buy: -${fmtPct(character.vendorBuyMod)}  Vendor Sell: +${fmtPct(character.vendorSellMod)}`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- ABILITIES ---
    if (lower === 'abilities' || lower === 'ab') {
      const abilities = [...ctx.db.ability_template.by_character.filter(character.id)];
      const hasPending = [...ctx.db.pending_skill.by_character.filter(character.id)].length > 0;
      const levelsWithAbilities = new Set(abilities.map((a: any) => Number(a.levelRequired)));
      const missedLevels: number[] = [];
      for (let lvl = 1; lvl <= Number(character.level); lvl++) {
        if (!levelsWithAbilities.has(lvl)) missedLevels.push(lvl);
      }

      const parts: string[] = [];
      if (abilities.length === 0) {
        parts.push('You have no abilities yet.');
      } else {
        abilities.sort((a: any, b: any) => Number(a.levelRequired) - Number(b.levelRequired));
        parts.push(`{{color:#fbbf24}}Abilities (${abilities.length}){{/color}}`);
        parts.push('');
        for (const ab of abilities) {
          const sourceLabel = ab.source ? `[${ab.source}] ` : '';
          parts.push(`{{color:#fbbf24}}${sourceLabel}${ab.name}{{/color}} (Lv ${ab.levelRequired})`);
          if (ab.description) parts.push(`  ${ab.description}`);
          parts.push(`  ${ab.kind} — ${ab.resourceType}: ${ab.resourceCost} — Cast: ${ab.castSeconds}s — CD: ${ab.cooldownSeconds}s`);
          parts.push('');
        }
      }

      if (missedLevels.length > 0) {
        parts.push('');
        if (hasPending) {
          parts.push('You have pending ability choices. Select one of the offered skills first.');
        } else {
          parts.push(`Missed ability selections: Level ${missedLevels.join(', Level ')}`);
          parts.push('{{color:#fbbf24}}[choose ability]{{/color}} — The Keeper will present new offerings');
        }
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', parts.join('\n'));
      return;
    }

    // --- CHARACTER ---
    if (lower === 'character' || lower === 'char') {
      const fmtLabel = (type: string): string => {
        switch (type) {
          case 'stat_str': return 'STR';
          case 'stat_dex': return 'DEX';
          case 'stat_int': return 'INT';
          case 'stat_wis': return 'WIS';
          case 'stat_cha': return 'CHA';
          case 'spell_damage': return 'Spell Damage';
          case 'phys_damage': return 'Phys Damage';
          case 'max_hp': return 'Max HP';
          case 'max_mana': return 'Max Mana';
          case 'mana_regen': return 'Mana Regen';
          case 'stamina_regen': return 'Stamina Regen';
          case 'crit_chance': return 'Crit';
          case 'armor': return 'Armor';
          case 'dodge': return 'Dodge';
          case 'hp_regen': return 'HP Regen';
          case 'max_stamina': return 'Max Stamina';
          case 'hit_chance': return 'Hit';
          case 'parry': return 'Parry';
          case 'faction_bonus': return 'Faction Gain';
          case 'magic_resist': return 'Magic Resist';
          case 'perception': return 'Perception';
          case 'travel_cost_discount': return 'Travel Discount';
          case 'travel_cost_increase': return 'Travel Cost';
          case 'loot_bonus': return 'Resource Find';
          default: return type;
        }
      };
      const fmtVal = (type: string, value: bigint): string => {
        const v = Number(value);
        switch (type) {
          case 'crit_chance': case 'dodge': case 'hit_chance': case 'parry': case 'magic_resist':
            return `+${(v / 10).toFixed(2).replace(/\.?0+$/, '')}%`;
          case 'faction_bonus': case 'loot_bonus':
            return `+${v}%`;
          case 'travel_cost_discount':
            return `-${v} stamina`;
          case 'travel_cost_increase':
            return `+${v} stamina`;
          default:
            return `+${v}`;
        }
      };
      const fmtPenalty = (type: string, value: bigint): string => {
        const v = Number(value);
        if (type === 'travel_cost_increase') return `+${v} stamina`;
        if (type === 'travel_cost_discount') return `-${v} stamina`;
        return `-${v}`;
      };

      const parts: string[] = [`{{color:#fbbf24}}${character.name}{{/color}}`, ''];
      parts.push(`Class: ${character.className}`);
      if (character.weaponProficiencies) {
        parts.push(`Weapon Proficiencies: ${character.weaponProficiencies}`);
      }
      if (character.armorProficiencies) {
        parts.push(`Armor Proficiencies: ${character.armorProficiencies}`);
      }
      parts.push('');

      // Look up race — try race_definition first (v2.0 generated races), fall back to legacy race table
      const raceLower = character.race.toLowerCase();
      // findRaceDefinition never returns a row for the reserved placeholder name (IN-14), so a
      // character whose race is the 'Unknown' placeholder shows no generated-race bonuses.
      const rd = findRaceDefinition(ctx, character.race);
      if (rd) {
        parts.push(`Race: ${rd.name}`);
        if (rd.narrative) parts.push(rd.narrative);
        parts.push('');
        try {
          const bonuses = JSON.parse(rd.bonusesJson);
          if (bonuses.primary) {
            parts.push('{{color:#fbbf24}}Racial Bonuses:{{/color}}');
            parts.push(`  ${fmtLabel(bonuses.primary.stat)}: ${fmtVal(bonuses.primary.stat, BigInt(bonuses.primary.value))}`);
            if (bonuses.secondary) {
              parts.push(`  ${fmtLabel(bonuses.secondary.stat)}: ${fmtVal(bonuses.secondary.stat, BigInt(bonuses.secondary.value))}`);
            }
            if (bonuses.flavor) parts.push(`  ${bonuses.flavor}`);
          }
        } catch { /* bonusesJson parse error - show name only */ }
      } else {
        // Fallback to old race table (legacy races)
        let raceFound = false;
        for (const r of ctx.db.race.iter()) {
          if (r.name.toLowerCase() === raceLower) {
            raceFound = true;
            parts.push(`Race: ${r.name}`);
            if (r.description) parts.push(r.description);
            parts.push('');
            parts.push('{{color:#fbbf24}}Racial Bonuses:{{/color}}');
            parts.push(`  ${fmtLabel(r.bonus1Type)}: ${fmtVal(r.bonus1Type, r.bonus1Value)}`);
            parts.push(`  ${fmtLabel(r.bonus2Type)}: ${fmtVal(r.bonus2Type, r.bonus2Value)}`);
            if (r.penaltyType && r.penaltyValue) {
              parts.push(`  ${fmtLabel(r.penaltyType)}: ${fmtPenalty(r.penaltyType, r.penaltyValue)}`);
            }
            parts.push('');
            parts.push('{{color:#fbbf24}}Level Bonus (every level):{{/color}}');
            parts.push(`  ${fmtLabel(r.levelBonusType)}: ${fmtVal(r.levelBonusType, r.levelBonusValue)} per level`);
            if (character.level > 0n) {
              parts.push(`  Total at level ${character.level}: ${fmtVal(r.levelBonusType, r.levelBonusValue * BigInt(character.level))}`);
            }
            if ((r as any).abilityName) {
              const ra = r as any;
              parts.push('');
              parts.push('{{color:#fbbf24}}Race Ability:{{/color}}');
              parts.push(`  ${ra.abilityName}`);
              if (ra.abilityDescription) parts.push(`  ${ra.abilityDescription}`);
              const cdMins = Number(ra.abilityCooldownSeconds) / 60;
              parts.push(`  Cooldown: ${cdMins} min`);
            }
            break;
          }
        }
        if (!raceFound) {
          parts.push(`Race: ${character.race}`);
          parts.push('Race data unavailable.');
        }
      }

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

      // A sold-out listing (quantity 0) is hidden until it is restocked.
      const vendorInv = [...ctx.db.vendor_inventory.by_vendor.filter(vendorNpc.id)].filter(
        (vi: any) => vi.quantity >= 1n
      );
      const parts: string[] = [`${vendorNpc.name}'s Wares:`];

      if (vendorInv.length === 0) {
        parts.push('  Nothing for sale.');
      } else {
        // The price shown is the price buy_item and buy_listing charge: the list price after the
        // perk and Charisma discounts, never below what the character earns selling it back.
        const perkBuyPct = getPerkBonusByField(ctx, character.id, 'vendorBuyDiscount', character.level);
        const perkSellPct = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
        for (const vi of vendorInv) {
          const template = ctx.db.item_template.id.find(vi.itemTemplateId);
          if (!template) continue;
          const chargedPrice = listingBuyPrice({
            listPrice: vi.price,
            vendorValue: template.vendorValue ?? 0n,
            perkBuyPct,
            perkSellPct,
            vendorBuyMod: character.vendorBuyMod,
            vendorSellMod: character.vendorSellMod ?? 0n,
          });
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
          parts.push(`  {{color:${color}}}[Buy ${template.name}]{{/color}} — ${chargedPrice} gold ×${vi.quantity}${statsStr}`);
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

          // Check materials: every requirement in slot order (recipeRequirements, the shared rule;
          // a legendary regional recipe has a 4th).
          const reqParts: string[] = [];
          let hasMats = true;
          const bagRows = [...ctx.db.item_instance.by_owner.filter(character.id)];
          for (const req of recipeRequirements(recipe)) {
            const reqTemplate = ctx.db.item_template.id.find(req.templateId);
            const heldCount = bagRows
              .filter((i: any) => i.templateId === req.templateId && !i.equippedSlot)
              .reduce((sum: bigint, i: any) => sum + (i.quantity ?? 1n), 0n);
            if (reqTemplate) reqParts.push(`${reqTemplate.name} x${req.count}`);
            if (heldCount < req.count) hasMats = false;
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
      const lootRows = [...ctx.db.combat_loot.by_character.filter(character.id)];
      if (lootRows.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nothing to loot here.');
        return;
      }

      // Quick 261008-f3m: the same loot links as the victory line, as kind 'reward' (the client
      // parses loot tokens on reward rows only), so typing `loot` re-lists clickable drops.
      const lootLine = formatLootLine(LOOT_AVAILABLE_LEAD, lootRows, (id) => ctx.db.item_template.id.find(id));
      if (lootLine === null) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nothing to loot here.');
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', lootLine);
      }
      return;
    }

    // --- LOOT <item name> (quest items) ---
    if (lower.startsWith('loot ')) {
      const itemName = raw.substring(5).trim();
      if (!itemName) return fail(ctx, character, 'Loot what?');

      // Check for quest items at current location
      const questItemsAtLoc = [...ctx.db.quest_item.by_location.filter(character.locationId)]
        .filter((qi: any) => qi.characterId === character.id && qi.discovered && !qi.looted);
      const match = questItemsAtLoc.find((qi: any) => qi.name.toLowerCase() === itemName.toLowerCase()
        || qi.name.toLowerCase().includes(itemName.toLowerCase()));
      if (match) {
        // Same pickup as the loot_quest_item reducer (looted, quest completed, messages, 30% aggro roll)
        pickUpQuestItem(ctx, character, match, appendPrivateEvent, {
          ensurePoolsForLocation: deps.ensurePoolsForLocation,
          effectiveGroupId: deps.effectiveGroupId,
          startCombat: deps.startCombat,
          startCombatForSpawn: deps.startCombatForSpawn,
        });
        return;
      }
      // Fall through to fail
      return fail(ctx, character, `Nothing called "${itemName}" to loot here.`);
    }

    // --- ENEMIES ---
    // Families first, in danger order (Phase 51.3.1.1 D-03), then the individuals (D-07): the
    // character's named enemies and individual spawns. Ordinary creatures are never listed one by one.
    if (lower === 'enemies' || lower === 'mobs') {
      const families = creaturePoolsByDanger(ctx, character.locationId, ctx.timestamp.microsSinceUnixEpoch);
      const individuals = individualsHere(ctx, character);
      if (families.length === 0 && individuals.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'No enemies nearby.');
        return;
      }
      const parts: string[] = ['{{color:#fbbf24}}Enemies at this location:{{/color}}'];
      for (const h of families) {
        const label = `${levelRangeLabel(h.lvLo, h.lvHi)}, ${densityWord('creature', h.level)}`;
        if (h.level === 0) {
          // A wiped-out family keeps its place in the list, without a keyword (nothing to pull).
          parts.push(`  {{color:#6b7280}}${h.family.name} (${label}){{/color}}`);
        } else {
          parts.push(`  {{color:${conColor(h.lvHi, character.level)}}}[${h.family.name}] (${label}){{/color}}`);
        }
      }
      for (const one of individuals) {
        const countSuffix = one.spawn && one.spawn.groupCount > 1n ? ` x${one.spawn.groupCount}` : '';
        let line = `  {{color:${conColor(one.level, character.level)}}}[${one.name}]${countSuffix} (Lv ${one.level}) - ${one.template.role} ${one.template.creatureType}`;
        if (one.template.isBoss) line += ' [BOSS]';
        if (one.spawn?.state === 'engaged') line += ' [In Combat]';
        if (one.spawn?.state === 'pulling') line += ' [Pulling]';
        line += '{{/color}}';
        parts.push(line);
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', parts.join('\n'));
      return;
    }

    // --- PLAYERS ---
    if (lower === 'players' || lower === 'who') {
      const allChars = [...ctx.db.character.by_location.filter(character.locationId)];
      // Offline characters drop out of who (CONTEXT Area 2).
      const others = allChars.filter((c: any) => c.id !== character.id && c.online === true);
      if (others.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', 'No other players nearby.');
        return;
      }
      const parts: string[] = ['{{color:#fbbf24}}Players at this location:{{/color}}'];
      for (const other of others) {
        parts.push(`  {{color:#69db7c}}[${other.name}]{{/color}} — Level ${other.level} ${other.race} ${other.className}`);
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', parts.join('\n'));
      return;
    }

    // --- QUESTS ---
    if (lower === 'quests' || lower === 'quest') {
      // Turned-in quests (completedAt set) stay as history and are not listed as active
      const instances = [...ctx.db.quest_instance.by_character.filter(character.id)].filter((qi: any) => !isQuestTurnedIn(qi));
      if (instances.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'You have no active quests. Speak with NPCs to discover what needs doing.');
        return;
      }

      const questParts: string[] = [`Active Quests (${instances.length}/4):`];

      for (const qi of instances) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        const npc = ctx.db.npc.id.find(qt.npcId);
        const giverName = npc ? npc.name : 'Unknown';
        const location = npc ? ctx.db.location.id.find(npc.locationId) : null;
        const locName = location ? location.name : 'Unknown';

        // Quest type description
        const typeDesc: Record<string, string> = {
          kill: 'Slay', kill_loot: 'Hunt and collect', explore: 'Explore',
          delivery: 'Deliver', boss_kill: 'Defeat', gather: 'Gather',
          escort: 'Escort', interact: 'Interact', discover: 'Discover',
        };
        const verb = typeDesc[(qt.questType ?? 'kill')] || 'Complete';

        const progressStr = `${qi.progress}/${qt.requiredCount}`;
        let statusLine: string;
        if (qi.completed) {
          // Turned in to the giver, or to a delivery's recipient (questTurnInNpcId)
          const turnInNpcId = questTurnInNpcId(qt);
          const turnInNpc = turnInNpcId ? ctx.db.npc.id.find(turnInNpcId) : undefined;
          const turnInLoc = turnInNpc ? ctx.db.location.id.find(turnInNpc.locationId) : null;
          const turnInName = turnInNpc ? turnInNpc.name : giverName;
          const turnInLocName = turnInLoc ? turnInLoc.name : locName;
          statusLine = `  {{color:#22c55e}}COMPLETE{{/color}} — Return to {{color:#da77f2}}[${turnInName}]{{/color}} at ${turnInLocName} to {{color:#22c55e}}[Turn In ${qt.name}]{{/color}}`;
        } else {
          statusLine = `  ${verb}: ${progressStr}`;
          if (qt.targetItemName) statusLine += ` (${qt.targetItemName})`;
        }

        questParts.push(`\n{{color:#fbbf24}}${qt.name}{{/color}}`);
        if (qt.description) questParts.push(`  ${qt.description}`);
        questParts.push(`  Given by: {{color:#da77f2}}[${giverName}]{{/color}} at ${locName}`);
        questParts.push(statusLine);
        questParts.push(`  {{color:#6b7280}}[Abandon ${qt.name}]{{/color}}`);
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look', questParts.join('\n'));
      return;
    }

    // --- TURN IN <quest name> ---
    if (lower.startsWith('turn in ')) {
      const questName = raw.substring(8).trim();
      if (!questName) return fail(ctx, character, 'Turn in which quest?');

      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        if (qt.name.toLowerCase() !== questName.toLowerCase()) continue;
        if (!qi.completed) {
          return fail(ctx, character, `"${qt.name}" is not yet complete.`);
        }
        // Same path as the turn_in_quest reducer (giver's location, bag space, xp, gold, item, affinity, NPC memory)
        turnInCompletedQuest(ctx, character, qi, qt, appendPrivateEvent, fail);
        return;
      }
      return fail(ctx, character, `No quest found called "${questName}".`);
    }

    // --- CONFIRM ABANDON <quest name> --- (must be before 'abandon' to avoid prefix match)
    if (lower.startsWith('confirm abandon ')) {
      const questName = raw.substring(16).trim();
      if (!questName) return fail(ctx, character, 'Confirm abandon which quest?');

      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        if (qt.name.toLowerCase() !== questName.toLowerCase()) continue;
        if (isQuestTurnedIn(qi)) {
          return fail(ctx, character, `You've already turned in ${qt.name}; it cannot be abandoned.`);
        }

        ctx.db.quest_instance.id.delete(qi.id);
        if (qt.npcId) {
          awardNpcAffinity(ctx, character, qt.npcId, -3n);
        }
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
          `Quest abandoned: {{color:#ef4444}}${qt.name}{{/color}}. This quest may never be offered again.`);
        return;
      }
      return fail(ctx, character, `No quest found called "${questName}".`);
    }

    // --- ABANDON <quest name> --- (shows warning, requires confirmation)
    if (lower.startsWith('abandon ')) {
      const questName = raw.substring(8).trim();
      if (!questName) return fail(ctx, character, 'Abandon which quest?');

      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
        if (!qt) continue;
        if (qt.name.toLowerCase() !== questName.toLowerCase()) continue;
        if (isQuestTurnedIn(qi)) {
          return fail(ctx, character, `You've already turned in ${qt.name}; it cannot be abandoned.`);
        }

        let warning = `{{color:#f59e0b}}--- Abandon ${qt.name}? ---{{/color}}\n`;
        if (qt.npcId) {
          const npc = ctx.db.npc.id.find(qt.npcId);
          if (npc) {
            warning += `Your relationship with {{color:#60a5fa}}${npc.name}{{/color}} will suffer.\n`;
          }
        }
        warning += `This quest may never be offered again.\n\n`;
        warning += `{{color:#ef4444}}[Confirm Abandon ${qt.name}]{{/color}}  {{color:#22c55e}}[Keep Quest]{{/color}}`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest', warning);
        return;
      }
      return fail(ctx, character, `No quest found called "${questName}".`);
    }

    // --- KEEP QUEST --- (cancel abandonment)
    if (lower === 'keep quest') {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        'You decide to continue your quest.');
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
      const sellArg = raw.substring(5).trim();
      if (!sellArg) return fail(ctx, character, 'Sell what?');

      const npcsAtLoc = [...ctx.db.npc.by_location.filter(character.locationId)];
      const vendorNpc = npcsAtLoc.find((n: any) => n.npcType === 'vendor');
      if (!vendorNpc) return fail(ctx, character, 'There is no vendor here.');

      // --- SELL ALL JUNK / SELL JUNK ---
      const lowerArg = sellArg.toLowerCase();
      if (lowerArg === 'junk' || lowerArg === 'all junk') {
        const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);
        let total = 0n;
        const soldNames: string[] = [];
        for (const inst of ctx.db.item_instance.by_owner.filter(character.id)) {
          if (inst.equippedSlot) continue;
          const tmpl = ctx.db.item_template.id.find(inst.templateId);
          if (!tmpl || !tmpl.isJunk) continue;
          if (isQuestItemTemplate(tmpl)) continue;
          total += sellPayout(
            tmpl.vendorValue ?? 0n,
            inst.quantity ?? 1n,
            vendorSellBonus,
            character.vendorSellMod ?? 0n
          );
          soldNames.push(inst.displayName || tmpl.name);
          for (const affix of ctx.db.item_affix.by_instance.filter(inst.id)) {
            ctx.db.item_affix.id.delete(affix.id);
          }
          ctx.db.item_instance.id.delete(inst.id);
        }
        if (soldNames.length === 0) {
          return fail(ctx, character, 'You have no junk to sell.');
        }
        ctx.db.character.id.update({ ...character, gold: (character.gold ?? 0n) + total });
        const preview = soldNames.slice(0, 3);
        const extra = soldNames.length > 3 ? ` and ${soldNames.length - 3} more` : '';
        const bonusMsg = appliedSellBonusPercent(vendorSellBonus) > 0 ? ` (${appliedSellBonusPercent(vendorSellBonus)}% perk bonus)` : '';
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `You sell ${soldNames.length} junk item(s) for ${total} gold${bonusMsg}: ${preview.join(', ')}${extra}.`);
        return;
      }

      // --- SELL N <item> ---
      const sellNMatch = sellArg.match(/^(\d+)\s+(.+)$/i);
      if (sellNMatch) {
        // Zero is refused with the window's own line instead of selling one: nothing is written.
        const wanted = BigInt(sellNMatch[1]);
        if (wanted < 1n) return fail(ctx, character, 'Choose at least one to sell.');
        const itemNameTarget = sellNMatch[2].trim();
        const vendorSellBonus = getPerkBonusByField(ctx, character.id, 'vendorSellBonus', character.level);

        const matchingItems: any[] = [];
        let questMatchesSkipped = 0;
        for (const inst of ctx.db.item_instance.by_owner.filter(character.id)) {
          if (inst.equippedSlot) continue;
          const tmpl = ctx.db.item_template.id.find(inst.templateId);
          if (!tmpl) continue;
          const name = inst.displayName || tmpl.name;
          if (name.toLowerCase().includes(itemNameTarget.toLowerCase())) {
            if (isQuestItemTemplate(tmpl)) {
              questMatchesSkipped++;
              continue;
            }
            matchingItems.push({ inst, tmpl });
          }
        }
        if (matchingItems.length === 0) {
          if (questMatchesSkipped > 0) return fail(ctx, character, QUEST_ITEM_SALE_REFUSAL);
          return fail(ctx, character, `You don't have "${itemNameTarget}" in your backpack.`);
        }

        // N is a number of UNITS, walked across the matching stacks in order. Each touched stack
        // goes through the shared helper (one payout per stack, like the window Sell). Selling
        // part of one stack is the typed form of the picker's single Sell, so it records buy-back
        // with the exact quantity; a sale spanning several stacks is a bulk sale and records
        // nothing, like sell junk.
        const plan: Array<{ inst: any; tmpl: any; take: bigint }> = [];
        let remaining = wanted;
        for (const { inst, tmpl } of matchingItems) {
          if (remaining <= 0n) break;
          const have: bigint = inst.quantity ?? 1n;
          const take = have < remaining ? have : remaining;
          plan.push({ inst, tmpl, take });
          remaining -= take;
        }
        let totalGold = 0n;
        let sold = 0n;
        let soldTemplateName = '';
        for (const { inst, tmpl, take } of plan) {
          const paid = sellInstanceToVendor(ctx, {
            character,
            instance: inst,
            template: tmpl,
            npcId: vendorNpc.id,
            quantity: take,
            record: plan.length === 1,
            announce: false,
            fail,
          });
          totalGold += paid ?? 0n;
          sold += take;
          soldTemplateName = tmpl.name;
        }
        const bonusMsg = appliedSellBonusPercent(vendorSellBonus) > 0 ? ` (${appliedSellBonusPercent(vendorSellBonus)}% perk bonus)` : '';
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
          `You sell ${sold}x ${soldTemplateName} for ${totalGold} gold${bonusMsg}.`);
        return;
      }

      // --- SELL <item> (single) ---
      const itemNameTarget = sellArg;

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

      // One shared helper: refuses quest items, pays, snapshots the affixes, lists, records buy-back.
      sellInstanceToVendor(ctx, {
        character,
        instance: matchedInstance,
        template: matchedTemplate,
        npcId: vendorNpc.id,
        record: true,
        fail,
      });
      return;
    }

    // --- HOTBAR COMMANDS ---
    // "hotbars" — list all hotbars with slot contents
    if (lower === 'hotbars') {
      const allHotbars = [...ctx.db.hotbar.by_character.filter(character.id)];
      if (allHotbars.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'You have no hotbars. Type [hotbar add main] to create one.');
        return;
      }
      const sorted = [...allHotbars].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      const lines: string[] = ['{{color:#c9a227}}— Hotbars —{{/color}}'];
      for (const hb of sorted) {
        const activeTag = hb.isActive ? ' {{color:#22c55e}}(active){{/color}}' : '';
        const slots = [...ctx.db.hotbar_slot.by_hotbar.filter(hb.id)];
        const slotParts = slots
          .sort((a: any, b: any) => a.slot - b.slot)
          .map((s: any) => {
            const tmpl = ctx.db.ability_template.id.find(s.abilityTemplateId);
            const name = tmpl ? tmpl.name : `#${s.abilityTemplateId}`;
            return `{{color:#868e96}}${s.slot}:{{/color}}[${name}]`;
          });
        const slotStr = slotParts.length > 0 ? `\n    ${slotParts.join('  ')}` : '\n    {{color:#868e96}}(empty){{/color}}';
        lines.push(`  [hotbar ${hb.name}]${activeTag}${slotStr}`);
      }
      lines.push('{{color:#868e96}}Click a hotbar name to switch. hotbar add {name} to create.{{/color}}');
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', lines.join('\n'));
      return;
    }

    // "hotbar" (bare) — show active hotbar contents
    if (lower === 'hotbar') {
      const activeHotbar = [...ctx.db.hotbar.by_character.filter(character.id)].find((h: any) => h.isActive);
      if (!activeHotbar) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'You have no active hotbar. Type [hotbar add main] to create one.');
        return;
      }
      const slots = [...ctx.db.hotbar_slot.by_hotbar.filter(activeHotbar.id)];
      if (slots.length === 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `{{color:#c9a227}}— ${activeHotbar.name} —{{/color}} {{color:#22c55e}}(active){{/color}}\n  {{color:#868e96}}(empty) — Use hotbar set {slot} {ability} to assign abilities.{{/color}}`);
        return;
      }
      const slotParts = slots
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((s: any) => {
          const tmpl = ctx.db.ability_template.id.find(s.abilityTemplateId);
          const name = tmpl ? tmpl.name : `#${s.abilityTemplateId}`;
          return `  {{color:#868e96}}${s.slot}:{{/color}} [${name}]`;
        });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#c9a227}}— ${activeHotbar.name} —{{/color}} {{color:#22c55e}}(active){{/color}}\n${slotParts.join('\n')}`);
      return;
    }

    // "hotbar add <name>" — create a new named hotbar
    const hotbarAddMatch = lower.match(/^hotbar\s+add\s+(.+)$/i);
    if (hotbarAddMatch) {
      const newName = raw.substring('hotbar add '.length).trim();
      const existing = [...ctx.db.hotbar.by_character.filter(character.id)];
      if (existing.length >= 10) {
        return fail(ctx, character, 'You already have 10 hotbars (maximum).');
      }
      for (const h of existing) {
        ctx.db.hotbar.id.update({ ...h, isActive: false });
      }
      ctx.db.hotbar.insert({
        id: 0n,
        characterId: character.id,
        name: newName,
        sortOrder: existing.length,
        isActive: true,
        createdAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}Created hotbar "${newName}" and set as active.{{/color}}`);
      return;
    }

    // "hotbar delete <name>" — remove a named hotbar and all its slots
    const hotbarDeleteMatch = lower.match(/^hotbar\s+delete\s+(.+)$/i);
    if (hotbarDeleteMatch) {
      const targetName = raw.substring('hotbar delete '.length).trim();
      const allHotbars = [...ctx.db.hotbar.by_character.filter(character.id)];
      const target = allHotbars.find((h: any) => h.name.toLowerCase() === targetName.toLowerCase());
      if (!target) return fail(ctx, character, `No hotbar named "${targetName}" found.`);
      if (allHotbars.length <= 1) return fail(ctx, character, 'Cannot delete your only hotbar.');
      // Delete all slots belonging to this hotbar
      for (const s of [...ctx.db.hotbar_slot.by_hotbar.filter(target.id)]) {
        ctx.db.hotbar_slot.id.delete(s.id);
      }
      ctx.db.hotbar.id.delete(target.id);
      // If was active, switch to the first remaining hotbar
      if (target.isActive) {
        const remaining = allHotbars.filter((h: any) => h.id !== target.id);
        if (remaining.length > 0) {
          ctx.db.hotbar.id.update({ ...remaining[0], isActive: true });
        }
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}Deleted hotbar "${target.name}".{{/color}}`);
      return;
    }

    // "hotbar clear <slot>" — remove ability from a hotbar slot
    const hotbarClearMatch = lower.match(/^hotbar\s+clear\s+(\d+)$/i);
    if (hotbarClearMatch) {
      const slot = parseInt(hotbarClearMatch[1], 10);
      if (slot < 1 || slot > 10) return fail(ctx, character, 'Hotbar slot must be 1–10.');
      const activeHotbar = [...ctx.db.hotbar.by_character.filter(character.id)].find((h: any) => h.isActive);
      if (!activeHotbar) return fail(ctx, character, 'You have no active hotbar.');
      const existing = [...ctx.db.hotbar_slot.by_hotbar.filter(activeHotbar.id)].find((s: any) => s.slot === slot);
      if (!existing) return fail(ctx, character, `Slot ${slot} is already empty.`);
      ctx.db.hotbar_slot.id.delete(existing.id);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}Cleared{{/color}} slot {{color:#c9a227}}${slot}{{/color}} on hotbar "${activeHotbar.name}".`);
      return;
    }

    // "hotbar set <slot> <ability>" or "hotbar set <ability> <slot>" — assign ability to slot
    const hotbarSetMatch1 = lower.match(/^hotbar\s+set\s+(\d+)\s+(.+)$/i);
    const hotbarSetMatch2 = lower.match(/^hotbar\s+set\s+(.+?)\s+(\d+)$/i);
    if (hotbarSetMatch1 || hotbarSetMatch2) {
      const slotStr = hotbarSetMatch1 ? hotbarSetMatch1[1] : hotbarSetMatch2![2];
      const abilityStr = hotbarSetMatch1 ? hotbarSetMatch1[2] : hotbarSetMatch2![1];
      const slot = parseInt(slotStr, 10);
      // Extract original-case ability name from raw input
      const abilityName = raw.substring(raw.toLowerCase().indexOf(abilityStr), raw.toLowerCase().indexOf(abilityStr) + abilityStr.length).trim();
      if (slot < 1 || slot > 10) return fail(ctx, character, 'Hotbar slot must be 1–10.');
      const abilities = [...ctx.db.ability_template.by_character.filter(character.id)];
      const matched = abilities.find((a: any) => a.name.toLowerCase() === abilityName.toLowerCase())
        ?? abilities.find((a: any) => a.name.toLowerCase().includes(abilityName.toLowerCase()));
      if (!matched) return fail(ctx, character, `No ability matching "${abilityName}" found.`);
      const activeHotbar = [...ctx.db.hotbar.by_character.filter(character.id)].find((h: any) => h.isActive);
      const hotbar = activeHotbar ?? (() => {
        return ctx.db.hotbar.insert({
          id: 0n, characterId: character.id, name: 'main',
          sortOrder: 0, isActive: true, createdAt: ctx.timestamp,
        });
      })();
      const existingSlot = [...ctx.db.hotbar_slot.by_hotbar.filter(hotbar.id)].find((s: any) => s.slot === slot);
      if (existingSlot) {
        ctx.db.hotbar_slot.id.update({ ...existingSlot, abilityTemplateId: matched.id, assignedAt: ctx.timestamp });
      } else {
        ctx.db.hotbar_slot.insert({
          id: 0n, characterId: character.id, hotbarId: hotbar.id,
          slot, abilityTemplateId: matched.id, assignedAt: ctx.timestamp,
        });
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}[${matched.name}]{{/color}} assigned to slot {{color:#c9a227}}${slot}{{/color}} on hotbar "${hotbar.name}".`);
      return;
    }

    // "hotbar swap <slot1> <slot2>" — swap two slots on active hotbar
    const hotbarSwapMatch = lower.match(/^hotbar\s+swap\s+(\d+)\s+(\d+)$/i);
    if (hotbarSwapMatch) {
      const slot1 = parseInt(hotbarSwapMatch[1], 10);
      const slot2 = parseInt(hotbarSwapMatch[2], 10);
      const activeHotbar = [...ctx.db.hotbar.by_character.filter(character.id)].find((h: any) => h.isActive);
      if (!activeHotbar) return fail(ctx, character, 'You have no active hotbar.');
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
          id: 0n, characterId: character.id, hotbarId: activeHotbar.id,
          slot: slot1, abilityTemplateId: id2, assignedAt: ctx.timestamp,
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
          id: 0n, characterId: character.id, hotbarId: activeHotbar.id,
          slot: slot2, abilityTemplateId: id1, assignedAt: ctx.timestamp,
        });
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}Swapped{{/color}} slots {{color:#c9a227}}${slot1}{{/color}} and {{color:#c9a227}}${slot2}{{/color}} on hotbar "${activeHotbar.name}".`);
      return;
    }

    // "hotbar set" or "hotbar swap" with bad args — show usage instead of falling through
    if (lower.match(/^hotbar\s+set\b/i)) {
      return fail(ctx, character, 'Usage: hotbar set {slot} {ability} — e.g. hotbar set 1 fireball');
    }
    if (lower.match(/^hotbar\s+swap\b/i)) {
      return fail(ctx, character, 'Usage: hotbar swap {slot1} {slot2} — e.g. hotbar swap 1 2');
    }
    if (lower.match(/^hotbar\s+clear\b/i)) {
      return fail(ctx, character, 'Usage: hotbar clear {slot} — e.g. hotbar clear 3');
    }
    if (lower.match(/^hotbar\s+delete\b/i)) {
      return fail(ctx, character, 'Usage: hotbar delete {name} — e.g. hotbar delete buffs');
    }

    // "hotbar <name>" — switch active hotbar (must come AFTER add/set/swap/delete checks)
    const hotbarSwitchMatch = lower.match(/^hotbar\s+(?!add\s|set\b|swap\b|clear\b|delete\s)(.+)$/i);
    if (hotbarSwitchMatch) {
      const targetName = hotbarSwitchMatch[1].trim();
      const allHotbars = [...ctx.db.hotbar.by_character.filter(character.id)];
      const target = allHotbars.find((h: any) => h.name.toLowerCase() === targetName.toLowerCase());
      if (!target) return fail(ctx, character, `No hotbar named "${targetName}" found. Type [hotbars] to see your hotbars.`);
      for (const h of allHotbars) {
        ctx.db.hotbar.id.update({ ...h, isActive: h.id === target.id });
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        `{{color:#22c55e}}Switched to hotbar "${target.name}".{{/color}}`);
      return;
    }

    // --- CAMP / REST ---
    if (lower === 'camp' || lower === 'rest') {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You cannot rest while in combat.');
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You make camp and rest briefly. The world continues without you.');

      // Schedule logout after 10 seconds
      const CAMP_LOGOUT_DELAY = 10_000_000n; // 10 seconds in microseconds
      const logoutAtMicros = ctx.timestamp.microsSinceUnixEpoch + CAMP_LOGOUT_DELAY;
      ctx.db.character_logout_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(logoutAtMicros),
        characterId: character.id,
        ownerUserId: character.ownerUserId,
        logoutAtMicros,
      });
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

    // --- SKILLS: ask the Keeper for a new skill offer (same rules as level-up) ---
    if (lower === 'skills') {
      const offer = requestSkillOffer(ctx, character, ctx.sender);
      if (offer.kind === 'system') return fail(ctx, character, offer.text);
      return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', offer.text);
    }

    // --- EXPLORE: the player's retry for world gen (only useful after errors; generation never retries itself).
    // It retries the first region, the second half of a region that failed to fill, or a failed uncharted edge. ---
    if (lower === 'explore') {
      // A character still at location 0 is waiting on the starter region: retry it from its own ERROR state
      // (looked up by character, so another identity of the same user can retry too).
      if (character.locationId === 0n) {
        const starter = retryStarterWorldGen(ctx, character, ctx.sender);
        if (starter === 'busy') {
          return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', STARTER_RETRY_MESSAGES.busy);
        }
        if (starter === 'none') return fail(ctx, character, STARTER_RETRY_MESSAGES.none);
        // Phase 51.3.1.2 (D-17, D-18): only the failed stage (2a or 2b) of the first region was re-enqueued.
        if (starter === 'fill_started') {
          return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', WORLD_FILL_RETRY_LINE);
        }
        if (starter === 'started') {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', STARTER_RETRY_MESSAGES.started);
        }
        return;
      }
      // Phase 43: the second half of a region (stage 2). A FILLING or FILLING_FAMILIES state answers with
      // patience; a failed state at the crossing or in the region gets only its failed stage re-enqueued
      // (never stage 1): FILL_ERROR the places call (world_gen), FAMILIES_ERROR the families call
      // (world_gen_families) alone, so the places are never asked for twice (Phase 51.3.1.2, D-09, D-18).
      const fill = retryWorldFill(ctx, character, ctx.sender);
      if (fill === 'busy') {
        return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', STARTER_RETRY_MESSAGES.busy);
      }
      if (fill === 'started') {
        return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', WORLD_FILL_RETRY_LINE);
      }
      if (fill === 'refused') return; // failWorldFill already posted the in-voice line
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
      const retryState = ctx.db.world_gen_state.insert({
        id: 0n,
        playerId: ctx.sender,
        characterId: args.characterId,
        sourceLocationId: character.locationId,
        sourceRegionId: currentLoc.regionId,
        step: 'PENDING',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      const startedRetry = startWorldGeneration(ctx, retryState);
      if (startedRetry === 'enqueued' || startedRetry === 'duplicate') {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'The edges of reality shimmer around you. The world pauses, as if remembering something it had forgotten...');
      }
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
          nowhereToGoLine(ctx, character.locationId));
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
          : nowhereToGoLine(ctx, character.locationId);
        return fail(ctx, character, `No path leads to "${travelTarget}". ${hint}`);
      }

      performTravel(ctx, travelDeps(deps), character, matchedLocation.id);
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
      if (target.online !== true) return fail(ctx, character, `${target.name} is offline.`);

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

      // Hailing the NPC a completed quest is turned in to (its giver, or a delivery's recipient) turns it in,
      // through the same shared path as the hail_npc reducer; a turn-in takes priority over the greeting.
      if (turnInQuestsAtNpc(ctx, character, npc, appendPrivateEvent, fail)) return;

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
        const regard = npcRegardLine(npc.name, npcGender(npc), affinity);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', regard);
        return;
      }

      // Individuals (named, event and boss spawns), then a creature family by its name, plural,
      // singular or a member's name (Phase 51.3.1.1 D-03, D-07): exact names before partial ones.
      const conTarget = findFightTarget(ctx, character, targetName, ctx.timestamp.microsSinceUnixEpoch);
      if (conTarget) {
        const line = conTarget.kind === 'family'
          ? familyConLine(conTarget.here, character.level)
          : individualConLine(conTarget.one, character.level);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', line);
        return;
      }

      return fail(ctx, character, `You see no one named "${conMatch[1].trim()}" here to consider.`);
    }

    // --- ATTACK / FIGHT / KILL / PULL ---
    // Phase 51.3.1.1 (D-07, D-12, UI-SPEC P3): a named, event or boss individual starts its own fight;
    // a creature family is pulled through the same helper as the Pull button (pullFamilyFor). With no
    // name, the first living family in danger order is pulled. The careful-pull prompt is retired.
    const attackMatch = raw.match(/^(?:attack|fight|kill|pull)(?:\s+(.*))?$/i);
    if (attackMatch) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You are already in combat. Use your abilities.');
      }
      const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
      const typedName = (attackMatch[1] ?? '').trim();
      const target = typedName
        ? findFightTarget(ctx, character, typedName, now)
        : firstFightTarget(ctx, character, now);
      if (!target) {
        if (!typedName) return fail(ctx, character, FIGHT_TEXT.nothing);
        const nearby = nearbyFightNames(ctx, character, now).map((n) => `[${n}]`).join(', ');
        return fail(ctx, character, nearby ? FIGHT_TEXT.unknownNearby(typedName, nearby) : FIGHT_TEXT.unknown(typedName));
      }
      const refusal = target.kind === 'family'
        ? pullFamilyFor(deps, ctx, character, target.here.pool, now)
        : fightIndividualFor(deps, ctx, character, target.one);
      if (refusal) return fail(ctx, character, refusal, 'combat');
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
      performTravel(ctx, travelDeps(deps), character, implicitDest.id);
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
      `The Keeper regards you with mild contempt. "${raw}" means nothing here. Perhaps try [help].`);
  });
};
