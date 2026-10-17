"""Plain-async pipeline (same policy and tools as the ADK agent). Used when FIVESEC_PIPELINE=direct or ADK fails."""

from __future__ import annotations

from app.agent.steps import TOOL_FNS, ScanState, finish, next_tool
from app.models import ScanResponse


async def run_direct(st: ScanState) -> ScanResponse:
    while (tool := next_tool(st)) is not None:
        await TOOL_FNS[tool](st)
    return finish(st)
