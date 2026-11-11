"""API de secours nya-su — déployée sur Railway.

- POST /translate  {"text": "...", "direction": "fr-ewo"}  ->  {"translation": "..."}
- GET  /health

Confidentialité : le texte reçu n'est ni journalisé ni stocké. Les montants sont
déjà remplacés par ⟦i⟧ côté extension : ils ne transitent jamais par l'API.
Si le modèle n'est pas chargé, l'API répond 503 (jamais de fausse traduction).
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Pas de journalisation du contenu des requêtes.
logging.getLogger("uvicorn.access").disabled = True

MODEL_DIRS = {
    "fr-ewo": os.environ.get("MODEL_DIR_FR_EWO", "models/fr-ewo"),
    "ewo-fr": os.environ.get("MODEL_DIR_EWO_FR", "models/ewo-fr"),
}
MAX_CHARS = int(os.environ.get("MAX_CHARS", "500"))
_models = {}


def _load(direction):
    path = MODEL_DIRS[direction]
    if not os.path.isdir(path):
        return None
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(path)
    model = AutoModelForSeq2SeqLM.from_pretrained(path)
    model.eval()
    return tok, model


@asynccontextmanager
async def lifespan(_app):
    for d in MODEL_DIRS:
        _models[d] = _load(d)
    yield


app = FastAPI(title="nya-su API", lifespan=lifespan)


class Req(BaseModel):
    text: str = Field(min_length=1)
    direction: str = "fr-ewo"


@app.get("/health")
def health():
    return {"status": "ok", "models": {d: m is not None for d, m in _models.items()}}


@app.post("/translate")
def translate(req: Req):
    if req.direction not in MODEL_DIRS:
        raise HTTPException(400, "direction invalide")
    if len(req.text) > MAX_CHARS:
        raise HTTPException(413, f"texte trop long (max {MAX_CHARS} caractères)")
    m = _models.get(req.direction)
    if m is None:
        raise HTTPException(503, "modèle non chargé pour cette direction")

    import torch
    tok, model = m
    inputs = tok(req.text, return_tensors="pt", truncation=True, max_length=128)
    with torch.no_grad():
        out = model.generate(**inputs, max_new_tokens=128, num_beams=4)
    return {"translation": tok.decode(out[0], skip_special_tokens=True)}
