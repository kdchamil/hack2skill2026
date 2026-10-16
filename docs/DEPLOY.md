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

The runtime service account `fiveseconds-run` gets `roles/aiplatform.user` only.
Text-to-Speech needs no extra role once the API is enabled.

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
