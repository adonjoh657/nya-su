const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.runtime.sendMessage({ type: "get-config" });
  $("autoPage").checked = !!cfg.autoPage;
  $("blockMachineOnCritical").checked = cfg.blockMachineOnCritical !== false;
  $("apiEnabled").checked = !!cfg.apiEnabled;
  $("apiUrl").value = cfg.apiUrl || "";
  $("modelBaseUrl").value = cfg.modelBaseUrl || "";
}

async function ensureHostPermission(url) {
  if (!url) return true;
  try {
    const origin = new URL(url).origin + "/*";
    if (await chrome.permissions.contains({ origins: [origin] })) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

$("save").onclick = async () => {
  const apiUrl = $("apiUrl").value.trim();
  const modelBaseUrl = $("modelBaseUrl").value.trim();

  const okApi = await ensureHostPermission(apiUrl);
  const okModel = await ensureHostPermission(modelBaseUrl);
  if (!okApi || !okModel) {
    alert("Permission refusée pour l'une des adresses.");
    return;
  }

  await chrome.runtime.sendMessage({
    type: "set-config",
    patch: {
      autoPage: $("autoPage").checked,
      blockMachineOnCritical: $("blockMachineOnCritical").checked,
      apiEnabled: $("apiEnabled").checked,
      apiUrl,
      modelBaseUrl,
    },
  });
  $("saved").hidden = false;
  setTimeout(() => ($("saved").hidden = true), 2000);
};

load();
