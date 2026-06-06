import type { Policy, Player, Tribune, Tile, OwnedTile, TraitVector, GovernmentType, ActiveEffect } from '../types';
import type { TuningConfig } from '../config';
import { coordKey } from './hex';

//alt tribune env: itjyfsfa

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTribuneBias(tribune: Tribune, policy: Policy): number {
  const override = policy.tribuneReactions?.[tribune.id]?.biasOverride;
  if (override !== undefined) return override;
  let dot = 0;
  let shiftMagnitude = 0;
  for (const [trait, shift] of Object.entries(policy.alignmentShift) as Array<[keyof TraitVector, number]>) {
    dot += (tribune.traitWeights[trait as keyof TraitVector] ?? 0) * shift;
    shiftMagnitude += Math.abs(shift);
  }
  if (shiftMagnitude === 0) return 0;
  return Math.max(-1, Math.min(1, dot / shiftMagnitude));
}

export function drawPolicyCards(
  policies: Policy[],
  _player: Player,
  tribunes: Tribune[],
  count: number,
  rand: () => number
): Policy[] {
  if (policies.length <= count) return [...policies];

  const pool: Array<{ policy: Policy; weight: number }> = policies.map(policy => {
    let weight = policy.weight ?? 1.0;
    for (const tribune of tribunes) {
      if (Math.abs(getTribuneBias(tribune, policy)) > 0.5) {
        weight *= 1.5;
      }
    }
    return { policy, weight };
  });

  const result: Policy[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * totalWeight;

    let selectedIndex = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll <= 0) {
        selectedIndex = j;
        break;
      }
    }

    result.push(pool[selectedIndex].policy);
    pool.splice(selectedIndex, 1);
  }

  return result;
}

export function computeSentimentShifts(
  policy: Policy,
  choiceIndex: number,
  player: Player,
  councilTribunes: Tribune[],
  config: TuningConfig['policy']
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const tribune of councilTribunes) {
    const currentSentiment = player.tribuneSentiment[tribune.id] ?? 0;
    const bias = getTribuneBias(tribune, policy);

    if (Math.abs(bias) < 0.001) {
      result[tribune.id] = currentSentiment;
      continue;
    }

    const aligned = (bias > 0 && choiceIndex === 0) || (bias < 0 && choiceIndex === 1);
    const alignmentFactor = aligned ? 1 : -1;
    const shift = alignmentFactor * Math.abs(bias) * config.tribuneSentimentShift;
    const newSentiment = clamp(currentSentiment + shift, -1, 1);

    console.log(`[policy] ${player.name} — ${tribune.name} sentiment: ${currentSentiment.toFixed(3)} → ${newSentiment.toFixed(3)} (shift: ${shift.toFixed(3)})`);

    result[tribune.id] = newSentiment;
  }

  return result;
}

export function computeVetoProbability(
  tribune: Tribune,
  policy: Policy,
  player: Player,
  governmentType: GovernmentType,
  config: TuningConfig['policy']
): number {
  const ceiling =
    governmentType === 'democracy' ? config.vetoCeilingDemocracy :
    governmentType === 'hybrid'    ? config.vetoCeilingHybrid :
    governmentType === 'autocracy' ? config.vetoCeilingAutocracy :
    0.00;
  const bias = getTribuneBias(tribune, policy);
  const base_prob = (ceiling * 0.75) * Math.abs(bias);
  const currentSentiment = player.tribuneSentiment[tribune.id] ?? 0;
  const sentiment_discount = (ceiling / 4) * currentSentiment;
  const veto_prob = Math.max(0, Math.min(ceiling, base_prob - sentiment_discount));

  return veto_prob;
}

export function resolvePolicyVeto(
  policy: Policy,
  choiceIndex: number,
  player: Player,
  councilTribunes: Tribune[],
  governmentType: GovernmentType,
  config: TuningConfig['policy'],
  rand: () => number
): { finalChoiceIndex: number; vetoingTribuneId: string | null } {
  const eligibleTribunes = councilTribunes.filter(tribune => {
    const bias = getTribuneBias(tribune, policy);
    if (Math.abs(bias) < 0.001) return false;
    return (bias > 0 && choiceIndex === 1) || (bias < 0 && choiceIndex === 0);
  });

  if (eligibleTribunes.length === 0) {
    return { finalChoiceIndex: choiceIndex, vetoingTribuneId: null };
  }

  const tribune = eligibleTribunes.reduce((best, current) =>
    Math.abs(getTribuneBias(current, policy)) > Math.abs(getTribuneBias(best, policy)) ? current : best
  );

  const veto_prob = computeVetoProbability(tribune, policy, player, governmentType, config);
  const roll = rand();

  console.log(`[policy] ${player.name} — Veto check — ${tribune.name}: prob=${veto_prob.toFixed(3)}, roll=${roll.toFixed(3)}`);

  if (roll < veto_prob) {
    console.log(`[policy] ${player.name} — VETOED by ${tribune.name}`);
    return { finalChoiceIndex: choiceIndex === 0 ? 1 : 0, vetoingTribuneId: tribune.id };
  }

  console.log(`[policy] ${player.name} — Veto failed for ${tribune.name}`);
  return { finalChoiceIndex: choiceIndex, vetoingTribuneId: null };
}

export function applyPolicyChoice(
  policy: Policy,
  finalChoiceIndex: number, // 0 = approve, 1 = decline
  player: Player,
  tiles: Record<string, Tile>,
  config: TuningConfig['policy']
): { updatedPlayer: Player; updatedTiles: Record<string, Tile> } {
  const isDecline = finalChoiceIndex === 1;
  const declineMod = policy.declineModifier ?? 1.0;

  // ── Alignment shift ──────────────────────────────────────────────────────
  const newAlignmentVector: TraitVector = { ...player.alignmentVector };
  const appliedShifts: Partial<TraitVector> = {};
  for (const [trait, shift] of Object.entries(policy.alignmentShift) as Array<[keyof TraitVector, number]>) {
    const appliedShift = isDecline ? -shift * declineMod : shift * config.alignmentDriftScale;
    appliedShifts[trait as keyof TraitVector] = appliedShift;
    newAlignmentVector[trait] = clamp(newAlignmentVector[trait] + appliedShift, -1, 1);
  }
  let updatedPlayer: Player = { ...player, alignmentVector: newAlignmentVector };

  // ── Loyalty effect ───────────────────────────────────────────────────────
  const updatedTiles: Record<string, Tile> = {};
  for (const tile of Object.values(tiles)) {
    const key = coordKey(tile.coord);
    if (tile.state !== 'owned') {
      updatedTiles[key] = tile;
      continue;
    }
    const ownedTile = tile as OwnedTile;
    if (ownedTile.ownerId !== player.id) {
      updatedTiles[key] = ownedTile;
      continue;
    }
    let delta = 0;
    for (const [trait, appliedShift] of Object.entries(appliedShifts) as Array<[keyof TraitVector, number]>) {
      delta += appliedShift * ownedTile.cultureVector[trait as keyof TraitVector];
    }
    delta *= config.loyaltyModifierScale;
    updatedTiles[key] = {
      ...ownedTile,
      loyalty: clamp(ownedTile.loyalty + clamp(delta, -1, 1), -1, 1),
    };
  }

  // ── Effect application ───────────────────────────────────────────────────
  const effectTemplate = isDecline ? policy.declineEffect : policy.approveEffect;
  if (effectTemplate) {
    const targetPlayerIds =
      effectTemplate.targeting === 'self'          ? [player.id] :
      effectTemplate.targeting === 'all_opponents' ? [] :
      /* global */                                   [player.id];

    const hydratedEffect: ActiveEffect = {
      ...effectTemplate,
      id: `eff_${policy.id}_${Date.now()}`,
      sourcePlayerId: player.id,
      targetPlayerIds,
      enabled: true,
      suspendable: false,
    };

    updatedPlayer = {
      ...updatedPlayer,
      activeEffects: [...updatedPlayer.activeEffects, hydratedEffect],
    };
  }

  return { updatedPlayer, updatedTiles };
}

export function chooseAIPolicyOption(
  policy: Policy,
  player: Player,
): 0 | 1 {
  const declineMod = policy.declineModifier ?? 1.0;

  let scoreApprove = 0;
  let scoreDecline = 0;

  for (const [trait, shift] of Object.entries(policy.alignmentShift) as Array<[keyof TraitVector, number]>) {
    const current = player.alignmentVector[trait as keyof TraitVector];
    const target = player.traitVector[trait as keyof TraitVector];
    scoreApprove += Math.abs(current - target) - Math.abs(current + shift - target);
    const declineShift = -shift * declineMod;
    scoreDecline += Math.abs(current - target) - Math.abs(current + declineShift - target);
  }

  return scoreApprove >= scoreDecline ? 0 : 1;
}
