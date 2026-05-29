import { useCallback } from 'react';
import { hexToPixel } from '../engine/hex';
import type { AxialCoord, PixelCoord } from '../engine/hex';

/**
 * Returns a stable function that converts an axial hex coordinate to a
 * pixel center point for the given hex circumradius `size`.
 */
export function useMapLayout(size: number): (coord: AxialCoord) => PixelCoord {
  return useCallback((coord: AxialCoord) => hexToPixel(coord, size), [size]);
}
