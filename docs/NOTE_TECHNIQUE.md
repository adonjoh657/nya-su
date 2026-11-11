# Note technique — nya-su (extension de traduction Ewondo)

SAFINUM Innovate Challenge · Version 1.0.0 (MVP)

## 1. Architecture

Page web → `content.js` (bulle) ← messages → `background.js` (service worker) → `engine.js`

Ordre de décision de `engine.js` :
1. **Dictionnaire** `resources/ewo.json` : correspondance exacte, puis templates (regex). Seules les entrées `status = validated` avec `ewo` non vide sont utilisées.
2. **Garde-fou financier** : si le texte contient un montant/nombre ou un mot critique (frais, solde, PIN, bénéficiaire, avertissement…) et n'est pas couvert par le dictionnaire validé, **aucune traduction automatique n'est produite** (option `blockMachineOnCritical`, activée par défaut).
3. **Modèle local** (IndexedDB, optionnel) : traduction automatique, signalée « à vérifier ».
4. **API Railway** (désactivée par défaut, activée par l'utilisateur) : idem.
5. Sinon : texte original, marqué `[non traduit]`.

Deux modes d'usage, détaillés dans `docs/DESIGN_FRONTEND.md` : **traduction de toute la page** (bouton flottant, popup, Alt+Maj+T, menu contextuel) et **traduction d'une sélection** (bulle). Le mode page surveille les nouveaux contenus (`MutationObserver`) pour traduire les messages qui apparaissent pendant la démonstration.

## 2. Préservation des montants (F3)

Trois niveaux de protection :
1. **Dictionnaire** : les montants capturés par les templates sont réinjectés tels quels dans la phrase validée.
2. **Jetons** : `protect.js` remplace chaque montant, numéro et nom propre détecté par `⟦i⟧` avant le modèle local ou l'API, puis le réinjecte à l'identique. Un résultat dont un montant ne correspond pas à l'original est rejeté (`amountsPreserved`). Le même traitement est appliqué au corpus d'entraînement (`training/train.py`).
3. **DOM** : en mode page, les éléments contenant un montant ou un nom (`<span>12 500 F CFA</span>`) sont conservés tels quels dans la phrase traduite (mêmes nœuds, jamais recréés). Si un résultat perd, duplique ou invente un tel élément, il est rejeté et le texte d'origine est conservé.

Le masquage des noms est heuristique (mot capitalisé en milieu de phrase) : il ne garantit pas la détection de tous les noms. C'est pourquoi l'API est désactivée par défaut et n'est jamais appelée pour un texte financier non validé (garde-fou).

## 3. Indépendance vis-à-vis du service cible (F4)

Aucune modification du code source de la page. En mode page, seuls les **nœuds texte** (et les attributs `placeholder`, `title`, `aria-label`) sont remplacés ; les champs de saisie, scripts et styles ne sont jamais touchés. L'original est restitué à l'identique par « Voir l'original » (vérifié par `tools/test_page.mjs`). L'interface de l'extension est isolée dans un Shadow DOM.

## 4. Permissions

| Permission | Usage |
|---|---|
| `contextMenus` | entrée « Traduire la sélection en Ewondo » |
| `storage` | historique (10 entrées, local), options, état « page traduite » par onglet (mémoire de session, effacé à la fermeture du navigateur) |
| `commands` | raccourci Alt+Maj+T |
| `activeTab` | accès à l'onglet courant |
| hôte `https://*.up.railway.app/*` | appels à l'API de secours |
| hôtes optionnels `https://*/*` | demandés à l'exécution uniquement pour l'URL saisie dans Options (API ou modèle) |

Le content script s'exécute sur toutes les pages et tous les cadres (`<all_urls>`, `all_frames`) pour traduire la page et afficher la bulle. Il n'envoie au service worker de l'extension que les textes à traduire, jamais les valeurs des champs de saisie.

## 5. Données transmises

- **Mode dictionnaire / modèle local** : aucune donnée sortante.
- **Mode API** (opt-in) : le texte, dont montants, numéros et noms détectés sont remplacés par des jetons, est envoyé en HTTPS à l'URL configurée, uniquement s'il n'est pas un texte financier. Aucune identité, aucun identifiant. Le serveur ne journalise pas le contenu. Service externe à déclarer : Railway.
- **Téléchargement du modèle** : requêtes GET vers l'URL saisie dans Options, vérification SHA-256 de chaque fichier.

Ne jamais utiliser de données bancaires réelles pendant la démo.

## 6. Inférence locale — limite connue

`localmodel.js` gère le téléchargement, la vérification d'intégrité et le stockage IndexedDB du modèle. **La fonction `translate()` d'inférence n'est pas encore branchée** : elle nécessite `onnxruntime-web` (WASM, ≈ 10 Mo) et le décodage du modèle Marian (tokenizer SentencePiece + boucle de génération). Cet ajout dépasse le critère « < 1 Mo » ; il doit donc être soit embarqué dans `vendor/` (extension plus lourde), soit chargé via un bundle séparé. En attendant, un texte inédit est traité par l'API (si activée), sinon marqué `[non traduit]`.

## 7. Qualité linguistique

- Le dictionnaire livré ne contient que le français ; les traductions ewondo doivent être renseignées et **validées par un locuteur natif** (`tools/csv_to_json.py`, `tools/validate.py`).
- Les traductions automatiques sont toujours signalées « à vérifier » dans l'interface.
- Le modèle de base (OPUS-MT) n'a pas été entraîné sur l'ewondo ; la qualité dépend du corpus et doit être relue manuellement (`test_pairs.tsv`).

## 8. Composants tiers à déclarer

| Composant | Licence | Usage |
|---|---|---|
| Helsinki-NLP/opus-mt-* (Marian) | CC-BY-4.0 (vérifier sur la fiche du modèle choisi) | modèle de base du fine-tuning |
| Transformers, Datasets, Optimum, ONNX Runtime | Apache-2.0 / MIT | entraînement, export |
| FastAPI, Uvicorn, PyTorch | MIT / BSD | API Railway |
| onnxruntime-web (si embarqué) | MIT | inférence navigateur |

Vérifiez les licences et versions exactes au moment de la soumission.

## 9. Test rapide

1. `chrome://extensions` → mode développeur → « Charger l'extension non empaquetée » → dossier de l'extension.
2. Ouvrir `demo/bank.html` (ou l'interface du comité), cliquer sur le bouton « Traduire en Ewondo » (ou Alt+Maj+T).
3. Tant qu'aucune entrée n'est `validated`, rien n'est traduit : les textes restent en français, montants intacts, et le toast indique « non traduit(s) ».
4. Tests automatiques : `node tools/test_protect.mjs` et (après `npm install --no-save jsdom`) `node tools/test_page.mjs`.

## 10. Environnement de test et limites supplémentaires

- L'interface de test du comité est une page web : l'extension s'y applique sans modification de la page.
- **Langue source** : le dictionnaire est en français. Si l'interface du comité est en **anglais**, il faut ajouter des entrées anglaises (non fournies).
- Le garde-fou financier est volontairement strict : un message inédit contenant un montant ou un mot financier n'est pas traduit automatiquement. Il peut être désactivé dans Options, au risque d'erreurs de sens (défaut majeur au barème).
- Le marquage visuel des traductions automatiques (soulignement) utilise la CSS Highlight API (Chrome 105+, Firefox 140+) ; sans elle, seul le toast signale ces textes.
