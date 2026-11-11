const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const SOURCE_LABEL = {
  "dictionnaire": "Dictionnaire validé",
  "modèle local": "Traduction automatique (modèle local) — à vérifier",
  "API": "Traduction automatique (API) — à vérifier",
  "non traduit": "[non traduit] — aucune traduction fiable",
};

async function refreshStatus() {
  const s = await send({ type: "status" });
  if (!s || s.error) { $("status").textContent = "Erreur"; return; }

  let label;
  if (s.model.installed) label = "Hors-ligne installé";
  else if (s.apiEnabled) label = navigator.onLine ? "En ligne (API)" : "Hors-ligne";
  else label = "Dictionnaire seul";
  $("status").textContent = label;

  $("offlineInfo").textContent = s.model.installed
    ? `Modèle installé (version ${s.model.version}, ${(s.model.sizeBytes / 1048576).toFixed(1)} Mo).`
    : "Télécharge le modèle une seule fois (30 à 70 Mo) pour traduire sans connexion.";
  $("install").textContent = s.model.installed ? "Supprimer le modèle" : "Installer le mode hors-ligne";
  $("install").dataset.installed = s.model.installed ? "1" : "";
}

async function doTranslate() {
  const text = $("input").value.trim();
  if (!text) return;
  const direction = $("direction").value;
  const r = await send({ type: "translate", text, direction });
  $("result").hidden = false;
  $("resultText").textContent = r.untranslated ? `[non traduit] ${text}` : r.text;
  const meta = $("resultMeta");
  meta.textContent = SOURCE_LABEL[r.source] || r.source;
  meta.className = "result-meta" + (r.machine ? " machine" : "");
  loadHistory();
}

async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const ul = $("history");
  ul.textContent = "";
  for (const h of history) {
    const li = document.createElement("li");
    li.textContent = h.translation;
    const small = document.createElement("small");
    small.textContent = h.original;
    li.append(small);
    li.onclick = () => navigator.clipboard.writeText(h.translation);
    li.title = "Cliquer pour copier";
    ul.append(li);
  }
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id;
}

async function refreshPage() {
  const tabId = await activeTabId();
  const r = tabId === undefined ? null : await send({ type: "page-state", tabId });
  const on = !!(r && r.active);
  $("togglePage").setAttribute("aria-pressed", String(on));
  $("togglePage").textContent = on ? "Voir l'original" : "Traduire la page en Ewondo";
}

$("togglePage").onclick = async () => {
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  await send({ type: "toggle-page", tabId });
  setTimeout(refreshPage, 150);
};

$("translate").onclick = doTranslate;
$("input").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") doTranslate();
});
$("copy").onclick = () => navigator.clipboard.writeText($("resultText").textContent);
$("clearHistory").onclick = async () => { await send({ type: "clear-history" }); loadHistory(); };
$("openOptions").onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };

$("install").onclick = async () => {
  const msg = $("offlineMsg");
  msg.textContent = "";
  if ($("install").dataset.installed) {
    await send({ type: "uninstall-model" });
    return refreshStatus();
  }
  $("progress").hidden = false;
  $("progress").value = 0;
  $("install").disabled = true;
  const r = await send({ type: "install-model" });
  $("install").disabled = false;
  $("progress").hidden = true;
  if (r && r.error) msg.textContent = "Échec : " + r.error;
  else msg.textContent = "Mode hors-ligne installé.";
  refreshStatus();
};

chrome.runtime.onMessage.addListener((m) => {
  if (m.type === "install-progress") $("progress").value = m.pct;
});

refreshStatus();
refreshPage();
loadHistory();
