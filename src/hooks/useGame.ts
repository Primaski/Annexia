import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { generateMap } from '../engine/mapGen';
import { spawnPlayers } from '../engine/spawnPlayers';
import { SPAWN_LOYALTY, calculateLoyaltyTarget, stepLoyalty, isBreakawayCandidate } from '../engine/loyalty';
import { coordKey, hexNeighbors } from '../engine/hex';
import { DEFAULT_CONFIG } from '../config';
import { generateName } from '../engine/names';
import tribunesData from '../data/tribunes.json';
import type { Tile, OwnedTile, BarbarianTile, Player, GovernmentType, Nation, Tribune, AIPersonality, TraitVector } from '../types';
import aiPersonalitiesData from '../data/ai_personalities.json';

// Mulberry32 seeded PRNG — same algorithm as mapGen.ts, kept local to avoid coupling.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

const DEMOCRATIC_LEANS: Record<keyof TraitVector, number> = {
  ecology: 0.3,
  militarism: -0.8,
  religion: -0.5,
  liberty: 0.9,
  progress: 0.4,
};
const TOTAL_ABS_LEAN = 2.9;

function deriveGovernmentType(traitVector: TraitVector): GovernmentType {
  const score =
    (traitVector.ecology * DEMOCRATIC_LEANS.ecology +
      traitVector.militarism * DEMOCRATIC_LEANS.militarism +
      traitVector.religion * DEMOCRATIC_LEANS.religion +
      traitVector.liberty * DEMOCRATIC_LEANS.liberty +
      traitVector.progress * DEMOCRATIC_LEANS.progress) /
    TOTAL_ABS_LEAN;
  if (score > 0.15) return 'democracy';
  if (score < -0.15) return 'autocracy';
  return 'hybrid';
}

/**
 * Call once in the game screen to run the full generation pipeline:
 * terrain → spawn → store. Reads config from the store at mount time.
 */
export function useMapGen(): void {
  useEffect(() => {
    useGameStore.getState().setTribunes(tribunesData as unknown as Tribune[]);
    useGameStore.getState().setPhase('roundtable');
    const { config, setTiles, setPlayers, setMapSeed } = useGameStore.getState();
    const { mapCols, mapRows, playerCount } = config;
    const seed = Date.now();
    const rand = mulberry32(seed);

    // Step 1: Generate terrain
    const { tiles: terrainTiles, nations } = generateMap(mapCols, mapRows, DEFAULT_CONFIG.map, seed);
    const nationsRecord = Object.fromEntries(nations.map((n) => [n.id, n]));

    // Step 2: Place starting territories
    const spawnResults = spawnPlayers(terrainTiles, playerCount, true, seed);

    // Step 3: Build player list
    const personalities = aiPersonalitiesData as unknown as AIPersonality[];
    const players: Player[] = spawnResults.map((_, i) => {
      if (i === 0) {
        return {
          id: `player_${i + 1}`,
          name: `Player ${i + 1}`,
          isHuman: true,
          alignmentVector: { ecology: 0.5, militarism: 0.5, religion: 0.5, liberty: 0.5, progress: 0.5 },
          confidence: 0.5,
          governmentType: 'none' as GovernmentType,
          advisorId: null,
          tribuneIds: [],
          personalityId: null,
          nationId: `nation_player_${i}`,
          imagePath: null,
        };
      }
      const personality = personalities[Math.floor(rand() * personalities.length)];
      return {
        id: `player_${i + 1}`,
        name: personality.name,
        isHuman: false,
        alignmentVector: { ...personality.traitVector },
        confidence: 0.5,
        governmentType: deriveGovernmentType(personality.traitVector),
        advisorId: null,
        tribuneIds: [],
        personalityId: personality.id,
        nationId: `nation_player_${i}`,
        imagePath: personality.imagePath,
      };
    });

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

    // Step 6: Mint a nation for each player
    const playerNationsRecord: Record<string, Nation> = {};
    for (let i = 0; i < players.length; i++) {
      const id = `nation_player_${i}`;
      playerNationsRecord[id] = { id, name: generateName(rand), isBarbarian: false, imagePath: null };
    }

    // Step 7: Dispatch to store
    setTiles(tileRecord);
    setPlayers(players);
    useGameStore.getState().setNations({ ...nationsRecord, ...playerNationsRecord });
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
      // Inherit nation from an adjacent barbarian tile, or mint a new one
      let nationId: string | null = null;
      for (const neighborCoord of hexNeighbors(tile.coord)) {
        const neighbor = updatedTiles[coordKey(neighborCoord)];
        if (neighbor?.state === 'barbarian' && neighbor.nationId !== null) {
          nationId = neighbor.nationId;
          break;
        }
      }
      if (nationId === null) {
        const id = `nation_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const nation: Nation = { id, name: generateName(() => Math.random()), isBarbarian: true, imagePath: null };
        useGameStore.getState().addNation(nation);
        nationId = id;
      }

      updatedTiles[key] = {
        coord: tile.coord,
        state: 'barbarian',
        cultureVector: tile.cultureVector,
        name: tile.name,
        nationId,
        defense: Math.floor(Math.random() * 26) + 25,
      } as BarbarianTile;
    }
  }

  // Step 4 — Write to store
  useGameStore.getState().setTiles(updatedTiles);
  useGameStore.getState().advanceTurn();
}
