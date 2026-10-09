// The rail exits model (51-UI-SPEC "Rail Travel Panel", Console 12a): one row per neighbour with its
// rating ring, region suffix, rating and range, open-row note and Travel or Cross button state.
//
// 51.3.1.1 (UI-SPEC "Exits, Here card and mobile chips", D-33, D-41): each row carries the place's
// safety rating from the shared rule (rating.ts over @game-data/place_rating), computed from the
// destination's own pool rows and the viewer's rating level; Unknown until those rows apply, never
// Safe. The band (danger) stays for the Map's region chips and gate pills (B9).
//
// Pure, no Vue. The costs and blocks come from travelChecks (the same prediction the Map's detail
// column uses, built on the shared stamina rule in @game-data/travel_config); the danger band and
// colour come from placeDanger (the Map rule, never the mock's strings); the terrain word and icon
// from terrainOf. A time shown here is always the server's cooldown row minus the server clock (the
// caller passes the travelChecks); no duration is read or assumed. The server re-checks every trip.

import { placeDanger } from '../map/danger';
import type { PlaceDanger } from '../map/danger';
import { terrainOf } from '../map/terrain';
import type { TerrainInfo } from '../map/terrain';
import type { TravelChecks } from '../map/travelChecks';
import { aboutMinutes, formatClock } from '../map/travelTimer';
import { ratingForPlace } from './rating';
import type { PlaceRatingView, RatingPool } from './rating';

export interface ExitLocation {
  id: bigint;
  name: string;
  description: string;
  regionId: bigint;
  levelOffset: bigint;
  isSafe: boolean;
  terrainType: string;
  bindStone: boolean;
  craftingAvailable: boolean;
  /** The place's short name for the mobile chip; '' when it has none. */
  shortName: string;
}

/** A pool_level row as the exits read it: its place and its public density only. */
export interface ExitPool extends RatingPool {
  locationId: bigint;
}

export interface ExitRegion {
  id: bigint;
  name: string;
  dangerMultiplier: bigint;
}

export interface ExitNote {
  /** The note; while a timer blocks, the text before the clock ('Region travel in '). */
  text: string;
  tone: 'neutral' | 'accent' | 'wait' | 'bad';
  /** The clock, 'm:ss', when a region timer blocks the crossing. Shown aria-hidden. */
  timeText: string | null;
  /** The minute-level sentence for screen readers when a timer blocks (it names a waiting follower). */
  srText: string | null;
  /** When a follower's timer blocks the crossing, who waits ('Mira can't cross yet'); else null. */
  blocker: string | null;
}

export interface ExitButton {
  label: 'Travel' | 'Cross';
  ariaLabel: string;
  icon: 'signpost' | 'door';
  disabled: boolean;
  /** '{m:ss}' while a region timer blocks the crossing, else null. */
  timeText: string | null;
  /** The server seconds behind timeText (for the minute-level sentence), else null. */
  secondsLeft: number | null;
}

export interface ExitRow {
  locationId: bigint;
  /** The full place name (accessible name, row label, open card). */
  name: string;
  /** The chip's line 1: the short name, or the full name when the place has none. */
  shortName: string;
  /** The place description when it is not empty, else ''. */
  title: string;
  terrain: TerrainInfo;
  /** The Map band (kept for the region chips and gate pills; places show the rating). */
  danger: PlaceDanger;
  /** The safety rating of the destination for this viewer (word, line, level label). */
  rating: PlaceRatingView;
  crossing: boolean;
  regionName: string;
  /** Your own region timer runs and this row is a crossing (the right side shows a lock and the clock). */
  locked: boolean;
  timeText: string | null;
  /** While locked, the minute-level sentence of your own timer; else null (the label's lock part). */
  lockText: string | null;
  heardOf: boolean;
  note: ExitNote;
  button: ExitButton;
  following: number;
  /** '{n} stamina', or for a party '{n} stamina each' (the shared travelChecks text). */
  costText: string;
}

export interface ExitRowsInput {
  routes: readonly { locationId: bigint; name: string }[];
  here: { regionId: bigint } | null;
  locations: ReadonlyMap<bigint, ExitLocation>;
  regions: readonly ExitRegion[];
  heardOf: ReadonlySet<bigint>;
  playerLevel: number;
  /** pool_level rows of every loaded region (game.poolLevels); each destination reads its own. */
  pools: readonly ExitPool[];
  /** game.poolsAppliedFor: the destination's pool rows have applied. */
  poolsApplied: (locationId: bigint) => boolean;
  /** The level places are rated for (viewerRatingLevel); null rates Unknown. */
  ratingLevel: bigint | null;
  /** A living boss or named enemy of the viewer at the place (D-34). */
  bossOrNamed: (locationId: bigint) => boolean;
  checksFor: (destination: ExitLocation) => TravelChecks;
  connected: boolean;
}

function noteFor(
  destination: ExitLocation,
  terrain: TerrainInfo,
  crossing: boolean,
  heardOf: boolean,
  checks: TravelChecks,
): ExitNote {
  const following = checks.followers.length > 0 ? ` · ${checks.followers.length} following` : '';
  const block = checks.block;

  if (block !== null) {
    switch (block.reason) {
      case 'gathering':
        return { text: 'Finish gathering first.', tone: 'bad', timeText: null, srText: null, blocker: null };
      case 'selfTimer':
      case 'followerTimer': {
        const seconds = block.secondsLeft ?? 0;
        // A follower's timer is not yours: the note names who waits, with the region check's own
        // label ('Mira can't cross yet'), as the Map checklist does (review IN-03).
        const region = checks.checks.find((c) => c.key === 'region' && c.status === 'wait');
        const blocker = block.reason === 'followerTimer' && region ? region.label : null;
        const minutes = `Region travel ready in ${aboutMinutes(seconds)}`;
        return {
          text: blocker === null ? 'Region travel in ' : `${blocker} · ready in `,
          tone: 'wait',
          timeText: formatClock(seconds),
          srText: blocker === null ? minutes : `${blocker}. ${minutes}`,
          blocker,
        };
      }
      case 'selfStamina':
        return { text: 'Not enough stamina.', tone: 'bad', timeText: null, srText: null, blocker: null };
      case 'followerStamina': {
        // The stamina check's label already names who is short ('Mira is short on stamina').
        const stamina = checks.checks.find((c) => c.key === 'stamina' && c.status === 'bad');
        return {
          text: `${stamina ? stamina.label : 'A follower is short on stamina'}.`,
          tone: 'bad',
          timeText: null,
          srText: null,
          blocker: null,
        };
      }
    }
  }

  if (crossing) {
    return {
      text: `New region · ${checks.costText} · starts the region travel timer${following}`,
      tone: 'accent',
      timeText: null,
      srText: null,
      blocker: null,
    };
  }

  const parts = [terrain.word];
  if (heardOf) parts.push('heard of');
  parts.push(checks.costText);
  if (destination.bindStone) parts.push('Bind stone');
  if (destination.craftingAvailable) parts.push('Crafting');
  return { text: `${parts.join(' · ')}${following}`, tone: 'neutral', timeText: null, srText: null, blocker: null };
}

export function exitRows(input: ExitRowsInput): ExitRow[] {
  const poolsByPlace = new Map<bigint, ExitPool[]>();
  for (const pool of input.pools) {
    const list = poolsByPlace.get(pool.locationId);
    if (list) list.push(pool);
    else poolsByPlace.set(pool.locationId, [pool]);
  }

  const rows: ExitRow[] = [];
  for (const route of input.routes) {
    const destination = input.locations.get(route.locationId);
    if (!destination) continue;

    const terrain = terrainOf(destination.terrainType ?? '');
    const danger = placeDanger(destination, input.regions, input.playerLevel);
    const crossing = input.here !== null && input.here.regionId !== destination.regionId;
    const regionName = input.regions.find((r) => r.id === destination.regionId)?.name ?? 'Unknown region';
    const heardOf = input.heardOf.has(destination.id);
    const checks = input.checksFor(destination);
    const note = noteFor(destination, terrain, crossing, heardOf, checks);

    const block = checks.block;
    const timerBlocked = block !== null && (block.reason === 'selfTimer' || block.reason === 'followerTimer');
    const buttonSeconds = timerBlocked ? (block.secondsLeft ?? 0) : null;
    const buttonTime = buttonSeconds === null ? null : formatClock(buttonSeconds);
    const ariaLabel = crossing ? `Cross into ${regionName}` : `Travel to ${destination.name}`;

    const locked = crossing && checks.selfTimer.running;
    const rating = ratingForPlace({
      location: destination,
      poolsHere: poolsByPlace.get(destination.id) ?? [],
      ready: input.poolsApplied(destination.id),
      playerLevel: input.ratingLevel,
      bossOrNamedHere: input.bossOrNamed(destination.id),
    });
    const short = (destination.shortName ?? '').trim();

    rows.push({
      locationId: destination.id,
      name: destination.name,
      shortName: short !== '' ? short : destination.name,
      title: destination.description ? destination.description : '',
      terrain,
      danger,
      rating,
      crossing,
      regionName,
      locked,
      timeText: locked ? formatClock(checks.selfTimer.secondsLeft) : null,
      lockText: locked ? `Region travel ready in ${aboutMinutes(checks.selfTimer.secondsLeft)}` : null,
      heardOf,
      note,
      button: {
        label: crossing ? 'Cross' : 'Travel',
        ariaLabel,
        icon: crossing ? 'door' : 'signpost',
        disabled: !input.connected || block !== null,
        timeText: buttonTime,
        secondsLeft: buttonSeconds,
      },
      following: checks.followers.length,
      costText: checks.costText,
    });
  }
  return rows;
}

/** The scoped colour class every rail and line component maps to a token (no inline colours). */
export function dangerClass(danger: PlaceDanger): string {
  if (danger.kind === 'band' && danger.band !== null) return `lv-${danger.band}`;
  return danger.kind === 'safe' ? 'lv-safe' : 'lv-unknown';
}

/** 'Lv 2–3 · even', 'Safe' or 'Danger unknown': the sub-line and chip line 2 wording. */
export function dangerText(danger: PlaceDanger): string {
  if (danger.kind === 'band') return `${danger.levelLabel} · ${danger.word}`;
  return danger.word;
}

/**
 * The accessible name of an exit row or chip: '{place}{ (Region)}, {Rating}, {level label}{, lock
 * text}', for example 'Glass Orchard, Deadly, Lv 12–14'; Safe reads '{place}, Safe'. The full place
 * name always (the chip shows the short name and the visible text ellipsizes); the rating word, as
 * colour is never the only cue; an Unknown rating has no word and keeps the range; for a locked
 * crossing the minute-level sentence.
 */
export function exitLabel(row: ExitRow): string {
  const parts = [row.crossing ? `${row.name} (${row.regionName})` : row.name];
  if (row.rating.word !== '') parts.push(row.rating.word);
  if (row.rating.levelLabel !== '') parts.push(row.rating.levelLabel);
  // From your own timer whenever the row shows the lock, even when gathering outranks the timer as
  // the block and the note says something else (review IN-04).
  if (row.lockText !== null) parts.push(row.lockText);
  return parts.join(', ');
}
