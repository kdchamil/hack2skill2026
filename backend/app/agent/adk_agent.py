"""Google ADK custom agent. BaseAgent subclass whose _run_async_impl runs the tool steps in order and yields
one Event per tool. The agent itself never calls a model; only the tools do. The per-request ScanState (which
holds image bytes) lives in an in-process registry keyed by run id; only the run id goes through the ADK session.
"""

from __future__ import annotations

import uuid
from typing import AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.adk.runners import InMemoryRunner
from google.genai import types

from app.agent.steps import STEPS, ScanState, finish
from app.models import ScanResponse

_RUNS: dict[str, ScanState] = {}
APP_NAME = "five_seconds"


class ScanAgent(BaseAgent):
    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        run_id = ctx.user_content.parts[0].text  # type: ignore[union-attr]
        st = _RUNS[run_id]
        for step in STEPS:
            await step(st)
            last = st.trace[-1]
            yield Event(
                author=self.name,
                invocation_id=ctx.invocation_id,
                custom_metadata={"tool": last["tool"], "ms": last["ms"], "model_calls": last["model_calls"]},
            )


_runner: InMemoryRunner | None = None


def _get_runner() -> InMemoryRunner:
    global _runner
    if _runner is None:
        _runner = InMemoryRunner(agent=ScanAgent(name="scan_agent"), app_name=APP_NAME)
    return _runner


async def run_adk(st: ScanState) -> ScanResponse:
    runner = _get_runner()
    run_id = uuid.uuid4().hex
    _RUNS[run_id] = st
    sess = await runner.session_service.create_session(app_name=APP_NAME, user_id="anon")
    try:
        msg = types.Content(role="user", parts=[types.Part(text=run_id)])
        async for _ in runner.run_async(user_id="anon", session_id=sess.id, new_message=msg):
            pass
    finally:
        _RUNS.pop(run_id, None)
        try:
            await runner.session_service.delete_session(app_name=APP_NAME, user_id="anon", session_id=sess.id)
        except Exception:  # noqa: BLE001
            pass
    return finish(st)
