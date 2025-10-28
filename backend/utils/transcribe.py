# backend/utils/transcribe.py
import sys, json, os
from faster_whisper import WhisperModel
from phonemizer import phonemize

AUDIO = sys.argv[1]

# Extra safety: keep CPU libs single-threaded to reduce RAM
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMBA_NUM_THREADS", "1")
os.environ.setdefault("CT2_USE_CPU_ONLY", "1")

# Tiny model, int8, single worker/thread = low memory
model = WhisperModel(
    "tiny",
    device="cpu",
    compute_type="int8",
    cpu_threads=1,
    num_workers=1,
)

# Transcribe with conservative settings (low RAM)
segments, info = model.transcribe(
    AUDIO,
    language="en",
    vad_filter=False,
    beam_size=1,
    condition_on_previous_text=False,
)

text = " ".join([s.text.strip() for s in segments]).strip()

ipa = ""
if text:
    try:
        ipa = phonemize(
            text,
            language="en-us",
            backend="espeak",
            strip=True,
            njobs=1,
            punctuation_marks=';:,.!?'
        )
    except Exception:
        ipa = ""

print(json.dumps({"text": text, "ipa": ipa}))
