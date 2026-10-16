"""Environment settings. Read at call time so tests can monkeypatch env.

Latency (2026-10-17, global endpoint; asia-southeast1 has no Gemini 3.x): gemini-3.5-flash-lite with thinking_budget=0
gave ~3.3 s extract / ~2.4 s commentary with identical findings; gemini-3.8-flash took 10-150 s on the same call, so it is
only the fallback model.

Model IDs verified 2026-10-17 against Google Cloud docs:
- Vertex "Model versions" page: gemini-3.8-flash (rel. 2026-09-02) and gemini-3.5-flash are in the
  >=12-month availability table; gemini-2.5-pro retires 2026-10-20 so it is NOT used as default.
- Gemini-TTS page (Cloud Text-to-Speech): gemini-2.5-flash-tts / gemini-2.5-pro-tts (no Preview label);
  gemini-3.1-flash-tts-preview is Preview. Languages: en-US GA, ta-IN GA, si-LK Preview.
  Voices are language-agnostic names (e.g. Kore, Charon, Puck). Python: VoiceSelectionParams(model_name=...).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    project: str | None
    location: str
    flash_model: str
    commentary_model: str
    fallback_model: str
    pro_model: str
    tts_model: str
    mock: bool
    pipeline: str
    web_dist: Path
    tts_voice: str


def get_settings() -> Settings:
    project = os.getenv("GOOGLE_CLOUD_PROJECT") or None
    mock_env = os.getenv("FIVESEC_MOCK")
    mock = (not project) if mock_env is None else mock_env.strip().lower() in ("1", "true", "yes", "on")
    pipeline = os.getenv("FIVESEC_PIPELINE", "adk").strip().lower()
    return Settings(
        project=project,
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
        flash_model=os.getenv("GEMINI_FLASH_MODEL", "gemini-3.5-flash-lite"),
        commentary_model=os.getenv("GEMINI_COMMENTARY_MODEL") or os.getenv("GEMINI_FLASH_MODEL", "gemini-3.5-flash-lite"),
        fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.8-flash"),
        pro_model=os.getenv("GEMINI_PRO_MODEL", "gemini-3.1-pro"),
        tts_model=os.getenv("TTS_MODEL", "gemini-2.5-flash-tts"),
        mock=mock,
        pipeline="direct" if pipeline == "direct" else "adk",
        web_dist=Path(os.getenv("WEB_DIST") or REPO_ROOT / "web" / "dist"),
        tts_voice=os.getenv("TTS_VOICE", "Kore"),
    )
