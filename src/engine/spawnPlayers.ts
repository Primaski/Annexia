/**
 * spawnPlayers.ts — Starting territory assignment for all players.
 *
 * Pure TypeScript. No React, no Zustand.
 * Imports only from ./hex and ../types.
 */

import { coordKey, hexDistance, hexNeighbors, hexesInRadius, isInGrid } from './hex';
import type { AxialCoord, Tile } from '../types';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface SpawnResult {
  spawnCoord: AxialCoord;
  claimedCoords: AxialCoord[]; // center + 6 neighbors = 7 tiles
}

// ─── PRNG ─────────────────────────────────────────────────────────────────────

// Mulberry32 — copied from mapGen.ts where it is private. Do not import it.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─── Grid Dimension Derivation ────────────────────────────────────────────────

function deriveDimensions(tiles: Tile[]): { cols: number; rows: number } {
  let maxGx = 0;
  let maxR = 0;
  for (const t of tiles) {
    const gx = t.coord.q + Math.floor(t.coord.r / 2);
    if (gx > maxGx) maxGx = gx;
    if (t.coord.r > maxR) maxR = t.coord.r;
  }
  return { cols: maxGx + 1, rows: maxR + 1 };
}

// ─── Candidate Validation ─────────────────────────────────────────────────────

/**
 * Returns true if `coord` satisfies all four spawn eligibility conditions.
 * Assumes the caller has already confirmed the tile itself is 'unclaimed'
 * and not in claimedKeySet.
 *
 * Condition 1: state === 'unclaimed' — enforced by the caller's filter.
 * Condition 2: all 6 immediate neighbors are 'unclaimed' and not claimed by
 *              a previously placed player.
 * Condition 3: at least 14 of the 18 non-center tiles within radius 2 are land
 *              (any non-water state).
 * Condition 4: no barbarian tile and no claimed player tile within hex distance 2.
 */
function isValidCandidate(
  coord: AxialCoord,
  tileMap: Map<string, Tile>,
  claimedKeySet: Set<string>,
  cols: number,
  rows: number
): boolean {
  // Condition 2: all 6 immediate neighbors are unclaimed and unoccupied
  for (const n of hexNeighbors(coord)) {
    if (!isInGrid(n, cols, rows)) return false;
    const nKey = coordKey(n);
    if (claimedKeySet.has(nKey)) return false;
    const nTile = tileMap.get(nKey);
    if (!nTile || nTile.state !== 'unclaimed') return false;
  }

  // Conditions 3 & 4 — single pass over the 18 non-center tiles in radius 2.
  // hexesInRadius(coord, 2) returns 19 tiles (incl. center); we skip the center.
  const centerKey = coordKey(coord);
  const r2 = hexesInRadius(coord, 2);
  let landInR2 = 0;

  for (const c of r2) {
    const k = coordKey(c);
    if (k === centerKey) continue;
    if (!isInGrid(c, cols, rows)) continue; // out-of-bounds can't be barbarian or claimed

    const ct = tileMap.get(k);
    if (!ct) continue;

    // Condition 4: barbarian tiles must be ≥ 3 steps away
    if (ct.state === 'barbarian') return false;
    // Condition 4: already-claimed player tiles must be ≥ 3 steps away
    if (claimedKeySet.has(k)) return false;
    // Condition 3: count non-water tiles
    if (ct.state !== 'water') landInR2++;
  }

  return landInR2 >= 14;
}

// ─── Spawn Selection ──────────────────────────────────────────────────────────

/**
 * Return the candidate that maximises the minimum hexDistance to all existing
 * spawn points. Ties are broken by iteration order (first found).
 */
function pickMaxDist(candidates: AxialCoord[], existingSpawns: AxialCoord[]): AxialCoord {
  let best = candidates[0];
  let bestMin = -1;
  for (const c of candidates) {
    let minDist = Infinity;
    for (const s of existingSpawns) {
      const d = hexDistance(c, s);
      if (d < minDist) minDist = d;
    }
    if (minDist > bestMin) {
      bestMin = minDist;
      best = c;
    }
  }
  return best;
}

// ─── Single Placement Attempt ─────────────────────────────────────────────────

/**
 * Try to place all players using the provided PRNG.
 * Returns null if any player has no valid candidates (seed fails).
 */
function attemptSpawn(
  tiles: Tile[],
  tileMap: Map<string, Tile>,
  playerCount: number,
  maxDistanceMode: boolean,
  rand: () => number,
  cols: number,
  rows: number
): SpawnResult[] | null {
  const results: SpawnResult[] = [];
  const claimedKeySet = new Set<string>();

  for (let i = 0; i < playerCount; i++) {
    // Collect valid candidates for this placement
    const candidates: AxialCoord[] = [];
    for (const t of tiles) {
      if (t.state !== 'unclaimed') continue;
      if (claimedKeySet.has(coordKey(t.coord))) continue;
      if (isValidCandidate(t.coord, tileMap, claimedKeySet, cols, rows)) {
        candidates.push(t.coord);
      }
    }

    if (candidates.length === 0) return null;

    // Select spawn point
    let chosen: AxialCoord;
    if (maxDistanceMode && results.length > 0) {
      // Subsequent players: maximise minimum distance to existing spawns
      chosen = pickMaxDist(candidates, results.map((r) => r.spawnCoord));
    } else {
      // First player (or random mode): pick randomly
      chosen = candidates[Math.floor(rand() * candidates.length)];
    }

    // Claim center + all 6 neighbors (7 tiles total).
    // All neighbors are guaranteed in-grid by condition 2.
    const claimedCoords: AxialCoord[] = [chosen, ...hexNeighbors(chosen)];
    for (const c of claimedCoords) {
      claimedKeySet.add(coordKey(c));
    }

    results.push({ spawnCoord: chosen, claimedCoords });
  }

  return results;
}

// ─── Overlap Assertion ────────────────────────────────────────────────────────

function assertNoOverlap(results: SpawnResult[], tileMap: Map<string, Tile>): void {
  const seen = new Set<string>();
  const overlaps: AxialCoord[] = [];

  for (const { claimedCoords } of results) {
    for (const c of claimedCoords) {
      const k = coordKey(c);
      if (seen.has(k)) overlaps.push(c);
      seen.add(k);
      if (tileMap.get(k)?.state === 'barbarian') overlaps.push(c);
    }
  }

  if (overlaps.length > 0) {
    throw new Error(
      `[spawnPlayers] Tile overlap detected at ${overlaps.map(coordKey).join(', ')} — ` +
      `this is a bug in spawn logic, not a map quality issue.`
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Place `playerCount` starting territories on the map.
 *
 * Each result contains the spawn center and the 7 claimed tile coords
 * (center + 6 neighbors). No tile mutation happens here — the caller
 * is responsible for converting those coords to OwnedTile.
 *
 * Retries up to 5 seeds (seed, seed+1, …, seed+4) if a seed produces a map
 * where valid placement is impossible. Throws if all 5 fail.
 */
export function spawnPlayers(
  tiles: Tile[],
  playerCount: number,
  maxDistanceMode: boolean,
  seed: number
): SpawnResult[] {
  const { cols, rows } = deriveDimensions(tiles);
  const tileMap = new Map<string, Tile>(tiles.map((t) => [coordKey(t.coord), t]));

  for (let attempt = 0; attempt < 5; attempt++) {
    const rand = mulberry32(seed + attempt);
    const result = attemptSpawn(tiles, tileMap, playerCount, maxDistanceMode, rand, cols, rows);
    if (result !== null) {
      assertNoOverlap(result, tileMap);
      return result;
    }
  }

  const triedSeeds = Array.from({ length: 5 }, (_, i) => seed + i).join(', ');
  throw new Error(
    `[spawnPlayers] Failed to place ${playerCount} players after 5 attempts. ` +
    `Seeds tried: ${triedSeeds}`
  );
}
