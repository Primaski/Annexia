/**
 * mobilization.ts — Mobilization phase actions: annexation, troop queries.
 *
 * Pure TypeScript. No React, no Zustand.
 */

import { hexNeighbors, isInGrid, coordKey } from './hex';
import { SPAWN_LOYALTY } from './loyalty';
import type { Tile, OwnedTile } from '../types';
import { DEFAULT_CONFIG } from '../config';

/**
 * Returns coordKeys of all unclaimed tiles adjacent to any tile owned by playerId.
 */
export function getAnnexableTiles(
  tiles: Record<string, Tile>,
  playerId: string,
  cols: number,
  rows: number
): Set<string> {
  const result = new Set<string>();

  for (const tile of Object.values(tiles)) {
    if (tile.state !== 'owned' || tile.ownerId !== playerId) continue;

    for (const neighborCoord of hexNeighbors(tile.coord)) {
      if (!isInGrid(neighborCoord, cols, rows)) continue;
      const key = coordKey(neighborCoord);
      const neighbor = tiles[key];
      if (neighbor && neighbor.state === 'unclaimed') {
        result.add(key);
      }
    }
  }

  return result;
}

/**
 * Returns a new tiles record with the annex applied. Does not mutate inputs.
 * Throws if the target is not unclaimed or if troopSources don't sum to annexTroopCost.
 */
export function annexTile(
  tiles: Record<string, Tile>,
  targetKey: string,
  playerId: string,
  nationId: string,
  troopSources: Record<string, number>
): Record<string, Tile> {
  if (tiles[targetKey].state !== 'unclaimed') {
    throw new Error('annexTile: target tile is not unclaimed');
  }

  const troopSum = Object.values(troopSources).reduce((a, b) => a + b, 0);
  if (troopSum !== DEFAULT_CONFIG.mobilization.annexTroopCost) {
    throw new Error('annexTile: troopSources must sum to annexTroopCost');
  }

  const newTiles: Record<string, Tile> = { ...tiles };

  for (const [sourceKey, count] of Object.entries(troopSources)) {
    const sourceTile = newTiles[sourceKey] as OwnedTile;
    newTiles[sourceKey] = { ...sourceTile, activeTroops: sourceTile.activeTroops - count };
  }

  newTiles[targetKey] = {
    ...tiles[targetKey],
    state: 'owned',
    ownerId: playerId,
    nationId,
    loyalty: SPAWN_LOYALTY,
    loyaltyTarget: SPAWN_LOYALTY,
    suppression: 0,
    defense: 0,
    activeTroops: DEFAULT_CONFIG.mobilization.annexTroopCost,
  } as OwnedTile;

  return newTiles;
}

/**
 * Returns the total troops available across all tiles owned by playerId,
 * accounting for troops already committed this mobilization phase.
 */
export function getTotalAvailableTroops(
  tiles: Record<string, Tile>,
  playerId: string,
  spentTroopsByTile: Record<string, number>
): number {
  let total = 0;
  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.state !== 'owned' || tile.ownerId !== playerId) continue;
    total += Math.max(0, tile.activeTroops - (spentTroopsByTile[key] ?? 0));
  }
  return total;
}
