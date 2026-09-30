import { describe, it, expect, vi } from 'vitest';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const BROWSER_ADMIN = 'c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80';
const CLI_ADMIN = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';

const idOf = (hex: string) => ({ toHexString: () => hex });

describe('admin identities', () => {
  it('is exactly the browser identity and the CLI/database-owner identity', async () => {
    const { ADMIN_IDENTITIES } = await import('./admin');
    expect([...ADMIN_IDENTITIES].sort()).toEqual([BROWSER_ADMIN, CLI_ADMIN].sort());
  });

  it('requireAdmin passes for both admin identities', async () => {
    const { requireAdmin } = await import('./admin');
    expect(() => requireAdmin({ sender: idOf(BROWSER_ADMIN) })).not.toThrow();
    expect(() => requireAdmin({ sender: idOf(CLI_ADMIN) })).not.toThrow();
  });

  it("requireAdmin throws 'Admin only' for any other identity", async () => {
    const { requireAdmin } = await import('./admin');
    expect(() => requireAdmin({ sender: idOf('f'.repeat(64)) })).toThrow('Admin only');
  });
});
