# Annexia — Claude Code Context

This file is loaded automatically by Claude Code on every prompt. It contains the full project context, coding rules, and game design reference.

---

## Coding Rules

These apply to every task, no exceptions.

### Never do this without explicit instruction
- Import React inside any file in `engine/`. That directory is pure TypeScript. Zero React, ever.
- Put logic in JSON files. JSON is data. TypeScript acts on it.
- Invent game logic. No placeholder loyalty formulas, no assumed breakaway thresholds, no invented AI behavior. If the spec is missing, ask.
- Make design decisions silently. If a choice must be made that belongs to the developer (a tuning value, a threshold, a tie-breaking rule), surface it and ask.
- Rewrite working code that wasn't part of the request. Scope changes must be explicit.
- Guess at intended behavior in edge cases. Ask instead.

### Always ask before coding if
- A formula or algorithm hasn't been specified
- A request could be interpreted two different ways — present both and ask
- Edge case behavior isn't defined
- The scope is ambiguous (just this function, or this function plus its callers?)
- Implementing something requires a design decision that belongs to the developer

### Output format
1. State what you're about to implement in one or two sentences before the code.
2. Flag any assumptions made, even small ones, at the end.
3. List follow-up questions — things that will need resolving before the next piece can be built.
4. Note edge cases the current spec doesn't cover that will eventually need handling.

If something is unclear mid-implementation, stop and ask rather than finish and note the problem at the end.

---

## Division of Labor

### Developer owns
- All game design decisions — formulas, tuning values, balance, win conditions
- Specifying how every system works before it gets implemented
- All JSON content — advisors, policies, events, AI personalities
- Map generation parameters (cluster density, culture vector shape, starting conditions)
- UI specifications — layout, flow, what each screen shows
- Code review — reading output and flagging anything that doesn't match intent
- Playtesting and feedback

### Claude owns
- All coding — TypeScript engine logic, React components, hooks, store, config
- Implementing every system exactly to spec — no guessing, no assumed design decisions
- TypeScript interfaces for all JSON data types
- Debugging on request
- Asking clarifying questions before writing anything ambiguous

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | |
| UI Framework | React | Component-based. Natural fit for a menu-heavy game. |
| Build Tool | Vite | Fast dev server. |
| Map Rendering | SVG (initial) | Rendered inside React. Upgrade to Canvas later if needed. |
| State Management | Zustand | Lightweight global store. |
| Data Files | JSON | All game content lives here. |
| Multiplayer | Firebase Firestore | Deferred to Phase 5. |
| Hosting | Vercel | Deferred to Phase 5. |

---

## Project Structure

```
hex-game/
  public/
    index.html

  src/
    data/                      ← JSON content files. Developer maintains these.
      advisors.json
      policies.json
      events.json
      ai_personalities.json

    engine/                    ← Pure TypeScript. Zero React imports. Ever.
      hex.ts                   ← Coordinate math, pixel conversion, neighbors
      mapGen.ts                ← Map generation — Voronoi-based, to spec
      tile.ts                  ← Tile type + state
      player.ts                ← Player state
      policy.ts                ← Policy loading, effect application
      loyalty.ts               ← Loyalty calculation, breakaway logic
      ai.ts                    ← AI personality + decision weighting
      phases.ts                ← Turn phase state machine
      events.ts                ← Random event resolution

    store/
      gameStore.ts             ← Zustand store for game state
      uiStore.ts               ← Zustand store for UI state

    components/
      map/
        HexGrid.tsx            ← SVG container, renders all tiles
        HexTile.tsx            ← Individual hex polygon
        MapFilters.tsx         ← Toggle overlays: owner / loyalty / defense
      ui/
        SidePanel.tsx          ← Selected tile info
        PolicyCard.tsx         ← Policy event card + choices
        AdvisorPanel.tsx       ← Advisor portraits + recommendations
        TurnBanner.tsx         ← Phase indicator, current turn, whose move
        IntelFeed.tsx          ← Mobilization phase log for waiting players
      screens/
        SetupScreen.tsx        ← Choose leader + advisors
        GameScreen.tsx         ← Main game view: map + panels
        EndScreen.tsx          ← Win/loss summary

    hooks/
      useGame.ts               ← Bridge: calls engine functions, updates store
      useMapLayout.ts          ← Computes hex pixel positions for current viewport

    types/
      index.ts                 ← Shared TypeScript types

    App.tsx                    ← Root component, screen routing
    main.tsx                   ← Vite entry point
```

---

## JSON Data Schemas

### `advisors.json`
```json
[
  {
    "id": "adv_environmentalist",
    "name": "Dr. Mara Voss",
    "archetype": "environmentalist",
    "traitWeights": {
      "ecology": 0.9,
      "militarism": 0.1,
      "religion": 0.2,
      "individualism": 0.4,
      "tradition": 0.5
    },
    "policyBias": {
      "coal_subsidies": -0.8,
      "green_energy_act": 0.9,
      "military_expansion": -0.6
    },
    "flavourText": "Progress that poisons the soil is no progress at all.",
    "imagePath": null
  }
]
```

### `policies.json`
```json
[
  {
    "id": "pol_coal_subsidies",
    "title": "Subsidize Coal Industry",
    "description": "Boost energy output but anger environmental factions.",
    "tags": ["economic", "energy"],
    "weight": 1.0,
    "choices": [
      {
        "label": "Approve",
        "alignmentShift": { "ecology": -0.15, "militarism": 0.05 },
        "loyaltyEffect": {
          "filter": { "trait": "ecology", "threshold": 0.6 },
          "modifier": -12
        },
        "flavour": "The furnaces burn bright tonight."
      },
      {
        "label": "Reject",
        "alignmentShift": { "ecology": 0.08 },
        "loyaltyEffect": {
          "filter": { "trait": "ecology", "threshold": 0.6 },
          "modifier": 6
        },
        "flavour": "The energy lobby is not pleased."
      }
    ]
  }
]
```

### `events.json`
```json
[
  {
    "id": "evt_separatist_movement",
    "title": "Separatist Movement",
    "description": "A cluster of tiles is organizing against your rule.",
    "trigger": "random",
    "weight": 0.8,
    "effect": {
      "type": "loyalty_penalty",
      "scope": "random_cluster",
      "amount": -15,
      "duration": 2
    }
  }
]
```

### `ai_personalities.json`
```json
[
  {
    "id": "ai_expansionist",
    "name": "Expansionist",
    "traitVector": {
      "ecology": 0.2,
      "militarism": 0.85,
      "religion": 0.3,
      "individualism": 0.4,
      "tradition": 0.5
    },
    "aggression": 0.8,
    "expansionism": 0.9,
    "decisionNoise": {
      "easy": 0.5,
      "medium": 0.25,
      "hard": 0.08
    }
  }
]
```

---

## Game Design Reference

### Concept
Annexia is a turn-based, roguelite-flavored political strategy game on a hexagonal map. Players govern a small territory and compete to meet a win condition — through expansion, suppression, diplomacy, or attrition — while managing the loyalty of a population that has its own values and can turn against them.

The core tension: your people are not yours by default. They have cultures, beliefs, and priorities. The player must either align with them or control them well enough that it doesn't matter.

### Design Philosophy
- **Roguelite, not roguelike.** No permadeath, but heavy randomness in map generation, policy events, and tile values. Every game feels different.
- **Menus, not micromanagement.** Most gameplay is making choices from menus, not dragging units.
- **Mechanics over aesthetics.** Depth lives in the numbers and systems.
- **Short games.** A session should be completable in one sitting.

---

### The Map

- Default size: 25×25 cells (~625 tiles total, roughly half land).
- Each tile is one of four states: **Water** (impassable), **Unclaimed**, **Barbarian-controlled**, or **Player-controlled**.
- Land and water use Voronoi-based generation with a single-continent bias. Small islands are expected and desirable.
- Each land tile has a **culture vector** — trait weights between 0 and 1. Neighboring tiles have similar but not identical vectors. Divergence increases with distance.
- Defense on barbarian tiles is randomly assigned at generation and does not regenerate.

---

### Players

Each player starts with 7 contiguous hexes. Before the first turn they select a leader and a council of 2–3 advisors.

**Player attributes:**
- **Alignment vector** — same trait space as tile culture vectors. Shifts with policy choices.
- **Confidence rating** — global trust measure. Influences action success rates. Declines when actions backfire or loyalty drops sharply.
- **Military strength** — resource pool for mobilization actions. Partially replenishes each turn.

---

### Culture & Loyalty

**Traits** (used in both culture vectors and alignment vectors):
- `ecology` — value placed on environmental protection
- `religion` — emphasis on religious identity and tradition
- `militarism` — appetite for strong defense and expansion
- `individualism` — preference for personal freedoms over collective control
- `tradition` — resistance to change

**Loyalty calculation** (formula to be specified before implementation):
1. **Cultural alignment** — cosine similarity between player alignment and tile culture vector
2. **Neighbor pressure** — adjacent tiles owned by better-aligned players pull loyalty down
3. **Suppression bonus** — stationed troops slow loyalty decay but build hidden resentment
4. **Historical momentum** — loyalty drifts toward its target over turns, doesn't snap

Loyalty is 0–100.

**Breakaway events** trigger at turn end when loyalty is below threshold (exact threshold TBD):
- Tile goes unclaimed (most common)
- Tile flips to a better-aligned adjacent player (less common)
- Breakaway chance increases with duration of low loyalty; decreases with suppression level

---

### Advisors

Each advisor has `traitWeights`, `policyBias`, and `flavourText`. On the council they:
- Visually endorse or warn against policy choices
- Passively nudge the player's alignment vector toward theirs each turn
- Unlock certain mobilization actions

Archetypes: Environmentalist, Nationalist, Energy Mogul, Military Hawk, Civil Libertarian, Religious Leader, Technocrat, Populist.

---

### Turn Structure

**Phase 1 — Policy Phase (simultaneous)**
All players receive 2–3 policy cards drawn from `policies.json` weighted by relevance. Each card has 2–3 choices. Players submit simultaneously; resolution happens all at once. Effects: alignment shifts, loyalty updates, breakaway evaluation, random events queued.

**Phase 2 — Mobilization Phase (sequential)**
Players act in randomized order. Actions: Annex, Invade, Suppress, Reinforce, Propaganda campaign. Waiting players receive an intel feed of the active player's actions.

---

### AI Opponents

AI uses a personality vector (same trait space) to weight policy decisions. Difficulty scales decision noise, not values — a pacifist AI on hard is a competent pacifist.

- **Easy** — high noise, ignores threats, plays suboptimally
- **Medium** — moderate noise, standard evaluation
- **Hard** — low noise, proactive threat assessment, targets low-loyalty border tiles

Archetypes: Expansionist, Isolationist, Militarist, Diplomat, Populist, Theocrat.

---

### Win Conditions
- **Majority control** — own more than 50% of land tiles
- **Dominance** — control the entire map
- **Time limit** — most tiles after N turns
- **Stability** — average loyalty above 75 across all tiles for 3 consecutive turns

---

### Out of Scope (for now)
Multiplayer, advisor overrule mechanic, portraits, sound, mobile layout, diplomacy, economy beyond military strength, tech tree.

---

## Development Phases

### Phase 0 — Bench Setup
*Goal: something visible on screen. No game logic.*

Deliver: Vite + React + TS setup, full folder structure, `hex.ts`, `App.tsx` with a static 10×10 hex grid, Zustand store skeletons, JSON files with 2–3 example entries, TypeScript interfaces for all data types.

Exit: A static hex grid renders in the browser.

---

### Phase 1 — Static World
*Goal: a real generated map you can click on.*

Deliver: `mapGen.ts` (Voronoi-based, to spec), `HexGrid.tsx`, `HexTile.tsx`, `SidePanel.tsx` (tile inspector).

Exit: Map generates, tiles are colored by owner, clicking a tile shows its data.

---

### Phase 2 — Core Mechanics
*Goal: a turn has meaning.*

Deliver: `loyalty.ts`, `policy.ts`, `phases.ts`, `PolicyCard.tsx`, `TurnBanner.tsx`, mobilization action handlers, win condition check.

Exit: Full turn playable end-to-end. Loyalty shifts, breakaways occur, turn resolves.

---

### Phase 3 — AI & Playability
*Goal: a completable single-player game.*

Deliver: `ai.ts`, `events.ts`, `AdvisorPanel.tsx`, `SetupScreen.tsx`, `EndScreen.tsx`, difficulty selection.

Exit: Full game playable vs. 1–3 AI opponents. Win or lose.

---

### Phase 4 — Polish
*Goal: the game feels like a game, not a debug tool.*

Deliver: Map filter overlays, smooth pan/scroll, styled policy cards and panels, placeholder portraits, tile transition animations.

Exit: Showable to someone without apology.

---

### Phase 5 — Multiplayer
*Deferred until the game is fun solo.*

Deliver: Firebase setup, room flow, simultaneous policy sync, sequential mobilization, intel feed, Vercel hosting.
