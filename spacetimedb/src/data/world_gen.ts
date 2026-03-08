// World generation data: ripple templates, discovery templates, biome hints, danger scaling

export const RIPPLE_TEMPLATES = [
  'A new land has been remembered beyond {sourceRegion}... the air carries hints of {biomeHint}.',
  'The edges of reality ripple. Something ancient stirs beyond {sourceRegion}.',
  'The world grows. A {biomeHint} presence makes itself known past {sourceRegion}.',
  'Reality exhales. Beyond {sourceRegion}, {biomeHint} terrain has always been there. You simply failed to notice.',
  'The map trembles at its borders. {sourceRegion} is no longer the edge of things.',
];

export const DISCOVERY_TEMPLATES = [
  'You have wandered beyond the edge of the known world. The Keeper of Knowledge pauses, then remembers... {regionName}.',
  'The mists part. You are the first to remember {regionName}. The Keeper notes this with something almost like interest.',
  'You step into {regionName}. It has always been here. You were simply the first to notice.',
];

export const BIOME_HINTS: Record<string, string[]> = {
  volcanic: ['scorched', 'ember-touched', 'ashen'],
  forest: ['verdant', 'ancient woodland', 'deep-rooted'],
  tundra: ['frost-bitten', 'ice-shrouded', 'crystalline'],
  desert: ['sun-scorched', 'sand-swept', 'arid'],
  swamp: ['mire-cloaked', 'fetid', 'bog-born'],
  mountains: ['stone-crowned', 'peaks of', 'windswept heights'],
  plains: ['wind-swept', 'open expanse', 'grassland'],
  coastal: ['salt-touched', 'tide-worn', 'sea-bitten'],
  cavern: ['subterranean', 'deep-dwelling', 'darkness-steeped'],
  ruins: ['crumbling', 'time-ravaged', 'forgotten'],
};

/**
 * Pick a ripple announcement message using deterministic timestamp-based selection.
 * Called from reducers -- no Math.random allowed.
 */
export function pickRippleMessage(
  sourceRegionName: string,
  biome: string,
  timestampMicros: bigint
): string {
  const template = RIPPLE_TEMPLATES[Number(timestampMicros % BigInt(RIPPLE_TEMPLATES.length))];
  const hints = BIOME_HINTS[biome] ?? BIOME_HINTS['plains'];
  const hint = hints[Number(timestampMicros % BigInt(hints.length))];
  return template
    .replace('{sourceRegion}', sourceRegionName)
    .replace('{biomeHint}', hint);
}

/**
 * Pick a personal discovery narrative using deterministic timestamp-based selection.
 * Called from reducers -- no Math.random allowed.
 */
export function pickDiscoveryMessage(
  regionName: string,
  timestampMicros: bigint
): string {
  const template = DISCOVERY_TEMPLATES[Number(timestampMicros % BigInt(DISCOVERY_TEMPLATES.length))];
  return template.replace('{regionName}', regionName);
}

/**
 * Compute danger multiplier for a newly generated region.
 * Increases by 50-100 from source region's danger, caps at 800.
 * Uses timestamp-derived pseudorandom for determinism in reducers.
 */
export function computeRegionDanger(
  sourceRegionDanger: bigint,
  timestampMicros: bigint
): bigint {
  const increase = Number(timestampMicros % 51n) + 50;
  const newDanger = Number(sourceRegionDanger) + increase;
  return BigInt(Math.min(newDanger, 800));
}
