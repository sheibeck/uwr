/**
 * Whether to show the "reload for the new version" bar. The reload itself is the
 * player's choice; nothing here reloads automatically. Dev builds stamp a fresh
 * version every run, so they never prompt. A fresh database has no row: no prompt.
 */
export function shouldPromptReload(
  row: { version: string } | null | undefined,
  clientVersion: string | null | undefined,
  isDev: boolean,
): boolean {
  if (isDev) return false;
  if (!row) return false;
  if (!clientVersion) return false;
  return row.version !== clientVersion;
}
