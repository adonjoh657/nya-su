# API nya-su sur Railway

## Contenu à déposer
```
api/
├─ app.py
├─ requirements.txt
├─ railway.json
└─ models/
   └─ fr-ewo/      <- sortie de training/train.py (config.json, model.safetensors, tokenizer, source.spm, target.spm…)
```
Optionnel : `models/ewo-fr/` pour la traduction inverse.

## Déploiement
1. Créez un dépôt GitHub contenant le dossier `api/` (le modèle peut être ajouté avec Git LFS si > 100 Mo).
2. Sur railway.com : **New Project → Deploy from GitHub repo**, et choisissez **Root Directory = `api`**.
3. Dans **Settings → Networking**, cliquez **Generate Domain** : vous obtenez `https://xxxx.up.railway.app`.
4. Testez : `https://xxxx.up.railway.app/health` doit renvoyer `{"status":"ok","models":{"fr-ewo":true,...}}`.
5. Collez cette adresse dans **Options** de l'extension (champ « URL de l'API »), cochez « Autoriser l'API de secours ».

## Points d'attention
- PyTorch rend l'image volumineuse (plusieurs Go) : vérifiez les limites de votre offre Railway.
- Offre gratuite/essai : le service peut se mettre en veille ; ouvrez `/health` avant la démo.
- L'adresse `*.up.railway.app` est déjà autorisée dans le manifest de l'extension.
- Aucune donnée n'est journalisée par `app.py`. Vérifiez aussi que vous n'ajoutez pas de journalisation côté Railway.
