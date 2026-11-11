// Configuration par défaut de nya-su.
// Modifiable par l'utilisateur dans la page Options (chrome.storage.local).

export const DEFAULTS = {
  // URL de l'API déployée sur Railway. À remplacer après déploiement
  // (ou à saisir dans Options, sans republier l'extension).
  apiUrl: "",
  apiEnabled: false,          // l'envoi de texte à l'API est désactivé tant que l'utilisateur ne l'accepte pas
  // URL du modèle ONNX (dossier contenant encoder_model.onnx, decoder_model.onnx, tokenizer.json, manifest.json)
  modelBaseUrl: "",
  autoPage: false,            // traduire automatiquement chaque page (utile pour la démo)
  blockMachineOnCritical: true, // pas de traduction automatique pour les textes financiers
  theme: "auto",              // "auto" | "light" | "dark"
  historyMax: 10
};

export async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  return { ...DEFAULTS, ...(stored.config || {}) };
}

export async function setConfig(patch) {
  const cfg = await getConfig();
  await chrome.storage.local.set({ config: { ...cfg, ...patch } });
}
