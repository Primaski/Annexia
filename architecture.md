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
    tribunes.json            ← Political tribunes. policyStances + traitWeights.
    ai_personalities.json    ← AI archetypes. traitVector + aggression + noise.
    policies.json            ← Policy cards. choices, alignmentShift, loyaltyEffect.
    events.json              ← Random events. Not yet wired to engine.

  engine/                   ← Pure TypeScript. No React. No Zustand.
    hex.ts                   ← Coordinate math, pixel conversion, neighbors, grid gen
    loyalty.ts               ← cosineSimilarity, calculateLoyaltyTarget, stepLoyalty,
                                isBreakawayCandidate, SPAWN_LOYALTY
    mapGen.ts                ← Voronoi + noise land/water, culture vectors, barbarian
                                clusters, nation flood-fill. Returns MapGenResult.
    names.ts                 ← generateName(rand). 80-syllable bank. Seeded, pure.
    policy.ts                ← drawPolicyCards, computeSentimentShifts,
                                computeVetoProbability, resolvePolicyVeto,
                                applyPolicyChoice
    spawnPlayers.ts          ← Starting territory placement, overlap assertion
    mobilization.ts          ← (next) getAnnexableTiles, annexTile, future actions

  store/
    gameStore.ts             ← All game session state. Tiles, players, nations,
                                tribunes, phase, turn, activePolicyCards, effects.
    uiStore.ts               ← UI-only state. selectedTile, hoveredTile, tooltip
                                position, activeOverlay, vetoResult.

  hooks/
    useGame.ts               ← Bridge between engine and store.
                                useMapGen, resolveTurn, processAITurns,
                                startPolicyPhase, submitPolicyChoice,
                                finishPolicyPhase, endMobilizationPhase,
                                performAnnex (next)
    useMapLayout.ts          ← hexToPixel wrapper, stable callback

  components/
    map/
      HexGrid.tsx            ← SVG container. ResizeObserver sizing. Mouse event
                                wiring. Territory border edges. No game logic.
      HexTile.tsx            ← Individual hex polygon. Fill color by state/overlay.
      MapFilters.tsx         ← Overlay toggle buttons. Default + traits + loyalty.
    ui/
      ActionBar.tsx          ← Phase router. Renders one panel component per phase.
      HoverTooltip.tsx       ← Mouse-tracked tooltip. Fixed position. No delay.
                                pointer-events none.
      TileDetailPanel.tsx    ← Floating top-right of map. Click to open. × to close.
      NotificationBubbles.tsx ← Export: NotificationPanel. Vertical list in notif bar.
      Sprite.tsx             ← Image or lettered placeholder. Reusable.
      MapTuningPanel.tsx     ← Dev tool for map config sliders.
      phases/
        RoundtablePanel.tsx  ← Game start setup: name, government, tribunes, advisor.
        PolicyPanel.tsx      ← Policy card + inline veto screen.
        CalibrationPanel.tsx ← "Resolving turn..." placeholder.
        MobilizationPanel.tsx ← Actions remaining + End Turn.

  types/
    index.ts                 ← All shared interfaces. Single import source.

  config.ts                  ← TuningConfig + DEFAULT_CONFIG. Engine constants only.
  App.tsx                    ← Layout shell + phase-driven useEffect hooks.
  main.tsx                   ← Vite entry point.
```

---

## Screen Layout

Five named regions. Names are canonical — use them in all future discussions.

```
┌─────────────────────────────────────────────────────────────────┐
│ INFO BAR (36px, full width)                                     │
│ Turn N — Phase                              troops: N   AP: N  │
├──────────────┬──────────────────────────────────────────┬───────┤
│              │ [EFFECTS BAR - floating, top-left map]   │       │
│ NOTIFICATION │                                          │ACTION │
│ BAR (200px)  │         MAP AREA (flex 1)                │ BAR   │
│              │         position: relative               │(420px)│
│              │                       [TILE DETAIL PANEL]│       │
│              │                        floating top-right│       │
└──────────────┴──────────────────────────────────────────┴───────┘
│ SETTINGS BAR (40px, full width)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Info Bar
- Turn number + phase name (left)
- Total troops (sum of activeTroops across owned tiles) + action points available (right)
- Reads directly from gameStore in App.tsx

### Notification Bar
- Vertical list of dismissable text notifications
- Empty state: "no notifications" muted
- 200px wide, full remaining height

### Map Area
- `position: relative` — required for floating panels anchored inside it
- HexGrid fills via ResizeObserver, never via window.innerWidth
- **Effects bar**: `position: absolute, top: 12px, left: 12px` — hoverable effect icons
- **Tile detail panel**: `position: absolute, top: 12px, right: 12px` — appears on tile click

### Action Bar
- 420px wide, full remaining height
- Context-sensitive by phase:
  - `roundtable` → RoundtablePanel
  - `policy` → PolicyPanel
  - `calibration` → CalibrationPanel
  - `mobilization` → MobilizationPanel

### Settings Bar
- 40px, full width
- Lens button (toggles MapFilters panel floating above it)
- Future: additional settings

---

## Hover and Click Interaction Model

**Hover (HoverTooltip)**
- Fires immediately on mouseenter, dismisses on mouseleave
- No delay
- Fixed position, offset 12px from cursor
- pointer-events: none (never blocks clicks)
- Shows: tile name, owner, loyalty/defense where applicable, trait emojis for extremes

**Click (TileDetailPanel)**
- Opens floating panel at top-right of map area
- Shows full tile detail
- During mobilization: will also show available action buttons (next task)
- × button closes it
- Water tiles: panel does not open

**Tile interaction during mobilization**
- Hover: shows basic info + available actions as text
- Click: opens detail panel with action buttons
- If tile is annexable: highlight color on map, action button in detail panel

---

## Coordinate System

Axial coordinates throughout. `{ q, r }`. Never store cube coords (s = -q - r is derived).

Key functions in `hex.ts`:
- `coordKey({ q, r })` → `"q,r"` string — used as Record key everywhere
- `hexNeighbors(coord)` → 6 neighbors, no bounds check
- `isInGrid(coord, cols, rows)` → bounds check
- `hexDistance(a, b)` → step count
- `hexToPixel(coord, size)` → pixel center for SVG rendering
- `hexCorners(center, size)` → 6 corner points for polygon

Grid generation: `generateGridCoords(cols, rows)` — offset rows, row-major order.

---

## State Architecture

### What Lives Where

**gameStore** — "what is true about the game world"
- `tiles: Record<string, Tile>` — keyed by coordKey
- `players: Player[]` — index 0 is always human
- `nations: Record<string, Nation>`
- `tribunes: Tribune[]` — full roster, loaded once at start
- `phase: TurnPhase`
- `currentTurn: number`
- `activePolicyCards: Policy[]`
- `currentPolicyCardIndex: number`
- `actionsRemaining: number`
- `notifications: Notification[]`
- `pendingRoundtable: boolean`
- `roundtableReason: RoundtableReason | null`
- `mapSeed: number | null`
- `winnerId: string | null`

**uiStore** — "what is the player looking at"
- `selectedTileCoord: AxialCoord | null`
- `hoveredTileCoord: AxialCoord | null`
- `tooltipPosition: { x, y }`
- `activeOverlay: { trait, inverted } | null`
- `vetoResult: { policyId, tribuneId, originalChoiceIndex, finalChoiceIndex } | null`

### What Never Lives in the Store
- Derived/computed values — calculate in components or hooks
- Engine intermediate results — return from pure functions, pass to store actions

---

## Type System

All shared interfaces in `src/types/index.ts`. Single import source for everything.

### Key Types

**Tile union** — `WaterTile | UnclaimedTile | BarbarianTile | OwnedTile`
Always narrow before accessing state-specific fields: `if (tile.state === 'owned') { ... }`

**TraitVector** — five traits, all [0, 1]:
`ecology, militarism, religion, liberty, progress`

**Player**
```ts
{
  id, name, isHuman, alignmentVector: TraitVector,
  confidence, governmentType, tribuneIds, advisorId,
  personalityId, nationId, imagePath,
  tribuneSentiment: Record<string, number>,  // tribune ID → [-1, 1]
  activeEffects: ActiveEffect[]
}
```

**Tribune**
```ts
{
  id, name, archetype, traitWeights: TraitVector,
  policyStances: Record<string, { bias: number; flavor: string }>,
  flavourText, imagePath
}
```

**ActiveEffect**
```ts
{
  id, sourcePlayerId,
  targetPlayerIds: string[],   // always array
  type: string,                // enum later
  scope, magnitude,
  turnsRemaining: number | null,  // null = permanent
  icon, description
}
```

**TurnPhase** — `'roundtable' | 'policy' | 'calibration' | 'mobilization'`

**GovernmentType** — `'none' | 'democracy' | 'hybrid' | 'autocracy'`

---

## Loyalty System

Internal range: `[-10000, +10000]`. Display: divide by `LOYALTY_SCALE` (100).

**Loyalty target formula** (MAD-based):
```
mad = average(|ownerAlignment[trait] - tileCulture[trait]|) across 5 traits
base = round((1 - mad × 2) × 10000)
pressure = round(max(0, bestEnemySim - ownerSim) × neighborPressureStrength × 10000)
target = clamp(base - pressure, -10000, +10000)
```

**Momentum**: `stepLoyalty(current, target, momentumRate)` — moves by `momentumRate` fraction of gap each turn.

**Breakaway**: fires when loyalty ≤ `breakawayThreshold` (default -1 internal). Tile becomes BarbarianTile, inherits adjacent nation or mints new one.

Tunable in `DEFAULT_CONFIG.loyalty`: `neighborPressureStrength`, `breakawayThreshold`, `momentumRate`.

---

## Policy System

**Draw**: weighted random without replacement. `policy.weight` defaults to `1.0` if absent. Tribune boost: if any council tribune has |bias| > 0.5 for this policy, multiply weight by 1.5 per matching tribune.

**Convention**: choice index 0 = approve, index 1 = decline. Always. Labels are hardcoded in the UI — not stored in policy data.

**Data structure** (`data/policies.json`):
```json
{
  "id": "pol_example",
  "title": "...",
  "description": "...",
  "weight": 1.0,
  "alignmentShift": { "militarism": 0.1, "liberty": -0.05 },
  "declineModifier": 0.4,
  "loyaltyEffect": { "trait": "militarism", "modifier": -10 }
}
```
`weight` and `declineModifier` are optional — both default to `1.0` if absent.
`alignmentShift` is the approve direction. Decline negates each shift × `declineModifier`.
`loyaltyEffect.modifier` is the approve value. Decline negates it × `declineModifier`.

**Loyalty formula**:
```
offset = cultureVector[trait] - 0.5          // range [-0.5, +0.5]
normalized = offset / 0.5                     // range [-1, +1]
delta = round(appliedModifier × normalized × LOYALTY_SCALE)
```
Tiles at 0.5 on the trait are completely unaffected. Tiles at 0.0 or 1.0 receive the full modifier. `appliedModifier` is `modifier` on approve, `-modifier × declineModifier` on decline.

**Resolution sequence per card**:
1. `resolvePolicyVeto` (uses pre-shift sentiment) → finalChoiceIndex, vetoingTribuneId
2. `computeSentimentShifts` (original choice) → updated tribuneSentiment for ALL council tribunes
3. `applyPolicyChoice` (final choice) → updated player alignment + tile loyalty

**Veto probability**:
```
base_prob = vetoCeiling[governmentType] × |bias|
sentiment_discount = (vetoCeiling / 2) × ((sentiment + 1) / 2)
veto_prob = max(0, base_prob - sentiment_discount)
```
Only highest |bias| eligible tribune rolls. One roll per policy.

**Sentiment shift**:
```
alignment = (bias > 0 && choiceIndex === 0) || (bias < 0 && choiceIndex === 1) ? +1 : -1
shift = alignment × |bias| × tribuneSentimentShift (default 0.15)
newSentiment = clamp(current + shift, -1, 1)
```
Applied to ALL council tribunes, including those with bias = 0 (no shift for zero bias).

---

## Turn Sequence

```
[turn N start]
  if pendingRoundtable === true
    → phase: 'roundtable' (RoundtablePanel in action bar)
    → player confirms name / government / tribunes
    → setPhase('policy'), setPendingRoundtable(null)

  phase: 'policy'
    → startPolicyPhase(): drawPolicyCards(3), store in activePolicyCards
    → for each card:
        submitPolicyChoice(choiceIndex)
          → resolvePolicyVeto (pre-shift sentiment)
          → computeSentimentShifts (original choice) → updatePlayer
          → applyPolicyChoice (final choice) → setTiles, updatePlayer
          → if veto: set vetoResult in uiStore → show veto screen
          → else: advance card or call finishPolicyPhase()
    → finishPolicyPhase()
        → setPhase('calibration')
        → resolveTurn()
            Step 1-3: loyalty targets, step loyalty, breakaway pass → setTiles
            Step 5: tick active effects → updatePlayer per changed player
        → read phase from store
        → if phase !== 'roundtable': setPhase('mobilization')
        → processAITurns() (stub)

  phase: 'mobilization'
    → player takes actions (annex, etc.) via MobilizationPanel / tile clicks
    → each action: spend 1 AP via spendAction()
    → endMobilizationPhase() on End Turn button
        → advanceTurn() → currentTurn++, reset submittedPlayerIds,
                           actionsRemaining = 0,
                           phase = pendingRoundtable ? 'roundtable' : 'policy'

[turn N+1 start]
```

---

## Active Effects

Effects live in `Player.activeEffects[]`. Ticked in calibration (resolveTurn Step 5).

**Tick behavior**: decrement `turnsRemaining` by 1. Remove if reaches 0. Skip if `turnsRemaining === null` (permanent).

**Application**: mobilization engine reads relevant effects when calculating action costs. Not yet implemented — add when mobilization actions are built.

**Scope values**: `'all_owned' | 'border_tiles' | 'global' | 'specific_player'`

**targetPlayerIds**: always an array. Self-effect: `[player.id]`. Global: all player IDs. Cross-player: opponent's ID(s).

---

## Renderer Separation Rule

The SVG layer and the UI layer must stay cleanly separated at all times.

- **HexGrid** and **HexTile** render SVG only. They receive data from the store and render polygons. No UI elements (tooltips, panels, buttons) go inside the SVG.
- **All UI** (tooltips, panels, overlays, bars) is React divs outside the SVG.
- Mouse events on SVG elements write to uiStore (hoveredTileCoord, selectedTileCoord). React UI components read from uiStore and render independently.

This separation is intentional for a future 3D or canvas pivot. If the SVG renderer is ever replaced, the entire UI layer survives unchanged because it reads from the store, not from the SVG.

**Do not violate this rule.** If you find a reason to put a React component inside the SVG, it's a sign the architecture needs a different solution.

---

## Naming Conventions

| Thing | Convention |
|---|---|
| Coord key | `"q,r"` string, produced by `coordKey()` |
| Player ID | `"player_1"`, `"player_2"`, etc. |
| AI player ID | same as human, `"player_2"` onward |
| Nation ID | `"nation_player_0"`, `"nation_0"`, `"nation_1"`, etc. |
| Tribune ID | `"tr_environmentalist"`, `"tr_military_hawk"`, etc. |
| Policy ID | `"pol_coal_subsidies"`, `"pol_military_expansion"`, etc. |
| Event ID | `"evt_separatist_movement"`, etc. |
| Effect ID | `"eff_"` prefix + descriptive name (future) |
| Phase | lowercase: `'policy'`, `'mobilization'`, etc. |
| Bars/panels | info bar, notification bar, action bar, settings bar, effects bar, tile detail panel |

---

## Things Intentionally Deferred

- Multiplayer (Phase 5, Firebase)
- AI mobilization behavior (stub only)
- Confidence score mechanics
- Tribune veto probability tuning (0.15 shift is placeholder)
- Roundtable trigger conditions beyond game_start
- Barbarian affinities
- Economy / resource system beyond action points
- Tech tree / inter-game progression
- Sound
- Mobile layout
- Diplomacy between players
- 3D / canvas renderer pivot (architecture supports it, SVG for now)
- ActiveEffect type enum (string for now)
- Portrait images for tribunes and AI personalities (dicebear placeholders)
