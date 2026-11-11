"""API de secours nya-su — déployée sur Railway.

- POST /translate  {"text": "...", "direction": "fr-ewo"}  ->  {"translation": "..."}
- GET  /health

Confidentialité : le texte reçu n'est ni journalisé ni stocké. Les montants sont
déjà remplacés par ⟦i⟧ côté extension : ils ne transitent jamais par l'API.
Si le modèle n'est pas disponible, l'API répond 503 (jamais de fausse traduction).

Modèle :
  - priorité au dossier local `models/<direction>/` (sortie de training/train.py) ;
  - sinon, variable d'environnement `MODEL_ID_FR_EWO` / `MODEL_ID_EWO_FR`
    (identifiant Hugging Face), téléchargé au premier appel.
Le chargement est paresseux : l'API démarre même sans modèle.
"""
import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Pas de journalisation du contenu des requêtes.
logging.getLogger("uvicorn.access").disabled = True

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_DIR = BASE_DIR / "models"

DIRECTIONS = ("fr-ewo", "ewo-fr")
MAX_CHARS = int(os.environ.get("MAX_CHARS", "500"))
NUM_BEAMS = int(os.environ.get("NUM_BEAMS", "4"))
TORCH_THREADS = int(os.environ.get("TORCH_THREADS", "2"))

_models = {}
_locks = {d: threading.Lock() for d in DIRECTIONS}


def _env_suffix(direction):
    return direction.upper().replace("-", "_")


def _model_dir(direction):
    env = os.environ.get(f"MODEL_DIR_{_env_suffix(direction)}")
    return Path(env) if env else DEFAULT_MODEL_DIR / direction


def _model_id(direction):
    return os.environ.get(f"MODEL_ID_{_env_suffix(direction)}") or None


def _source(direction):
    path = _model_dir(direction)
    if path.is_dir():
        return str(path)
    return _model_id(direction)


def _configured(direction):
    return _source(direction) is not None


def _load(direction):
    source = _source(direction)
    if not source:
        return None

    import torch

    torch.set_num_threads(TORCH_THREADS)

    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(source)
    model = AutoModelForSeq2SeqLM.from_pretrained(source)
    model.to("cpu")
    model.eval()
    return tok, model


def get_model(direction):
    if direction in _models:
        return _models[direction]
    with _locks[direction]:
        if direction not in _models:
            try:
                _models[direction] = _load(direction)
            except Exception:  # modèle absent/corrompu : on ne bloque pas l'API
                logging.exception("Chargement du modèle %s impossible", direction)
                _models[direction] = None
    return _models[direction]


@asynccontextmanager
async def lifespan(_app):
    # Chargement paresseux volontaire : démarrage rapide, healthcheck immédiat.
    yield


app = FastAPI(title="nya-su API", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class Req(BaseModel):
    text: str = Field(min_length=1)
    direction: str = "fr-ewo"


@app.get("/")
def root():
    return {"name": "nya-su API", "version": "1.1.0", "docs": "/docs"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models": {d: _configured(d) for d in DIRECTIONS},
    }


@app.post("/translate")
def translate(req: Req):
    if req.direction not in DIRECTIONS:
        raise HTTPException(400, "direction invalide")
    if len(req.text) > MAX_CHARS:
        raise HTTPException(413, f"texte trop long (max {MAX_CHARS} caractères)")

    m = get_model(req.direction)
    if m is None:
        raise HTTPException(503, "modèle non chargé pour cette direction")

    import torch

    tok, model = m
    inputs = tok(req.text, return_tensors="pt", truncation=True, max_length=128)
    with torch.inference_mode():
        out = model.generate(**inputs, max_new_tokens=128, num_beams=NUM_BEAMS)
    return {"translation": tok.decode(out[0], skip_special_tokens=True)}
