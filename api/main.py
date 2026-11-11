"""Point d'entrée pour Railway/Railpack.

Railpack lance par défaut `uvicorn main:app` : ce module expose l'application
FastAPI définie dans `app.py`.
"""
from app import app  # noqa: F401
