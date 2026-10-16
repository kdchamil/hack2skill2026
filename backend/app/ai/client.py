"""Single choke point for Gemini calls (Vertex AI via ADC, no API keys). Tests monkeypatch call_model."""

from __future__ import annotations

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


async def call_model(
    *, model: str, system: str, parts: list[Any], schema: dict[str, Any]
) -> str:
    """One structured-output Gemini call; returns the raw JSON text. Never logs inputs."""
    from google.genai import types

    cfg = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0,
        response_mime_type="application/json",
        response_json_schema=schema,
    )
    resp = await _get_client().aio.models.generate_content(
        model=model, contents=[types.Content(role="user", parts=parts)], config=cfg
    )
    return resp.text or ""
