---
phase: 22
title: Class Ability Balancing & Progression
status: discussed
created: 2026-02-20
---

## Core Design Rule

**Abilities unlock at odd levels only: 1, 3, 5, 7, 9. Level 10 = capstone.**
Even levels are reserved exclusively for racial bonuses. This gives 6 ability unlock points per class.

All existing level 2 and level 4 abilities have been repositioned into the odd-level slots or redesigned.

---

## New Backend Systems Required

These mechanics are referenced by multiple classes and need new backend support:

| System | Required By | Description |
|--------|-------------|-------------|
| **Stun debuff** | Monk (L3), Shaman (L10), Enchanter (L3) | New debuffType: 'stun' — prevents enemy actions for N seconds |
| **Life drain tick** | Necromancer (L5 Wither), Reaver (L1 Blood Rend) | DoT that heals caster for % of damage dealt per tick |
| **Debuff DoT** | Necromancer (L7 Soul Rot) | DoT that also applies a stat debuff per tick |
| **BardSong system** | Bard (all abilities) | Active song table + 6s tick scheduler — see Bard section |
| **Haste buff** | Enchanter (L7) | New CharacterEffect type: reduces cast time + increases auto-attack rate |
| **Charm/Copy pet** | Enchanter (L10) | Spawns a temporary combat pet mirroring the current target's stats |
| **Shapeshifter form** | Druid (L10) | 30s physical mode + temporary bonus HP buffer (CharacterEffect) |
| **Pet aggro** | Beastmaster (L1), Summoner (all pets), Necromancer (L3) | Pets immediately generate aggro and can be attacked by enemies |
| **Pet swap** | Summoner | 10-second overlap window when swapping pets; old pet fades after 10s |
| **Conjure items** | Summoner (L3, L9) | Creates actual inventory items (food/bandages, temp gear with affixes) |
| **Temp equipment** | Summoner (L9) | ItemInstance flag: lasts until logout, stripped on disconnect |
| **Death Bloom spread** | (Necromancer capstone removed — Plague Lord Form instead) | N/A |
| **Travel discount buff** | Bard (L7) | CharacterEffect type: reduces travel stamina cost per move |
| **Berserker stance** | Warrior (L10) | 30s buff: +50% physical damage, cannot use defensive abilities |
| **Plague Lord Form** | Necromancer (L10) | 30s stance: all DoTs tick 2x faster, life drains heal 2x |

---

## Class-by-Class Ability Progressions

### Warrior
**Identity:** Armor-shredding frontliner who draws aggro and punishes clustered enemies.
**Resource:** Stamina

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Slam | Physical dmg + AC debuff | Armor shred (-5 AC, 7s) |
| 3 | Intimidating Presence | Taunt/aggro | Draws enemy attention |
| 5 | Crushing Blow | Heavy single-target physical | |
| 7 | Cleave | AoE physical | All enemies, 65% dmg per target |
| 9 | Rally | Group morale shout | Party buff |
| 10 | Berserker Rage | Stance buff (30s) | +50% physical damage, cannot use defensive abilities, 5 min CD |

---

### Cleric
**Identity:** Primary group healer and party buffer. Makes the whole group more effective through healing and long-duration blessings. One divine damage ability at the capstone.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Mend | Small direct heal | The reliable, frequently-used heal |
| 3 | Blessing of Might | Group STR buff (45 min) | Whole party hits harder; long-duration blessing |
| 5 | Heal | Large direct heal | Signature big heal — the Cleric's core identity |
| 7 | Sanctify | Group armor + HP regen buff (45 min) | AC bonus for whole party + passive HP regen; long-duration blessing |
| 9 | Resurrect | Out-of-combat revive | 50% HP/mana restore, 10s cast, teleports fallen ally |
| 10 | Holy Nova | AoE Smite + party heal (capstone) | Deals AoE divine magic damage to all enemies AND heals all allies simultaneously; the one Smite expression; 3 min CD |

**Buff design:** Both blessings (Blessing of Might, Sanctify) are 45-minute party-wide buffs that should be cast before major encounters.

---

### Wizard
**Identity:** Burst arcane magic specialist with mana management.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Magic Missile | Magic damage | Fast, reliable |
| 3 | Frost Shard | Magic damage | Targeted |
| 5 | Lightning Surge | Big single-target magic | 2s cast |
| 7 | Mana Shield | Absorb damage buff | |
| 9 | Arcane Storm | AoE magic damage | All enemies |
| 10 | Arcane Explosion | Massive AoE magic | Power 10, 3s cast, 5 min CD |

---

### Rogue
**Identity:** Stealth-flavored physical DPS with DoT bleeds and burst finishers.
**Resource:** Stamina

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Shadow Cut | Physical + bleed DoT | 40% power split, 2 ticks |
| 3 | Evasion | Dodge chance buff | |
| 5 | Shadow Strike | Heavy physical burst | |
| 7 | Bleed | Pure DoT | 60% power split, 3 ticks |
| 9 | Pickpocket | Utility | Steal from target |
| 10 | Death Mark | 15s damage buff | +50% damage to marked target, stacks with DoTs, 3 min CD |

---

### Ranger
**Identity:** True hybrid — physical ranged attacks + magic/utility abilities.
**Resource:** Hybrid (physical abilities = stamina, magic/utility = mana)

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Marked Shot | Physical bow damage | Stamina |
| 3 | Track | Scout utility — reveals enemy names/levels | Mana |
| 5 | Piercing Arrow | Heavy physical | Stamina |
| 7 | Nature's Balm | Minor heal | Mana |
| 9 | Rapid Shot | Multi-hit physical | Stamina |
| 10 | Rain of Arrows | AoE physical | All enemies, power 9, 2 min CD |

**Note:** All bow damage switched to physical (was magic). Physical abilities use stamina, magic/utility use mana.

---

### Druid
**Identity:** Nature magic DPS with HoT healing and gather utility.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Thorn Lash | Magic damage | |
| 3 | Nature's Mark | Gather utility | Instant gather from location |
| 5 | Wild Surge | Big magic damage | |
| 7 | Nature's Gift | HoT | Heals ally over time |
| 9 | Entangle | AoE root + DoT | All enemies |
| 10 | Shapeshifter Form | 30s physical stance | +40% damage, cannot cast spells, grants temporary bonus HP buffer during form, 5 min CD |

---

### Bard
**Identity:** Musical group support — all abilities are "songs" with group effects.
**Resource:** Mana
**Special system: Melody Weaving**

#### Melody System
- All Bard abilities are "songs" — casting a song makes it **active**
- Active songs **tick their effect on the group every 6 seconds** indefinitely
- When a new song is cast, the old song enters a **6-second fade window** (one final tick), then ends
- Songs fade **independently** — if 3 songs are cast in rapid succession, all 3 overlap briefly before fading in order
- Works both in-combat and out-of-combat (including during travel)
- All Bard abilities have **1-second cooldown** (not standard cooldowns)

#### Backend: BardSong table
- `characterId`, `songAbilityKey`, `activatedAt`, `fadingUntil` (optional)
- Scheduled 6s tick reapplies each active song's effect to party
- On new song cast: mark previous song as fading (fadingUntil = now + 6s), insert new active song

| Level | Ability | Song Effect | Notes |
|-------|---------|-------------|-------|
| 1 | Discordant Note | AoE sonic damage to all enemies | Every 6s tick hits whole room |
| 3 | Melody of Mending | Group HP regen HoT (all allies, 1 tick per 6s) | |
| 5 | Chorus of Vigor | Group mana regen (all allies, 1 tick per 6s) | |
| 7 | March of the Wayfarers | Travel stamina cost reduction for all party at location | Works out of combat; buff stays until Bard switches songs |
| 9 | Battle Hymn | AoE sonic damage + group HP/mana regen simultaneously | Combo song |
| 10 | Finale | Ends all active/fading songs in a burst | Delivers full effect of each ended song simultaneously; proportional to songs active; 3 min CD; NOT a sustained song |

---

### Monk
**Identity:** Disciplined physical striker, chi-powered unarmed combat.
**Resource:** Stamina

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Crippling Kick | Physical + slow debuff | |
| 3 | Stunning Strike | Physical + stun debuff | Requires stun backend support |
| 5 | Tiger Flurry | Multi-hit physical burst | |
| 7 | Centering | Stamina restore | 60s CD |
| 9 | Inner Focus | Combat damage buff | |
| 10 | Hundred Fists | Physical x5 rapid hits | Total power 12 split across hits, 2 min CD |

---

### Paladin
**Identity:** Holy tank who heals, buffs, and deals divine damage.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Holy Strike | Physical (holy-infused) | |
| 3 | Shield of Faith | Ally shield buff | |
| 5 | Radiant Smite | Heavy physical (holy) | 1s cast |
| 7 | Lay on Hands | Full single-target heal | 600s CD |
| 9 | Devotion | Group defense AoE buff | All party |
| 10 | Consecrated Ground | DoT all enemies + HoT all allies | Both 3 ticks, high power split, 3 min CD |

---

### Shaman
**Identity:** Spirit healer who debuffs enemies and calls elemental storms.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Spirit Mender | HoT | Heals ally over time |
| 3 | Hex | Magic damage + AC debuff | |
| 5 | Stormcall | Big magic damage | 2s cast |
| 7 | Spirit Wolf | Summon companion | |
| 9 | Ancestral Ward | Spirit shield buff | |
| 10 | Earthquake | AoE physical + stun all enemies | Power 9, 5 min CD; requires stun backend |

---

### Necromancer
**Identity:** DoT specialist with multiple drain flavors and undead pet companion.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Plague Spark | Pure magic DoT | 3 ticks, 50% power split |
| 3 | Bone Servant | Summon undead pet | Pet holds aggro |
| 5 | Wither | Life drain DoT | Deals magic damage AND heals caster for 50% per tick — requires drain DoT backend |
| 7 | Soul Rot | Debuff DoT | Deals damage AND reduces target's AC per tick — requires debuff DoT backend |
| 9 | Corpse Summon | Out-of-combat utility | Summons fallen ally's corpse to caster location |
| 10 | Plague Lord Form | 30s stance | All DoTs tick 2x faster, life drains heal 2x, Bone Servants buffed; 5 min CD |

---

### Beastmaster
**Identity:** Animal companion controller — the beast fights, the master directs.
**Resource:** Stamina

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Call Beast | Summon companion | From level 1 — beast identity established immediately |
| 3 | Pack Rush | Coordinated charge | Master + companion strike together |
| 5 | Alpha Assault | Heavy coordinated physical | |
| 7 | Wild Howl | Empower companion buff | |
| 9 | Beast Fang | Heavy companion strike | Companion deals massive damage |
| 10 | Wild Hunt | Companion AoE | Companion strikes all enemies, power 10, 3 min CD |

---

### Enchanter
**Identity:** Mental domination — DoT damage, CC control, party acceleration, enemy conversion.
**Resource:** Mana

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Mind Fray | Magic DoT | 3 ticks psychic damage |
| 3 | Mesmerize | Stun CC | 4 second stun; requires stun backend |
| 5 | Clarity | Group mana regen buff | Whole party mana acceleration |
| 7 | Haste | Party speed buff (30s) | Faster auto-attacks + reduced cast times — requires new CharacterEffect type |
| 9 | Bewilderment | AoE AC + hit debuff | All enemies confused |
| 10 | Charm | Summon enemy copy as pet | Creates a psychic copy of current target that fights for the party for combat duration. Works in 1v1. Copy has same stats as original. 5 min CD |

---

### Reaver
**Identity:** Dark physical warrior who sustains through blood and punishes with dark power.
**Resource:** Mana (main) + Stamina (Blood Pact)

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Blood Rend | Physical + minor lifesteal | ~20% lifesteal; deals damage AND heals caster — baseline sustain throughout game |
| 3 | Soul Rend | Heavy physical | Dark energy strike |
| 5 | Oblivion | Devastating single-target physical | 1s cast |
| 7 | Dread Aura | AoE enemy debuff | Weakens all enemies |
| 9 | Blood Pact | Self-buff (costs HP) | Stamina resource |
| 10 | Death's Embrace | 30s lifesteal stance | +30% lifesteal on all damage + 25% physical damage increase; 5 min CD |

---

### Spellblade
**Identity:** Elemental frontline tank — melee combat infused with fire, ice, lightning, and earth.
**Resource:** Hybrid (stamina for physical strikes, mana for elemental infusions)

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Flame Strike | Fire physical (stamina) | Physical damage + fire DoT |
| 3 | Frost Armor | Ice defense (mana) | Self-buff: reduces incoming damage + slows melee attackers on hit |
| 5 | Thunder Cleave | Lightning AoE (stamina) | Physical + magic damage to all enemies |
| 7 | Stone Skin | Earth tank (mana) | Heavy AC buff for 30 seconds |
| 9 | Magma Shield | Fire+earth defense (mana) | Damage reduction + burns melee attackers with fire DoT |
| 10 | Elemental Surge | All four elements | Single-target; highest combined physical + magic damage; channeling capstone; 5 min CD |

---

### Summoner
**Identity:** Conjuration master — elemental pets with roles, conjured consumables and gear for the group.
**Resource:** Mana
**Note:** Does NOT have direct damage abilities. All damage comes through pets.

#### Pet System
- One active pet type at a time (Earth, Fire, or Water elemental)
- Swapping pets: old pet has **10-second overlap** before fading
- Pets immediately generate aggro (Earth especially — auto-taunts)
- Pets act each combat round independently

#### Conjured Items
- **Conjure Sustenance** (L3): Creates food + bandages in each group member's inventory
- **Conjure Equipment** (L9): Creates a temporary weapon or armor piece with a random affix — lasts until logout; flagged as temporary, stripped on disconnect

| Level | Ability | Type | Notes |
|-------|---------|------|-------|
| 1 | Summon Earth Elemental | Tank pet | Immediately holds aggro; physical strikes; high HP |
| 3 | Conjure Sustenance | Group utility | Creates food + bandages for all party members |
| 5 | Summon Fire Elemental | DPS pet | High damage, aggressive; replaces Earth with 10s overlap |
| 7 | Summon Water Elemental | Healer pet | Heals summoner + nearby allies each round |
| 9 | Conjure Equipment | Personal utility | Temp weapon or armor with random affix; lasts until logout |
| 10 | Summon Primal Titan | Ultimate pet (90s) | Tanks + deals AoE magic damage + heals party each round; all-in-one capstone elemental; 5 min CD |

---

## Summary Table

| Class | L1 | L3 | L5 | L7 | L9 | L10 Capstone |
|-------|----|----|----|----|----|----|
| Warrior | Slam | Intimidating Presence | Crushing Blow | Cleave | Rally | Berserker Rage |
| Cleric | Mend | Blessing of Might | Heal | Sanctify | Resurrect | Holy Nova |
| Wizard | Magic Missile | Frost Shard | Lightning Surge | Mana Shield | Arcane Storm | Arcane Explosion |
| Rogue | Shadow Cut | Evasion | Shadow Strike | Bleed | Pickpocket | Death Mark |
| Ranger | Marked Shot | Track | Piercing Arrow | Nature's Balm | Rapid Shot | Rain of Arrows |
| Druid | Thorn Lash | Nature's Mark | Wild Surge | Nature's Gift | Entangle | Shapeshifter Form |
| Bard | Discordant Note | Melody of Mending | Chorus of Vigor | March of Wayfarers | Battle Hymn | Finale |
| Monk | Crippling Kick | Stunning Strike | Tiger Flurry | Centering | Inner Focus | Hundred Fists |
| Paladin | Holy Strike | Shield of Faith | Radiant Smite | Lay on Hands | Devotion | Consecrated Ground |
| Shaman | Spirit Mender | Hex | Stormcall | Spirit Wolf | Ancestral Ward | Earthquake |
| Necromancer | Plague Spark | Bone Servant | Wither | Soul Rot | Corpse Summon | Plague Lord Form |
| Beastmaster | Call Beast | Pack Rush | Alpha Assault | Wild Howl | Beast Fang | Wild Hunt |
| Enchanter | Mind Fray | Mesmerize | Clarity | Haste | Bewilderment | Charm |
| Reaver | Blood Rend | Soul Rend | Oblivion | Dread Aura | Blood Pact | Death's Embrace |
| Spellblade | Flame Strike | Frost Armor | Thunder Cleave | Stone Skin | Magma Shield | Elemental Surge |
| Summoner | Summon Earth Elem. | Conjure Sustenance | Summon Fire Elem. | Summon Water Elem. | Conjure Equipment | Summon Primal Titan |

---

## Deferred / Out of Scope

- Haste auto-attack rate implementation is complex — may need to simplify to cast time reduction only if auto-attack tick rate is hard to modify
- Charm pet AI behavior (will it use abilities? just auto-attack?) — planner decides
- Summoner pet AI (do pets have their own ability rotations?) — planner decides
- Shapeshifter Form UI (how does the player know they're in form?) — planner decides
- Bard March of the Wayfarers travel cost reduction amount — planner decides (suggest -3 stamina per move)
