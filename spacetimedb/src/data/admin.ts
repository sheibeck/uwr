import { SenderError } from 'spacetimedb/server';

// Admin identity hex strings — set to admin player identities
// Run: spacetime identity list — to find your hex
export const ADMIN_IDENTITIES = new Set<string>([
  // Add admin identity hex strings here
  "c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80"
]);

export function requireAdmin(ctx: any): void {
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    throw new SenderError('Admin only');
  }
}
