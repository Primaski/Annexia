/**
 * mobilization.ts — Mobilization phase actions: annexation, troop queries.
 *
 * Pure TypeScript. No React, no Zustand.
 */

import { hexNeighbors, isInGrid, coordKey, parseCoordKey } from './hex';
import { SPAWN_LOYALTY } from './loyalty';
import type { Tile, OwnedTile, BarbarianTile } from '../types';
import { CONQUEST_LOYALTY_BARBARIAN } from '../types';
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
 * Throws if the target is not unclaimed or if troopSources contribute fewer than 1 troop.
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
  if (troopSum < 1) {
    throw new Error('annexTile: troopSources must contribute at least 1 troop');
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
    activeTroops: troopSum,
    loyaltyLog: [],
  } as OwnedTile;

  return newTiles;
}

/**
 * Returns a new tiles record with troops moved from troopSources into targetKey.
 * Target must be an owned tile belonging to playerId.
 * troopSources is a map of tileKey → troop count to move from that tile.
 * Does not mutate inputs.
 */
export function fortifyTile(
  tiles: Record<string, Tile>,
  targetKey: string,
  playerId: string,
  troopSources: Record<string, number>
): Record<string, Tile> {
  const target = tiles[targetKey];
  if (!target || target.state !== 'owned' || target.ownerId !== playerId) {
    throw new Error('fortifyTile: target must be an owned tile belonging to playerId');
  }

  const totalMoved = Object.values(troopSources).reduce((a, b) => a + b, 0);
  if (totalMoved === 0) {
    throw new Error('fortifyTile: must move at least one troop');
  }

  if (targetKey in troopSources) {
    throw new Error('fortifyTile: target tile cannot also be a source tile');
  }

  for (const [sourceKey, count] of Object.entries(troopSources)) {
    const sourceTile = tiles[sourceKey] as OwnedTile;
    if (sourceTile.ownerId !== playerId) {
      throw new Error('fortifyTile: source tile does not belong to playerId');
    }
    if (sourceTile.activeTroops < count) {
      throw new Error(`fortifyTile: source tile ${sourceKey} has insufficient troops`);
    }
  }

  const newTiles: Record<string, Tile> = { ...tiles };

  for (const [sourceKey, count] of Object.entries(troopSources)) {
    const sourceTile = newTiles[sourceKey] as OwnedTile;
    newTiles[sourceKey] = { ...sourceTile, activeTroops: sourceTile.activeTroops - count };
  }

  const ownedTarget = target as OwnedTile;
  newTiles[targetKey] = { ...ownedTarget, activeTroops: ownedTarget.activeTroops + totalMoved };

  return newTiles;
}

export interface CombatResult {
  attackerWon: boolean;
  attackerSurvivors: number;
  defenderSurvivors: number;
}

export function simulateCombat(
  attackers: number,
  defenders: number,
  lanchesterExponent: number,
  defenderBonus: number,
  rand: () => number
): CombatResult {
  const effectiveDefenders = defenders * defenderBonus;
  const p = 1 / (1 + Math.pow(effectiveDefenders / attackers, lanchesterExponent));
  const attackerWon = rand() < p;

  const [a, d] = attackerWon ? [attackers, defenders] : [defenders, attackers];
  const rawSurvivors = Math.sqrt(Math.max(0, a * a - d * d));
  const survivors = Math.max(1, Math.round(rawSurvivors * (0.85 + rand() * 0.3)));

  return {
    attackerWon,
    attackerSurvivors: attackerWon ? survivors : 0,
    defenderSurvivors: attackerWon ? 0 : survivors,
  };
}

/**
 * Returns coordKeys of all barbarian tiles adjacent to any tile owned by playerId.
 */
export function getInvadableTileKeys(
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
      if (neighbor && neighbor.state === 'barbarian') {
        result.add(key);
      }
    }
  }

  return result;
}

/**
 * Attempts an invasion of a barbarian tile.
 * Troops are deducted from sources immediately regardless of outcome.
 * If attacker wins, tile converts to owned with conquest loyalty penalty.
 * If defender wins, tile stays barbarian with updated troop count.
 */
export function invadeTile(
  tiles: Record<string, Tile>,
  targetKey: string,
  playerId: string,
  nationId: string,
  troopSources: Record<string, number>,
  lanchesterExponent: number,
  defenderBonus: number,
  rand: () => number
): { newTiles: Record<string, Tile>; result: CombatResult } {
  const target = tiles[targetKey];
  if (!target || target.state !== 'barbarian') {
    throw new Error('invadeTile: target tile is not barbarian');
  }

  const troopSum = Object.values(troopSources).reduce((a, b) => a + b, 0);
  if (troopSum < DEFAULT_CONFIG.mobilization.invadeTroopMin) {
    throw new Error('invadeTile: troopSources must sum to at least invadeTroopMin');
  }

  const validNeighborKeys = new Set(hexNeighbors(parseCoordKey(targetKey)).map(coordKey));
  for (const sourceKey of Object.keys(troopSources)) {
    if (!validNeighborKeys.has(sourceKey)) {
      throw new Error(`invadeTile: source tile ${sourceKey} is not adjacent to target`);
    }
  }

  const newTiles: Record<string, Tile> = { ...tiles };

  for (const [sourceKey, count] of Object.entries(troopSources)) {
    const sourceTile = newTiles[sourceKey] as OwnedTile;
    newTiles[sourceKey] = { ...sourceTile, activeTroops: sourceTile.activeTroops - count };
  }

  const defenderTroops = (tiles[targetKey] as BarbarianTile).activeTroops;
  const result = simulateCombat(troopSum, defenderTroops, lanchesterExponent, defenderBonus, rand);

  if (result.attackerWon) {
    newTiles[targetKey] = {
      ...tiles[targetKey],
      state: 'owned',
      ownerId: playerId,
      nationId,
      loyalty: CONQUEST_LOYALTY_BARBARIAN,
      loyaltyTarget: CONQUEST_LOYALTY_BARBARIAN,
      suppression: 0,
      defense: 0,
      activeTroops: result.attackerSurvivors,
      loyaltyLog: [],
    } as OwnedTile;
  } else {
    newTiles[targetKey] = {
      ...(tiles[targetKey] as BarbarianTile),
      activeTroops: result.defenderSurvivors,
      previousOwner: null,
    };
  }

  return { newTiles, result };
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
