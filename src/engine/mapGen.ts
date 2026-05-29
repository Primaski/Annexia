/**
 * mapGen.ts — Map generation for Annexia.
 *
 * Step 1: Point generation and Lloyd relaxation.
 * Step 2: Voronoi tile assignment, noise-based land/water classification,
 *         and inland lake removal.
 * Step 3: Culture vector assignment, barbarian clustering, and Tile construction.
 *
 * Public API: generateMap(). Steps 1–2 are also exported for unit testing.
 *
 * RULE: No React imports. No Zustand. No game state. Pure math only.
 */

import { createNoise2D } from 'simplex-noise';
import { coordKey, generateGridCoords, hexNeighbors, isInGrid } from './hex';
import type { AxialCoord, PixelCoord } from './hex';
import type { TraitVector, Tile } from '../types';
import type { TuningConfig } from '../config';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

/**
 * Mulberry32 — a fast, seedable 32-bit PRNG.
 * Returns a function that produces uniformly distributed floats in [0, 1).
 * Period: 2^32. Good enough for map generation.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ─── Step 1: Point Generation ─────────────────────────────────────────────────

/**
 * Scatter `count` random points across a canvas of width=cols, height=rows.
 * Each coordinate is in the half-open range [0, cols) × [0, rows).
 *
 * `seed` defaults to Date.now() so each run is unique unless a seed is passed.
 * The seed is logged so any map can be reproduced during testing.
 */
export function generatePoints(
  cols: number,
  rows: number,
  count: number,
  seed: number = Date.now()
): PixelCoord[] {
  console.log(`[mapGen] seed: ${seed}`);
  const rand = mulberry32(seed);
  const points: PixelCoord[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ x: rand() * cols, y: rand() * rows });
  }
  return points;
}

// ─── Step 1: Lloyd Relaxation ─────────────────────────────────────────────────

// Rasterization sample density: samples per unit length on each axis.
// 4 gives a 100×100 sample grid on a 25×25 map — accurate enough for
// centroid approximation without being expensive.
const SAMPLE_DENSITY = 4;

/**
 * Run Lloyd relaxation to distribute points more evenly across the canvas.
 *
 * Each iteration:
 *   1. Rasterize [0, width] × [0, height] at SAMPLE_DENSITY samples per unit.
 *   2. Assign each sample to its nearest seed (nearest-neighbor Voronoi).
 *   3. Move each seed to the centroid of its assigned samples.
 *
 * Seeds with no assigned samples (only possible at extreme point densities)
 * retain their previous position unchanged.
 *
 * `seed` is accepted here so callers can pass it through the full generation
 * pipeline for logging and future use; lloydRelaxation is currently deterministic.
 */
export function lloydRelaxation(
  points: PixelCoord[],
  iterations: number,
  width: number,
  height: number,
  seed?: number
): PixelCoord[] {
  void seed;

  const samplesX = Math.ceil(width * SAMPLE_DENSITY);
  const samplesY = Math.ceil(height * SAMPLE_DENSITY);
  const stepX = width / samplesX;
  const stepY = height / samplesY;

  let current = points.map((p) => ({ ...p }));

  for (let iter = 0; iter < iterations; iter++) {
    const sumX = new Float64Array(current.length);
    const sumY = new Float64Array(current.length);
    const hits = new Int32Array(current.length);

    for (let sy = 0; sy < samplesY; sy++) {
      const y = (sy + 0.5) * stepY;
      for (let sx = 0; sx < samplesX; sx++) {
        const x = (sx + 0.5) * stepX;

        let nearest = 0;
        let minDist = Infinity;
        for (let k = 0; k < current.length; k++) {
          const dx = x - current[k].x;
          const dy = y - current[k].y;
          const dist = dx * dx + dy * dy;
          if (dist < minDist) {
            minDist = dist;
            nearest = k;
          }
        }

        sumX[nearest] += x;
        sumY[nearest] += y;
        hits[nearest]++;
      }
    }

    current = current.map((p, k) =>
      hits[k] > 0 ? { x: sumX[k] / hits[k], y: sumY[k] / hits[k] } : { ...p }
    );
  }

  return current;
}

// ─── Step 2: Voronoi Assignment and Classification ────────────────────────────

/**
 * Map an axial hex coordinate to the cols×rows grid space used by the Voronoi
 * points. Each hex {q, r} becomes {x: colIndex, y: rowIndex} in [0, cols) × [0, rows).
 *
 * Derived from generateGridCoords's offset formula: qOffset = -floor(r/2),
 * so colIndex = q - qOffset = q + floor(r/2).
 *
 * Note: this treats each hex as a 1×1 square for distance purposes and ignores
 * the hex aspect ratio (~1.155:1 height-to-width for pointy-top). For large
 * Voronoi regions the resulting distortion is visually negligible.
 */
function axialToGridSpace({ q, r }: AxialCoord): PixelCoord {
  return { x: q + Math.floor(r / 2), y: r };
}

/** Return the index of the nearest point in `voronoiPoints` to `pos`. */
function nearestRegionIndex(pos: PixelCoord, voronoiPoints: PixelCoord[]): number {
  let nearest = 0;
  let minDist = Infinity;
  for (let k = 0; k < voronoiPoints.length; k++) {
    const dx = pos.x - voronoiPoints[k].x;
    const dy = pos.y - voronoiPoints[k].y;
    const dist = dx * dx + dy * dy;
    if (dist < minDist) {
      minDist = dist;
      nearest = k;
    }
  }
  return nearest;
}

/** True if `coord` lies on the outer perimeter of a generateGridCoords(cols, rows) grid. */
function isBorderTile({ q, r }: AxialCoord, cols: number, rows: number): boolean {
  if (r === 0 || r === rows - 1) return true;
  const qOffset = -Math.floor(r / 2);
  return q === qOffset || q === qOffset + cols - 1;
}

/**
 * Flood-fill from all border water tiles and reclassify any water tile that is
 * not reachable from the border as land (inland lake removal).
 *
 * Ocean water is connected to the map edge; inland lakes are not.
 * Land tiles fully enclosed by water (islands) are left unchanged.
 */
function removeInlandLakes(
  states: Map<string, 'land' | 'water'>,
  coords: AxialCoord[],
  cols: number,
  rows: number
): Map<string, 'land' | 'water'> {
  const reachable = new Set<string>();
  const queue: AxialCoord[] = [];

  for (const coord of coords) {
    const key = coordKey(coord);
    if (isBorderTile(coord, cols, rows) && states.get(key) === 'water') {
      reachable.add(key);
      queue.push(coord);
    }
  }

  // BFS with head pointer to avoid O(n²) shift cost
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    for (const neighbor of hexNeighbors(current)) {
      if (!isInGrid(neighbor, cols, rows)) continue;
      const key = coordKey(neighbor);
      if (!reachable.has(key) && states.get(key) === 'water') {
        reachable.add(key);
        queue.push(neighbor);
      }
    }
  }

  const result = new Map(states);
  for (const coord of coords) {
    const key = coordKey(coord);
    if (states.get(key) === 'water' && !reachable.has(key)) {
      result.set(key, 'land');
    }
  }
  return result;
}

/**
 * Classify every tile coordinate as 'land' or 'water' using Voronoi regions
 * and Simplex noise.
 *
 * Algorithm:
 *   1. Assign each tile to its nearest Voronoi region (array index into voronoiPoints).
 *   2. Score each region: score = normalizedDistFromCenter - noiseValue.
 *      Low score → near center or high noise → land.
 *      High score → near edge or low noise → water.
 *   3. Sort scores; pick the threshold at the landRatio percentile so the
 *      config value drives the actual land fraction.
 *   4. Reclassify inland lakes (water not connected to the map border) as land.
 *
 * Region IDs are array indices into voronoiPoints.
 */
export function classifyTiles(
  coords: AxialCoord[],
  voronoiPoints: PixelCoord[],
  cols: number,
  rows: number,
  noiseScale: number,
  landRatio: number,
  seed: number
): Map<string, 'land' | 'water'> {
  const noise2D = createNoise2D(mulberry32(seed));

  const cx = cols / 2;
  const cy = rows / 2;
  const halfDiag = Math.sqrt(cx * cx + cy * cy);

  const scores = voronoiPoints.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const normalizedDist = Math.sqrt(dx * dx + dy * dy) / halfDiag;
    const noiseVal = noise2D((p.x / cols) * noiseScale, (p.y / rows) * noiseScale);
    return normalizedDist - noiseVal;
  });

  const sorted = [...scores].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * landRatio)] ?? sorted[sorted.length - 1];

  const regionIsLand = scores.map((s) => s <= threshold);

  const states = new Map<string, 'land' | 'water'>();
  for (const coord of coords) {
    const pos = axialToGridSpace(coord);
    const region = nearestRegionIndex(pos, voronoiPoints);
    states.set(coordKey(coord), regionIsLand[region] ? 'land' : 'water');
  }

  return removeInlandLakes(states, coords, cols, rows);
}

// ─── Step 3: Barbarian Clustering ─────────────────────────────────────────────

// Number of Lloyd relaxation passes. Higher = more evenly distributed Voronoi
// seeds; 3 is the conventional sweet spot (diminishing returns past 2–3).
const LLOYD_ITERATIONS = 3;

// Target tiles per barbarian cluster. Controls how many BFS seeds are placed.
// Formula: seedCount = max(2, floor(barbarianCount / BARBARIAN_CLUSTER_SIZE))
const BARBARIAN_CLUSTER_SIZE = 8;

const TRAIT_KEYS: (keyof TraitVector)[] = [
  'ecology', 'militarism', 'religion', 'liberty', 'progress',
];

/**
 * Grow barbarian territory outward from random land seeds via randomized BFS.
 * Stops when `targetCount` land tiles have been claimed or the frontier exhausts.
 *
 * Returns a Set of coordKeys for all barbarian-designated tiles.
 *
 * `rand` is the caller's PRNG — passed in so the full generation sequence
 * stays deterministic under a single seed.
 */
function growBarbarianClusters(
  landCoords: AxialCoord[],
  targetCount: number,
  seedCount: number,
  cols: number,
  rows: number,
  rand: () => number
): Set<string> {
  if (targetCount <= 0 || landCoords.length === 0) return new Set();

  const actual = Math.min(targetCount, landCoords.length);
  const landSet = new Set(landCoords.map(coordKey));

  // Partial Fisher-Yates shuffle to pick random seeds without a full copy+sort
  const idxs = Array.from({ length: landCoords.length }, (_, i) => i);
  const actualSeedCount = Math.min(seedCount, landCoords.length);
  for (let i = 0; i < actualSeedCount; i++) {
    const j = i + Math.floor(rand() * (landCoords.length - i));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const seeds = idxs.slice(0, actualSeedCount).map((i) => landCoords[i]);

  const barbSet = new Set<string>(seeds.map(coordKey));
  const frontier: AxialCoord[] = [...seeds];

  while (barbSet.size < actual && frontier.length > 0) {
    const idx = Math.floor(rand() * frontier.length);
    const current = frontier[idx];

    const candidates = hexNeighbors(current).filter(
      (n) => isInGrid(n, cols, rows) && landSet.has(coordKey(n)) && !barbSet.has(coordKey(n))
    );

    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(rand() * candidates.length)];
      barbSet.add(coordKey(chosen));
      frontier.push(chosen);
    } else {
      // Dead end: this frontier tile can't expand further, discard it
      frontier.splice(idx, 1);
    }
  }

  return barbSet;
}

// ─── Step 2.5: Landmass Centering ────────────────────────────────────────────

/**
 * Shift the land/water classification so the centroid of all land tiles
 * in grid space (x = q + floor(r/2), y = r) aligns with the grid center
 * (cols/2, rows/2). The offset is rounded to the nearest integer so all
 * shifted coords remain on valid axial positions. Land tiles that shift
 * outside the grid bounds are replaced with water.
 */
function centerLandmass(
  landWater: Map<string, 'land' | 'water'>,
  coords: AxialCoord[],
  cols: number,
  rows: number
): Map<string, 'land' | 'water'> {
  let sumX = 0, sumY = 0, count = 0;
  for (const coord of coords) {
    if (landWater.get(coordKey(coord)) !== 'land') continue;
    sumX += coord.q + Math.floor(coord.r / 2);
    sumY += coord.r;
    count++;
  }

  if (count === 0) return landWater;

  const offsetX = Math.round(cols / 2 - sumX / count);
  const offsetY = Math.round(rows / 2 - sumY / count);

  if (offsetX === 0 && offsetY === 0) return landWater;

  // Start with all water, then place each land tile at its shifted position.
  const shifted = new Map<string, 'land' | 'water'>(
    coords.map((c) => [coordKey(c), 'water' as const])
  );

  for (const coord of coords) {
    if (landWater.get(coordKey(coord)) !== 'land') continue;
    const newGx = (coord.q + Math.floor(coord.r / 2)) + offsetX;
    const newGy = coord.r + offsetY;
    // Inverse of axialToGridSpace: r = newGy, q = newGx - floor(newGy / 2)
    const newCoord: AxialCoord = { q: newGx - Math.floor(newGy / 2), r: newGy };
    if (!isInGrid(newCoord, cols, rows)) continue;
    shifted.set(coordKey(newCoord), 'land');
  }

  return shifted;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a complete map and return it as a flat Tile array.
 *
 * The array order matches generateGridCoords(cols, rows) — row-major, left to right.
 * Conversion to Record<string, Tile> (for the store) happens at the call site.
 *
 * Produces only WaterTile, UnclaimedTile, and BarbarianTile.
 * OwnedTile is never created here; starting territory is assigned elsewhere.
 */
export function generateMap(
  cols: number,
  rows: number,
  config: TuningConfig['map'],
  seed: number = Date.now()
): Tile[] {
  const coords = generateGridCoords(cols, rows);

  // Steps 1–2: Voronoi point layout and land/water classification
  const voronoiCount = Math.floor((cols * rows) / config.voronoiGrain);
  const rawPoints = generatePoints(cols, rows, voronoiCount, seed);
  const relaxedPoints = lloydRelaxation(rawPoints, LLOYD_ITERATIONS, cols, rows, seed);
  const landWater = centerLandmass(
    classifyTiles(coords, relaxedPoints, cols, rows, config.noiseScale, config.landRatio, seed),
    coords, cols, rows
  );

  // One independent noise function per culture trait.
  // Seeds are derived from the master seed so maps are fully reproducible.
  // Culture noise is sampled at normalized tile coordinates (no additional scaling)
  // so cultural region frequency is decoupled from island shape frequency.
  const cultureNoise = TRAIT_KEYS.map((_, i) =>
    createNoise2D(mulberry32(((seed ^ ((i + 1) * 0x4b2a53f7)) >>> 0)))
  );

  // Step 3a: Build initial tiles and collect land coordinates
  const tiles: Tile[] = [];
  const landCoords: AxialCoord[] = [];

  for (const coord of coords) {
    const key = coordKey(coord);

    if (landWater.get(key) === 'water') {
      tiles.push({ coord, state: 'water' });
      continue;
    }

    // Normalize hex grid position to [0, 1] for noise sampling.
    // Grid space: x = q + floor(r/2), y = r (see axialToGridSpace).
    const nx = (coord.q + Math.floor(coord.r / 2)) / cols;
    const ny = coord.r / rows;

    const cnx = nx * config.cultureNoiseScale;
    const cny = ny * config.cultureNoiseScale;
    const cultureVector: TraitVector = {
      ecology:       (cultureNoise[0](cnx, cny) + 1) / 2,
      militarism:    (cultureNoise[1](cnx, cny) + 1) / 2,
      religion:      (cultureNoise[2](cnx, cny) + 1) / 2,
      liberty: (cultureNoise[3](cnx, cny) + 1) / 2,
      progress: 1 - (cultureNoise[4](cnx, cny) + 1) / 2,
    };

    landCoords.push(coord);
    tiles.push({ coord, state: 'unclaimed', cultureVector });
  }

  // Step 3b: Grow barbarian clusters from random land seeds
  const barbarianCount = Math.round(landCoords.length * config.barbarianFraction);
  const clusterSeedCount = Math.max(
    2,
    Math.floor(landCoords.length * config.barbarianFraction / BARBARIAN_CLUSTER_SIZE)
  );
  // Separate PRNG for Step 3 so it doesn't interfere with Steps 1–2
  const rand = mulberry32(((seed ^ 0xf0e1d2c3) >>> 0));
  const barbarianKeys = growBarbarianClusters(
    landCoords, barbarianCount, clusterSeedCount, cols, rows, rand
  );

  // Step 3c: Stamp barbarian state and assign defense values (20–60)
  return tiles.map((tile): Tile => {
    if (tile.state !== 'unclaimed' || !barbarianKeys.has(coordKey(tile.coord))) return tile;
    const defense = Math.floor(rand() * 41) + 20;
    return { ...tile, state: 'barbarian' as const, defense };
  });
}
