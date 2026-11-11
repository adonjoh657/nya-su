# nya-su — extension de traduction Ewondo pour services financiers

Prototype SAFINUM Innovate Challenge. Traduit une interface financière web (français) en ewondo sans modifier son code source.

## Installer et tester
1. Chrome/Edge : `chrome://extensions` → activer le mode développeur → **Charger l'extension non empaquetée** → choisir ce dossier (ou le ZIP décompressé de `nya-su-extension.zip`).
2. Ouvrir `demo/bank.html` (page bancaire fictive) ou l'interface de test du comité.
3. Cliquer sur **Traduire en Ewondo** (bas droite) ou **Alt+Maj+T**. Clic sur **Voir l'original** pour revenir.
4. Sélection : surligner un texte → clic droit → **Traduire la sélection en Ewondo**.

## Contenu
| Dossier | Rôle |
|---|---|
| `manifest.json`, `*.js`, `popup/`, `options/` | l'extension (Manifest V3) |
| `resources/ewo.json` | dictionnaire (ewondo à valider par un locuteur natif) |
| `demo/bank.html` | page bancaire fictive pour la démonstration |
| `tools/` | CSV ↔ JSON, validation du dictionnaire, tests, build |
| `training/` | fine-tuning et export ONNX du modèle |
| `api/` | API de secours pour Railway |
| `docs/` | `NOTE_TECHNIQUE.md`, `DESIGN_FRONTEND.md` |

## Remplir le dictionnaire
```
python tools/csv_to_json.py export resources/ewo.json a_traduire.csv   # à donner au locuteur natif
python tools/csv_to_json.py import resources/ewo.json rempli.csv       # colonnes : id, fr, ewo, status
python tools/validate.py resources/ewo.json
```
Une entrée n'est utilisée que si `status` vaut `validated` et que `ewo` n'est pas vide.

## Tests et build
```
node tools/test_protect.mjs
npm install --no-save jsdom && node tools/test_page.mjs
bash tools/build.sh
```

Limites connues et composants tiers : voir `docs/NOTE_TECHNIQUE.md`.
