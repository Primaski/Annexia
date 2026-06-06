# Annexia — Game Design Document
*Working title. Last updated: post-session-15.*

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
- **No free choices.** Every policy decision has tradeoffs. Approving AND declining a policy can both have consequences — effects, loyalty shifts, and alignment drift. Players must weigh citizens, tribunes, and strategic effects simultaneously.

---

## The Map

### Structure
- The map is a hex grid. Default size: 30×30 cells (~900 tiles, roughly half water).
- Each tile is one of four states:
  - **Water** — not claimable, impassable.
  - **Unclaimed** — land with no current ruler. Available for annexation.
  - **Barbarian-controlled** — has troops. Can be invaded.
  - **Player-controlled** — owned by a human or AI player.

### Tile Generation
- Land/water placed via Voronoi regions + Simplex noise. Inland lakes removed by flood-fill.
- Landmass centroid is shifted to the grid center after generation.
- Each land tile gets a **culture vector** at generation — five trait values on `[-1, 1]`. Neighboring tiles have similar vectors; divergence increases with distance, producing organic cultural regions.
- Each land tile gets a **terrain type** at generation via a second independent Voronoi pass (biome pass). Biome regions are assigned weighted terrain types; coast is a post-pass override for any land tile adjacent to water.
- Barbarian tiles are clustered via randomized BFS from random seeds. Each contiguous cluster forms one barbarian nation with a generated name.
- **Barbarian troop counts** are assigned at generation based on the cluster's average `militarism` culture trait: `troopsPerTile = 10 + (avgMilitarism + 1) / 2 × 10` (range 10–20 per tile). A floor of `round(troopsPerTile / 3)` guarantees every tile has troops. Remainder distributed randomly across the cluster via seeded PRNG.
- Barbarian tile color scales with troop count: lightly garrisoned tiles appear lighter than the base color; heavily garrisoned tiles appear darker.
- All land tiles have a generated name (2–3 syllable fantasy name, seeded PRNG).

### Terrain Types
Every land tile has a `terrainType` — a discrete value used for gameplay mechanics and visual rendering. Water tiles have no terrain type.

| Type | Description | Planned gameplay hooks |
|---|---|---|
| `plains` | Open grassland, majority of land tiles | Farmland, food output |
| `forest` | Dense woodland, organic clusters | Small defense bonus, resource potential, environmentalist affinity |
| `hills` | Rocky elevated terrain | Defense bonus, extra AP cost to invade, mineral resources |
| `desert` | Harsh arid land | Natural resources beneath surface, low habitability |
| `coast` | Water-adjacent land | Fishing/food output, future port cities, troop transport, bridge building |

Terrain types are **discrete gameplay values** — `terrainType` on the tile is always a clean enum. Visual blending at biome boundaries is a rendering concern only and does not affect the stored type.

**Tile purpose designations** (military base, capital marker, etc.) are a planned future direction that will build on `terrainType` as a foundation. Tabled until mechanics justify them.

### Map Navigation
- The map starts centered and fully fitted to the screen on every new game.
- **Pan**: click and drag to pan. The map cannot be dragged fully out of the visible area.
- **Zoom**: scroll down to zoom in, scroll up to zoom out. Range: 0.4×–3×. Zoom re-clamps pan automatically — the map cannot become stranded after zooming out.

---

## Players

### Starting Conditions
- Each player begins with **7 contiguous hexes** centered on a starting point with guaranteed spacing from other players.
- The center hex is the **capital** — where passive troop income deposits, and the anchor for capital-based mechanics.
- At game start, the **Roundtable** phase fires: player chooses country name, government type, and tribunes.

### Player Attributes
- **Alignment vector** — the player's political/cultural identity. Same trait space as tile culture vectors, `[-1, 1]`. Starts at all zeros (neutral). Shifts with every policy choice.
- **Confidence rating** — global trust measure. Affects success rate of propaganda and smear actions. Not yet mechanically wired.
- **Action points (AP)** — per-turn budget for mobilization actions. Replenishes each turn. Default: 20 per turn.
- **Tribune sentiment** — per-tribune record of how each council member feels about the player, range `[-1, 1]`. Initialized to 0. Shifts with every policy decision.
- **Active effects** — list of temporary or permanent modifiers affecting the player's territory or actions. Displayed as cards in the effects bar (top-left of map).
- **Capital tile** — the player's seat of power. Passive troop income deposits here. Reassigns to nearest owned tile if the capital is lost.
- **Budget** — universal currency. Starts at 90. Passive income of 10/turn (Civic Levy). No spending mechanics yet.

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
- **React to policies.** Each tribune has a `traitWeights` vector on `[-1, 1]`. Their bias toward a policy is computed as the dot product of `traitWeights × policy.alignmentShift`, normalized by total shift magnitude, clamped to `[-1, +1]`. Positive = favours approval, negative = favours decline. An optional `biasOverride` on the policy card overrides the computed value for specific tribunes where lateral connections aren't captured by the dot product.
- **Speak their mind.** Flavor text shown on the policy card resolves from `policy.tribuneReactions[tribune.id].flavor` if present, otherwise falls back to the tribune's generic `agreeText` or `disagreeText` based on their bias direction. Tribunes always have something to say.
- **Veto choices.** If a tribune strongly opposes your choice and conditions are met, they may veto it, flipping the outcome. Only the highest-|bias| eligible tribune rolls per policy.
- **Track your record.** Each tribune has a `sentiment` score (your `tribuneSentiment[tribuneId]`) that shifts based on every policy decision you make. Sentiment affects veto probability — tribunes who like you are more lenient.
- **Influence alignment (planned).** Tribune trait vectors will passively nudge your alignment each turn.
- **Unlock actions (planned).** Some mobilization actions require specific tribunes.

### Veto System
- **Direction**: index 0 = approve, index 1 = decline. Always by convention.
- **Eligibility**: tribune is eligible if their bias opposes the player's choice.
- **Roll**: only the highest |bias| eligible tribune rolls. One roll per policy card.
- **Probability formula**:
  ```
  base_prob          = (vetoCeiling × 0.75) × |bias|
  sentiment_discount = (vetoCeiling / 4) × currentSentiment
  veto_prob          = clamp(base_prob - sentiment_discount, 0, vetoCeiling)
  ```
- **Outcome**: veto flips the final choice. The tile loyalty update uses the flipped outcome. Tribune sentiment still updates based on what the player originally chose — tribunes know your intent.
- **Veto screen**: shows "VETOED", the blocking tribune's name and portrait, their flavor text for the policy.

### Tribune Sentiment
- Range: `[-1, 1]`. Initialized to 0 at roundtable.
- Shifts after every policy card regardless of which tribune is displayed.
- Formula: `shift = alignmentFactor × |bias| × tribuneSentimentShift (0.15)`
  - alignmentFactor = +1 if player's choice matched tribune's bias direction, -1 if opposed.
  - No shift if computed bias is effectively zero (< 0.001 absolute value).
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
Five traits, shared across tile culture vectors, player alignment vectors, and tribune trait weights. All values `[-1, 1]`.

| Trait | Positive pole | Negative pole |
|---|---|---|
| ecology | Environmental protection | Industrial growth |
| militarism | Expansion, defense | Pacifism |
| religion | Religious identity | Secularism |
| liberty | Personal freedoms | Collective control |
| progress | Openness to change | Tradition |

These are not moral judgments — they describe what a population values. Zero is genuinely neutral.

### Loyalty
- Range: `[-1, 1]`. Starts at `SPAWN_LOYALTY` (+0.30) for newly claimed tiles.
- Loyalty drifts toward a target each turn. Target is computed from cosine similarity between player alignment and tile culture, modified by neighbor pressure.
- Tile secedes (becomes barbarian) when loyalty falls to or below `breakawayThreshold` (default `-0.80`).
- Secession warning fires when loyalty crosses below `secessionWarningThreshold` (default `-0.50`).
- Loyalty log: per-tile list of `{ label, delta }` entries. Reset each turn at policy phase start. Populated by policy choices and drift. Visible to the player in the mobilization panel when a tile is selected.

### Conquest Loyalty
Starting loyalty for newly acquired tiles:
- Annex unclaimed tile: `SPAWN_LOYALTY` (+0.30)
- Conquer barbarian tile: `CONQUEST_LOYALTY_BARBARIAN` (-0.30)
- Reclaim a tile that previously seceded from you: `CONQUEST_LOYALTY_RECLAIMED` (-0.50)
- Another player captures a formerly-seceded tile: standard `-0.30`

---

## Mobilization

### Action Points
Each player has **20 AP** per turn (configurable). AP costs are flat per action type — not per troop.

| Action | AP Cost | Troop minimum |
|---|---|---|
| Fortify | 1 | 1 |
| Annex | 5 | 1 |
| Invade | 10 | 5 |

### Troop Action Rules
Troops follow strict passive/military action rules within a turn:

- **Passive action** (fortify): troops that have been fortified away from a tile are passive-spent. They cannot be used for military actions from their source tile. Troops that *arrive* at a tile via fortify are also ineligible for military actions that turn — they are `receivedPassive` and cannot fight.
- **Military action** (annex, invade): troops committed to a military action are fully locked for the rest of the turn. No further passive or military use.
- Fortified troops CAN be fortified onward (passive → passive is allowed), subject to normal AP costs.

This is tracked via `actionType: 'passive' | 'military'` on each `relocatedTroops` entry. Two derived maps are computed on demand from this log: `getMilitarySpentByTile` and `getReceivedPassiveByTile`.

### Actions

**Annex**
- Claim an adjacent unclaimed tile. Costs 5 AP. Minimum 1 troop committed.
- Troops must come from a connected owned region adjacent to the target.
- Target tile spawns with `SPAWN_LOYALTY` and the committed troops.

**Fortify**
- Move troops from one or more owned tiles into a target owned tile. Costs 1 AP flat regardless of troop count or number of source tiles.
- Sources and target must be in the same connected owned region.

**Invade**
- Attack an adjacent barbarian tile. Costs 10 AP. Minimum 5 troops.
- Sources must be **directly adjacent** to the target — not just connected.
- Only troops eligible for military action can be drafted (not passive-spent, not receivedPassive).
- During draft, only adjacent tiles are highlighted as eligible sources.

### Combat Model (Lanchester's Square Law)
Invasion uses Lanchester's Square Law rather than round-by-round simulation.

**Win probability** (used for UI display):
```
effectiveDefenders = defenders × defenderBonus
P(attacker wins) = 1 / (1 + (effectiveDefenders / attackers) ^ lanchesterExponent)
```

**Survivors** (computed on resolution):
- Determine winner probabilistically using the above formula.
- Winning side survivors: `sqrt(winner² - loser²)` with ±15% noise jitter, floored at 1.

Config knobs in `TuningConfig.combat`:
- `lanchesterExponent` (default `3`) — how steeply army size matters
- `defenderBonus` (default `1.07`) — structural defender advantage. Exposed for future card effects.

At defaults, equal matchups give the attacker ~45% odds. Example outcomes:
- 5v18: ~1.7% (near-suicidal)
- 13v13: ~45% (slight defender edge)
- 20v13: ~75% (meaningful advantage)

`defenderBonus` is intentionally a live variable — future card effects can increase it for specific tiles or players (e.g. "Fortified Borders" effect).

---

## Barbarians

Barbarians are **reactive bots**, not players. They do not make policy decisions and do not expand. They exist as obstacles, tactical challenges, and economic incentives.

### Troop Model
- Each barbarian tile has `activeTroops` assigned at generation (militarism-scaled, floored per tile).
- Troops are visible on hover (`⚔️ N`).
- Tile color reflects garrison strength — lighter = fewer troops, darker = more.

### Reactive Behavior (planned)
When a player annexes a tile adjacent to a barbarian cluster, the cluster may shift troops toward the border.

### Barter (planned)
Once adjacent, **Buy Tile** becomes available. Price scales with tile militarism and prior invasion history.

---

## Notifications

The notification bar (left panel) shows a filtered list of game events. All notifications have a `severity` and a `playerId`.

| Severity | Color | Events |
|---|---|---|
| `'breaking'` | Red | Tile secession (scoped `'global'` — visible to all players) |
| `'warning'` | Amber | Effect suspended, tile approaching secession |
| `'info'` | Default | Effect restored, invasion outcome |

Notifications scoped to a specific player ID only appear in that player's bar. `'global'` notifications appear for all players.

---

## AI Opponents

AI players participate in all phases. Currently: policy phase uses `chooseAIPolicyOption` (distance-reduction scoring against traitVector), mobilization performs basic annexation.

### Personality
Each AI has a `traitVector` (same space as culture/alignment), `aggression`, and `expansionism` scores. Government type derived from trait vector.

### Difficulty
Difficulty scales decision noise, not values.

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

Selected or randomized at game start. Check not yet implemented.

- **Majority** — own > 50% of land tiles.
- **Dominance** — own all tiles (last player standing).
- **Time limit** — most tiles after N turns.
- **Stability** — average loyalty ≥ 75 across all tiles for 3 consecutive turns.

---

## UI Layout

Five named regions. See architecture.md for full spec.

- **Info bar** — turn, phase, troops, AP, budget (💰 N)
- **Notification bar** — dismissable notifications (left panel), filtered to viewing player
- **Map area** — hex grid with pan/zoom, hover tooltip, floating tile detail panel (policy phase only), effects bar, loyalty preview overlay
- **Action bar** — context-sensitive: roundtable / policy card / calibration / mobilization. During mobilization, shows selected tile content inline (TileDetailContent) with End Turn pinned at bottom.
- **Settings bar** — lens overlay controls

Hover tooltip: immediate, no delay, tracks cursor.
Tile detail panel: visible during policy phase only — floating, draggable, top-right of map area. Suppressed during mobilization (content moves to action bar instead).
During mobilization: clicking a tile populates the action bar with that tile's detail content. Confirming an action keeps the tile selected. End Turn always pinned at bottom of action bar.
Right-click shortcut: during mobilization, right-clicking a tile triggers the first available action (Annex / Fortify / Invade) as if the player had clicked the tile and pressed the action button. A floating toast pill appears near the cursor — green with the action name on success, red with the blocked reason if AP or troops are insufficient. The action still navigates to the "pick sources" draft screen; right-click is a shortcut to that screen, not a one-click confirm.
Effects bar: floats top-left of map area with semi-transparent backing, shows active effect icons. Suspended effects shown faded. Multiple instances of the same card are grouped under one icon with a count badge; hovering shows all instances' durations stacked.

---

## Out of Scope (for now)

- Multiplayer over network (Phase 5) — architecture designed for clean Firebase integration
- **Mobilization interaction redesign** — current flow is "pick destination → pick sources" (to→from). Planned redesign to "pick source → pick destination" (from→to), which better matches player intent and eliminates cross-screen mouse travel. Substantial refactor of TileDetailContent, HexGrid interaction model, and MobilizationPanel. Deferred to next session.
- Advisor overrule / passive alignment nudge (tribune influence)
- Confidence score mechanics
- Tribune portrait fine-tuning (dicebear styles now curated per tribune; further polish deferred)
- Tile purpose designations (military base, capital marker, etc.) — planned, tabled until mechanics justify
- Sound
- Mobile layout
- Diplomacy (treaties, non-aggression pacts)
- Tech tree / inter-game progression
- 3D or canvas renderer (architecture supports pivot, SVG for now)
- Budget spending mechanics
- Dynamic policy weights based on game state
- Procedural flavor text / token replacement
- Roundtable warnings for suspended effects and approaching secession (designed, not yet built)
- Win condition check
- Strategic intel visibility toggles (enemy loyalty hidden by default; `hasLoyaltyIntel` flag gates future intel effect; enemy troops still visible during playtesting)
- "Did you hear?" AI hearsay notifications (designed, deferred)
- Barbarian reactive troop redistribution (designed, not yet built)
- Barbarian barter / Buy Tile action (designed, not yet built)
- Invade player-owned tiles (barbarian invasion implemented; player-vs-player combat deferred)
- Foreign neighbor drain (designed, not yet built)
