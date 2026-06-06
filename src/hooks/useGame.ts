import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { generateMap } from '../engine/mapGen';
import { spawnPlayers } from '../engine/spawnPlayers';
import { SPAWN_LOYALTY, calculateLoyaltyTarget, stepLoyalty, isBreakawayCandidate, cosineSimilarity } from '../engine/loyalty';
import { coordKey, hexDistance, hexNeighbors, isInGrid, parseCoordKey } from '../engine/hex';
import { getAnnexableTiles, annexTile, getTotalAvailableTroops, fortifyTile, invadeTile, getInvadableTileKeys } from '../engine/mobilization';
import { DEFAULT_CONFIG } from '../config';
import { generateName } from '../engine/names';
import tribunesData from '../data/tribunes.json';
import type { Tile, OwnedTile, BarbarianTile, Player, GovernmentType, Nation, Tribune, AIPersonality, TraitVector, Policy, ActiveEffect, LoyaltyLogEntry } from '../types';
import aiPersonalitiesData from '../data/ai_personalities.json';
import policiesData from '../data/policies.json';
import { useUIStore } from '../store/uiStore';
import { drawPolicyCards, computeSentimentShifts, resolvePolicyVeto, applyPolicyChoice, chooseAIPolicyOption } from '../engine/policy';

let simStepInProgress = false;

export type RelocationEntry = { fromKey: string; toKey: string; count: number; ownerId: string; actionType: 'passive' | 'military' };

export type ActionBlockedReason = 'no_ap' | 'no_troops' | 'no_adjacent_troops' | 'no_connected_troops';

export interface AvailableAction {
  type: 'annex' | 'invade' | 'fortify';
  canAfford: boolean;
  blockedReason?: ActionBlockedReason;
}

export function getMilitarySpentByTile(relocatedTroops: RelocationEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of relocatedTroops) {
    if (e.actionType !== 'military') continue;
    result[e.fromKey] = (result[e.fromKey] ?? 0) + e.count;
  }
  return result;
}

export function getReceivedPassiveByTile(relocatedTroops: RelocationEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of relocatedTroops) {
    if (e.actionType !== 'passive') continue;
    result[e.toKey] = (result[e.toKey] ?? 0) + e.count;
  }
  return result;
}

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
  individualism: 0.9,
  progress: 0.4,
};
const TOTAL_ABS_LEAN = 2.9;

function deriveGovernmentType(traitVector: TraitVector): GovernmentType {
  const score =
    (traitVector.ecology * DEMOCRATIC_LEANS.ecology +
      traitVector.militarism * DEMOCRATIC_LEANS.militarism +
      traitVector.religion * DEMOCRATIC_LEANS.religion +
      traitVector.individualism * DEMOCRATIC_LEANS.individualism +
      traitVector.progress * DEMOCRATIC_LEANS.progress) /
    TOTAL_ABS_LEAN;
  if (score > 0.15) return 'democracy';
  if (score < -0.15) return 'autocracy';
  return 'hybrid';
}

export function initAIRoundtable(): void {
  const { players, tribunes } = useGameStore.getState();
  for (const player of players) {
    if (player.isHuman) continue;

    const tribuneCount = player.governmentType === 'democracy' ? 4 : 3;

    const scored = tribunes.map(t => ({
      tribune: t,
      score: cosineSimilarity(t.traitWeights, player.alignmentVector),
    }));
    scored.sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, tribuneCount).map(s => s.tribune);
    const selectedIds = selected.map(t => t.id);
    const selectedNames = selected.map(t => t.name);
    const tribuneSentiment = Object.fromEntries(selectedIds.map(id => [id, 0]));

    useGameStore.getState().updatePlayer(player.id, { tribuneIds: selectedIds, tribuneSentiment });
    console.log(`[roundtable] ${player.name} (${player.governmentType}) selects: ${selectedNames.join(', ')}`);
  }
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
          traitVector: { ecology: 0, militarism: 0, religion: 0, individualism: 0, progress: 0 },
          alignmentVector: { ecology: 0, militarism: 0, religion: 0, individualism: 0, progress: 0 },
          confidence: 0.5,
          governmentType: 'none' as GovernmentType,
          advisorId: null,
          tribuneIds: [],
          tribuneSentiment: {},
          personalityId: null,
          nationId: `nation_player_${i}`,
          imagePath: null,
          activeEffects: [
            {
              id: `eff_voluntary_enlistment_player_${i + 1}`,
              sourcePlayerId: `player_${i + 1}`,
              targetPlayerIds: [`player_${i + 1}`],
              type: 'troop_income',
              scope: 'all_owned' as const,
              targeting: 'self' as const,
              magnitude: 2,
              turnsRemaining: null,
              uses: null,
              enabled: true,
              suspendable: true,
              title: 'Voluntary Enlistment',
              icon: '⚔️',
              description: 'Willing hands take up arms. The capital is never without defenders.',
            },
            {
              id: `eff_civic_levy_player_${i + 1}`,
              sourcePlayerId: `player_${i + 1}`,
              targetPlayerIds: [`player_${i + 1}`],
              type: 'budget_income',
              scope: 'all_owned' as const,
              targeting: 'self' as const,
              magnitude: 10,
              turnsRemaining: null,
              uses: null,
              enabled: true,
              suspendable: true,
              title: 'Civic Levy',
              icon: '💰',
              description: 'Tax day comes every season. The coffers fill, steadily.',
            },
          ] as ActiveEffect[],
          capitalTileKey: coordKey(spawnResults[i].spawnCoord),
          budget: DEFAULT_CONFIG.mobilization.startingBudget,
        };
      }
      const personality = personalities[Math.floor(rand() * personalities.length)];
      return {
        id: `player_${i + 1}`,
        name: personality.name,
        isHuman: false,
        traitVector: { ...personality.traitVector },
        alignmentVector: { ...personality.traitVector },
        confidence: 0.5,
        governmentType: deriveGovernmentType(personality.traitVector),
        advisorId: null,
        tribuneIds: [],
        tribuneSentiment: {},
        personalityId: personality.id,
        nationId: `nation_player_${i}`,
        imagePath: personality.imagePath,
        activeEffects: [
          {
            id: `eff_voluntary_enlistment_player_${i + 1}`,
            sourcePlayerId: `player_${i + 1}`,
            targetPlayerIds: [`player_${i + 1}`],
            type: 'troop_income',
            scope: 'all_owned' as const,
            targeting: 'self' as const,
            magnitude: 2,
            turnsRemaining: null,
            uses: null,
            enabled: true,
            suspendable: true,
            title: 'Voluntary Enlistment',
            icon: '⚔️',
            description: 'Citizens voluntarily enlist each turn, providing passive troop income to your capital.',
          },
          {
            id: `eff_civic_levy_player_${i + 1}`,
            sourcePlayerId: `player_${i + 1}`,
            targetPlayerIds: [`player_${i + 1}`],
            type: 'budget_income',
            scope: 'all_owned' as const,
            targeting: 'self' as const,
            magnitude: 10,
            turnsRemaining: null,
            uses: null,
            enabled: true,
            suspendable: true,
            title: 'Civic Levy',
            icon: '💰',
            description: 'Citizens pay taxes each turn, providing passive budget income.',
          },
        ] as ActiveEffect[],
        capitalTileKey: coordKey(spawnResults[i].spawnCoord),
        budget: 100,
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
          nationId: `nation_player_${i}`,
          loyalty: SPAWN_LOYALTY,
          loyaltyTarget: SPAWN_LOYALTY,
          suppression: 0,
          defense: 0,
          activeTroops: key === spawnKey ? DEFAULT_CONFIG.mobilization.spawnTroops : 0,
        loyaltyLog: [],
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
      playerNationsRecord[id] = { id, name: i === 0 ? '' : generateName(rand), isBarbarian: false, imagePath: null };
    }

    // Step 7: Dispatch to store
    setTiles(tileRecord);
    setPlayers(players);
    useUIStore.getState().setViewingPlayerId(players[0].id);
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
  const allPlayers = useGameStore.getState().players;
  let playerIndex = 0;
  for (const player of allPlayers) {
    if (player.isHuman) continue;

    const freshPlayer = useGameStore.getState().players.find(p => p.id === player.id)!;
    const { tribunes } = useGameStore.getState();
    const councilTribunes = tribunes.filter(t => freshPlayer.tribuneIds.includes(t.id));
    const rand = mulberry32(Date.now() + playerIndex * 77777);

    const cards = drawPolicyCards(policiesData as Policy[], freshPlayer, councilTribunes, 3, rand);

    for (const card of cards) {
      const currentPlayer = useGameStore.getState().players.find(p => p.id === player.id)!;
      const choiceIndex = chooseAIPolicyOption(card, currentPlayer);
      console.log(`[DEBUG] ${currentPlayer.name} — ${choiceIndex === 0 ? 'Approve' : 'Decline'} "${card.title}"`);

      const { finalChoiceIndex, vetoingTribuneId } = resolvePolicyVeto(
        card, choiceIndex, currentPlayer, councilTribunes, currentPlayer.governmentType, DEFAULT_CONFIG.policy, rand,
      );

      if (vetoingTribuneId !== null) {
        const vetoingTribune = useGameStore.getState().tribunes.find(t => t.id === vetoingTribuneId);
        const tribuneName = vetoingTribune?.name ?? vetoingTribuneId;
        console.log(`[DEBUG] ${currentPlayer.name} — ${tribuneName} vetoes "${card.title}" → ${finalChoiceIndex === 0 ? 'Approve' : 'Decline'}`);
      }

      const sentimentShifts = computeSentimentShifts(card, choiceIndex, currentPlayer, councilTribunes, DEFAULT_CONFIG.policy);
      const updatedSentiment = { ...currentPlayer.tribuneSentiment, ...sentimentShifts };
      useGameStore.getState().updatePlayer(player.id, { tribuneSentiment: updatedSentiment });

      const { updatedPlayer, updatedTiles } = applyPolicyChoice(
        card, finalChoiceIndex, currentPlayer, useGameStore.getState().tiles, DEFAULT_CONFIG.policy,
      );
      useGameStore.getState().setTiles(updatedTiles);
      useGameStore.getState().updatePlayer(player.id, {
        alignmentVector: updatedPlayer.alignmentVector,
        activeEffects: updatedPlayer.activeEffects,
      });
    }

    useGameStore.getState().markPolicySubmitted(player.id);
    playerIndex++;
  }
}

export function startPolicyPhase(): void {
  const currentTiles = useGameStore.getState().tiles;
  const clearedTiles: Record<string, Tile> = { ...currentTiles };
  for (const key of Object.keys(clearedTiles)) {
    const t = clearedTiles[key];
    if (t.state === 'owned') {
      clearedTiles[key] = { ...(t as OwnedTile), loyaltyLog: [] };
    }
  }
  useGameStore.getState().setTiles(clearedTiles);

  const { players, tribunes } = useGameStore.getState();
  const aiPlayersWithoutTribunes = players.filter(p => !p.isHuman && p.tribuneIds.length === 0);
  if (aiPlayersWithoutTribunes.length > 0) initAIRoundtable();

  const { setActivePolicyCards, setCurrentPolicyCardIndex } = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const humanPlayer = players.find((p) => p.id === viewingPlayerId);
  if (humanPlayer) {
    const councilTribunes = tribunes.filter((t) => humanPlayer.tribuneIds.includes(t.id));
    const rand = mulberry32(Date.now());
    const cards = drawPolicyCards(policiesData as Policy[], humanPlayer, councilTribunes, 3, rand);
    setActivePolicyCards(cards);
    setCurrentPolicyCardIndex(0);
  }
}

export function startSimulation(): void {
  useUIStore.getState().setSimulationMode(true);
  const { players } = useGameStore.getState();
  for (const player of players) {
    useGameStore.getState().updatePlayer(player.id, { isHuman: false });
  }
  const { phase } = useGameStore.getState();
  if (phase === 'roundtable') {
    for (const player of useGameStore.getState().players) {
      if (player.governmentType === 'none') {
        useGameStore.getState().updatePlayer(player.id, {
          governmentType: deriveGovernmentType(player.alignmentVector),
        });
      }
    }
    initAIRoundtable();
    useGameStore.getState().setPhase('policy');
    useGameStore.getState().setPendingRoundtable(null);
    startPolicyPhase();
  }
  console.log('[sim] Simulation started — all players set to AI.');
}

export function stopSimulation(): void {
  useUIStore.getState().setSimulationMode(false);
  console.log('[sim] Simulation stopped.');
}

export function advanceSimStep(): void {
  if (simStepInProgress) return;
  simStepInProgress = true;
  const { phase } = useGameStore.getState();
  console.log(`[sim] Step — phase: ${phase}`);
  if (phase === 'roundtable') {
    initAIRoundtable();
    useGameStore.getState().setPhase('policy');
    useGameStore.getState().setPendingRoundtable(null);
    startPolicyPhase();
  } else if (phase === 'policy') {
    processAITurns();
    finishPolicyPhase();
  } else if (phase === 'calibration') {
    resolveTurn();
    useGameStore.getState().setPhase('mobilization');
    startMobilizationPhase();
  } else if (phase === 'mobilization') {
    endMobilizationPhase();
  }
  simStepInProgress = false;
}

export function submitPolicyChoice(choiceIndex: number): void {
  const { activePolicyCards, currentPolicyCardIndex, players, tribunes } = useGameStore.getState();
  const policy = activePolicyCards[currentPolicyCardIndex];
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const humanPlayer = players.find((p) => p.id === viewingPlayerId)!;
const councilTribunes = tribunes.filter((t) => humanPlayer.tribuneIds.includes(t.id));
  const rand = mulberry32(Date.now());

  // Resolve veto first, using pre-update sentiment (humanPlayer read before any store writes)
  const { finalChoiceIndex, vetoingTribuneId } = resolvePolicyVeto(
    policy, choiceIndex, humanPlayer, councilTribunes, humanPlayer.governmentType, DEFAULT_CONFIG.policy, rand,
  );

  console.log(`[policy] ${humanPlayer.name} — ${choiceIndex === 0 ? 'Approve' : 'Decline'} "${policy.title}"`);
  if (vetoingTribuneId !== null) {
    const vetoingTribune = councilTribunes.find(t => t.id === vetoingTribuneId);
    console.log(`[policy] ${humanPlayer.name} — ${vetoingTribune?.name ?? vetoingTribuneId} vetoes "${policy.title}" → ${finalChoiceIndex === 0 ? 'Approve' : 'Decline'}`);
  }

  // Compute and commit sentiment shifts using the player's original choice
  const sentimentShifts = computeSentimentShifts(policy, choiceIndex, humanPlayer, councilTribunes, DEFAULT_CONFIG.policy);
  const updatedTribuneSentiment = { ...humanPlayer.tribuneSentiment, ...sentimentShifts };
  useGameStore.getState().updatePlayer(humanPlayer.id, { tribuneSentiment: updatedTribuneSentiment });

  // Apply loyalty and alignment effects using the final (post-veto) choice
  const tiles = useGameStore.getState().tiles;
  const freshPlayer = useGameStore.getState().players.find((p) => p.id === humanPlayer.id)!;
  const { updatedPlayer: appliedPlayer, updatedTiles } = applyPolicyChoice(
    policy, finalChoiceIndex, freshPlayer, tiles, DEFAULT_CONFIG.policy,
  );

  const policyLabel = 'Policy: ' + policy.title;
  const tilesWithLog: Record<string, Tile> = { ...updatedTiles };
  for (const [key, updatedTile] of Object.entries(updatedTiles)) {
    if (updatedTile.state !== 'owned') continue;
    const previousTile = tiles[key] as OwnedTile;
    const delta = (updatedTile as OwnedTile).loyalty - previousTile.loyalty;
    if (delta === 0) continue;
    tilesWithLog[key] = {
      ...(updatedTile as OwnedTile),
      loyaltyLog: [...(updatedTile as OwnedTile).loyaltyLog, { label: policyLabel, delta } as LoyaltyLogEntry],
    };
  }
  useGameStore.getState().setTiles(tilesWithLog);
  useGameStore.getState().updatePlayer(humanPlayer.id, {
    alignmentVector: appliedPlayer.alignmentVector,
    activeEffects: appliedPlayer.activeEffects,
  });

  // Advance card or surface veto screen
  if (vetoingTribuneId !== null) {
    useUIStore.getState().setVetoResult({ policyId: policy.id, tribuneId: vetoingTribuneId, originalChoiceIndex: choiceIndex, finalChoiceIndex });
  } else {
    const nextIndex = currentPolicyCardIndex + 1;
    if (nextIndex < activePolicyCards.length) {
      useGameStore.getState().setCurrentPolicyCardIndex(nextIndex);
    } else {
      processAITurns();
      finishPolicyPhase();
    }
  }
}

export function finishPolicyPhase(): void {
  useGameStore.getState().setPhase('calibration');
  resolveTurn();
  // Only advance to mobilization if a roundtable hasn't been set externally.
  if (useGameStore.getState().phase !== 'roundtable') {
    useGameStore.getState().setPhase('mobilization');
  }
}

export function startMobilizationPhase(): void {
  useGameStore.getState().setActionsRemaining(DEFAULT_CONFIG.mobilization.startingAP);
  useGameStore.getState().clearRelocations();
}

export function getAnnexableTileKeys(): Set<string> {
  const { tiles, players, config, spentTroopsByTile } = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const human = players.find((p) => p.id === viewingPlayerId);
  if (!human) return new Set();

  const visited = new Set<string>();
  const result = new Set<string>();

  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.state !== 'owned' || (tile as OwnedTile).ownerId !== human.id) continue;
    if (visited.has(key)) continue;

    const region = getConnectedOwnedRegion(tiles, key, human.id);
    for (const k of region) visited.add(k);

    const hasAvailableTroops = [...region].some(
      (k) => (tiles[k] as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0) > 0,
    );
    if (!hasAvailableTroops) continue;

    for (const regionKey of region) {
      for (const neighborCoord of hexNeighbors(tiles[regionKey].coord)) {
        if (!isInGrid(neighborCoord, config.mapCols, config.mapRows)) continue;
        const neighborKey = coordKey(neighborCoord);
        if (tiles[neighborKey]?.state === 'unclaimed') result.add(neighborKey);
      }
    }
  }

  return result;
}

export function getInvadableTileKeysForPlayer(): Set<string> {
  const { tiles, players, config } = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const human = players.find((p) => p.id === viewingPlayerId);
  if (!human) return new Set();
  return getInvadableTileKeys(tiles, human.id, config.mapCols, config.mapRows);
}

export function performInvade(targetKey: string, troopSources: Record<string, number>): void {
  const state = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const human = state.players.find((p) => p.id === viewingPlayerId)!;

  const validNeighborKeys = new Set(hexNeighbors(parseCoordKey(targetKey)).map(coordKey));
  for (const sourceKey of Object.keys(troopSources)) {
    if (!validNeighborKeys.has(sourceKey)) {
      throw new Error(`performInvade: source tile ${sourceKey} is not adjacent to target`);
    }
  }

  const tileName = (state.tiles[targetKey] as BarbarianTile).name;

  const { newTiles, result } = invadeTile(
    state.tiles, targetKey, human.id, human.nationId!, troopSources,
    DEFAULT_CONFIG.combat.lanchesterExponent, DEFAULT_CONFIG.combat.defenderBonus, () => Math.random(),
  );

  useGameStore.getState().setTiles(newTiles);

  for (const [sourceKey, count] of Object.entries(troopSources)) {
    useGameStore.getState().recordTroopRelocation({
      fromKey: sourceKey,
      toKey: targetKey,
      count,
      ownerId: human.id,
      actionType: 'military',
    });
  }

  useGameStore.getState().spendAction(DEFAULT_CONFIG.mobilization.invadeAPCost);

  useGameStore.getState().addNotification(
    result.attackerWon
      ? {
          id: `notif_invade_win_${targetKey}_${Date.now()}`,
          text: `⚔️ ${tileName} conquered! ${result.attackerSurvivors} troops remain.`,
          severity: 'info',
          playerId: human.id,
        }
      : {
          id: `notif_invade_loss_${targetKey}_${Date.now()}`,
          text: `⚔️ Attack on ${tileName} failed. All troops lost.`,
          severity: 'warning',
          playerId: human.id,
        },
  );
}

export function performAnnex(targetKey: string, troopSources: Record<string, number>): void {
  const state = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId;
  const human = state.players.find((p) => p.id === viewingPlayerId)!;

  const ownedNeighborKey = hexNeighbors(parseCoordKey(targetKey))
    .map((c) => coordKey(c))
    .find((k) => state.tiles[k]?.state === 'owned' && (state.tiles[k] as OwnedTile).ownerId === human.id);
  if (ownedNeighborKey) {
    const reachable = getConnectedOwnedRegion(state.tiles, ownedNeighborKey, human.id);
    for (const sourceKey of Object.keys(troopSources)) {
      if (!reachable.has(sourceKey)) {
        throw new Error('performAnnex: troop source is not connected to annex target');
      }
    }
  }

  const updatedTiles = annexTile(state.tiles, targetKey, human.id, human.nationId!, troopSources);
  useGameStore.getState().setTiles(updatedTiles);
  const totalMoved = Object.values(troopSources).reduce((a, b) => a + b, 0);
  useGameStore.getState().recordTroopRelocation({
    fromKey: targetKey,
    toKey: targetKey,
    count: totalMoved,
    ownerId: human.id,
    actionType: 'military',
  });
  useGameStore.getState().spendAction(DEFAULT_CONFIG.mobilization.annexAPCost);
}

export function performFortify(targetKey: string, troopSources: Record<string, number>): void {
  const state = useGameStore.getState();
  const viewingPlayerId = useUIStore.getState().viewingPlayerId!;
  const human = state.players.find((p) => p.id === viewingPlayerId)!;

  const ownedNeighborKey = hexNeighbors(parseCoordKey(targetKey))
    .map((c) => coordKey(c))
    .find((k) => state.tiles[k]?.state === 'owned' && (state.tiles[k] as OwnedTile).ownerId === human.id);
  if (ownedNeighborKey) {
    const reachable = getConnectedOwnedRegion(state.tiles, ownedNeighborKey, human.id);
    for (const sourceKey of Object.keys(troopSources)) {
      if (!reachable.has(sourceKey)) {
        throw new Error('performFortify: troop source is not connected to target');
      }
    }
  }

  const updatedTiles = fortifyTile(state.tiles, targetKey, human.id, troopSources);
  useGameStore.getState().setTiles(updatedTiles);
  for (const [sourceKey, count] of Object.entries(troopSources)) {
    useGameStore.getState().recordTroopRelocation({
      fromKey: sourceKey,
      toKey: targetKey,
      count,
      ownerId: human.id,
      actionType: 'passive',
    });
  }
  useGameStore.getState().spendAction(DEFAULT_CONFIG.mobilization.fortifyAPCost);
}

function getConnectedOwnedRegion(
  tiles: Record<string, Tile>,
  startKey: string,
  playerId: string,
): Set<string> {
  const startTile = tiles[startKey];
  if (!startTile || startTile.state !== 'owned' || (startTile as OwnedTile).ownerId !== playerId) {
    return new Set();
  }
  const visited = new Set<string>();
  const queue: string[] = [startKey];
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const neighborCoord of hexNeighbors(parseCoordKey(key))) {
      const neighborKey = coordKey(neighborCoord);
      const neighbor = tiles[neighborKey];
      if (neighbor && neighbor.state === 'owned' && (neighbor as OwnedTile).ownerId === playerId && !visited.has(neighborKey)) {
        queue.push(neighborKey);
      }
    }
  }
  return visited;
}

export function performAIAnnex(): void {
  const { players, config } = useGameStore.getState();
  const maxAttempts = Math.floor(DEFAULT_CONFIG.mobilization.startingAP / DEFAULT_CONFIG.mobilization.annexAPCost);
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    if (player.isHuman || !player.nationId) continue;
    const rand = mulberry32(Date.now() + i * 99991);
    let currentTiles = useGameStore.getState().tiles;
    const localSpent: Record<string, number> = {};
    let apRemaining = DEFAULT_CONFIG.mobilization.startingAP;
    const annexable = Array.from(getAnnexableTiles(currentTiles, player.id, config.mapCols, config.mapRows));

    for (let attempt = 0; attempt < maxAttempts && annexable.length > 0; attempt++) {
      const totalAvailable = getTotalAvailableTroops(currentTiles, player.id, localSpent);
      if (totalAvailable < DEFAULT_CONFIG.mobilization.annexTroopMin) break;
      if (apRemaining < DEFAULT_CONFIG.mobilization.annexAPCost) break;

      const idx = Math.floor(rand() * annexable.length);
      const targetKey = annexable.splice(idx, 1)[0];

      const ownedNeighborKey = hexNeighbors(parseCoordKey(targetKey))
        .map((c) => coordKey(c))
        .find((k) => currentTiles[k]?.state === 'owned' && (currentTiles[k] as OwnedTile).ownerId === player.id);
      if (!ownedNeighborKey) continue;
      const reachableRegion = getConnectedOwnedRegion(currentTiles, ownedNeighborKey, player.id);

      const sources: Record<string, number> = {};
      let needed = DEFAULT_CONFIG.mobilization.annexTroopMin;
      for (const [key, tile] of Object.entries(currentTiles)) {
        if (needed <= 0) break;
        if (!reachableRegion.has(key)) continue;
        if (tile.state !== 'owned' || (tile as OwnedTile).ownerId !== player.id) continue;
        const available = (tile as OwnedTile).activeTroops - (localSpent[key] ?? 0);
        if (available <= 0) continue;
        const take = Math.min(available, needed);
        sources[key] = take;
        needed -= take;
      }
      if (needed > 0) break;

      currentTiles = annexTile(currentTiles, targetKey, player.id, player.nationId, sources);
      console.log(`[DEBUG] ${player.name} annexes ${targetKey}`);
      for (const [fromKey, count] of Object.entries(sources)) {
        localSpent[fromKey] = (localSpent[fromKey] ?? 0) + count;
      }
      apRemaining -= DEFAULT_CONFIG.mobilization.annexAPCost;
    }
    useGameStore.getState().setTiles(currentTiles);
  }
}

export function endMobilizationPhase(): void {
  performAIAnnex();
  useGameStore.getState().advanceTurn();
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

    const { target: newTarget } = calculateLoyaltyTarget(
      ownerPlayer.alignmentVector,
      owned.cultureVector,
      enemyNeighborAlignments,
      DEFAULT_CONFIG.loyalty,
    );

    const stepped = stepLoyalty(owned.loyalty, newTarget, DEFAULT_CONFIG.loyalty.momentumRate);
    const driftDelta = stepped - owned.loyalty;

    const warningThreshold = DEFAULT_CONFIG.loyalty.secessionWarningThreshold;
    const breakawayThreshold = DEFAULT_CONFIG.loyalty.breakawayThreshold;
    const wasAboveWarning = owned.loyalty > warningThreshold;
    const isBelowWarning = stepped <= warningThreshold;
    const notYetBreaking = stepped > breakawayThreshold;

    if (owned.ownerId === useUIStore.getState().viewingPlayerId && wasAboveWarning && isBelowWarning && notYetBreaking) {
      useGameStore.getState().addNotification({
        id: `notif_secession_${key}_${Date.now()}`,
        text: `⚠ ${owned.name} is dangerously close to breaking away.`,
        severity: 'warning',
        playerId: owned.ownerId,
      });
    }

    const turnLog: LoyaltyLogEntry[] = [
      ...owned.loyaltyLog.filter(e => e.label.startsWith('Policy:')),
      { label: 'Drift', delta: driftDelta },
    ];

    updatedTiles[key] = { ...owned, loyalty: stepped, loyaltyTarget: newTarget, loyaltyLog: turnLog };
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

      useGameStore.getState().addNotification({
        id: `notif_breakaway_${key}_${Date.now()}`,
        text: `BREAKING: ${(tile as OwnedTile).name} breaks away from ${playerMap.get((tile as OwnedTile).ownerId)?.name ?? 'its ruler'}!`,
        severity: 'breaking',
        playerId: 'global',
      });

      updatedTiles[key] = {
        coord: tile.coord,
        state: 'barbarian',
        terrainType: (tile as OwnedTile).terrainType,
        cultureVector: tile.cultureVector,
        name: tile.name,
        nationId,
        activeTroops: Math.max(5, (tile as OwnedTile).activeTroops),
        previousOwner: (tile as OwnedTile).ownerId,
      } as BarbarianTile;
    }
  }

  // Step 3.5 — Effect income tick
  for (const player of playerMap.values()) {
    let loyaltySum = 0;
    let tileCount = 0;
    for (const tile of Object.values(updatedTiles)) {
      if (tile.state !== 'owned') continue;
      const owned = tile as OwnedTile;
      if (owned.ownerId !== player.id) continue;
      loyaltySum += owned.loyalty;
      tileCount++;
    }
    const avgLoyalty = tileCount === 0 ? 0 : loyaltySum / tileCount;
    console.log(`[effects] ${player.id} avgLoyalty=${avgLoyalty}, thresholds: troop=${DEFAULT_CONFIG.mobilization.troopIncomeSuspendThreshold} budget=${DEFAULT_CONFIG.mobilization.budgetIncomeSuspendThreshold}`);
    
    const updatedEffects = player.activeEffects.map(e => {
      if (e.type === 'troop_income' && e.suspendable) return { ...e, enabled: avgLoyalty >= DEFAULT_CONFIG.mobilization.troopIncomeSuspendThreshold };
      if (e.type === 'budget_income' && e.suspendable) return { ...e, enabled: avgLoyalty >= DEFAULT_CONFIG.mobilization.budgetIncomeSuspendThreshold };
      return e;
    });

    for (let i = 0; i < updatedEffects.length; i++) {
      const prev = player.activeEffects[i];
      const next = updatedEffects[i];
      if (!prev || !next) continue;
      if (prev.enabled && !next.enabled) {
        useGameStore.getState().addNotification({
          id: `notif_suspend_${next.id}_${Date.now()}`,
          text: `⚠ ${next.title} has been suspended — your people's loyalty is too low.`,
          severity: 'warning',
          playerId: player.id,
        });
      } else if (!prev.enabled && next.enabled) {
        useGameStore.getState().addNotification({
          id: `notif_restore_${next.id}_${Date.now()}`,
          text: `✓ ${next.title} has been restored.`,
          severity: 'info',
          playerId: player.id,
        });
      }
    }

    let updatedBudget = player.budget;
    let updatedCapitalTileKey = player.capitalTileKey;

    for (const effect of updatedEffects) {
      if (!effect.enabled) continue;

      if (effect.type === 'troop_income') {
        let depositKey: string | null = null;

        if (updatedCapitalTileKey !== null) {
          const capitalTile = updatedTiles[updatedCapitalTileKey];
          if (capitalTile?.state === 'owned' && (capitalTile as OwnedTile).ownerId === player.id) {
            depositKey = updatedCapitalTileKey;
          }
        }

        if (depositKey === null) {
          const capitalCoord = updatedCapitalTileKey !== null ? parseCoordKey(updatedCapitalTileKey) : null;
          let nearestDist = Infinity;
          for (const [key, tile] of Object.entries(updatedTiles)) {
            if (tile.state !== 'owned' || (tile as OwnedTile).ownerId !== player.id) continue;
            const dist = capitalCoord !== null ? hexDistance(capitalCoord, parseCoordKey(key)) : 0;
            if (dist < nearestDist) {
              nearestDist = dist;
              depositKey = key;
            }
          }
          if (depositKey !== null) updatedCapitalTileKey = depositKey;
        }

        if (depositKey !== null) {
          const depositTile = updatedTiles[depositKey] as OwnedTile;
          updatedTiles[depositKey] = { ...depositTile, activeTroops: depositTile.activeTroops + effect.magnitude };
        }
      } else if (effect.type === 'budget_income') {
        updatedBudget += effect.magnitude;
      }
    }

    useGameStore.getState().updatePlayer(player.id, {
      activeEffects: updatedEffects,
      budget: updatedBudget,
      capitalTileKey: updatedCapitalTileKey,
    });
  }

  // Step 4 — Write to store
  useGameStore.getState().setTiles(updatedTiles);

  // Step 5 — Tick active effects
  const freshPlayers = useGameStore.getState().players;
  for (const player of freshPlayers) {
    if (player.activeEffects.length === 0) continue;
    const hasNonPermanent = player.activeEffects.some((e) => e.turnsRemaining !== null);
    if (!hasNonPermanent) continue;
    const ticked = player.activeEffects
      .map((e) => e.turnsRemaining === null ? e : { ...e, turnsRemaining: e.turnsRemaining - 1 })
      .filter((e) => e.turnsRemaining === null || e.turnsRemaining > 0);
    useGameStore.getState().updatePlayer(player.id, { activeEffects: ticked });
  }
}

export function getAvailableActionsForTile(
  tileKey: string,
  tiles: Record<string, Tile>,
  viewingPlayerId: string,
  actionsRemaining: number,
  spentTroopsByTile: Record<string, number>,
  relocatedTroops: RelocationEntry[],
  mapCols: number,
  mapRows: number,
): AvailableAction[] {
  const tile = tiles[tileKey];
  if (!tile || tile.state === 'water') return [];

  const actions: AvailableAction[] = [];

  if (tile.state === 'unclaimed') {
    const annexable = getAnnexableTiles(tiles, viewingPlayerId, mapCols, mapRows);
    if (!annexable.has(tileKey)) return [];

    let totalAvailableTroops = 0;
    for (const [k, t] of Object.entries(tiles)) {
      if (t.state !== 'owned' || (t as OwnedTile).ownerId !== viewingPlayerId) continue;
      totalAvailableTroops += Math.max(0, (t as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0));
    }

    if (actionsRemaining < DEFAULT_CONFIG.mobilization.annexAPCost) {
      actions.push({ type: 'annex', canAfford: false, blockedReason: 'no_ap' });
    } else if (totalAvailableTroops < DEFAULT_CONFIG.mobilization.annexTroopMin) {
      actions.push({ type: 'annex', canAfford: false, blockedReason: 'no_troops' });
    } else {
      actions.push({ type: 'annex', canAfford: true });
    }
    return actions;
  }

  if (tile.state === 'barbarian') {
    const invadable = getInvadableTileKeys(tiles, viewingPlayerId, mapCols, mapRows);
    if (!invadable.has(tileKey)) return [];

    const receivedPassiveByTile = getReceivedPassiveByTile(relocatedTroops);

    let adjacentAvailableTroops = 0;
    for (const neighborCoord of hexNeighbors(parseCoordKey(tileKey))) {
      const k = coordKey(neighborCoord);
      const neighbor = tiles[k];
      if (!neighbor || neighbor.state !== 'owned' || (neighbor as OwnedTile).ownerId !== viewingPlayerId) continue;
      adjacentAvailableTroops += Math.max(
        0,
        (neighbor as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0) - (receivedPassiveByTile[k] ?? 0),
      );
    }

    if (actionsRemaining < DEFAULT_CONFIG.mobilization.invadeAPCost) {
      actions.push({ type: 'invade', canAfford: false, blockedReason: 'no_ap' });
    } else if (adjacentAvailableTroops < DEFAULT_CONFIG.mobilization.invadeTroopMin) {
      actions.push({ type: 'invade', canAfford: false, blockedReason: 'no_adjacent_troops' });
    } else {
      actions.push({ type: 'invade', canAfford: true });
    }
    return actions;
  }

  if (tile.state === 'owned' && (tile as OwnedTile).ownerId === viewingPlayerId) {
    const receivedPassiveByTile = getReceivedPassiveByTile(relocatedTroops);

    let connectedAvailableTroops = 0;
    for (const [k, t] of Object.entries(tiles)) {
      if (k === tileKey) continue;
      if (t.state !== 'owned' || (t as OwnedTile).ownerId !== viewingPlayerId) continue;
      connectedAvailableTroops += Math.max(
        0,
        (t as OwnedTile).activeTroops - (spentTroopsByTile[k] ?? 0) - (receivedPassiveByTile[k] ?? 0),
      );
    }

    if (actionsRemaining < DEFAULT_CONFIG.mobilization.fortifyAPCost) {
      actions.push({ type: 'fortify', canAfford: false, blockedReason: 'no_ap' });
    } else if (connectedAvailableTroops === 0) {
      actions.push({ type: 'fortify', canAfford: false, blockedReason: 'no_connected_troops' });
    } else {
      actions.push({ type: 'fortify', canAfford: true });
    }
    return actions;
  }

  return [];
}
