// Configuration par défaut de nya-su.
// Modifiable par l'utilisateur dans la page Options (chrome.storage.local).

export const DEFAULTS = {
  configVersion: 2,
  // API déployée sur Railway — activée par défaut.
  // L'utilisateur peut la désactiver dans Options (mode 100 % local).
  apiUrl: "https://nya-su-production.up.railway.app",
  apiEnabled: true,
  // URL du modèle ONNX (dossier contenant encoder_model.onnx, decoder_model.onnx, tokenizer.json, manifest.json)
  modelBaseUrl: "",
  autoPage: false,            // traduire automatiquement chaque page (utile pour la démo)
  blockMachineOnCritical: true, // pas de traduction automatique pour les textes financiers
  theme: "auto",              // "auto" | "light" | "dark"
  historyMax: 10
};

export async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  const saved = stored.config || {};
  const cfg = { ...DEFAULTS, ...saved };

  // Migration v1 -> v2 : activer l'API Railway par défaut.
  // Après la v2, le choix de l'utilisateur est respecté.
  if (!saved.configVersion || saved.configVersion < DEFAULTS.configVersion) {
    cfg.apiUrl = saved.apiUrl || DEFAULTS.apiUrl;
    cfg.apiEnabled = true;
    cfg.configVersion = DEFAULTS.configVersion;
    await chrome.storage.local.set({ config: cfg });
  }

  return cfg;
}

export async function setConfig(patch) {
  const cfg = await getConfig();
  await chrome.storage.local.set({ config: { ...cfg, ...patch } });
}
