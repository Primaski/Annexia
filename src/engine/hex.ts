/**
 * hex.ts — Hexagonal coordinate math and geometry utilities.
 *
 * ─── COORDINATE SYSTEM ────────────────────────────────────────────────────────
 *
 * This file uses AXIAL COORDINATES (q, r). It's the cleanest system for hex
 * grids — think of it as a skewed 2D plane.
 *
 *   q → runs along the "column" axis (roughly left-right)
 *   r → runs along the "row" axis (diagonally down-right)
 *
 * There's also a hidden third axis, s = -q - r, which is used in distance
 * math. Because q + r + s always equals 0, we never need to store s.
 *
 * ─── ORIENTATION ──────────────────────────────────────────────────────────────
 *
 * All hexes in Annexia are POINTY-TOP: corners point up and down, flat edges
 * on the left and right. This determines every formula in this file.
 *
 *         *
 *       /   \
 *      |     |   ← pointy-top
 *       \   /
 *         *
 *
 * ─── REFERENCE ────────────────────────────────────────────────────────────────
 *
 * All formulas come from https://www.redblobgames.com/grids/hexagons/ — the
 * single best resource on hex math. Bookmark it.
 *
 * ─── RULE ─────────────────────────────────────────────────────────────────────
 *
 * This file MUST NEVER import from React, Zustand, or any other game module.
 * It is pure geometry — no state, no side effects, no UI.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** The primary coordinate type. q = column axis, r = row axis. */
export interface AxialCoord {
  q: number;
  r: number;
}

/**
 * Cube coordinates — axial + the derived s axis.
 * Only used internally for distance math; you won't store these in game state.
 */
export interface CubeCoord {
  q: number;
  r: number;
  s: number; // always equals -q - r
}

/** A 2D screen-space coordinate in pixels. */
export interface PixelCoord {
  x: number;
  y: number;
}

// ─── Coordinate Conversions ───────────────────────────────────────────────────

/** Expand an axial coord into full cube coords by deriving s. */
export function axialToCube({ q, r }: AxialCoord): CubeCoord {
  return { q, r, s: -q - r };
}

/** Collapse cube coords back to axial (just drops s). */
export function cubeToAxial({ q, r }: CubeCoord): AxialCoord {
  return { q, r };
}

/**
 * Produce a stable string key for a hex coordinate.
 * Use this to index tiles in a Map or plain object.
 *
 * Example: coordKey({ q: 3, r: -1 }) → "3,-1"
 */
export function coordKey({ q, r }: AxialCoord): string {
  return `${q},${r}`;
}

/**
 * Parse a coordKey string back into an AxialCoord.
 * Inverse of coordKey().
 */
export function parseCoordKey(key: string): AxialCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

// ─── Neighbor Logic ───────────────────────────────────────────────────────────

/**
 * The 6 directional offsets for a pointy-top hex, in axial coords.
 * Order: E, NE, NW, W, SW, SE (clockwise from east).
 */
const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },   // E
  { q: 1, r: -1 },  // NE
  { q: 0, r: -1 },  // NW
  { q: -1, r: 0 },  // W
  { q: -1, r: 1 },  // SW
  { q: 0, r: 1 },   // SE
] as const;

/**
 * Return all 6 neighbors of a hex.
 * Note: does not check whether the neighbors are within map bounds —
 * that's the map layer's responsibility.
 */
export function hexNeighbors(hex: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
}

/**
 * Return neighbors that pass a filter function.
 * Useful for: "only land neighbors", "only player-owned neighbors", etc.
 */
export function filteredNeighbors(
  hex: AxialCoord,
  filter: (neighbor: AxialCoord) => boolean
): AxialCoord[] {
  return hexNeighbors(hex).filter(filter);
}

// ─── Distance ─────────────────────────────────────────────────────────────────

/**
 * Hex distance: the minimum number of steps to walk from a to b.
 * Uses the cube-coordinate formula: max(|dq|, |dr|, |ds|).
 */
export function hexDistance(a: AxialCoord, b: AxialCoord): number {
  const ca = axialToCube(a);
  const cb = axialToCube(b);
  return Math.max(
    Math.abs(ca.q - cb.q),
    Math.abs(ca.r - cb.r),
    Math.abs(ca.s - cb.s)
  );
}

/**
 * Return all hexes within `radius` steps of `center` (inclusive).
 * The center itself is included (distance 0).
 *
 * Useful for: area-of-effect events, influence spread, debug overlays.
 */
export function hexesInRadius(center: AxialCoord, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

// ─── Pixel Conversion ─────────────────────────────────────────────────────────

/**
 * Convert axial hex coordinates to pixel coordinates (center of the hex).
 *
 * `size` is the hex's circumradius — the distance from center to a corner.
 * A hex with size=30 has corners 30px from center; its width is ~52px.
 *
 * Formula for pointy-top:
 *   x = size * √3 * (q + r/2)
 *   y = size * (3/2) * r
 */
export function hexToPixel({ q, r }: AxialCoord, size: number): PixelCoord {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * (3 / 2) * r,
  };
}

/**
 * Convert a pixel coordinate back to the nearest axial hex coord.
 * Useful for: click-to-select a hex from a mouse event.
 *
 * Inverts hexToPixel, then rounds to the nearest valid hex.
 */
export function pixelToHex(point: PixelCoord, size: number): AxialCoord {
  const q = ((Math.sqrt(3) / 3) * point.x - (1 / 3) * point.y) / size;
  const r = ((2 / 3) * point.y) / size;
  return roundToNearestHex({ q, r, s: -q - r });
}

/**
 * Round fractional cube coordinates to the nearest integer hex.
 * Required because pixelToHex produces fractional coords.
 *
 * Algorithm: round all three axes, then fix whichever has the largest
 * rounding error so that q + r + s = 0 holds exactly.
 */
function roundToNearestHex(frac: CubeCoord): AxialCoord {
  let q = Math.round(frac.q);
  let r = Math.round(frac.r);
  let s = Math.round(frac.s);

  const dq = Math.abs(q - frac.q);
  const dr = Math.abs(r - frac.r);
  const ds = Math.abs(s - frac.s);

  // The axis with the biggest rounding error gets recalculated from the other two
  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  } else {
    s = -q - r; // s is unused in return, but keeps the math valid
    void s;
  }

  return { q, r };
}

// ─── Rendering Geometry ───────────────────────────────────────────────────────

/**
 * Return the 6 corner pixel positions of a pointy-top hex centered at `center`.
 *
 * For SVG rendering, pass these to a <polygon points="..." /> element:
 *   const pts = hexCorners(center, size).map(c => `${c.x},${c.y}`).join(' ');
 *   <polygon points={pts} />
 *
 * Corner angles for pointy-top (SVG y-axis points down):
 *   i=0 → top (−90°), then clockwise every 60°
 */
export function hexCorners(center: PixelCoord, size: number): PixelCoord[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angleDeg = 60 * i - 90; // −90° = top corner for pointy-top
    const angleRad = (Math.PI / 180) * angleDeg;
    return {
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    };
  });
}

// ─── Grid Generation ─────────────────────────────────────────────────────────

/**
 * Generate all axial coordinates for a rectangular-ish hex grid.
 *
 * This uses "offset rows" to keep the visual shape roughly rectangular.
 * Each row r starts at q = -floor(r/2), so even rows start at x=0 and
 * odd rows are nudged right by half a hex width.
 *
 * Example for cols=3, rows=2:
 *   Row 0: (0,0), (1,0), (2,0)
 *   Row 1: (0,1), (1,1), (2,1)   ← visually shifted right by half a hex
 *
 * Note: the resulting pixel positions will all have x ≥ 0. You still need
 * to add SVG padding for the hex corners themselves.
 */
export function generateGridCoords(cols: number, rows: number): AxialCoord[] {
  const coords: AxialCoord[] = [];
  for (let r = 0; r < rows; r++) {
    const qOffset = -Math.floor(r / 2);
    for (let q = qOffset; q < qOffset + cols; q++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

/**
 * Check if a coord lies within the standard rectangular grid bounds
 * produced by generateGridCoords(cols, rows).
 *
 * Use this to filter out-of-bounds neighbors during map logic.
 */
export function isInGrid(coord: AxialCoord, cols: number, rows: number): boolean {
  if (coord.r < 0 || coord.r >= rows) return false;
  const qOffset = -Math.floor(coord.r / 2);
  return coord.q >= qOffset && coord.q < qOffset + cols;
}
