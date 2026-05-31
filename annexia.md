# Annexia — Game Design Document
*Working title. Last updated: post-policy-phase build.*

---

## Concept

Annexia is a turn-based, roguelite-flavored political strategy game played on a hexagonal map. Players govern a small territory and compete to meet a win condition — through expansion, suppression, diplomacy, or attrition — while managing the loyalty of a population that has its own values and can turn against you.

The core tension: your people are not yours by default. They have cultures, beliefs, and priorities. Your job is to either align yourself with them or control them well enough that it doesn't matter.

---

## Design Philosophy

- **Roguelite, not roguelike.** No permadeath, but heavy randomness in map generation, policy events, and tile values. Every game feels different. You work with what you're dealt.
- **Menus, not micromanagement.** The interface is clean and sparse. Most gameplay is making choices from menus, not dragging units around a board.
- **Mechanics over aesthetics.** Depth lives in the numbers and systems, not the visuals.
- **Short games.** A session should be completable in one sitting. Win conditions are designed to force resolution within a bounded number of turns.
- **Visible consequence.** Every decision should have a visible effect the player can connect to their choice — tile color shifts, tribune reactions, loyalty changes.

---

## The Map

### Structure
- The map is a hex grid. Default size: 30×30 cells (~900 tiles, roughly half water).
- Each tile is one of four states:
  - **Water** — not claimable, impassable.
  - **Unclaimed** — land with no current ruler. Available for annexation.
  - **Barbarian-controlled** — has a defense value. Can be invaded.
  - **Player-controlled** — owned by a human or AI player.

### Tile Generation
- Land/water placed via Voronoi regions + Simplex noise. Inland lakes removed by flood-fill.
- Landmass centroid is shifted to the grid center after generation.
- Each land tile gets a **culture vector** at generation — five trait weights [0, 1]. Neighboring tiles have similar vectors; divergence increases with distance, producing organic cultural regions.
- Barbarian tiles are clustered via randomized BFS from random seeds. Each contiguous cluster forms one barbarian nation with a generated name.
- Defense on barbarian tiles is randomly assigned (20–60). Does not regenerate.
- All land tiles have a generated name (2–3 syllable fantasy name, seeded PRNG).

---

## Players

### Starting Conditions
- Each player begins with **7 contiguous hexes** centered on a starting point with guaranteed spacing from other players.
- At game start, the **Roundtable** phase fires: player chooses country name, government type, and tribunes.

### Player Attributes
- **Alignment vector** — the player's political/cultural identity. Same trait space as tile culture vectors. Shifts with every policy choice.
- **Confidence rating** — global trust measure. Affects success rate of propaganda and smear actions. Not yet mechanically wired.
- **Action points (AP)** — per-turn budget for mobilization actions. Replenishes each turn.
- **Tribune sentiment** — per-tribune record of how each council member feels about the player, range [-1, 1]. Initialized to 0. Shifts with every policy decision.
- **Active effects** — list of temporary or permanent modifiers affecting the player's territory or actions.

### Government Type
Chosen at the Roundtable. Affects tribune council size and veto probability.

| Type | Tribune slots | Veto ceiling |
|---|---|---|
| Democracy | 4 | 50% |
| Hybrid | 3 | 25% |
| Autocracy | 3 | 0% |

Government type for AI players is derived from their personality trait vector via a weighted scoring formula.

---

## Tribunes

Each player selects a council of tribunes at the Roundtable. Tribunes are defined in `tribunes.json`.

Tribunes are **biased political advisors** — distinct from the impartial advisor in `advisors.json`.

### What Tribunes Do
- **React to policies.** Each tribune has a `policyStances` record keyed by policy ID. Each entry has a `bias` (signed float, -1 to +1) and `flavor` text (always visible on the policy card — no hover required).
- **Veto choices.** If a tribune strongly opposes your choice and conditions are met, they may veto it, flipping the outcome. Only the highest-|bias| eligible tribune rolls per policy.
- **Track your record.** Each tribune has a `sentiment` score (your `tribuneSentiment[tribuneId]`) that shifts based on every policy decision you make. Sentiment affects veto probability — tribunes who like you are more lenient.
- **Influence alignment (planned).** Tribune trait vectors will passively nudge your alignment each turn.
- **Unlock actions (planned).** Some mobilization actions require specific tribunes.

### Veto System
- **Direction**: index 0 = approve (pro-policy), index 1 = reject. Always by convention.
- **Eligibility**: tribune is eligible if their bias opposes the player's choice.
- **Roll**: only the highest |bias| eligible tribune rolls. One roll per policy card.
- **Probability formula**:
  ```
  base_prob = vetoCeiling × |bias|
  sentiment_discount = (vetoCeiling / 2) × ((sentiment + 1) / 2)
  veto_prob = max(0, base_prob - sentiment_discount)
  ```
- **Outcome**: veto flips the final choice. The tile loyalty update uses the flipped outcome. Tribune sentiment still updates based on what the player originally chose — tribunes know your intent.
- **Veto screen**: shows "VETOED", the blocking tribune's name and portrait, their flavor text for the policy.

### Tribune Sentiment
- Range: [-1, 1]. Initialized to 0 at roundtable.
- Shifts after every policy card regardless of which tribune is displayed.
- Formula: `shift = alignment × |bias| × tribuneSentimentShift (0.15)`
  - Alignment = +1 if player's choice matched tribune's bias direction, -1 if opposed.
  - No shift if bias = 0 or no stance entry.
- Sentiment affects veto probability — higher sentiment = more lenient = lower veto chance.

### Tribune Archetypes (current roster)
- Dr. Mara Voss — Environmentalist
- General Rask — Military Hawk
- Director Chen — Technocrat
- Sister Calinda — Populist
- Montgomery Gould — Industrialist

---

## Culture & Loyalty System

### Trait Space
Five traits, shared across tile culture vectors, player alignment vectors, and tribune trait weights. All values [0, 1].

| Trait | High value | Low value |
|---|---|---|
| ecology | Environmental protection | Industrial growth |
| militarism | Expansion, defense | Pacifism |
| religion | Religious identity | Secularism |
| liberty | Personal freedoms | Collective control |
| progress | Openness to change | Tradition |

These are not moral judgments — they describe what a population values.

### Loyalty Calculation
Loyalty is stored in internal units [-10000, +10000]. Display value = internal / 100.

Formula (MAD-based):
```
mad = mean(|ownerAlignment[trait] - tileCulture[trait]|) across 5 traits
base = (1 - mad × 2) × 10000
pressure = max(0, bestEnemySim - ownerSim) × neighborPressureStrength × 10000
target = clamp(base - pressure, -10000, +10000)
```

Loyalty drifts toward target by `momentumRate` fraction of gap per turn (default 0.2).

### Breakaway Events
At end of calibration phase, tiles with loyalty ≤ breakawayThreshold (default -1 internal) become BarbarianTile. They inherit an adjacent barbarian nation's ID or mint a new one.

---

## Turn Structure

Each turn has four phases.

---

### Phase 0: Roundtable *(conditional)*

Fires at game start and whenever triggered by a game event (breakaway clusters, public disapproval, government change, war declaration, etc.).

Player chooses:
- Country name (defaults to spawn tile name)
- Government type (Democracy / Hybrid / Autocracy)
- Tribune council (slots determined by government type)

AI government type is derived at map generation from personality trait vector.

---

### Phase 1: Policy Phase

3 policy cards drawn from `policies.json`, weighted by `policy.weight` with tribune bias boost (×1.5 per matching tribune with |bias| > 0.5).

For each card:
1. Player sees title, description, and tribune reactions (proponent + objector visible, no hover needed).
2. Player chooses approve or reject.
3. Veto check runs (pre-sentiment-shift).
4. Tribune sentiment updates for all council members (based on original choice).
5. Tile loyalty and player alignment update (based on final outcome, post-veto).

**Policy effects can include:**
- Alignment vector shift
- Flat loyalty modifier to tiles matching a trait filter
- Active effects (temporary or permanent modifiers — e.g. action cost increase, defense bonus)

Active effects persist in `Player.activeEffects[]` and tick down each calibration phase.

---

### Phase 2: Calibration Phase

Runs automatically after policy phase. No player input.

1. Recalculate loyalty targets for all owned tiles.
2. Step loyalty toward targets (momentum).
3. Check breakaway conditions — tiles below threshold become barbarian.
4. Tick active effects — decrement turnsRemaining, remove expired.

---

### Phase 3: Mobilization Phase *(Sequential)*

Players act one at a time. Each player has a budget of action points (AP).

**Current actions:**
- **Annex** — claim an adjacent unclaimed tile. Costs 1 AP.

**Planned actions:**
- **Invade** — attack an adjacent barbarian or player-owned tile. Costs AP. Success based on troop strength vs. defense.
- **Suppress** — station troops in a low-loyalty tile to slow breakaway. Costs AP. Builds resentment.
- **Reinforce** — increase a tile's defense value. Costs AP.
- **Move troops** — relocate troops to adjacent owned tile. Costs 1 AP per move.
- **Propaganda campaign** — attempt to raise loyalty. Success rate based on confidence.

AI mobilization is currently a stub.

---

## Active Effects System

Policies can produce effects beyond immediate loyalty/alignment shifts. Effects persist across turns.

```ts
interface ActiveEffect {
  id: string;
  sourcePlayerId: string;
  targetPlayerIds: string[];    // always array; self, opponents, or all
  type: string;                 // e.g. 'action_cost_increase', 'defense_bonus'
  scope: 'all_owned' | 'border_tiles' | 'global' | 'specific_player';
  magnitude: number;
  turnsRemaining: number | null; // null = permanent
  icon: string;                 // emoji for effects bar
  description: string;          // hover text
}
```

Effects live in `Player.activeEffects[]`. Ticked down during calibration. The **effects bar** (floating panel, top-left of map area) displays active effects with icons and hover descriptions.

Cross-player effects (e.g. smear campaigns, nuclear fallout) are dropped into the target player's `activeEffects` array.

---

## Random Events

Defined in `events.json`. Not yet wired to the engine. Planned triggers at turn boundaries.

Examples:
- **Separatist movement** — cluster of tiles gets loyalty penalty for 2 turns.
- **Cultural renaissance** — loyalty bonus to alignment-matched tiles.
- **Economic crisis** — AP replenishment halved this turn for one player.
- **Barbarian surge** — unclaimed border tiles gain temporary defense.
- **Smear campaign** — player-triggered; reduces opponent's confidence.

---

## AI Opponents

AI players participate in all phases. Currently: policy phase is a stub (instantly submitted), mobilization is not implemented.

### Personality
Each AI has a `traitVector` (same space as culture/alignment), `aggression`, and `expansionism` scores. Government type derived from trait vector.

### Difficulty
Difficulty scales decision noise, not values. A pacifist AI on hard is still pacifist — just competent.

| Difficulty | Noise |
|---|---|
| Easy | 0.50 |
| Medium | 0.25 |
| Hard | 0.08 |

### AI Archetypes
- Expansionist, Isolationist, Militarist, Theocrat (current)
- Diplomat, Populist (planned)

---

## Win Conditions

Selected or randomized at game start.

- **Majority** — own > 50% of land tiles.
- **Dominance** — own all tiles (last player standing).
- **Time limit** — most tiles after N turns.
- **Stability** — average loyalty ≥ 75 across all tiles for 3 consecutive turns.

Win condition check not yet implemented.

---

## UI Layout

Five named regions. See architecture.md for full spec.

- **Info bar** — turn, phase, troops, AP
- **Notification bar** — dismissable notifications (left panel)
- **Map area** — hex grid, hover tooltip, tile detail panel, effects bar
- **Action bar** — context-sensitive: roundtable / policy card / calibration / mobilization
- **Settings bar** — lens overlay controls

Hover tooltip: immediate, no delay, tracks cursor.
Tile detail panel: click to open, floats top-right of map area.
Effects bar: floats top-left of map area, shows active effect icons.

---

## Out of Scope (for now)

- Multiplayer over network (Phase 5)
- Advisor overrule / passive alignment nudge (tribune influence)
- Confidence score mechanics
- Portrait images (dicebear placeholders in use)
- Sound
- Mobile layout
- Diplomacy (treaties, non-aggression pacts)
- Economy / resource system beyond AP
- Tech tree / inter-game progression
- 3D or canvas renderer (architecture supports pivot, SVG for now)
