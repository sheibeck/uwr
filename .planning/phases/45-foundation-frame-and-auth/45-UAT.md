---
status: testing
phase: 45-foundation-frame-and-auth
source: [45-VERIFICATION.md, 45-11-SUMMARY.md]
started: 2026-10-05T00:00:00Z
updated: 2026-10-05T00:00:00Z
deferred: owner deferred all hands-on verification to one end-of-milestone UAT pass (2026-10-05)
---

## Current Test

number: 1
name: Splash logo and Sign in button at four viewport sizes
expected: |
  At 1280x800, 1280x600, 390x844 and 390x600 the 16:9 key-art logo is large, crisp and undistorted, and the Sign in button is visible without scrolling.
awaiting: user response (deferred to end-of-milestone UAT)

## Tests

The full step-by-step checklist is in 45-11-SUMMARY.md under "## Deferred owner verification". To run the stack, use the run-local skill (local only, no publish). Item 2 needs an account that already has a local character.

### 1. Splash logo and Sign in button at four viewport sizes
expected: At 1280x800, 1280x600, 390x844 and 390x600 the logo is crisp and undistorted, and Sign in is visible without scrolling.
result: [pending]

### 2. Live SpacetimeAuth sign-in, reload, picker and logout
expected: Sign in through SpacetimeAuth and land on the frame (active character) or the picker. Reload shows "Connecting…", never the idle splash first. Logout returns to the splash. Record the observed token lifetime and any "Signing in…" hang.
result: [pending]

### 3. Desktop layout and computed type
expected: At 1280x800 the header is 48px, the vitals rail 252px and the context rail 288px; the feed fills the rest, and there is no page scroll. At 1000px the header labels hide (below 1100px) and the location truncates first. On screen, computed font sizes are only 10/12/14/20 and weights only 400/500. `.card-title` is 20px, `.tag` 12px, `.card-body` 14px and rail `h6` 10px.
result: [pending]

### 4. Desktop drawer focus and scrolling
expected: Each of the 7 screens opens its drawer. Esc and the close button dismiss it, with a visible focus ring on Tab, and focus returns to the opener. Tab from header controls still moves between them. At short heights the body scrolls while the title row stays fixed.
result: [pending]

### 5. Mobile 390x844 sheets and strip truncation
expected: The vitals strip, location row, feed and 64px tab bar (Story, Map, Bag, Party, More) all show. The sheets open above the tab bar, and the More sheet lists Stats, Crafting, Events, Vendor and Log out. With a 20-character name and both tags, "New skill" drops before "Level up" and the name never wraps.
result: [pending]

### 6. Reconnect after a local server stop and start
expected: Stopping the local SpacetimeDB server shows a "Reconnecting…" countdown (1s, 2s, 5s…). Restarting it brings the frame back. After an outage of more than 30s, the picker returns.
result: [pending]

### 7. (Optional) Version reload bar in a production build
expected: In a production build, with `app_version` set by an admin to a value different from the build version, the Reload bar appears. It does not appear in dev.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
