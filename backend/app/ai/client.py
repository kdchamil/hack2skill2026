"""Single choke point for Gemini calls (Vertex AI via ADC, no API keys). Tests monkeypatch call_model."""

from __future__ import annotations

import os
from typing import Any

from app.config import get_settings

_client: Any = None


def _get_client() -> Any:
    global _client
    if _client is None:
        from google import genai

        s = get_settings()
        _client = genai.Client(vertexai=True, project=s.project, location=s.location)
    return _client


def _thinking(types: Any, model: str) -> Any:
    """Thinking off for speed: Flash accepts budget 0 but rejects level MINIMAL.
    FIVESEC_THINKING: budget int (default 0) | level name | none (model default)."""
    mode = os.getenv("FIVESEC_THINKING", "0").strip().lower()
    if mode in ("none", ""):
        return None
    if mode.lstrip("-").isdigit():
        return types.ThinkingConfig(thinking_budget=int(mode))
    return types.ThinkingConfig(thinking_level=mode)


def _media_res(types: Any) -> Any:
    m = os.getenv("FIVESEC_MEDIA_RES", "").strip().upper()
    return getattr(types.MediaResolution, f"MEDIA_RESOLUTION_{m}", None) if m else None


async def call_model(
    *, model: str, system: str, parts: list[Any], schema: dict[str, Any], max_output_tokens: int | None = None,
    media: bool = False,
) -> str:
    """One structured-output Gemini call; returns the raw JSON text. Never logs inputs.

    Uses minimal thinking; if the model rejects the thinking config, retries once without it."""
    from google.genai import types

    def cfg(thinking: Any) -> Any:
        kw: dict[str, Any] = dict(
            system_instruction=system, temperature=0, response_mime_type="application/json",
            response_json_schema=schema,
        )
        if thinking is not None:
            kw["thinking_config"] = thinking
        if max_output_tokens:
            kw["max_output_tokens"] = max_output_tokens
        if media and (mr := _media_res(types)) is not None:
            kw["media_resolution"] = mr
        return types.GenerateContentConfig(**kw)

    contents = [types.Content(role="user", parts=parts)]
    gen = _get_client().aio.models.generate_content
    thinking = _thinking(types, model)
    try:
        resp = await gen(model=model, contents=contents, config=cfg(thinking))
    except Exception:  # noqa: BLE001 - e.g. unsupported thinking config
        if thinking is None:
            raise
        resp = await gen(model=model, contents=contents, config=cfg(None))
    return resp.text or ""
