# FiveSeconds

Point your phone at a packaged product and understand it in five seconds, in English, Sinhala or Tamil. Each household member gets a verdict, for example "Avoid for Amaya: contains sesame".

**Live demo:** https://fiveseconds-gqvzirnfpa-as.a.run.app (Cloud Run, project `fiveseconds-hr-2026`, region `asia-southeast1`, real Gemini on Vertex AI).

Gemini reads and explains the pack. Deterministic code calculates the grade and decides the verdicts. Household details never leave the phone.

Measured live on 18 Oct 2026: a demo scan takes 2.4 to 3.5 s end to end in English, Sinhala and Tamil.

## How it works

An ADK agent in the backend chooses each next step from the scan state. It makes these decisions and records each one in the trace:

1. **Extract** (`extract_label`): Gemini reads 1 to 4 photos into a typed schema, with a confidence score per field.
2. **Check the capture** (`assess_capture`): if the ingredients or the allergen statement are unreadable, the app asks for a reshoot (`needs_reshoot` event, plus a finding in the result).
3. **Barcode route** (`lookup_open_food_facts`): with a numeric barcode, the agent asks Open Food Facts. It adds the Eco-Score as a verified planet finding. Without a barcode it skips the lookup and says why.
4. **Rules** (`run_rules`): allergens, diets, additives, nutrition levels, dates, packaging and claims, all in code.
5. **Ground unknown terms** (`resolve_terms`): for up to 3 ingredient terms the dictionaries miss, Gemini uses Google Search grounding (3 s timeout). Grounded terms become sourced findings and the rules run once more. If grounding fails, the terms go to the commentary step.
6. **Write commentary** (`write_commentary`): Gemini writes short headlines and reasons in the chosen language. Code checks the wording.

The web app shows "Read by Gemini in X s - N model calls - grade set by rules", with a tap-to-open list of every step. Mock mode and repeat scans show the same line with their own counts.

Model IDs and locations are set in `backend/app/config.py` and can be overridden by environment variables. Gemini-TTS reads the text aloud. A 503 from TTS makes the app show the text instead.

## Where AI is used, and where plain code is

| Step | AI (Gemini on Vertex AI) | Plain code |
| --- | --- | --- |
| Read the pack | Flash multimodal read of 1-4 photos into a typed schema, with per-field confidence | Schema validation; fields below 0.6 confidence become Unknown; date parsing |
| Capture check | None | Reshoot rule for unreadable ingredients or allergen statement |
| Barcode lookup | None | Open Food Facts call only for numeric barcodes; Eco-Score added as info |
| Odd ingredient names | Google Search grounding, only for terms the dictionaries miss (max 3) | Allergen, diet and additive matching from bundled dictionaries (7 languages) |
| Test claims | None | "Sugar free" vs dextrose, "No added MSG" vs E621, thresholds |
| Explain and speak | Writes short headlines and reasons; Gemini-TTS speaks them | Glossary check, number guard, "safe" ban, template fallback |
| Never AI | | Severity, evidence tier, grade, nutrient levels, expiry, household verdicts, encryption |

## Architecture

- **Backend** (`backend/`, FastAPI, Python 3.12): the ADK agent in `backend/app/agent/` runs the steps above. A direct pipeline is kept as a fallback (`FIVESEC_PIPELINE=direct`). Choosing the next step makes no model calls.
- **Rules engine** (`backend/app/rules`): every finding carries a tier and sources.
- **Cache** (`backend/app/store`): see below.
- **Rate limits**: see below.
- **Web** (`web/`, React + TypeScript + Vite PWA): streams the analysis over SSE, computes household verdicts on the phone, and stores profiles in IndexedDB encrypted with AES-256-GCM (PIN, recovery code, optional passkey PRF).
- **Streaming**: `POST /api/scan` returns `analysis`, then `commentary`, then `done` events, and `needs_reshoot` when the photo needs another try.

## Model calls

- **First scan**: at most 3 model calls when grounding runs (extract, grounding, commentary). Otherwise at most 2.
- **Repeat scan**: 0 model calls, from the cache.
- Limit set in NFR-15. Relaxed on 18 Oct 2026 for Search grounding.

## Cache

- Firestore holds three collections: label extractions (keyed by barcode and image hashes), commentary, and TTS audio. An in-memory LRU sits in front of it.
- Every document has an `expires_at` field for a Firestore TTL policy. The default lifetime is 30 days (`FIVESEC_CACHE_TTL_DAYS`).
- `FIVESEC_CACHE` picks `firestore` or `memory`. By default Firestore is used when `GOOGLE_CLOUD_PROJECT` is set and mock mode is off.
- Any Firestore error falls back to memory and never fails a scan.
- Photos are never stored.
- Honest status: live Firestore needs `scripts/setup_gcp.sh` to be run, and it is not yet verified live.

## Rate limits

- Per-IP token bucket: `FIVESEC_RATE_PER_MIN` (default 20).
- Daily budget: `FIVESEC_DAILY_BUDGET` (default 300).
- Both apply per instance. Demo fixture scans are exempt. Over the limit, the API returns 429.

## Privacy guarantees (and how they are tested)

- The scan request carries only images, barcode, language, market and an optional demo fixture name. Any other form field gets a 400 (`backend/tests/api`).
- Verdicts are computed in the browser from `HouseholdFacts`. Member profiles are never sent. Playwright checks every request in the mocked and the real-backend runs and asserts that no URL or body contains member aliases or profile values (`web/tests/e2e/privacy.spec.ts`, `web/tests/e2e-real/demo.spec.ts`).
- Demo packs show a labelled "Sample household" when no household is set up. It is made-up, held in memory, and never stored or sent.
- Photos are never written to disk or logged. No API keys: Application Default Credentials only.
- "Delete all my data" wipes the encrypted store (tested).

## Evidence tiers

`Verified` (e.g. halal mark found in the bundled registry) > `Label-stated` (read from the pack) > `Inferred` (derived from ingredients, or a grounded lookup) > `Unknown` (illegible or no data; carbon is always "No reliable data"). A tier is never upgraded, and wording is "may" / "consider", never "safe".

The grade sentence says what pulled the grade down and what helped it.

## Run locally (mock mode, no cloud needed)

```bash
cd web && npm ci && npm run build
cd ../backend && FIVESEC_MOCK=1 WEB_DIST=../web/dist uv run uvicorn app.main:app --port 8080
# open http://localhost:8080 , Household -> create PIN -> "Add demo household" -> Scan -> "Try a demo pack"
```

Mock mode uses 10 bundled fixture extractions and template commentary. TTS returns 503, so Listen falls back to on-screen text. Demo fixtures also work in live mode as a judge fallback: the extraction call is skipped, and the rest of the pipeline runs.

Docker: `docker build -t fiveseconds . && docker run -p 8080:8080 -e FIVESEC_MOCK=1 fiveseconds`

## Deploy

Cloud Run on Google Cloud. See [docs/DEPLOY.md](docs/DEPLOY.md). The scripts refuse the production project `manike-system-prod`.

## Tests (last run, merged main, 18 Oct 2026)

| Suite | Command | Result |
| --- | --- | --- |
| Backend (rules, agent, API, store) | `cd backend && uv run pytest -q` | 303 passed |
| Web unit | `cd web && npm test` | 64 passed |
| Web e2e (mocked API, axe light + dark) | `cd web && npx playwright test` | 13 passed |
| Web e2e (real backend, mock mode) | `cd web && npm run e2e:real` | 3 passed (includes the 3-minute judge demo) |

## Eval

[eval/results/results.md](eval/results/results.md): rules-only baseline vs Gemini pipeline. These are **offline numbers on 10 fixture texts, not photographs**. Both sides read identical text, so 100% allergen recall and precision is expected. It is not the uplift result. The 30-photo golden set is pending.

## Known limitations

- The 30-photo golden set is pending. Eval numbers are offline fixture text only.
- Live Search grounding and live Firestore are not yet verified.
- The rate limiter is per instance, so it is not a precise global quota.
- Sinhala TTS (`si-LK`) is Preview on Google's side. Expect lower quality or failures, which fall back to text.
- Sinhala and Tamil strings are awaiting native review.
- Passkey (WebAuthn PRF) unlock is untested on a real device. PIN and recovery code are tested.
- Not implemented: Firebase Hosting, App Check, and Model Armor.
- Oats are not treated as an allergen. Gluten-free becomes Unknown (Inferred) unless a gluten-free mark is read.
- The halal and kosher registry is a small bundled list. Recall matching, price and diary features are out of this cut.
- The real-backend e2e cannot inspect streamed multipart scan bodies in Chromium, so field names are enforced server-side instead.
- Decision support, not medical advice.
