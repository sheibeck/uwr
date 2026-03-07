---
phase: quick-337
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/NarrativeMessage.vue
autonomous: true
requirements: [STYLE-RIPPLE]
must_haves:
  truths:
    - "World ripple messages (kind 'world') are visually distinct from regular system/say messages"
    - "Ripple messages have a mystical/ethereal appearance that conveys world-shifting events"
  artifacts:
    - path: "src/components/NarrativeMessage.vue"
      provides: "Styled ripple/world messages"
      contains: "world"
  key_links: []
---

<objective>
Style ripple messages (world generation announcements) to stand out visually in the narrative console.

Purpose: Ripple messages announce world-altering events (new regions discovered, reality shifting) but currently render as plain white/gray text indistinguishable from system messages. They should feel special and mystical.

Output: Updated NarrativeMessage.vue with distinctive styling for world-scope ripple messages.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/NarrativeMessage.vue
@spacetimedb/src/data/world_gen.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Style world ripple messages with distinctive visual treatment</name>
  <files>src/components/NarrativeMessage.vue</files>
  <action>
In NarrativeMessage.vue, make world ripple messages visually distinctive:

1. Add `'world'` to KIND_COLORS with a mystical purple-blue color: `'#b197fc'` (soft violet).

2. Create a computed `isRipple` that checks `props.event.kind === 'world'` (these are the ripple/world-gen announcements).

3. Apply special styling to ripple messages in the template div's `:style` binding:
   - Italic text (like narrative messages)
   - Left border: `3px solid #b197fc88` (translucent violet)
   - Left padding: `10px`
   - Background: `linear-gradient(90deg, rgba(177, 151, 252, 0.08) 0%, transparent 70%)` — subtle gradient glow from left
   - Letter-spacing: `0.3px` for a slightly ethereal feel
   - Add top/bottom padding of `4px` for breathing room
   - Add top/bottom margin of `4px` (in addition to existing marginBottom)

4. The existing `isNarrative` styling should NOT apply to world messages (they get their own treatment above). The `isRipple` styling takes precedence.

Do NOT change any server-side code. Do NOT change how other message kinds are styled.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx vue-tsc --noEmit --pretty 2>&1 | tail -5</automated>
  </verify>
  <done>World ripple messages render with a distinctive violet-tinted, gradient-background style that clearly sets them apart from regular system messages in the narrative console.</done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Visual: ripple messages in narrative console have violet color, gradient background, and italic styling
</verification>

<success_criteria>
World ripple messages are immediately visually distinguishable from all other message types in the narrative console.
</success_criteria>

<output>
After completion, create `.planning/quick/337-style-ripple-messages-to-stand-out-more-/337-SUMMARY.md`
</output>
