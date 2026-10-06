// Pure model for the race suggestion cards (CRE-03). The cards come from races already stored in
// this world (race_definition rows): newest first by createdAt, ties by the larger id, the first
// 3. Stat tags come through the server's own parser. Every value is a plain string (text nodes
// later); nothing here builds HTML.

import { parseRaceBonuses } from '@game-data/race_bonuses';

export interface RaceDefinitionLike {
  id: bigint;
  name: string;
  narrative: string;
  bonusesJson: string;
  createdAt: { microsSinceUnixEpoch: bigint };
}

export interface RaceCard {
  id: bigint;
  name: string;
  description: string;
  tags: string[];
  ariaLabel: string;
  /** The stored race name, sent through the existing free-text race path (a stored race is reused with no model call). */
  sends: string;
}

export const NO_RACES_LINE = 'No races have been written yet. Describe one, or choose Surprise me.';

const CARD_COUNT = 3;
const DESCRIPTION_MAX = 160;

/** Stat tags such as '+2 INT', primary first. A malformed or unknown stat drops only its tag. */
export function raceCardTags(bonusesJson: string): string[] {
  const parsed = parseRaceBonuses(bonusesJson);
  const tags: string[] = [];
  for (const bonus of [parsed.primary, parsed.secondary]) {
    if (bonus !== null) tags.push(`+${bonus.value.toString()} ${bonus.stat.toUpperCase()}`);
  }
  return tags;
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const match = /^.*?[.!?](?= |$)/.exec(flat);
  return match ? match[0] : flat;
}

function cutAtWord(text: string): string {
  if (text.length <= DESCRIPTION_MAX) return text;
  const head = text.slice(0, DESCRIPTION_MAX);
  let cut = head;
  if (!/\s/.test(text.charAt(DESCRIPTION_MAX))) {
    const space = head.lastIndexOf(' ');
    if (space > 0) cut = head.slice(0, space);
  }
  return `${cut.trimEnd()}…`;
}

/** The stored flavor when present, otherwise the first sentence of the narrative cut at a word boundary. */
export function raceCardDescription(bonusesJson: string, narrative: string): string {
  const flavor = parseRaceBonuses(bonusesJson).flavor;
  if (flavor !== null) return flavor;
  return cutAtWord(firstSentence(narrative));
}

function compareNewestFirst(a: RaceDefinitionLike, b: RaceDefinitionLike): number {
  const at = a.createdAt.microsSinceUnixEpoch;
  const bt = b.createdAt.microsSinceUnixEpoch;
  if (at !== bt) return at > bt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/** Null until the subscription has applied, so the 'none' line never flashes. */
export function selectRaceCards(rows: readonly RaceDefinitionLike[], applied: boolean): RaceCard[] | null {
  if (!applied) return null;
  return [...rows]
    .sort(compareNewestFirst)
    .slice(0, CARD_COUNT)
    .map(row => {
      const tags = raceCardTags(row.bonusesJson);
      return {
        id: row.id,
        name: row.name,
        description: raceCardDescription(row.bonusesJson, row.narrative),
        tags,
        ariaLabel: tags.length > 0 ? `${row.name}, ${tags.join(', ')}. Choose this race.` : `${row.name}. Choose this race.`,
        sends: row.name,
      };
    });
}
