# Deploying Five Seconds

Target: Cloud Run service `fiveseconds` in `asia-southeast1`, image in Artifact Registry repo `fiveseconds`.
Never deploy to `manike-system-prod`; the scripts refuse it.

## One-time setup

1. Log in with the account you choose:
   ```sh
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
2. For local Vertex AI calls, set Application Default Credentials:
   ```sh
   gcloud auth application-default login
   ```
3. Enable APIs, create the Artifact Registry repo, the runtime service account and IAM bindings (idempotent):
   ```sh
   scripts/setup_gcp.sh YOUR_PROJECT_ID            # region defaults to asia-southeast1
   ```

The runtime service account `fiveseconds-run` gets `roles/aiplatform.user` and `roles/datastore.user`.
Text-to-Speech needs no extra role once the API is enabled.

### Firestore cache

`setup_gcp.sh` runs the following (shown here so you can run them by hand). Firestore holds only label extractions
(`label_extractions`), commentary (`commentary`) and TTS audio (`tts_audio`); no photos or user data. Auth is ADC.
```sh
gcloud services enable firestore.googleapis.com --project YOUR_PROJECT_ID
gcloud firestore databases create --database="(default)" --location=asia-southeast1 \
  --type=firestore-native --project YOUR_PROJECT_ID
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:fiveseconds-run@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user" --condition=None
# TTL policy on the expires_at field (30 days by default; FIVESEC_CACHE_TTL_DAYS)
for C in label_extractions commentary tts_audio; do
  gcloud firestore fields ttls update expires_at --collection-group=$C --enable-ttl --async --project YOUR_PROJECT_ID
done
```
The cache is chosen by `FIVESEC_CACHE` (`firestore` or `memory`); by default Firestore is used when
`GOOGLE_CLOUD_PROJECT` is set and mock mode is off. Any Firestore error falls back to in-memory caching.

### Rate limits

`/api/scan`, `/api/commentary`, `/api/tts` and `/api/list/parse` share a per-IP token bucket
(`FIVESEC_RATE_PER_MIN`, default 20) and a daily request budget (`FIVESEC_DAILY_BUDGET`, default 300), both per
instance. Demo fixture scans are exempt. Over the limit the API returns 429 with a JSON `detail`.

## Deploy

```sh
scripts/deploy.sh YOUR_PROJECT_ID
```

This submits `cloudbuild.yaml`: builds the image, pushes `:<git short sha>` and `:latest`,
then deploys to Cloud Run with `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`,
`FIVESEC_MOCK=0`, 1 GiB, 1 CPU, 0 to 5 instances, concurrency 20, 60 s timeout.
The script prints the service URL at the end.

## Local run (mock mode, no cloud calls)

```sh
cd web && npm run build && cd ../backend
FIVESEC_MOCK=1 uv run uvicorn app.main:app --port 8080
```

Open http://localhost:8080. Configuration reference: `.env.example`.
