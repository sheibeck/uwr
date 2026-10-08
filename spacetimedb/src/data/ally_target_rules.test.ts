import { describe, it, expect } from 'vitest';
import { peaceAllyReason, peaceAllyRefusal } from './ally_target_rules';

// Owner 2026-10-08: tap a party member to target them, everywhere. Out of combat the ally must be
// in your party, online, at your place and standing; the server and the client share this rule.
const caster = { id: 1n, groupId: 5n as bigint | null | undefined, locationId: 10n };
const brienne = (over: Record<string, unknown> = {}) => ({
  id: 2n,
  name: 'Brienne',
  groupId: 5n as bigint | null | undefined,
  locationId: 10n,
  online: true,
  hp: 40n,
  ...over,
});

describe('peaceAllyReason / peaceAllyRefusal', () => {
  it('a party member who is online, here and standing is ok, with no refusal text', () => {
    expect(peaceAllyReason(caster, brienne())).toBe('ok');
    expect(peaceAllyRefusal('ok', 'Brienne')).toBeNull();
  });

  it('the caster as target is always ok, whatever the row says', () => {
    const self = { ...brienne({ id: 1n, groupId: undefined, locationId: 99n, hp: 0n }), online: false };
    expect(peaceAllyReason(caster, self)).toBe('ok');
    expect(peaceAllyReason({ ...caster, groupId: undefined }, self)).toBe('ok');
  });

  it('a missing target is "missing" and reads as not in your party', () => {
    expect(peaceAllyReason(caster, undefined)).toBe('missing');
    expect(peaceAllyReason(caster, null)).toBe('missing');
    expect(peaceAllyRefusal('missing', '')).toBe('That target is not in your party.');
  });

  it('a caster with no party, or a target in another party, is "not_in_party" with no name', () => {
    expect(peaceAllyReason({ ...caster, groupId: undefined }, brienne())).toBe('not_in_party');
    expect(peaceAllyReason({ ...caster, groupId: null }, brienne())).toBe('not_in_party');
    expect(peaceAllyReason(caster, brienne({ groupId: 6n }))).toBe('not_in_party');
    expect(peaceAllyReason(caster, brienne({ groupId: undefined }))).toBe('not_in_party');
    expect(peaceAllyRefusal('not_in_party', 'Brienne')).toBe('That target is not in your party.');
  });

  it('an offline member is "offline"', () => {
    expect(peaceAllyReason(caster, { ...brienne(), online: false })).toBe('offline');
    expect(peaceAllyRefusal('offline', 'Brienne')).toBe('Brienne is offline.');
  });

  it('a member at another place is "elsewhere"', () => {
    expect(peaceAllyReason(caster, brienne({ locationId: 11n }))).toBe('elsewhere');
    expect(peaceAllyRefusal('elsewhere', 'Brienne')).toBe('Brienne is not here.');
  });

  it('a member at 0 HP is "fallen"', () => {
    expect(peaceAllyReason(caster, brienne({ hp: 0n }))).toBe('fallen');
    expect(peaceAllyRefusal('fallen', 'Brienne')).toBe('Brienne has fallen.');
  });

  it('order: not_in_party, then offline, then elsewhere, then fallen', () => {
    const worst = { ...brienne({ groupId: 6n, locationId: 11n, hp: 0n }), online: false };
    expect(peaceAllyReason(caster, worst)).toBe('not_in_party');
    expect(peaceAllyRefusal(peaceAllyReason(caster, worst), 'Brienne')).toBe('That target is not in your party.');
    expect(peaceAllyReason(caster, { ...brienne({ locationId: 11n, hp: 0n }), online: false })).toBe('offline');
    expect(peaceAllyReason(caster, brienne({ locationId: 11n, hp: 0n }))).toBe('elsewhere');
  });
});
