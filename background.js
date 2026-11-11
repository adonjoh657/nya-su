import { translate, dictionaryInfo } from "./engine.js";
import { getConfig, setConfig } from "./config.js";
import * as localModel from "./localmodel.js";

const MENU_SELECTION = "nya-su-selection";
const MENU_PAGE = "nya-su-page";

// --- Warm-up API Railway au démarrage du service worker ---
// Railway endort les instances inactives (plan gratuit). Un ping /health au
// démarrage réduit le cold start lors du premier appel de traduction.
async function warmupApi() {
  try {
    const cfg = await getConfig();
    if (!cfg.apiEnabled || !cfg.apiUrl) return;
    await fetch(cfg.apiUrl.replace(/\/$/, "") + "/health", { method: "GET" });
    console.debug("[nya-su] API warm-up OK");
  } catch (e) {
    console.debug("[nya-su] API warm-up échoué (normal si hors-ligne) :", e.message);
  }
}
warmupApi();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_SELECTION, title: "Traduire la sélection en Ewondo", contexts: ["selection"] });
  chrome.contextMenus.create({ id: MENU_PAGE, title: "Traduire toute la page en Ewondo", contexts: ["page"] });
});

// ---------- État « page traduite » par onglet (mémoire de session) ----------

async function getPages() {
  return (await chrome.storage.session.get("pages")).pages || {};
}

async function setPage(tabId, active, origin) {
  const pages = await getPages();
  pages[tabId] = { active, origin: origin ?? pages[tabId]?.origin };
  await chrome.storage.session.set({ pages });
  // Diffusé à tous les cadres de l'onglet.
  chrome.tabs.sendMessage(tabId, { type: "page-state", active }).catch(() => {});
}

async function togglePage(tabId) {
  const pages = await getPages();
  await setPage(tabId, !pages[tabId]?.active);
}

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const pages = await getPages();
  if (tabId in pages) {
    delete pages[tabId];
    await chrome.storage.session.set({ pages });
  }
});

// ---------- Menus et raccourcis ----------

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_PAGE) return togglePage(tab.id);
  if (info.menuItemId !== MENU_SELECTION) return;
  const result = await translate(info.selectionText, "fr-ewo");
  await addHistory(info.selectionText, result, "fr-ewo");
  chrome.tabs
    .sendMessage(tab.id, { type: "show-translation", original: info.selectionText, result }, { frameId: info.frameId ?? 0 })
    .catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) togglePage(tab.id);
});

// ---------- Historique ----------

async function addHistory(original, result, direction) {
  const cfg = await getConfig();
  const { history = [] } = await chrome.storage.local.get("history");
  history.unshift({ original, translation: result.text, source: result.source, direction, ts: Date.now() });
  await chrome.storage.local.set({ history: history.slice(0, cfg.historyMax) });
}

// ---------- Traduction par lots (limite de concurrence) ----------

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- Messages ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "translate": {
        const result = await translate(msg.text, msg.direction || "fr-ewo");
        if (msg.save !== false) await addHistory(msg.text, result, msg.direction || "fr-ewo");
        return result;
      }
      case "translate-batch": {
        const texts = (msg.texts || []).slice(0, 100);
        // Concurrence à 6 pour des pages avec beaucoup de textes
        const results = await mapLimit(texts, 6, (t) => translate(t, msg.direction || "fr-ewo"));
        return { results };
      }
      case "frame-ready": {
        const tabId = sender.tab?.id;
        if (tabId === undefined) return { active: false };
        const pages = await getPages();
        let entry = pages[tabId];
        if (sender.frameId === 0) {
          const origin = sender.url ? new URL(sender.url).origin : undefined;
          if (!entry || (entry.origin && origin && entry.origin !== origin)) {
            const cfg = await getConfig();
            entry = { active: !!cfg.autoPage, origin };
            pages[tabId] = entry;
            await chrome.storage.session.set({ pages });
          }
        }
        return { active: !!entry?.active };
      }
      case "toggle-page": {
        const tabId = msg.tabId ?? sender.tab?.id;
        if (tabId !== undefined) await togglePage(tabId);
        return { ok: true };
      }
      case "page-state": {
        const tabId = msg.tabId ?? sender.tab?.id;
        return { active: !!(await getPages())[tabId]?.active };
      }
      case "status": {
        const cfg = await getConfig();
        return {
          model: await localModel.status(),
          dictionary: await dictionaryInfo(),
          apiEnabled: cfg.apiEnabled && !!cfg.apiUrl,
          online: true,
        };
      }
      case "install-model": {
        await localModel.install((pct) => chrome.runtime.sendMessage({ type: "install-progress", pct }).catch(() => {}));
        return { ok: true };
      }
      case "uninstall-model":
        await localModel.uninstall();
        return { ok: true };
      case "get-config":
        return await getConfig();
      case "set-config":
        await setConfig(msg.patch);
        return { ok: true };
      case "clear-history":
        await chrome.storage.local.set({ history: [] });
        return { ok: true };
      default:
        return { error: "message inconnu" };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: e.message }));
  return true; // réponse asynchrone
});
