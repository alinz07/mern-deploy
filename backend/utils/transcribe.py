# backend/utils/transcribe.py
import sys, json
from faster_whisper import WhisperModel
from phonemizer import phonemize

AUDIO = sys.argv[1]

# small, CPU-friendly model; you can try "base" if Render free tier allows
model = WhisperModel("tiny", device="cpu", compute_type="int8")

segments, info = model.transcribe(AUDIO, language="en")
text = " ".join([s.text.strip() for s in segments]).strip()

ipa = ""
if text:
    try:
        ipa = phonemize(text, language="en-us", backend="espeak", strip=True, njobs=1, punctuation_marks=';:,.!?')
    except Exception:
        ipa = ""

print(json.dumps({"text": text, "ipa": ipa}))
