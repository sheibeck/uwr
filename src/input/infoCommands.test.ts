import { describe, expect, it } from 'vitest';
import {
  formatEvents,
  formatFaction,
  formatFactions,
  formatGroup,
  formatRenown,
  standingLabel,
} from './infoCommands';

function plain(text: string): void {
  expect(text).not.toMatch(/\{\{|\[|\]|!/);
}

describe('standingLabel', () => {
  it.each([
    [100n, 'Exalted'],
    [75n, 'Revered'],
    [50n, 'Honored'],
    [25n, 'Friendly'],
    [0n, 'Neutral'],
    [10n, 'Neutral'],
    [-25n, 'Unfriendly'],
    [-50n, 'Hostile'],
    [-100n, 'Hated'],
    [-500n, 'Hated'],
    [500n, 'Exalted'],
  ])('maps %s to %s', (standing, label) => {
    expect(standingLabel(standing)).toBe(label);
  });
});

describe('formatRenown', () => {
  it('shows the rank, next rank and percentage', () => {
    const out = formatRenown({ renown: { points: 300n, currentRank: 3n }, perks: [] });
    expect(out.split('\n')).toEqual([
      'Renown Status',
      '',
      'Rank 3: Recognized (300 points)',
      'Next rank: Proven (200 points needed, 60%)',
    ]);
    plain(out);
  });

  it('says max rank at rank 15', () => {
    const out = formatRenown({ renown: { points: 80000n, currentRank: 15n }, perks: [] });
    expect(out).toContain('Max rank achieved.');
    expect(out).not.toContain('Next rank');
    plain(out);
  });

  it('treats missing renown as rank 1 with no points', () => {
    const out = formatRenown({ renown: null, perks: [] });
    expect(out).toContain('Rank 1: Unsung (0 points)');
    expect(out).toContain('Next rank: Whispered (100 points needed, 0%)');
  });

  it('lists active perks', () => {
    const out = formatRenown({
      renown: { points: 120n, currentRank: 2n },
      perks: [{ rank: 2n, perkKey: 'keen_eye' }],
    });
    expect(out.split('\n').slice(-3)).toEqual(['', 'Active Perks:', '  Rank 2: keen_eye']);
    plain(out);
  });
});

describe('formatFactions', () => {
  it('has a plain empty state', () => {
    expect(formatFactions({ standings: [], factions: [] })).toBe('Faction Standings\n\nNo faction standings yet.');
  });

  it('lists one line per standing and falls back to the id', () => {
    const out = formatFactions({
      standings: [
        { factionId: 1n, standing: 60n },
        { factionId: 9n, standing: -25n },
      ],
      factions: [{ id: 1n, name: 'Wardens' }],
    });
    expect(out.split('\n')).toEqual([
      'Faction Standings',
      '',
      'Wardens: Honored (60)',
      'Faction 9: Unfriendly (-25)',
    ]);
    plain(out);
  });
});

describe('formatFaction', () => {
  const factions = [{ id: 1n, name: 'Wardens', description: 'Keepers of the pass.' }];

  it('matches the name case-insensitively', () => {
    const out = formatFaction('wardens', { standings: [{ factionId: 1n, standing: 80n }], factions });
    expect(out.split('\n')[0]).toBe('Wardens');
    expect(out).toContain('Standing: Revered (80)');
    expect(out).toContain('Keepers of the pass.');
    plain(out);
  });

  it('shows Neutral and 0 without a standing row', () => {
    expect(formatFaction('Wardens', { standings: [], factions })).toContain('Standing: Neutral (0)');
  });

  it('answers an unknown name on one line', () => {
    const out = formatFaction('nobody', { standings: [], factions });
    expect(out).toBe('No faction named nobody. For a name with spaces, type /faction <name>.');
    plain(out);
  });
});

describe('formatEvents', () => {
  it('has a plain empty state', () => {
    expect(formatEvents({ events: [], regions: [], objectives: [] })).toBe('World Events\n\nNo active events.');
  });

  it('skips events that are not active', () => {
    const out = formatEvents({
      events: [{ id: 1n, name: 'Old Fire', regionId: 1n, status: 'success' }],
      regions: [],
      objectives: [],
    });
    expect(out).toBe('World Events\n\nNo active events.');
  });

  it('lists active events with region and objectives', () => {
    const out = formatEvents({
      events: [
        { id: 1n, name: 'Wolf Surge', regionId: 2n, status: 'active' },
        { id: 2n, name: 'Lost Region Event', regionId: 99n, status: 'active' },
      ],
      regions: [{ id: 2n, name: 'Ashen Vale' }],
      objectives: [
        { eventId: 1n, name: 'Wolves slain', currentCount: 3n, targetCount: 10n },
        { eventId: 2n, name: 'Other', currentCount: 0n, targetCount: 1n },
      ],
    });
    expect(out.split('\n')).toEqual([
      'World Events',
      '',
      'Wolf Surge (Ashen Vale)',
      '  Wolves slain: 3/10',
      'Lost Region Event',
      '  Other: 0/1',
    ]);
    plain(out);
  });
});

describe('formatGroup', () => {
  const members = [
    { id: 1n, name: 'Ayla', level: 4n, className: 'Warden' },
    { id: 2n, name: 'Bram', level: 3n, className: 'Seer' },
  ];

  it('lists members with the leader marked', () => {
    const out = formatGroup({ inGroup: true, leaderId: 1n, members, inviterNames: [] });
    expect(out.split('\n')).toEqual([
      'Group',
      '',
      'Ayla, Lv 4 Warden (Leader)',
      'Bram, Lv 3 Seer',
      '',
      'Type /leave to leave the group.',
    ]);
    plain(out);
  });

  it('appends pending invites when in a group', () => {
    const out = formatGroup({ inGroup: true, leaderId: 1n, members, inviterNames: ['Cora'] });
    expect(out.split('\n').slice(-3)).toEqual(['', 'Pending Invites:', '  Cora: type accept Cora or decline Cora']);
    plain(out);
  });

  it('lists invites when not in a group', () => {
    const out = formatGroup({ inGroup: false, leaderId: null, members: [], inviterNames: ['Cora'] });
    expect(out.split('\n')).toEqual(['Group Invites', '', '  Cora: type accept Cora or decline Cora']);
    plain(out);
  });

  it('answers on one line when alone with no invites', () => {
    const out = formatGroup({ inGroup: false, leaderId: null, members: [], inviterNames: [] });
    expect(out).toBe('You are not in a group. Type invite <name> to start one.');
    plain(out);
  });
});
