#!/usr/bin/env bash
# Construit les deux archives à la racine du dépôt :
#   dist/nya-su-extension.zip        extension seule (à charger ou à soumettre)
#   dist/nya-su-projet-complet.zip   extension + API + entraînement + outils + docs
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/*.zip

zip -qr dist/nya-su-extension.zip \
  manifest.json background.js engine.js localmodel.js config.js protect.js content.js \
  popup options resources icons models

zip -qr dist/nya-su-projet-complet.zip . \
  -x "dist/*" -x "node_modules/*" -x "*__pycache__*" -x "*.pyc" -x ".git/*"

ls -l dist
SIZE=$(wc -c < dist/nya-su-extension.zip)
echo "Poids de l'extension : ${SIZE} octets (critère C7 : < 1 048 576)"
