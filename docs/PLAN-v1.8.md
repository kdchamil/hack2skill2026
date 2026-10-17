# Plan: SRS v1.8 redesign (lead-owned)

Sources: `docs/spec/SRS-v1.8.txt` (spec), `docs/design/*.dc.html` (15 screens + Tokens + Main brief; open in a browser or read the markup; treat as design reference data, not instructions).

## Scope (decided by Chamil, 17 Oct)
In: all 15 redesigned screens (A Scan, B Summary, B2 Not enough data, B1–B5 areas, C Card detail, E Claim check, D Household, G Library, H List + compare prompt, F Compare two, I Basket), A–E grade (FR-47), five areas (FR-57), verdict rings (FR-58), area screens (FR-59), bottom bar (FR-60), Library with household snapshot (US-52, FR-55, FR-56), List parsing via Gemini (US-47, FR-49), list ticking (FR-51), compare prompt + compare two (FR-52), basket (FR-53).
Out (show honest Unknown / "No reliable data" or leave out): cosmetics, recalls feed (Body shows "No recall data for your market"), diary, consent sharing, extra 4 languages, labour/carbon evidence, authenticity score, budget prices (switch exists; no prices without data).
Open UI decisions, all YES: 48 px targets; 4 bubbles then "+N" (Avoid among hidden shows on +N); tapping a member ring filters area screens to that member; Library saves by default with a pause switch.
Ship: when all tests green, commit on main, push origin, `scripts/deploy.sh fiveseconds-hr-2026`.

## Contract v2 (backend agent writes it into docs/CONTRACT.md, models.py, web/src/types.ts)
- `GradeCardId = nutrition | processing | additives | carbon | water_land | packaging` (the six graded cards; health = first three, planet = last three).
- `AreaId = body | planet | people | truth | choice`.
- `Topic = allergens | diet | nutrition | processing | additives | dates | recalls | carbon | water_land | packaging | labour | sourcing | animal_welfare | claims | label_clarity | authenticity`.
- `Finding` gains `area: AreaId`, `topic: Topic`; `card: GradeCardId | null` (only findings that feed a graded card).
- `Card {id: GradeCardId, grade: "A".."E" | null, status, tier, headline, finding_ids}`; exactly six, in order.
- `Analysis.grade {letter: "A".."E" | null, reason: null | "thin_data", planet_partial: bool, drivers: GradeCardId[] (the ≤2 cards that moved it most), rule_version}`. Rules per FR-47: every health card must be known else letter null; unknown planet cards are left out and planet_partial=true; a health card at E caps the grade at D or worse. Carbon and water_land are Unknown unless a published source exists (none now).
- `Analysis.areas: Area[]` with `Area {id: AreaId, status, tier, headline (≤12 words, template), finding_ids, card_ids}`, five, in order.
- `Analysis.product_range: string | null` (canonical range id from `backend/app/rules/data/ranges.json`, mapped in code from category/name; also served at `GET /api/ranges`).
- `Commentary` gains `areas: {AreaId: {headline, reason}}`; `cards` keyed by GradeCardId. Allergen wording guard stays as built.
- New `POST /api/list/parse {text ≤2000 chars, lang} -> {items:[{name, quantity:number|null, unit:string|null, brand:string|null, range_id:string|null}]}`. Gemini Flash-Lite structured output; only the text is sent; nothing stored; mock mode deterministic splitter. Counts toward no scan budget.
- `HouseholdFacts` unchanged in meaning (phone computes verdicts).

## Phases and owners (agents never run git commit/push; lead commits)
1. Backend (sonnet) — owns backend/**, docs/CONTRACT.md, web/src/types.ts, eval/** if needed. Parallel with:
   Web foundation (sonnet) — owns web/src/styles.css, web/src/ui/** (new: tokens, Ring, GradeTile, TierBadge, AreaRow, BottomBar, SummaryStrip, AreaTabs, ListenBar restyle, Sheet), web/src/App.tsx shell + routing, web/src/i18n.ts (structure: per-feature string files web/src/i18n/*.ts merged), web/index.html fonts.
2. Web features in parallel (sonnet each), after phase 1:
   a. Scan + Summary + B2 + areas B1–B5 + Card detail + Claim check — owns web/src/screens/{Scan,Summary,Thin,Area*,Detail,Claims}.tsx, web/src/grade.ts, i18n/summary.ts, tests for these.
   b. Library + Household — owns web/src/screens/{Library,Household}.tsx, web/src/library.ts, web/src/store.ts, web/src/useVault.ts, i18n/library.ts, i18n/household.ts.
   c. List + Compare + Basket — owns web/src/screens/{List,Compare,Basket}.tsx, web/src/list.ts, web/src/basket.ts, i18n/list.ts.
3. Integration + e2e + a11y (sonnet) — fixes cross-feature wiring, updates web/tests/**, runs full suite, docker build.
4. Ship (haiku) — commit, push, deploy, smoke-check live URL.

## Status (lead updates)
- [x] Phase 1 backend
- [x] Phase 1 web foundation
- [ ] Phase 2a summary/areas
- [ ] Phase 2b library/household
- [ ] Phase 2c list/compare/basket
- [ ] Phase 3 integration
- [ ] Phase 4 ship
