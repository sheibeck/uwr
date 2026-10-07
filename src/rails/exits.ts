// The rail exits model (51-UI-SPEC "Rail Travel Panel", Console 12a): one row per neighbour with its
// danger ring, region suffix, right-hand text, open-row note and Travel or Cross button state.
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
  name: string;
  /** The place description when it is not empty, else ''. */
  title: string;
  terrain: TerrainInfo;
  danger: PlaceDanger;
  crossing: boolean;
  regionName: string;
  rightText: string;
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

    rows.push({
      locationId: destination.id,
      name: destination.name,
      title: destination.description ? destination.description : '',
      terrain,
      danger,
      crossing,
      regionName,
      // An uncharted place has no level: the right column says 'Danger unknown', as the location line
      // and the chip do, instead of staying blank (review IN-08).
      rightText: danger.levelLabel !== '' ? danger.levelLabel : danger.word,
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
 * The accessible name of an exit row or chip: the full place and region (the visible text
 * ellipsizes), the level and band (colour is never the only cue) and, for a locked crossing, the
 * minute-level sentence.
 */
export function exitLabel(row: ExitRow): string {
  const place = row.crossing ? `${row.name} (${row.regionName})` : row.name;
  const level = row.danger.kind === 'band' ? `${row.danger.levelLabel}, ${row.danger.word}` : row.danger.word;
  // From your own timer whenever the row shows the lock, even when gathering outranks the timer as
  // the block and the note says something else (review IN-04).
  const wait = row.lockText !== null ? `, ${row.lockText}` : '';
  return `${place}, ${level}${wait}`;
}
