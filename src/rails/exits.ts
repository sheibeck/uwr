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
  /** The minute-level sentence for screen readers when a timer blocks. */
  srText: string | null;
}

export interface ExitButton {
  label: 'Travel' | 'Cross';
  ariaLabel: string;
  /** The full-width mobile label: ariaLabel, or 'Region travel in {m:ss}' while a timer blocks. */
  fullLabel: string;
  icon: 'signpost' | 'door';
  disabled: boolean;
  /** '{m:ss}' while a region timer blocks the crossing, else null. */
  timeText: string | null;
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
  rightColor: string;
  /** Your own region timer runs and this row is a crossing (the right side shows a lock and the clock). */
  locked: boolean;
  timeText: string | null;
  heardOf: boolean;
  note: ExitNote;
  button: ExitButton;
  following: number;
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
        return { text: 'Finish gathering first.', tone: 'bad', timeText: null, srText: null };
      case 'selfTimer':
      case 'followerTimer': {
        const seconds = block.secondsLeft ?? 0;
        return {
          text: 'Region travel in ',
          tone: 'wait',
          timeText: formatClock(seconds),
          srText: `Region travel ready in ${aboutMinutes(seconds)}`,
        };
      }
      case 'selfStamina':
        return { text: 'Not enough stamina.', tone: 'bad', timeText: null, srText: null };
      case 'followerStamina': {
        // The stamina check's label already names who is short ('Mira is short on stamina').
        const stamina = checks.checks.find((c) => c.key === 'stamina' && c.status === 'bad');
        return { text: `${stamina ? stamina.label : 'A follower is short on stamina'}.`, tone: 'bad', timeText: null, srText: null };
      }
    }
  }

  if (crossing) {
    return {
      text: `New region · ${checks.costText} · starts the region travel timer${following}`,
      tone: 'accent',
      timeText: null,
      srText: null,
    };
  }

  const parts = [terrain.word];
  if (heardOf) parts.push('heard of');
  parts.push(checks.costText);
  if (destination.bindStone) parts.push('Bind stone');
  if (destination.craftingAvailable) parts.push('Crafting');
  return { text: `${parts.join(' · ')}${following}`, tone: 'neutral', timeText: null, srText: null };
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
    const buttonTime = timerBlocked ? formatClock(block.secondsLeft ?? 0) : null;
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
      rightText: danger.levelLabel,
      rightColor: danger.color,
      locked,
      timeText: locked ? formatClock(checks.selfTimer.secondsLeft) : null,
      heardOf,
      note,
      button: {
        label: crossing ? 'Cross' : 'Travel',
        ariaLabel,
        fullLabel: buttonTime !== null ? `Region travel in ${buttonTime}` : ariaLabel,
        icon: crossing ? 'door' : 'signpost',
        disabled: !input.connected || block !== null,
        timeText: buttonTime,
      },
      following: checks.followers.length,
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
