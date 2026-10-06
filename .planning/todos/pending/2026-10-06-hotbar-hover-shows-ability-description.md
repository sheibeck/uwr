---
created: 2026-10-06T16:20:00Z
title: Show the ability description when hovering a hotbar slot
area: ui
files:
  - src/hotbar/hotbar.ts:176-186
  - src/hotbar/HotbarRow.vue:311-312
  - src/hotbar/hotbar.test.ts:255-256
  - src/module_bindings/ability_template_table.ts:17
---

## Problem

The owner asked on 2026-10-06, while playing the new client: "when hovering over a hotkey we should show the description of the ability to help us know what it does."

Hovering a hotbar slot today shows only a native `title` built by `slotTitle()` (`hotbar.ts:176`): name, cost and cooldown, for example `Firebolt · 12 mana · 6s`. The ability's `description`, which `ability_template.description` already stores, is never shown. That leaves players guessing what a generated ability does.

This is related to the older, client-agnostic `2026-03-09-show-cast-times-in-ability-descriptions.md`, which asks for cast time, cost and cooldown on ability cards at creation and level-up. The two are separate tasks; this one is about the hotbar hover.

## Solution

- Show a hover and focus tooltip (or popover) on hotbar slots with:
  - the name
  - the cost, cooldown and cast time (`castSeconds`)
  - in combat, the cooldown in rounds
  - the description text
  - the target type (self, ally or enemy) if useful
- Use text nodes only (descriptions are LLM-generated), and add an img-onerror escape test.
- Keyboard and screen-reader users need the same information. Show it on focus as well as hover, and link it with `aria-describedby`, not only a native `title`.
- Mobile has no hover. A long-press, or a small info affordance, opens the same content in a sheet. Decide this during planning.
- Follow the design guards:
  - no literal colors, no v-html, no `<svg`
  - sizes 10/12/14/20, weights 400/500
  - spacing scale 4/8/16/24/32/48/64
  - no new tokens
- It could also be reused by the Phase 49 ability cards and a future abilities screen.
- Client only; no server change is needed.
