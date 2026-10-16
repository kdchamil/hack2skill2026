"""Gemini-TTS through Cloud Text-to-Speech (ADC). Raises TTSUnavailable in mock mode or on any error."""

from __future__ import annotations

import asyncio
import hashlib
from collections import OrderedDict

from app.config import get_settings

LANG_CODES = {"en": "en-US", "si": "si-LK", "ta": "ta-IN"}  # si-LK is Preview in Gemini-TTS
_CACHE: "OrderedDict[str, bytes]" = OrderedDict()
_MAX = 64


class TTSUnavailable(Exception):
    pass


def _synth(text: str, lang: str) -> bytes:
    from google.cloud import texttospeech

    s = get_settings()
    c = texttospeech.TextToSpeechClient()
    resp = c.synthesize_speech(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(
            language_code=LANG_CODES[lang], name=s.tts_voice, model_name=s.tts_model
        ),
        audio_config=texttospeech.AudioConfig(audio_encoding=texttospeech.AudioEncoding.MP3),
    )
    return resp.audio_content


async def synthesize(text: str, lang: str) -> bytes:
    if get_settings().mock:
        raise TTSUnavailable("mock mode")
    if lang not in LANG_CODES:
        raise TTSUnavailable("unsupported language")
    key = hashlib.sha256(f"{lang}\n{text}".encode()).hexdigest()
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    try:
        audio = await asyncio.to_thread(_synth, text, lang)
    except Exception as e:  # noqa: BLE001 - any failure => client falls back to on-screen text
        raise TTSUnavailable(type(e).__name__) from e
    if not audio:
        raise TTSUnavailable("empty audio")
    _CACHE[key] = audio
    while len(_CACHE) > _MAX:
        _CACHE.popitem(last=False)
    return audio
