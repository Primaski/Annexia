import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { generateMap } from '../engine/mapGen';
import { spawnPlayers } from '../engine/spawnPlayers';
import { SPAWN_LOYALTY, calculateLoyaltyTarget, stepLoyalty, isBreakawayCandidate } from '../engine/loyalty';
import { coordKey, hexNeighbors } from '../engine/hex';
import { DEFAULT_CONFIG } from '../config';
import type { Tile, OwnedTile, BarbarianTile, Player, GovernmentType } from '../types';

/**
 * Call once in the game screen to run the full generation pipeline:
 * terrain → spawn → store. Reads config from the store at mount time.
 */
export function useMapGen(): void {
  useEffect(() => {
    const { config, setTiles, setPlayers, setMapSeed } = useGameStore.getState();
    const { mapCols, mapRows, playerCount } = config;
    const seed = Date.now();

    // Step 1: Generate terrain
    const terrainTiles = generateMap(mapCols, mapRows, DEFAULT_CONFIG.map, seed);

    // Step 2: Place starting territories
    const spawnResults = spawnPlayers(terrainTiles, playerCount, true, seed);

    // Step 3: Build player list
    const players: Player[] = spawnResults.map((_, i) => ({
      id: `player_${i + 1}`,
      name: `Player ${i + 1}`,
      isHuman: i === 0,
      alignmentVector: {
        ecology: 0.5,
        militarism: 0.5,
        religion: 0.5,
        liberty: 0.5,
        progress: 0.5,
      },
      confidence: 0.5,
      governmentType: 'none' as GovernmentType,
      advisorId: null,
      tribuneIds: [],
      personalityId: null,
    }));

    // Step 4: Convert spawn results to OwnedTile patches
    const ownedPatches = new Map<string, OwnedTile>();
    for (let i = 0; i < spawnResults.length; i++) {
      const { spawnCoord, claimedCoords } = spawnResults[i];
      const ownerId = players[i].id;
      const spawnKey = coordKey(spawnCoord);

      for (const coord of claimedCoords) {
        const key = coordKey(coord);
        const base = terrainTiles.find((t) => coordKey(t.coord) === key)!;
        ownedPatches.set(key, {
          ...base,
          state: 'owned',
          ownerId,
          loyalty: SPAWN_LOYALTY,
          loyaltyTarget: SPAWN_LOYALTY,
          suppression: 0,
          defense: 0,
          activeTroops: key === spawnKey ? 10 : 0,
        } as OwnedTile);
      }
    }

    // Step 5: Merge owned patches into terrain and build record
    const tileRecord: Record<string, Tile> = {};
    for (const tile of terrainTiles) {
      const key = coordKey(tile.coord);
      tileRecord[key] = ownedPatches.get(key) ?? tile;
    }

    // Step 6: Dispatch to store
    setTiles(tileRecord);
    setPlayers(players);
    setMapSeed(seed);
    useGameStore.getState().setPendingRoundtable('game_start');
  }, []);
}

/**
 * Stub for AI turn processing. AI players currently do nothing.
 * Called during policy and mobilization phases for all non-human players.
 * Replace with real AI logic in a later phase.
 */
export function processAITurns(): void {
  const { players, markPolicySubmitted } = useGameStore.getState();
  for (const player of players) {
    if (!player.isHuman) {
      markPolicySubmitted(player.id);
    }
  }
}

export function resolveTurn(): void {
  // Step 1 — Read state
  const { tiles, players } = useGameStore.getState();
  const playerMap = new Map<string, Player>(players.map((p) => [p.id, p]));

  // Step 2 — Compute new loyalty targets and step loyalty for every owned tile
  const updatedTiles: Record<string, Tile> = { ...tiles };

  for (const key of Object.keys(tiles)) {
    const tile = tiles[key];
    if (tile.state !== 'owned') continue;
    const owned = tile as OwnedTile;

    const ownerPlayer = playerMap.get(owned.ownerId);
    if (!ownerPlayer) continue;

    const enemyNeighborAlignments = hexNeighbors(owned.coord)
      .map((coord) => tiles[coordKey(coord)])
      .filter(
        (neighbor): neighbor is OwnedTile =>
          neighbor?.state === 'owned' && (neighbor as OwnedTile).ownerId !== owned.ownerId,
      )
      .map((neighbor) => playerMap.get(neighbor.ownerId)?.alignmentVector)
      .filter((v): v is Player['alignmentVector'] => v !== undefined);

    const newTarget = calculateLoyaltyTarget(
      ownerPlayer.alignmentVector,
      owned.cultureVector,
      enemyNeighborAlignments,
      DEFAULT_CONFIG.loyalty,
    );

    const stepped = stepLoyalty(owned.loyalty, newTarget, DEFAULT_CONFIG.loyalty.momentumRate);

    updatedTiles[key] = { ...owned, loyalty: stepped, loyaltyTarget: newTarget };
  }

  // Step 3 — Breakaway pass
  for (const key of Object.keys(updatedTiles)) {
    const tile = updatedTiles[key];
    if (tile.state !== 'owned') continue;

    // TODO: suppression should reduce breakaway chance
    if (isBreakawayCandidate(tile.loyalty, DEFAULT_CONFIG.loyalty.breakawayThreshold)) {
      updatedTiles[key] = {
        coord: tile.coord,
        state: 'barbarian',
        cultureVector: tile.cultureVector,
        defense: Math.floor(Math.random() * 26) + 25,
      } as BarbarianTile;
    }
  }

  // Step 4 — Write to store
  useGameStore.getState().setTiles(updatedTiles);
  useGameStore.getState().advanceTurn();
}
