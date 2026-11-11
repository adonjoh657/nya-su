// Protection des données sensibles avant toute traduction automatique (modèle local ou API).
//  1. Montants et nombres (montants, frais, numéros de téléphone/compte) -> [[TKi]]
//  2. Noms propres (bénéficiaires, expéditeurs) -> [[TKi]]
// Les jetons sont réinjectés à l'identique après traduction : un modèle ne peut pas
// altérer un montant, et l'API ne reçoit ni montant, ni numéro, ni nom détecté.
// Note : on utilise [[TKi]] (ASCII standard) car les crochets mathématiques ⟦...⟧ (U+27E6)
// sont hors-vocabulaire pour la plupart des tokenizers et provoquaient des boucles infinies de points.

// Montant avec devise : 12 500 F CFA, 12500 FCFA, 1.250,50 XAF, 5000 XAF...
const AMOUNT_RE = /\d[\d\s .,]*\d?\s?(?:F\s?CFA|FCFA|XAF|XOF|F|CFA|€|EUR|\$|USD)?/gi;

// Mot(s) capitalisé(s) en milieu de phrase, précédé(s) d'un mot en minuscule ou d'une ponctuation.
const NAME_RE = /(?<=[a-zàâçéèêëîïôûùüÿñæœ,;:]\s)[A-ZÀ-ÝŒ][\p{L}'’-]*(?:\s+[A-ZÀ-ÝŒ][\p{L}'’-]*)*/gu;

export function protect(text, { names = true } = {}) {
  const tokens = [];

  let out = text.replace(AMOUNT_RE, (m) => {
    // Les espaces/ponctuation de fin restent hors du jeton pour ne pas coller les mots.
    const trimmed = m.replace(/[\s .,]+$/, "");
    const tail = m.slice(trimmed.length);
    tokens.push(trimmed);
    return `[[TK${tokens.length - 1}]]${tail}`;
  });
  const amountCount = tokens.length;

  if (names) {
    out = out.replace(NAME_RE, (m) => {
      tokens.push(m);
      return `[[TK${tokens.length - 1}]]`;
    });
  }
  return { text: out, tokens, amountCount };
}

export function restore(text, tokens) {
  let out = text;
  tokens.forEach((t, i) => {
    // Tolère d'éventuels espaces injectés par le tokenizer du modèle : [[TK0]], [[ TK0 ]], etc.
    const tkRe = new RegExp(`\\[\\[\\s*TK${i}\\s*\\]\\]`, "gi");
    out = out.replace(tkRe, t);
    // Rétrocompatibilité avec les anciens jetons ⟦i⟧
    out = out.split(`⟦${i}⟧`).join(t);
  });
  return out;
}

// Vérifie qu'aucun montant n'a été perdu ou modifié.
export function amountsPreserved(original, translated) {
  const a = (original.match(AMOUNT_RE) || []).map((s) => s.trim().replace(/[\s .,]+$/, ""));
  return a.every((m) => translated.includes(m));
}

// Vrai si le texte ne contient plus aucune lettre une fois les jetons retirés
// (ex. « [[TK0]] » seul : une donnée, pas une phrase à traduire).
export function isOnlyData(protectedText) {
  const stripped = protectedText.replace(/\[\[\s*TK\d+\s*\]\]/gi, "").replace(/⟦\d+⟧/g, "");
  return !/\p{L}/u.test(stripped);
}
