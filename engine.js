// Moteur de traduction : JSON (exact + templates) -> modèle local -> API -> [non traduit]
import { getConfig } from "./config.js";
import { protect, restore, amountsPreserved, isOnlyData } from "./protect.js";

// Textes « financiers » : seule une traduction VALIDÉE (dictionnaire) est autorisée.
// Une erreur sur un montant, une condition ou un avertissement est un défaut majeur (règlement SAFINUM §8).
const CRITICAL_RE =
  /(frais|montant|solde|pin|mot de passe|code|bénéficiaire|beneficiaire|total|taux|intér|échéance|echeance|rembours|confirm|annul|transf|envoy|retrait|dépôt|depot|paiement|payer|sécurité|securite|avertissement|attention|partag|fraude|arnaque|compte|virement|limite|minimum|maximum|insuffisant|invalide|erreur|refus)/i;
import * as localModel from "./localmodel.js";

let dbCache = null;

async function loadDictionary() {
  if (dbCache) return dbCache;
  const url = chrome.runtime.getURL("resources/ewo.json");
  const data = await (await fetch(url)).json();

  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const frTerms = new Map();
  const ewoTerms = new Map();
  for (const t of data.terms || []) {
    if (t.ewo && t.status === "validated") {
      frTerms.set(norm(t.fr), t);
      ewoTerms.set(norm(t.ewo), t);
    }
  }
  const templates = (data.templates || [])
    .filter((t) => t.ewo && t.status === "validated")
    .map((t) => ({ ...t, frRe: new RegExp(t.regex, "i") }));

  dbCache = { data, frTerms, ewoTerms, templates, norm };
  return dbCache;
}

function applyTemplate(tpl, match, direction) {
  const g = match.groups || {};
  const base = direction === "fr-ewo" ? tpl.ewo : tpl.fr;
  return base.replace(/\{(\w+)\}/g, (_, k) => (g[k] !== undefined ? g[k] : `{${k}}`));
}

function fromDictionary(db, text, direction) {
  const key = db.norm(text);

  if (direction === "fr-ewo") {
    const t = db.frTerms.get(key);
    if (t) return { text: t.ewo, source: "dictionnaire", critical: !!t.critical };
    for (const tpl of db.templates) {
      const m = text.trim().match(tpl.frRe);
      if (m) return { text: applyTemplate(tpl, m, direction), source: "dictionnaire", critical: !!tpl.critical };
    }
  } else {
    const t = db.ewoTerms.get(key);
    if (t) return { text: t.fr, source: "dictionnaire", critical: !!t.critical };
  }
  return null;
}

export async function translate(text, direction = "fr-ewo") {
  const cfg = await getConfig();
  const original = (text || "").trim();
  if (!original) return { text: "", source: "vide" };

  const db = await loadDictionary();

  // 1. Dictionnaire validé
  const hit = fromDictionary(db, original, direction);
  if (hit) return hit;

  // Protection des montants avant toute traduction automatique
  const { text: protectedText, tokens, amountCount } = protect(original);

  // Une donnée seule (nom, montant) n'est pas une phrase à traduire.
  if (isOnlyData(protectedText)) {
    return { text: original, source: "non traduit", untranslated: true, reason: "donnée" };
  }

  // Garde-fou : texte financier non couvert par le dictionnaire validé -> jamais de traduction automatique.
  // NOTE : désactivé par défaut (blockMachineOnCritical=false) tant que l'API est un fallback temporaire fr→en.
  if (cfg.blockMachineOnCritical && (amountCount > 0 || CRITICAL_RE.test(original))) {
    console.debug("[nya-su] blocé (critique) :", original);
    return { text: original, source: "non traduit", untranslated: true, reason: "critique" };
  }

  // 2. Modèle local (si installé)
  try {
    if (await localModel.isInstalled()) {
      const out = await localModel.translate(protectedText, direction);
      const final = restore(out, tokens);
      if (amountsPreserved(original, final)) {
        return { text: final, source: "modèle local", machine: true };
      }
    }
  } catch (e) {
    console.warn("[nya-su] modèle local indisponible :", e.message);
  }

  // 3. API de secours (uniquement si activée par l'utilisateur)
  if (cfg.apiEnabled && cfg.apiUrl) {
    try {
      const res = await fetch(cfg.apiUrl.replace(/\/$/, "") + "/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: protectedText, direction }),
      });
      if (res.ok) {
        const j = await res.json();
        const final = restore(j.translation || "", tokens);
        // On accepte la traduction si elle est non-vide et différente de l'original.
        if (final && final !== original && amountsPreserved(original, final)) {
          console.debug("[nya-su] API ok:", original, "->", final);
          return { text: final, source: "API", machine: true };
        }
        console.debug("[nya-su] API résultat ignoré (vide ou identique) :", original, "->", final);
      } else {
        const body = await res.text().catch(() => "");
        console.warn("[nya-su] API erreur HTTP", res.status, ":", body);
      }
    } catch (e) {
      console.warn("[nya-su] API indisponible :", e.message);
    }
  }

  // 4. Rien de fiable : on garde l'original, montants intacts
  return { text: original, source: "non traduit", untranslated: true };
}

export async function dictionaryInfo() {
  const db = await loadDictionary();
  const validated = db.frTerms.size + db.templates.length;
  const total = (db.data.terms || []).length + (db.data.templates || []).length;
  return { validated, total, version: db.data.meta?.version };
}
