# Progress log

- 2026-10-17 lead: spec read, contract written, git init.
- 2026-10-17 scaffold: backend uv project + models.py + web vite scaffold done (tests: 4 passed)
- 2026-10-17 deploy: Dockerfile (node22 web build + python3.12-slim/uv 0.8.22 runtime, non-root), .dockerignore, cloudbuild.yaml (build/push/deploy fiveseconds), scripts/setup_gcp.sh and scripts/deploy.sh (refuse manike-system-prod, not executed against GCP), .env.example, docs/DEPLOY.md. bash -n passed; docker build: backend stage OK; web stage fails (web/src/App.tsx missing, web agent in progress).
- 2026-10-17 api: config/ai (extract, commentary+merged resolve, tts, glossary)/agent (ADK BaseAgent + direct fallback)/api (SSE scan, commentary, tts, report, fixtures, static SPA, security headers)/main done; 21 tests green in tests/api (rules stubbed in tests until rules agent lands).
- 2026-10-17 rules: deterministic engine analyze(extraction, market, resolved, today) + 10 fixtures + data dictionaries (allergens 7 langs, ~85 additives, diets, halal/kosher registry), 197 tests, 99% coverage
- 2026-10-17 eval: harness in eval/ (golden manifest 30 pending photo + 10 fixture text entries, baseline.py using rules.ingredients.scan_allergens, run_eval.py offline|live, results.md/json). Offline run on fixture text: baseline and pipeline both 100% allergen recall and precision; field accuracy baseline 90.6% (regex misses month-name dates) vs pipeline 100%. Not the golden-set result; live mode untested (needs ADC, google-cloud-vision, API).
