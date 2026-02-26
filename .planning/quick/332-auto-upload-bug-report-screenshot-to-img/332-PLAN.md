---
phase: quick-332
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/BugReportModal.vue
autonomous: true
must_haves:
  truths:
    - "When user submits a bug report with a screenshot, the screenshot is uploaded to imgur and its URL is embedded in the GitHub issue body as a markdown image"
    - "When user submits a bug report without a screenshot, the issue is created normally without an image section"
    - "If imgur upload fails, the issue still opens with a fallback message instead of blocking"
    - "The imgur Client-ID is configurable via VITE_IMGUR_CLIENT_ID env var"
  artifacts:
    - path: "src/components/BugReportModal.vue"
      provides: "Bug report modal with automatic imgur screenshot upload"
  key_links:
    - from: "src/components/BugReportModal.vue"
      to: "https://api.imgur.com/3/image"
      via: "fetch POST in handleSubmit"
      pattern: "api\\.imgur\\.com"
---

<objective>
Auto-upload bug report screenshots to imgur so they appear inline in GitHub issues without manual pasting.

Purpose: Currently the bug reporter captures a screenshot but the user must manually paste it. This removes that friction by uploading to imgur and embedding the URL.
Output: Updated BugReportModal.vue with imgur upload integration.
</objective>

<context>
@src/components/BugReportModal.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add imgur upload and embed screenshot URL in GitHub issue body</name>
  <files>src/components/BugReportModal.vue</files>
  <action>
Modify `handleSubmit` in BugReportModal.vue to:

1. Add a config constant at the top of the script block:
   ```typescript
   // Register an imgur application at https://api.imgur.com/oauth2/addclient
   // Select "OAuth 2 authorization without a callback URL"
   // The Client-ID is safe to embed in client-side code (anonymous uploads only)
   const IMGUR_CLIENT_ID = import.meta.env.VITE_IMGUR_CLIENT_ID ?? '';
   ```

2. Create an `uploadToImgur` async function that:
   - Takes the `screenshotDataUrl` (data:image/png;base64,...) string
   - Strips the `data:image/png;base64,` prefix to get raw base64
   - POSTs to `https://api.imgur.com/3/image` with:
     - Header: `Authorization: Client-ID ${IMGUR_CLIENT_ID}`
     - Body: FormData with `image` field set to the base64 string, and `type` field set to `'base64'`
   - Returns the `data.link` URL string on success
   - Returns `null` on any failure (catch all errors, log to console.warn)

3. Modify `handleSubmit`:
   - Before building the body string, if `props.screenshotDataUrl` exists AND `IMGUR_CLIENT_ID` is set, call `uploadToImgur`
   - Update the button text to show "Uploading screenshot..." during the imgur upload phase (use a separate `statusText` ref or just change `isSubmitting` behavior)
   - Build the body string conditionally:
     - If imgur returned a URL: include `**Screenshot:**\n\n![Screenshot](${imgurUrl})` in the body
     - If imgur failed or no screenshot: keep current fallback text about pasting from clipboard
     - If no IMGUR_CLIENT_ID configured: keep current behavior (clipboard copy + fallback text)
   - Keep the existing clipboard copy logic as a fallback (still useful if imgur fails)
   - Still open the GitHub issue URL via `window.open` as before

4. Add a small status indicator below the screenshot preview that shows upload progress:
   - Before submit: nothing shown
   - During upload: show "Uploading screenshot..." in small muted text near the submit button area
   - This can simply be driven by a `uploadStatus` ref ('idle' | 'uploading' | 'done' | 'failed')

Keep the approach simple. No retry logic, no progress bars. Just attempt once, fall back gracefully.
  </action>
  <verify>
    - TypeScript compiles without errors: `npx vue-tsc --noEmit` or verify no red squiggles
    - Manual test: Open bug report modal, fill in title, click submit
      - Without VITE_IMGUR_CLIENT_ID set: behaves exactly as before (clipboard copy, fallback text)
      - With VITE_IMGUR_CLIENT_ID set: uploads screenshot, GitHub issue body contains `![Screenshot](https://i.imgur.com/...)` markdown
  </verify>
  <done>
    - Bug report with screenshot + valid imgur Client-ID: screenshot auto-uploaded, markdown image embedded in issue body
    - Bug report without screenshot: issue created normally, no upload attempted
    - Bug report with screenshot but no Client-ID: falls back to clipboard-copy behavior
    - Imgur upload failure: issue still opens with fallback clipboard message, no crash
  </done>
</task>

</tasks>

<verification>
- Component renders without errors
- Submit flow works end-to-end with and without VITE_IMGUR_CLIENT_ID configured
- GitHub issue URL contains the imgur image markdown when upload succeeds
</verification>

<success_criteria>
Screenshots are automatically uploaded to imgur and embedded as markdown images in GitHub issue bodies when VITE_IMGUR_CLIENT_ID is configured. Graceful fallback to existing clipboard behavior when not configured or on upload failure.
</success_criteria>
