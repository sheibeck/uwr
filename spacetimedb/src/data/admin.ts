import { SenderError } from 'spacetimedb/server';

// Admin identity hex strings — set to admin player identities
// Run: spacetime identity list — to find your hex
export const ADMIN_IDENTITIES = new Set<string>([
  // Add admin identity hex strings here
  "c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80",
  // CLI/database-owner identity (spacetime login show); admin by user decision 2026-09-30
  // so the key script, smoke test and live proof run from the CLI. Also grants gameplay admin.
  "c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e"
]);

export function requireAdmin(ctx: any): void {
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    throw new SenderError('Admin only');
  }
}
