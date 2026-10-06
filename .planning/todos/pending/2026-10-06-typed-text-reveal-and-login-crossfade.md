---
created: 2026-10-06T19:00:00Z
title: Type out story text and cross-fade from login into the game
area: ui
files:
  - src/console/FeedView.vue
  - src/console/FeedLine.vue
  - src/console/pinning.ts
  - src/creation/CreationFeed.vue
  - src/App.vue
  - src/session/deriveScreen.ts
---

## Problem

On 2026-10-06 the owner said: "When we write text to the screen, it's instantly rendered. That's a kind of jarring experience." They asked for two things:
1. A **cross-fade** from the login screen into gameplay.
2. New text in the feed should **type out**: "Don't go too slow. It can be fairly fast, but we want a nice typed-out effect as the text renders."

The goal, in the owner's words: gameplay should feel "smooth and relaxing versus jarring and sharp".

## Solution

**Cross-fade.**
- In `App.vue`, wrap the screen switch (`deriveScreen`: sign-in → picker/creation → frame) in a Vue `<Transition mode="out-in">`, or a cross-fade with both screens absolutely positioned, at about 250–400 ms opacity.
- Keep focus management: focus moves to the new screen's main input after the fade.
- With `prefers-reduced-motion`, there is no animation; the switch is instant.

**Typed text reveal.**
- Reveal only lines that arrive live in the feed. Lines loaded on reload, history and backlog render instantly.
- Speed:
  - Fast, about 60–120 characters per second.
  - Faster still for long blocks: cap a block at about 1.5–2 s, then finish.
  - When several lines arrive at once, reveal them in order, quickly.
- Any keypress or click on the feed, or the next submitted command, completes the current reveal at once.
- Which lines:
  - Keeper narration, NPC dialogue and system lines: yes.
  - The player's own echo: no.
  - Combat round lines: shorter or near-instant, so fights stay readable. Owner to confirm at UAT.
- Correctness:
  - Keyword buttons must survive. Reveal by character count over the already-built segment and keyword nodes; do not reflow the text afterwards.
  - Text nodes only, and keep the img-onerror escape guarantees. No v-html.
- Accessibility:
  - Screen readers get the full line at once. Reveal visually only, and keep the live-region text complete.
  - `prefers-reduced-motion` turns the effect off.
- Scrolling:
  - Auto-scroll and pinning (`pinning.ts`) must follow the growing line.
  - The "New lines" pill must still work.
- Apply the same reveal to the creation interview feed (`CreationFeed.vue`), which reuses `FeedLine`.
- Tests:
  - The reveal completes on a keypress.
  - Reduced motion shows the line instantly.
  - Reloaded history is instant.
  - Keyword buttons are present after the reveal.
  - Screen-reader text is complete from the start.
  - The speed cap is enforced.
- Design guards apply: no new tokens, and timings stay within the reduced-motion rules.
