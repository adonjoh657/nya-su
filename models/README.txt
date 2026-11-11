Ce dossier est volontairement vide.

Le modèle ONNX n'est PAS inclus dans l'extension (poids 30 à 70 Mo).
Il est téléchargé à la demande par le bouton « Installer le mode hors-ligne »
depuis l'URL saisie dans Options, puis stocké dans IndexedDB (clé ewo_model_v1).

Structure attendue à l'URL du modèle :
  manifest.json            {"version":"1","files":[{"name":"...","sha256":"...","size":123}]}
  encoder_model.onnx
  decoder_model.onnx
  tokenizer.json
  (générés par training/export_onnx.py)
