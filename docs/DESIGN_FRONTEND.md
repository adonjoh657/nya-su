# Design frontend — nya-su

Cible : une interface financière **web** (environnement de test commun SAFINUM). L'extension doit s'y greffer sans la modifier ni la casser, et rester lisible pour des personnes peu à l'aise avec le français.

## 1. Principes

1. **Invisible tant qu'on ne l'appelle pas.** Aucun élément ajouté à la page avant l'action de l'utilisateur, hors un seul bouton flottant.
2. **Jamais de fausse confiance.** Chaque texte affiché dit d'où il vient : validé, automatique ou non traduit.
3. **Les données financières ne bougent pas.** Montants, noms, numéros restent les nœuds DOM d'origine, jamais recréés.
4. **Réversible à l'identique.** Un clic restitue exactement la page d'origine.
5. **Isolation.** L'interface de l'extension vit dans un Shadow DOM : ni le CSS de la banque ne la déforme, ni la nôtre ne touche la page.

## 2. Surfaces

```
┌────────────────────────── PAGE HÔTE (service financier) ──────────────────────────┐
│  textes de la page  ──────────►  remplacés en place (nœuds texte uniquement)      │
│                                                                                   │
│  ┌─ Shadow DOM #nya-su-host ───────────────┐                                      │
│  │  [Bulle]   traduction d'une sélection   │   (près de la sélection)             │
│  │  [Toast]   résumé « 12 traduits · … »   │   (bas droite, 7 s, aria-live)       │
│  │  [Bouton]  Traduire en Ewondo / Voir    │   (bas droite, fixe, 48 px mini)     │
│  └─────────────────────────────────────────┘   l'original                         │
└───────────────────────────────────────────────────────────────────────────────────┘
        ▲ messages                                              ▲ raccourci Alt+Maj+T
┌───────┴────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Popup          │   │ Menu contextuel  │   │ Options          │
│ page + saisie  │   │ sélection / page │   │ API, modèle, auto│
└────────────────┘   └──────────────────┘   └──────────────────┘
```

| Surface | Rôle | Déclencheurs |
|---|---|---|
| Bouton flottant | Basculer la traduction de toute la page | clic, Entrée/Espace, Alt+Maj+T |
| Bulle | Traduire une sélection, voir l'original, copier | clic droit → « Traduire la sélection en Ewondo » |
| Toast | Résumé après traduction de la page | automatique |
| Popup | Traduire la page, saisie libre, hors-ligne, historique | icône de l'extension |
| Options | API (opt-in), modèle, traduction auto | page d'options |

## 3. Code couleur de confiance

La couleur n'est jamais seule : elle est doublée d'un symbole et d'un texte.

| Source | Symbole | Couleur | Marquage dans la page | Libellé |
|---|---|---|---|---|
| Dictionnaire validé | ✓ | vert `#1b7a3d` | aucun (texte propre) | « Dictionnaire validé » |
| Traduction automatique | ⚠ | ambre `#d98a00` | soulignement ondulé (CSS Highlight API, sans toucher au DOM) | « Traduction automatique — à vérifier » |
| Non traduit | ✕ | rouge `#b3261e` | texte d'origine laissé tel quel | « Aucune traduction fiable » |
| Texte financier non validé | ✕ | rouge | texte d'origine laissé tel quel | « Texte financier : seule une traduction validée est affichée » |

## 4. Règles de respect de la page hôte

- **Seuls les nœuds texte sont modifiés** (et les attributs `placeholder`, `title`, `aria-label`). Aucun élément n'est créé, déplacé ou stylé dans la page.
- **Éléments « données » préservés** : dans « Votre solde est `<span>12 500 F CFA</span>` », le `<span>` est remplacé dans la phrase traduite sans être recréé. Si le site modifie plus tard sa valeur, la phrase traduite l'affiche à jour.
- **Jamais touchés** : champs de saisie (`input`, `textarea`), scripts, styles, zones éditables, éléments `[data-nya-skip]`.
- **Contenu dynamique** : un `MutationObserver` traduit les messages qui apparaissent après coup (erreurs, confirmations, contenu inédit introduit par le jury).
- **Annulation** : restitue les nœuds d'origine à l'identique.
- **Iframes** : le script s'exécute dans tous les cadres ; l'état « page traduite » est partagé par onglet.

## 5. Accessibilité et lisibilité (15 points du barème)

- Texte du bouton ≥ 16 px, cible tactile ≥ 48 px, contraste ≥ 4,5:1, mode sombre automatique.
- Tout est utilisable au clavier ; focus visible (anneau jaune 3 px) ; `aria-pressed` sur le bouton ; toast en `aria-live="polite"`.
- Libellés d'interface en français simple, verbes d'action courts : « Traduire en Ewondo », « Voir l'original ».
- Les polices de la page peuvent ne pas contenir ɛ ɔ ŋ ɓ ni les tons : le navigateur bascule sur une police de secours. À contrôler sur l'interface du comité.
- Pas de dépendance au réseau pour l'affichage : tout fonctionne avec le dictionnaire seul.

## 6. Flux de la traduction de page

```
Déclencheur ─► background (état par onglet, session) ─► diffuse « page-state » à tous les cadres
                                                           │
 content.js : collecte ─► regroupement par bloc ─► messages « translate-batch »
   (TreeWalker)           (slots ⟦Ea⟧ pour les éléments données)        │
                                                                         ▼
                                                    engine.js : dictionnaire → [garde-fou] → modèle → API
                                                                         │
 content.js : vérifie les slots ◄── résultats ◄──────────────────────────┘
   applique en place · surligne les traductions automatiques · toast
```

## 7. Chaînes d'interface (à relire par le locuteur natif si l'UI de l'extension est traduite)

« Traduire en Ewondo » · « Voir l'original » · « Traduire la page en Ewondo » · « Copier » · « Fermer » · « Mode hors-ligne » · « Historique » · « Options ».

## 8. Limites connues

- Les éléments « données » sont reconnus par heuristique (contient un nombre/une devise, ressemble à un nom propre, ou est vide). Un texte inline avec des mots reste traduit séparément.
- Une interface en **anglais** nécessite des entrées `en` dans le dictionnaire (non fournies).
- Pas de traduction du contenu des `input`, ni des images/canvas/PDF.
