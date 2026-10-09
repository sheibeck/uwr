import { describe, expect, it } from 'vitest';
import {
  enemyAbilityName,
  landsInAtAnnouncement,
  landsInLive,
  windupParts,
  windupTarget,
} from './windup';

const XSS = '<img src=x onerror=alert(1)>';

describe('landsInLive (rail N rule)', () => {
  it('counts rounds from the open round', () => {
    expect(landsInLive(7n, 5n)).toBe(3n);
    expect(landsInLive(5n, 5n)).toBe(1n);
  });
  it('clamps a landing round behind the open round to 1 (row not yet deleted)', () => {
    expect(landsInLive(4n, 5n)).toBe(1n);
    expect(landsInLive(1n, 9n)).toBe(1n);
  });
});

describe('landsInAtAnnouncement (feed N rule)', () => {
  it('counts rounds from the announcement', () => {
    expect(landsInAtAnnouncement({ announcedRound: 4n, landsAtRound: 6n })).toBe(2n);
  });
  it('clamps equal or reversed rounds to 1', () => {
    expect(landsInAtAnnouncement({ announcedRound: 4n, landsAtRound: 4n })).toBe(1n);
    expect(landsInAtAnnouncement({ announcedRound: 6n, landsAtRound: 4n })).toBe(1n);
  });
});

describe('windupParts', () => {
  it('builds the plural form', () => {
    const parts = windupParts({ enemy: 'Rotfang', ability: 'Bile Spray', target: 'you', rounds: 2n });
    expect(parts.text).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
    expect(parts.lead).toBe('Rotfang winds up ');
    expect(parts.ability).toBe('Bile Spray');
    expect(parts.tail).toBe(' → you · lands in 2 rounds');
    expect(parts.lead + parts.ability + parts.tail).toBe(parts.text);
  });
  it('reads "lands this round" when N is 1', () => {
    const parts = windupParts({ enemy: 'Rotfang', ability: 'Bile Spray', target: 'you', rounds: 1n });
    expect(parts.tail).toBe(' → you · lands this round');
  });
  it('reads "lands this round" for a degenerate zero or negative N as well', () => {
    expect(windupParts({ enemy: 'a', ability: 'b', target: 'c', rounds: 0n }).tail).toContain('lands this round');
    expect(windupParts({ enemy: 'a', ability: 'b', target: 'c', rounds: -2n }).tail).toContain('lands this round');
  });
  it('leaves the arrow out for an empty target (review 2 IN-03)', () => {
    const parts = windupParts({ enemy: 'Goblin Mender', ability: 'Mend', target: '', rounds: 2n });
    expect(parts.tail).toBe(' · lands in 2 rounds');
    expect(parts.text).toBe('Goblin Mender winds up Mend · lands in 2 rounds');
    expect(parts.text).not.toContain('→');
  });
  it('passes markup-looking names through as plain strings', () => {
    const parts = windupParts({ enemy: XSS, ability: XSS, target: XSS, rounds: 3n });
    expect(parts.text).toBe(`${XSS} winds up ${XSS} → ${XSS} · lands in 3 rounds`);
    expect(parts.ability).toBe(XSS);
  });
});

describe('windupTarget', () => {
  const characterNames = new Map<bigint, string>([
    [1n, 'Mira'],
    [2n, 'Tobren'],
  ]);
  const petNames = new Map<bigint, string>([[40n, 'Ember']]);
  const base = { selfId: 1n, characterNames, petNames };

  it("reads 'you' for the player", () => {
    expect(windupTarget({ ...base, targetCharacterId: 1n })).toBe('you');
  });
  it("reads another member's name", () => {
    expect(windupTarget({ ...base, targetCharacterId: 2n })).toBe('Tobren');
  });
  it("reads the pet's name", () => {
    expect(windupTarget({ ...base, targetPetId: 40n })).toBe('Ember');
    expect(windupTarget({ ...base, targetCharacterId: null, targetPetId: 40n })).toBe('Ember');
  });
  it("reads 'the party' when neither id is set", () => {
    expect(windupTarget({ ...base })).toBe('the party');
    expect(windupTarget({ ...base, targetCharacterId: null, targetPetId: null })).toBe('the party');
  });
  it("reads 'the party' for an unknown character or pet", () => {
    expect(windupTarget({ ...base, targetCharacterId: 99n })).toBe('the party');
    expect(windupTarget({ ...base, targetPetId: 99n })).toBe('the party');
  });
  it('does not call a character self when selfId is null', () => {
    expect(windupTarget({ ...base, selfId: null, targetCharacterId: 1n })).toBe('Mira');
  });
  it("names an enemy ally for a heal or shield wind-up, never 'the party' (WR-01)", () => {
    const enemyNames = new Map<bigint, string>([[2n, 'Goblin Brute']]);
    expect(windupTarget({ ...base, targetEnemyId: 2n, enemyNames })).toBe('Goblin Brute');
    expect(windupTarget({ ...base, targetEnemyId: 2n, targetCharacterId: null, targetPetId: null, enemyNames })).toBe(
      'Goblin Brute',
    );
  });
  it("an ally whose name has not loaded never reads as 'the party': the target is empty (review 2 IN-03)", () => {
    const loaded = new Map<bigint, string>([[2n, 'Goblin Brute']]);
    expect(windupTarget({ ...base, targetEnemyId: 7n, enemyNames: loaded })).toBe('');
    expect(windupTarget({ ...base, targetEnemyId: 7n })).toBe('');
    expect(windupTarget({ ...base, targetEnemyId: 2n, enemyNames: new Map([[2n, '']]) })).toBe('');
    expect(windupTarget({ ...base, targetEnemyId: 7n, targetCharacterId: null, targetPetId: null, enemyNames: loaded })).toBe('');
    const parts = windupParts({ enemy: 'Goblin Mender', ability: 'Mend', target: windupTarget({ ...base, targetEnemyId: 7n }), rounds: 1n });
    expect(parts.text).toBe('Goblin Mender winds up Mend · lands this round');
    expect(parts.text).not.toContain('the party');
  });
  it('ignores a zero ally id and falls back to the player and pet targets', () => {
    const enemyNames = new Map<bigint, string>([[2n, 'Goblin Brute']]);
    expect(windupTarget({ ...base, targetEnemyId: 0n, targetCharacterId: 1n, enemyNames })).toBe('you');
    expect(windupTarget({ ...base, targetEnemyId: 0n, enemyNames })).toBe('the party');
  });
  it('passes a markup-looking name through unchanged', () => {
    const names = new Map<bigint, string>([[5n, XSS]]);
    expect(windupTarget({ ...base, characterNames: names, targetCharacterId: 5n })).toBe(XSS);
  });
});

describe('enemyAbilityName', () => {
  const abilities = [
    { enemyTemplateId: 1n, abilityKey: 'bile_spray', name: 'Bile Spray' },
    { enemyTemplateId: 2n, abilityKey: 'bile_spray', name: 'Other Spray' },
  ];
  it('finds the name by template id and key', () => {
    expect(enemyAbilityName(abilities, 1n, 'bile_spray')).toBe('Bile Spray');
    expect(enemyAbilityName(abilities, 2n, 'bile_spray')).toBe('Other Spray');
  });
  it('falls back to the key with underscores as spaces', () => {
    expect(enemyAbilityName(abilities, 1n, 'rot_cloud')).toBe('rot cloud');
    expect(enemyAbilityName([], 1n, 'bile_spray')).toBe('bile spray');
  });
  it('passes a markup-looking name through unchanged', () => {
    expect(enemyAbilityName([{ enemyTemplateId: 1n, abilityKey: 'x', name: XSS }], 1n, 'x')).toBe(XSS);
  });
});
