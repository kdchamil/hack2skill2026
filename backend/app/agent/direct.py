"""Plain-async pipeline (same steps as the ADK agent). Used when FIVESEC_PIPELINE=direct or ADK fails."""

from __future__ import annotations

from app.agent.steps import STEPS, ScanState, finish
from app.models import ScanResponse


async def run_direct(st: ScanState) -> ScanResponse:
    for step in STEPS:
        await step(st)
    return finish(st)
