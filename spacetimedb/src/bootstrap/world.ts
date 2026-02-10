import { connectLocations, tableHasRows } from './utils';

export const ensureWorldSeed = (ctx: any, dayDurationMicros: bigint) => {
  if (!tableHasRows(ctx.db.location.iter())) {
    const starter = ctx.db.region.insert({
      id: 0n,
      name: 'Hollowmere Vale',
      dangerMultiplier: 100n,
      regionType: 'outdoor',
    });
    const border = ctx.db.region.insert({
      id: 0n,
      name: 'Embermarch Fringe',
      dangerMultiplier: 160n,
      regionType: 'outdoor',
    });
    const embermarchDepths = ctx.db.region.insert({
      id: 0n,
      name: 'Embermarch Depths',
      dangerMultiplier: 200n,
      regionType: 'dungeon',
    });

    const town = ctx.db.location.insert({
      id: 0n,
      name: 'Hollowmere',
      description: 'A misty river town with lantern-lit docks and a quiet market square.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 0n,
      isSafe: true,
      terrainType: 'town',
      bindStone: false,
    });
    const ashen = ctx.db.location.insert({
      id: 0n,
      name: 'Ashen Road',
      description: 'A cracked highway flanked by dead trees and drifting embers.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 1n,
      isSafe: false,
      terrainType: 'plains',
      bindStone: true,
    });
    const fogroot = ctx.db.location.insert({
      id: 0n,
      name: 'Fogroot Crossing',
      description: 'Twisted roots and slick stones mark a shadowy crossing.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'swamp',
      bindStone: false,
    });
    const bramble = ctx.db.location.insert({
      id: 0n,
      name: 'Bramble Hollow',
      description: 'A dense thicket where tangled branches muffle the light.',
      zone: 'Starter',
      regionId: starter.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'woods',
      bindStone: false,
    });
    const gate = ctx.db.location.insert({
      id: 0n,
      name: 'Embermarch Gate',
      description: 'A scorched pass leading toward harsher lands.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 3n,
      isSafe: false,
      terrainType: 'mountains',
      bindStone: false,
    });
    const cinder = ctx.db.location.insert({
      id: 0n,
      name: 'Cinderwatch',
      description: 'Ash dunes and ember winds test the brave.',
      zone: 'Border',
      regionId: border.id,
      levelOffset: 5n,
      isSafe: false,
      terrainType: 'plains',
      bindStone: false,
    });
    const ashvault = ctx.db.location.insert({
      id: 0n,
      name: 'Ashvault Entrance',
      description: 'Blackened stone stairs descend into a sulfur-lit vault.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 2n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });
    const sootveil = ctx.db.location.insert({
      id: 0n,
      name: 'Sootveil Hall',
      description: 'Echoing halls where soot clings to every surface.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 3n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });
    const furnace = ctx.db.location.insert({
      id: 0n,
      name: 'Furnace Crypt',
      description: 'A heat-soaked crypt of iron coffins and smoldering braziers.',
      zone: 'Dungeon',
      regionId: embermarchDepths.id,
      levelOffset: 4n,
      isSafe: false,
      terrainType: 'dungeon',
      bindStone: false,
    });

    ctx.db.worldState.insert({
      id: 1n,
      startingLocationId: town.id,
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + dayDurationMicros,
    });

    connectLocations(ctx, town.id, ashen.id);
    connectLocations(ctx, ashen.id, fogroot.id);
    connectLocations(ctx, fogroot.id, bramble.id);
    connectLocations(ctx, fogroot.id, gate.id);
    connectLocations(ctx, gate.id, cinder.id);
    connectLocations(ctx, gate.id, ashvault.id);
    connectLocations(ctx, ashvault.id, sootveil.id);
    connectLocations(ctx, sootveil.id, furnace.id);
  }
};
