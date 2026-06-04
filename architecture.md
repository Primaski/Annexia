# Annexia — Architecture Reference
*Living document. Update when architectural decisions change.*

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | Catches errors before runtime |
| UI Framework | React | Component-based, natural for menu-heavy game |
| Build Tool | Vite | Fast dev server, zero config |
| Map Rendering | SVG (current) | Simple, debuggable. Canvas upgrade possible later. |
| State Management | Zustand | Lightweight global store |
| Data Files | JSON | All game content lives here |
| Multiplayer (later) | Firebase Firestore | Deferred to Phase 5 |
| Hosting (later) | Vercel | Deferred to Phase 5 |

---

## The Iron Rule

**Engine files never import from React or Zustand. Ever.**

`src/engine/` is pure TypeScript. Zero side effects. Zero UI. Zero state.
If you find yourself importing a React hook or a Zustand store inside `engine/`, stop and rethink.

The engine computes. The hooks read the engine's output and write it to the store. The components read the store and render.

```
engine/ (pure TS) → hooks/ (bridge) → store/ (state) → components/ (render)
```

---

## Folder Structure

```
src/
  data/                     ← JSON content files. Content, not code.
    advisors.json            ← Impartial advisor(s). imagePath populated.
    tribunes.json            ← Political tribunes. traitWeights, agreeText, disagreeText.
    ai_personalities.json    ← AI archetypes. traitVector + aggression + noise.
    policies.json            ← Policy cards. alignmentShift, optional effects,
                                optional tribuneReactions (flavor + biasOverride per tribune).
    events.json              ← Random events. Not yet wired to engine.

  engine/                   ← Pure TypeScript. No React. No Zustand.
    hex.ts                   ← Coordinate math, pixel conversion, neighbors, grid gen
    loyalty.ts               ← cosineSimilarity, calculateLoyaltyTarget (returns { target }),
                                stepLoyalty, isBreakawayCandidate, SPAWN_LOYALTY
    mapGen.ts                ← Voronoi + noise land/water, culture vectors, barbarian
                                clusters (with militarism-scaled troop assignment),
                                nation flood-fill. Returns MapGenResult.
    names.ts                 ← generateName(rand). 80-syllable bank. Seeded, pure.
    policy.ts                ← drawPolicyCards, computeSentimentShifts,
                                computeVetoProbability, resolvePolicyVeto,
                                applyPolicyChoice (owner-scoped loyalty only),
                                chooseAIPolicyOption
    spawnPlayers.ts          ← Starting territory placement, overlap assertion
    mobilization.ts          ← getAnnexableTiles, annexTile, fortifyTile,
                                getTotalAvailableTroops, getInvadableTileKeys,
                                invadeTile, simulateCombat (Lanchester), CombatResult

  store/
    gameStore.ts             ← All game session state. Tiles, players, nations,
                                tribunes, phase, turn, activePolicyCards, effects.
                                relocatedTroops entries carry actionType: 'passive' | 'military'.
                                spendAction(amount?) accepts optional flat amount.
    uiStore.ts               ← UI-only state. selectedTile, hoveredTile, tooltip
                                position, activeOverlay, vetoResult, policyHoverChoice,
                                viewingPlayerId, invadeModeActive, setInvadeModeActive.

  hooks/
    useGame.ts               ← Bridge between engine and store.
                                useMapGen, resolveTurn, processAITurns,
                                startPolicyPhase, submitPolicyChoice,
                                finishPolicyPhase, endMobilizationPhase,
                                performAnnex, performFortify, performInvade,
                                getInvadableTileKeysForPlayer,
                                getMilitarySpentByTile (exported helper),
                                getReceivedPassiveByTile (exported helper),
                                RelocationEntry (exported type)
    useMapLayout.ts          ← hexToPixel wrapper, stable callback

  components/
    map/
      HexGrid.tsx            ← SVG container. ResizeObserver sizing. Mouse event
                                wiring. Territory border edges. Pan and zoom via
                                CSS transform on inner wrapper div. No game logic.
                                isDraftSource respects invadeModeActive — when invading,
                                only tiles adjacent to selectedTileCoord are highlighted.
      HexTile.tsx            ← Individual hex polygon. Fill color by state/overlay.
                                Loyalty preview overlay on policy hover.
                                Barbarian tiles color-scaled by activeTroops.
      MapFilters.tsx         ← Overlay toggle buttons. Default + traits + loyalty.
    ui/
      ActionBar.tsx          ← Phase router. Renders one panel component per phase.
      HoverTooltip.tsx       ← Mouse-tracked tooltip. Fixed position. No delay.
                                pointer-events none.
      TileDetailPanel.tsx    ← Floating top-right of map. Policy phase only — returns
                                null during mobilization. Drag handle: sprite + nation
                                name + coords + × button. Renders TileDetailContent
                                below the header.
      TileDetailContent.tsx  ← Extracted tile detail body. Used by both TileDetailPanel
                                (policy phase) and MobilizationPanel (mobilization phase).
                                Contains all mode state (draftMode, fortifyMode, invadeMode),
                                draft useEffects, computed troop availability, and all
                                action buttons (Annex, Fortify, Invade + draft panels).
                                Resets cleanly on tileKey change and unmount.
                                Subtracts receivedPassiveByTile in military eligibility checks.
                                Confirm handlers do NOT call selectTile(null) — tile stays
                                selected after action.
      NotificationBubbles.tsx ← Export: NotificationPanel. Vertical list in notif bar.
                                Severity-colored text. Filters to viewingPlayerId + 'global'.
      Sprite.tsx             ← Image or lettered placeholder. Reusable.
      MapTuningPanel.tsx     ← Dev tool for map config sliders.
      EffectsBar.tsx         ← Floating top-left of map. Active effect icons + tooltips.
                                Groups same-title effects; shows count badge when >1.
      CardTooltip.tsx        ← Shared card tooltip. Exports: CardTooltipContent,
                                effectTypeImage, formatMechanical, CardTooltipEffect type.
      phases/
        RoundtablePanel.tsx  ← Game start setup: name, government, tribunes, advisor.
        PolicyPanel.tsx      ← Policy card + inline veto screen.
        CalibrationPanel.tsx ← "Resolving turn..." placeholder.
        MobilizationPanel.tsx ← Three-zone layout: persistent header (label + AP count),
                                scrollable body (TileDetailContent when tile selected,
                                hint text otherwise), End Turn pinned at bottom.

  types/
    index.ts                 ← All shared interfaces. Single import source.
                                LoyaltyLogEntry: { label: string; delta: number }
                                CONQUEST_LOYALTY_UNCLAIMED (+0.30), CONQUEST_LOYALTY_BARBARIAN (-0.30),
                                CONQUEST_LOYALTY_RECLAIMED (-0.50) exported constants.
                                BarbarianTile carries previousOwner: string | null.

  config.ts                  ← TuningConfig + DEFAULT_CONFIG. Engine constants only.
                                combat.lanchesterExponent (default 3) — army-size scaling factor.
                                combat.defenderBonus (default 1.07) — structural defender advantage;
                                intentionally exposed for future card effects.
  App.tsx                    ← Layout shell + phase-driven useEffect hooks.
  main.tsx                   ← Vite entry point.
```

---

## Screen Layout

Five named regions. Names are canonical — use them in all future discussions.

```
┌─────────────────────────────────────────────────────────────────┐
│ INFO BAR (40px, full width)                                     │
│ Turn N — Phase                    troops: N   AP: N   💰 N     │
├──────────────┬──────────────────────────────────────────┬───────┤
│              │ [EFFECTS BAR - floating, top-left map]   │       │
│ NOTIFICATION │                                          │ACTION │
│ BAR          │         MAP AREA (flex 1)                │ BAR   │
│ (200px,      │         position: relative               │(420px,│
│  min 200px)  │         overflow: hidden                 │ min   │
│              │  [TILE DETAIL PANEL — policy phase only] │ 210px)│
│              │                        floating top-right│       │
└──────────────┴──────────────────────────────────────────┴───────┘
│ SETTINGS BAR (40px, full width)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Info Bar
- Turn number + phase name (left)
- Total troops + available troops + AP + budget (right)
- Reads directly from gameStore in App.tsx

### Notification Bar
- Vertical list of dismissable text notifications
- 200px wide, full remaining height, minimum 200px (flex-shrink: 1)
- Notifications have `severity: 'info' | 'warning' | 'breaking'`
- Notifications have `playerId: string` — `'global'` for world events, player id for player-scoped
- Display layer filters to `viewingPlayerId` (from uiStore) or `'global'`

### Map Area
- `position: relative` — required for floating panels anchored inside it
- `overflow: hidden` — prevents zoomed/panned SVG from bleeding into adjacent panels
- `zIndex: 0` — side panels sit above it at zIndex 2
- Tile detail panel floats here during policy phase only. Suppressed during mobilization.

### Action Bar
- 420px wide, minimum 210px (flex-shrink: 1)
- Routes to phase panel components: RoundtablePanel / PolicyPanel / CalibrationPanel / MobilizationPanel
- During mobilization: shows TileDetailContent inline when a tile is selected; End Turn always pinned at bottom

### Settings Bar
- 40px, full width
- Map overlay toggles (default / trait overlays / loyalty overlay)

---

## Tile Data Model

```ts
WaterTile     = { coord, state: 'water' }
UnclaimedTile = { coord, state: 'unclaimed', cultureVector, name, nationId }
BarbarianTile = { coord, state: 'barbarian', cultureVector, name, nationId,
                  activeTroops, previousOwner: string | null }
                  // previousOwner: set when tile secedes from a player.
                  // Used to apply CONQUEST_LOYALTY_RECLAIMED on re-invasion.
OwnedTile     = { coord, state: 'owned', cultureVector, name, nationId,
                  ownerId, loyalty, loyaltyTarget, activeTroops,
                  suppression, defense,
                  loyaltyLog: LoyaltyLogEntry[] }

LoyaltyLogEntry = { label: string, delta: number }
```

**OwnedTile.defense** — reserved for future Reinforce action. Currently unused.

---

## Troop Action Model

Troops follow a passive/military action rule within each turn:

- **Passive action** (fortify source): recorded as `actionType: 'passive'` in `relocatedTroops`. Source tile troops are `spentTroopsByTile` — cannot be moved again. Destination tile troops are `receivedPassiveByTile` — cannot perform military actions this turn.
- **Military action** (annex, invade): recorded as `actionType: 'military'`. Source tile troops fully locked via `spentTroopsByTile`.
- Passive → passive re-movement is allowed (fortified troops can be fortified onward, at AP cost).
- Passive → military is blocked (`receivedPassiveByTile` subtracted from military eligibility checks).
- Military → anything is blocked (`spentTroopsByTile` covers this).

Two exported helpers in `useGame.ts`:
- `getMilitarySpentByTile(relocatedTroops)` — keyed by `fromKey`, military entries only
- `getReceivedPassiveByTile(relocatedTroops)` — keyed by `toKey`, passive entries only

---

## Loyalty System

### Engine (`engine/loyalty.ts`)
- `calculateLoyaltyTarget(ownerAlignment, tileCulture, enemyNeighborAlignments, config)` — returns `{ target: number }`.
- `stepLoyalty(current, target, momentumRate)` — advances loyalty one tick toward target.
- `isBreakawayCandidate(loyalty, threshold)` — true when loyalty ≤ threshold.
- `cosineSimilarity(a, b)` — cosine similarity over five trait dimensions.

### Hook (`hooks/useGame.ts`)
1. `startPolicyPhase()` — clears all `loyaltyLog: []` on owned tiles
2. `submitPolicyChoice()` — appends `Policy: <title>` entries to tiles whose loyalty changed
3. `resolveTurn()` Step 2 — builds `turnLog`, stores on tile. Preserved through mobilization for inspection.

### Policy loyalty scope
`applyPolicyChoice` only applies loyalty deltas to tiles owned by `player.id`. AI tiles unaffected by human policy decisions and vice versa.

---

## Combat Model (Lanchester's Square Law)

Replaces the prior round-by-round simulation. Two-step resolution:

**Step 1 — Win probability:**
```
effectiveDefenders = defenders × defenderBonus
P(attacker wins) = 1 / (1 + (effectiveDefenders / attackers) ^ lanchesterExponent)
```
Winner determined by `rand() < P`.

**Step 2 — Survivors:**
```
rawSurvivors = sqrt(winner² - loser²)
survivors = max(1, round(rawSurvivors × (0.85 + rand() × 0.3)))  // ±15% noise, floor 1
```

Config knobs (`TuningConfig.combat`):
- `lanchesterExponent: 3` — steepness of army-size advantage
- `defenderBonus: 1.07` — structural defender edge; intentionally exposed for card effects

`defenderBonus` is designed to be overridden by active effects (e.g. a "Fortified Borders" card could increase it for specific tiles). At defaults: 13v13 ≈ 45%, 5v18 ≈ 1.7%.

The same formula is used for both the live probability display (UI) and the actual simulation resolution — no divergence between what the player sees and what the engine computes.

---

## Mobilization Actions

AP costs are flat per action type. Troop counts are flexible (subject to minimums).

**Annex**
- Claim an adjacent unclaimed tile. Costs `annexAPCost` (5) AP. Minimum `annexTroopMin` (1) troop.
- Troops must come from a connected owned region adjacent to the target.
- Target tile spawns with `SPAWN_LOYALTY` and the exact troops committed.
- Engine: `annexTile()`. Hook: `performAnnex()`.

**Fortify**
- Move troops from one or more owned tiles into a target owned tile.
- Costs `fortifyAPCost` (1) AP flat, regardless of troop count or source tile count.
- Sources and target must be in the same connected owned region.
- Engine: `fortifyTile()`. Hook: `performFortify()`.

**Invade**
- Attack an adjacent barbarian tile. Costs `invadeAPCost` (10) AP. Minimum `invadeTroopMin` (5) troops.
- Sources must be **directly adjacent** to the target.
- Only militarily-eligible troops can be drafted (excludes `spentTroopsByTile` and `receivedPassiveByTile`).
- During draft, only adjacent tiles are highlighted (not all owned tiles with troops).
- Attacker win: survivors occupy tile with `CONQUEST_LOYALTY_BARBARIAN` (-0.30), or `CONQUEST_LOYALTY_RECLAIMED` (-0.50) if `previousOwner === player.id`.
- Defender win: attacking troops destroyed, barbarian tile retains survivors.
- Engine: `invadeTile()`, `simulateCombat()`. Hook: `performInvade()`.

**Planned actions**: Invade player tile, Suppress, Reinforce, Propaganda campaign, Barter.

---

## Turn Sequence

```
[turn N start]
  startPolicyPhase():
    → clear all loyaltyLog: [] on owned tiles
    → drawPolicyCards(3), store in activePolicyCards

  if pendingRoundtable === true
    → phase: 'roundtable'
    → player confirms name / government / tribunes
    → setPhase('policy'), setPendingRoundtable(null)

  phase: 'policy'
    → for each card:
        submitPolicyChoice(choiceIndex)
          → resolvePolicyVeto → computeSentimentShifts → applyPolicyChoice
          → if veto: show veto screen
          → else: advance card or finishPolicyPhase()
    → finishPolicyPhase()
        → resolveTurn()
            Step 2: loyalty targets, step loyalty, Drift log entry
            Step 3: breakaway pass
            Step 3.5: effect income tick (troop + budget)
            Step 4: setTiles
            Step 5: tick active effects
        → setPhase('mobilization')

  phase: 'mobilization'
    → player clicks tiles; TileDetailContent renders in MobilizationPanel
    → actions: annex, fortify, invade via TileDetailContent buttons
    → each action: flat AP deduction via spendAction(amount)
    → endMobilizationPhase() on End Turn
        → advanceTurn() → currentTurn++, reset submittedPlayerIds,
                           actionsRemaining = 0, relocatedTroops [], spentTroopsByTile {}

[turn N+1 start]
```

---

## Data Isolation and Security Model

### Current (single-player vs AI)
All data lives in a single Zustand store. `viewingPlayerId` in `uiStore` determines which player's data the UI renders. Enemy tile loyalty is hidden (`hasLoyaltyIntel = false`). Enemy troop counts visible during playtesting.

`[DEBUG]` prefix: all AI-state console logs use this for easy removal (`grep -r '\[DEBUG\]'`).

### Future (Firebase multiplayer)
- Firestore security rules prevent cross-player data reads
- Cloud Functions project only what each client is entitled to see
- `viewingPlayerId` / `hasLoyaltyIntel` architecture slots cleanly into this model

---

## Barbarian System

Barbarians are reactive bots, not players.
- No policy phase participation, no expansion
- `activeTroops` on every tile (militarism-scaled at generation)
- `previousOwner: string | null` — set on secession, used for `CONQUEST_LOYALTY_RECLAIMED`
- Tile color reflects garrison strength

**Tabled mechanics**: reactive troop redistribution, barter/Buy Tile action.

---

## Active Effects Architecture

```ts
ActiveEffect {
  id, sourcePlayerId, targetPlayerIds,
  type: string,           // 'troop_income', 'budget_income', etc.
  scope, targeting,       // targeting: 'self' | 'all_opponents' | 'global'
  magnitude, turnsRemaining, uses,
  enabled: boolean,       // false = suspended, shown faded in effects bar
  suspendable: boolean,
  title, icon, description
}
```

**Starter effects**: seeded on every player at game start.
**Effect income tick**: runs in `resolveTurn` Step 3.5.
**Known limitation**: `applyPolicyChoice` resolves `'all_opponents'` and `'global'` as placeholders. Add `players: Player[]` when cross-player effects are needed.

**Design note**: `defenderBonus` in `TuningConfig.combat` is intentionally exposed so future card effects can modify it per-tile or per-player.

---

## Renderer Separation Rule

SVG layer and UI layer must stay cleanly separated.
- **HexGrid / HexTile**: SVG only. No UI elements inside SVG.
- **All UI**: React divs outside SVG.
- Mouse events on SVG write to uiStore. UI components read from uiStore.

Do not violate this rule. If you find a reason to put a React component inside the SVG, the architecture needs a different solution.

---

## Naming Conventions

| Thing | Convention |
|---|---|
| Coord key | `"q,r"` string, produced by `coordKey()` |
| Player ID | `"player_1"`, `"player_2"`, etc. |
| Nation ID | `"nation_player_0"`, `"nation_0"`, etc. |
| Tribune ID | `"tr_environmentalist"`, etc. |
| Policy ID | `"pol_coal_subsidies"`, etc. |
| Effect ID | `"eff_"` prefix + name + `"_"` + player ID for starter effects |
| Phase | lowercase: `'policy'`, `'mobilization'`, etc. |
| Bars/panels | info bar, notification bar, action bar, settings bar, effects bar, tile detail panel |

---

## Things Intentionally Deferred

- Multiplayer (Phase 5, Firebase)
- AI mobilization beyond basic annex
- Confidence score mechanics
- Tribune veto probability tuning (0.15 shift is placeholder)
- Roundtable trigger conditions beyond game_start
- Roundtable warnings for suspended effects and approaching secession
- Barbarian reactive troop redistribution
- Invade player-owned tiles (barbarian invasion done; PvP deferred)
- Barbarian barter (Buy Tile action)
- Foreign neighbor drain (flat drain formula; baseForeignPressure config knob)
- Budget spending mechanics
- Tech tree / inter-game progression
- Sound, mobile layout, diplomacy
- ActiveEffect type enum (string for now)
- Portrait images (dicebear placeholders)
- `uses` field consumption in engine (field exists, not yet decremented)
- Cross-player effect targeting (stubbed in applyPolicyChoice)
- Dynamic policy weights, procedural flavor text
- Win condition check implementation
- Intel visibility (hasLoyaltyIntel flag; enemy troops still visible during playtesting)
- Fortify connectivity check in UI layer (engine enforces on confirm)
- "Did you hear?" AI hearsay notifications
