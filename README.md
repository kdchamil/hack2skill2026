# Five Seconds

Point your phone at a packaged product and understand it in five seconds, in English, Sinhala or Tamil, with a per-member household verdict (for example "Avoid for Amaya: contains sesame").
Gemini reads and explains the pack; deterministic code calculates and decides. Household details never leave the phone.

## Where AI is used, and where plain code is

| Step | AI (Gemini on Vertex AI) | Plain code |
| --- | --- | --- |
| 1. Read the pack | Flash multimodal read of 1-4 photos into a typed schema, with per-field legibility | Schema validation; fields below 0.6 confidence become Unknown; date parsing |
| 2. Resolve odd ingredient names | Only terms the dictionary misses (merged into the commentary call) | Allergen, diet and additive matching from bundled dictionaries (7 languages) |
| 3. Test claims | Classification is rule-first; model only where no rule settles it | "Sugar free" vs dextrose, "No added MSG" vs E621, thresholds |
| 4. Explain and speak | Writes short headlines and reasons in the chosen language; Gemini-TTS speaks them | Glossary check, number guard, "safe" ban, template fallback |
| Never AI | | Severity, evidence tier, nutrient levels, expiry, household verdicts, encryption |

## Architecture

- **Backend** (`backend/`, FastAPI, Python 3.12): a Google ADK custom agent runs tool steps `extract_label` -> `lookup_open_food_facts` -> `run_rules` -> `check_claims` -> `resolve_terms` -> `write_commentary`, with a direct pipeline as fallback. Orchestration itself makes no model calls.
- **Model calls**: at most 2 on a first scan (Flash structured extraction, then one merged resolve + commentary call), 0 on a repeat scan (cache by barcode + image hash). Gemini-TTS via Cloud Text-to-Speech, cached; a 503 makes the app show the text instead.
- **Rules engine** (`backend/app/rules`): allergens, diets, additives, nutrition levels (UK FSA thresholds), dates, packaging codes, claims. Every finding carries a tier and sources.
- **Web** (`web/`, React + TypeScript + Vite PWA): streams the analysis over SSE, computes household verdicts on the phone, stores profiles in IndexedDB encrypted with AES-256-GCM (PIN, recovery code, optional passkey PRF).
- **Streaming**: `POST /api/scan` returns `analysis`, then `commentary`, then `done` events.

## Privacy guarantees (and how they are tested)

- The scan request carries only images, barcode, language, market and an optional demo fixture name. Any other form field gets a 400 (`backend/tests/api`).
- Verdicts are computed in the browser from `HouseholdFacts`; member profiles are never sent. Playwright intercepts every request in both the mocked and the real-backend run and asserts no URL or body contains member aliases or profile values (`web/tests/e2e/privacy.spec.ts`, `web/tests/e2e-real/demo.spec.ts`).
- Photos are never written to disk or logged. No API keys: Application Default Credentials only.
- "Delete all my data" wipes the encrypted store (tested).

## Evidence tiers

`Verified` (e.g. halal mark found in the bundled registry) > `Label-stated` (read from the pack) > `Inferred` (derived from ingredients) > `Unknown` (illegible or no data; carbon is always "No reliable data"). A tier is never upgraded, and wording is "may" / "consider", never "safe".

## Run locally (mock mode, no cloud needed)

```bash
cd web && npm ci && npm run build
cd ../backend && FIVESEC_MOCK=1 WEB_DIST=../web/dist uv run uvicorn app.main:app --port 8080
# open http://localhost:8080 , Household -> create PIN -> "Add demo household" -> Scan -> "Try a demo pack"
```

Mock mode uses 10 bundled fixture extractions and template commentary; TTS returns 503 so Listen falls back to on-screen text. Demo fixtures also work in live mode as a judge fallback (the extraction call is skipped, the rest of the pipeline runs).

Docker: `docker build -t fiveseconds . && docker run -p 8080:8080 -e FIVESEC_MOCK=1 fiveseconds`

## Deploy

Cloud Run on Google Cloud, see [docs/DEPLOY.md](docs/DEPLOY.md). Scripts refuse the production project and have not been run against GCP.

## Tests (last run)

| Suite | Command | Result |
| --- | --- | --- |
| Backend (rules + API) | `cd backend && uv run pytest -q --cov=app/rules` | 225 passed, rules coverage 99% |
| Web unit | `cd web && npm test` | 32 passed |
| Web e2e (mocked API, axe light + dark) | `cd web && npx playwright test` | 5 passed |
| Web e2e (real backend, mock mode) | `cd web && npm run e2e:real` | 1 passed (the 3-minute judge demo) |
| Docker | image builds; `/api/health`, fixture scan and SPA fallback verified on the container | OK |

## Eval

[eval/results/results.md](eval/results/results.md): rules-only baseline vs Gemini pipeline. These are **offline numbers on 10 fixture texts, not photographs**: both sides read identical text, so 100% allergen recall/precision is expected and is not the uplift result. The 30-photo golden set is pending; live mode is untested.

## Known limitations / not yet verified

- Live Gemini extraction/commentary and Gemini-TTS calls are untested: Google Cloud auth is not set up yet. Everything above ran in mock mode.
- Model IDs (`gemini-3.8-flash`, `gemini-2.5-flash-tts`) were taken from docs and must be confirmed against the project; they are env-overridable.
- Sinhala TTS (`si-LK`) is Preview on Google's side; expect lower quality or failures, which fall back to text.
- Passkey (WebAuthn PRF) unlock is untested on a real device; PIN and recovery code are tested.
- Oats are not treated as an allergen; gluten-free becomes Unknown (Inferred) unless a gluten-free mark is read.
- Halal/kosher registry is a small bundled list; recall matching, price and diary features are out of this cut.
- The real-backend e2e cannot inspect streamed multipart scan bodies in Chromium; field names are enforced server-side instead.
- Decision support, not medical advice.
