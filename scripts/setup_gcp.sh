#!/usr/bin/env bash
# One-time (idempotent) GCP setup for the Five Seconds prototype.
# Usage: scripts/setup_gcp.sh PROJECT_ID [REGION=asia-southeast1]
#
# Enables APIs, creates the Artifact Registry repo, creates the Cloud Run
# runtime service account (roles/aiplatform.user only) and grants the Cloud
# Build service account what it needs to deploy.
#
# Text-to-Speech needs no IAM role beyond the API being enabled, so the
# runtime SA does not get a TTS role.
set -euo pipefail

PROJECT_ID="${1:-}"
REGION="${2:-asia-southeast1}"
REPO="fiveseconds"
RUN_SA="fiveseconds-run"
FORBIDDEN_PROJECT="manike-system-prod"

if [[ -z "$PROJECT_ID" ]]; then
  echo "usage: $0 PROJECT_ID [REGION=asia-southeast1]" >&2
  exit 2
fi
if [[ "$PROJECT_ID" == "$FORBIDDEN_PROJECT" ]]; then
  echo "refusing: $FORBIDDEN_PROJECT is not a target for this prototype" >&2
  exit 1
fi

RUN_SA_EMAIL="${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "==> Project: $PROJECT_ID (number $PROJECT_NUMBER), region: $REGION"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  texttospeech.googleapis.com \
  --project "$PROJECT_ID"

echo "==> Artifact Registry repo: $REPO"
if ! gcloud artifacts repositories describe "$REPO" \
     --location "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location "$REGION" \
    --description="Five Seconds container images" \
    --project "$PROJECT_ID"
fi

echo "==> Runtime service account: $RUN_SA_EMAIL"
if ! gcloud iam service-accounts describe "$RUN_SA_EMAIL" \
     --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUN_SA" \
    --display-name="Five Seconds Cloud Run runtime" \
    --project "$PROJECT_ID"
fi

echo "==> Runtime SA roles (aiplatform.user only; TTS needs no extra role)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUN_SA_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None >/dev/null

echo "==> Cloud Build service account: $CB_SA"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin" \
  --condition=None >/dev/null

gcloud iam service-accounts add-iam-policy-binding "$RUN_SA_EMAIL" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project "$PROJECT_ID" >/dev/null

gcloud artifacts repositories add-iam-policy-binding "$REPO" \
  --location "$REGION" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer" \
  --project "$PROJECT_ID" >/dev/null

echo "==> Done. Next: scripts/deploy.sh $PROJECT_ID"
