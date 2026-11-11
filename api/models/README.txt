# Modèles locaux

Placez ici les modèles fine-tunés produits par `training/train.py` :

```
models/
├─ fr-ewo/     (config.json, model.safetensors, tokenizer…)
└─ ewo-fr/     (optionnel)
```

- Sans modèle local, définissez `MODEL_ID_FR_EWO` / `MODEL_ID_EWO_FR` (identifiant
  Hugging Face) : le modèle sera téléchargé au premier appel.
- Sans aucun modèle, `/translate` répond `503` — l'API ne renvoie jamais de fausse
  traduction.
- Les fichiers de modèle ne sont pas versionnés (voir `.gitignore`) : utilisez un
  volume Railway ou Hugging Face.
