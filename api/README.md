# API nya-su sur Railway

API FastAPI de secours pour l'extension : traduction `fr → ewo` et `ewo → fr`.
Le texte n'est jamais journalisé ; les montants sont déjà protégés par des jetons
côté extension et ne transitent pas par l'API.

## Structure

```
api/
├─ app.py            # FastAPI (chargement paresseux du modèle)
├─ requirements.txt  # torch CPU + transformers
├─ railway.json      # config Railway (Nixpacks, healthcheck /health)
├─ .python-version   # 3.11
└─ models/           # non versionné (voir models/README.txt)
   ├─ fr-ewo/
   └─ ewo-fr/        # optionnel
```

## Déploiement Railway

1. **New Project → Deploy from GitHub repo** → choisir `nya-su`.
2. **Settings → Source → Root Directory = `api`** ← indispensable : Railway
   construit sinon la racine du dépôt (l'extension Chrome) et Railpack échoue.
3. **Settings → Networking → Generate Domain** : vous obtenez
   `https://xxxx.up.railway.app`.
4. Vérifier `https://xxxx.up.railway.app/health` :
   ```json
   {"status":"ok","models":{"fr-ewo":false,"ewo-fr":false}}
   ```
   `false` = modèle pas encore configuré (normal avant la fin de l'entraînement).
5. Coller l'adresse dans **Options** de l'extension (champ « URL de l'API »),
   cocher « Autoriser l'API de secours ».

## Variables d'environnement (optionnelles)

| Variable | Rôle | Défaut |
|----------|------|--------|
| `MODEL_DIR_FR_EWO` | dossier local du modèle fr→ewo | `api/models/fr-ewo` |
| `MODEL_DIR_EWO_FR` | dossier local du modèle ewo→fr | `api/models/ewo-fr` |
| `MODEL_ID_FR_EWO` | id Hugging Face (si pas de dossier local) | — |
| `MODEL_ID_EWO_FR` | id Hugging Face | — |
| `MAX_CHARS` | longueur max d'une requête | `500` |
| `NUM_BEAMS` | beam search (qualité vs vitesse) | `4` |
| `TORCH_THREADS` | threads CPU | `2` |

Exemple pour tester l'API **avant** d'avoir le modèle ewondo (modèle public de
substitution, pas de l'ewondo) :

```
MODEL_ID_FR_EWO=Helsinki-NLP/opus-mt-fr-en
```

## Points d'attention

- `torch` est installé en version **CPU** (`--extra-index-url` dans
  `requirements.txt`) : image bien plus légère et build plus rapide que la
  version CUDA par défaut.
- Le premier appel à `/translate` télécharge/charge le modèle (quelques dizaines
  de secondes). Ensuite il reste en mémoire.
- Offre gratuite/essai : le service peut se mettre en veille ; ouvrez `/health`
  avant la démo.
- `*.up.railway.app` est déjà autorisé dans le manifest de l'extension.
- Aucune donnée n'est journalisée par `app.py` ; ne pas activer de logs d'accès
  côté Railway pour du texte utilisateur.
