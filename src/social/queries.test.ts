import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { socialQueries } from './queries';

const q = socialQueries();

describe('socialQueries', () => {
  it('chains active_pet on character_id (a WHERE on the indexed column, never the whole table)', () => {
    const sql = q.petsOf([1n, 2n]);
    expect(sql).toContain('"active_pet"');
    expect(sql).toContain('WHERE');
    expect(sql).toContain('"character_id" = 1');
    expect(sql).toContain('"character_id" = 2');
    expect(sql).toContain('OR');
    expect(sql).not.toContain('"combat_id"');
    expect(() => q.petsOf([])).toThrow();
  });

  it('filters group_invite on group_id', () => {
    const sql = q.groupInvitesOf(5n);
    expect(sql).toContain('"group_invite"');
    expect(sql).toContain('"group_id" = 5');
  });

  it('filters group on id and group_member on group_id', () => {
    const group = q.groupById(8n);
    expect(group).toContain('"group"');
    expect(group).toContain('"id" = 8');
    const members = q.groupMembersOf(8n);
    expect(members).toContain('"group_member"');
    expect(members).toContain('"group_id" = 8');
  });

  it('chains character on id', () => {
    const sql = q.charactersById([3n, 4n]);
    expect(sql).toContain('"character"');
    expect(sql).toContain('"id" = 3');
    expect(sql).toContain('"id" = 4');
    expect(sql).toContain('OR');
    expect(() => q.charactersById([])).toThrow();
  });

  it('every query has a WHERE on an indexed column', () => {
    const all = [q.petsOf([1n]), q.groupInvitesOf(1n), q.groupById(1n), q.groupMembersOf(1n), q.charactersById([1n])];
    for (const sql of all) expect(sql).toContain('WHERE');
  });

  it('never names the user table [UI cross-check X6]', () => {
    const all = [q.petsOf([1n, 2n]), q.groupInvitesOf(1n), q.groupById(1n), q.groupMembersOf(1n), q.charactersById([1n, 2n])];
    for (const sql of all) {
      expect(sql).not.toMatch(/"user"/);
      expect(sql).not.toMatch(/FROM\s+user\b/i);
    }
  });

  it('the social source files never reach the user table', () => {
    for (const file of ['queries.ts', 'socialData.ts', 'socialContext.ts']) {
      const source = readFileSync(resolve(process.cwd(), 'src/social', file), 'utf8');
      expect(source).not.toMatch(/tables\.user\b/);
      expect(source).not.toMatch(/db\.user\b/);
    }
  });
});
