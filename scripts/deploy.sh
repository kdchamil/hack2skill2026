#!/usr/bin/env bash
# Build and deploy Five Seconds to Cloud Run via Cloud Build.
# Usage: scripts/deploy.sh PROJECT_ID [REGION=asia-southeast1]
set -euo pipefail

PROJECT_ID="${1:-}"
REGION="${2:-asia-southeast1}"
SERVICE="fiveseconds"
FORBIDDEN_PROJECT="manike-system-prod"

if [[ -z "$PROJECT_ID" ]]; then
  echo "usage: $0 PROJECT_ID [REGION=asia-southeast1]" >&2
  exit 2
fi
if [[ "$PROJECT_ID" == "$FORBIDDEN_PROJECT" ]]; then
  echo "refusing: $FORBIDDEN_PROJECT is not a target for this prototype" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

SHA="$(git rev-parse --short HEAD 2>/dev/null || echo manual)"
echo "==> Submitting Cloud Build (project=$PROJECT_ID region=$REGION tag=$SHA)"
gcloud builds submit . \
  --config cloudbuild.yaml \
  --project "$PROJECT_ID" \
  --substitutions "_SHORT_SHA=${SHA},_REGION=${REGION}"

URL="$(gcloud run services describe "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)')"
echo "==> Service URL: $URL"
