// Gestion du modèle local ONNX : téléchargement, vérification SHA-256,
// stockage IndexedDB, et point d'entrée d'inférence.
//
// IMPORTANT : l'inférence nécessite onnxruntime-web (WASM, ~10 Mo) placé dans
// vendor/. Il n'est pas inclus dans le ZIP de base pour respecter le critère
// de poids < 1 Mo. Voir docs/NOTE_TECHNIQUE.md, section "Inférence locale".

import { getConfig } from "./config.js";

const DB_NAME = "nya-su";
const STORE = "models";
const KEY = "ewo_model_v1";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isInstalled() {
  const m = await idbGet(KEY);
  return !!(m && m.files);
}

export async function status() {
  const m = await idbGet(KEY);
  if (!m) return { installed: false };
  return { installed: true, version: m.version, sizeBytes: m.sizeBytes };
}

export async function uninstall() {
  await idbDelete(KEY);
}

// Télécharge les fichiers listés dans <modelBaseUrl>/manifest.json.
// Format attendu du manifest :
// { "version": "1", "files": [ {"name": "encoder_model.onnx", "sha256": "...", "size": 123}, ... ] }
export async function install(onProgress = () => {}) {
  const cfg = await getConfig();
  if (!cfg.modelBaseUrl) throw new Error("URL du modèle non configurée (Options).");
  const base = cfg.modelBaseUrl.replace(/\/$/, "");

  const manifest = await (await fetch(base + "/manifest.json")).json();
  const total = manifest.files.reduce((s, f) => s + (f.size || 0), 0);
  let done = 0;
  const files = {};

  for (const f of manifest.files) {
    const res = await fetch(`${base}/${f.name}`);
    if (!res.ok) throw new Error(`Échec du téléchargement de ${f.name} (${res.status})`);

    const reader = res.body.getReader();
    const chunks = [];
    while (true) {
      const { done: d, value } = await reader.read();
      if (d) break;
      chunks.push(value);
      done += value.length;
      onProgress(total ? Math.min(100, Math.round((done / total) * 100)) : 0);
    }
    const buf = await new Blob(chunks).arrayBuffer();

    if (f.sha256) {
      const hash = await sha256Hex(buf);
      if (hash !== f.sha256) throw new Error(`Empreinte invalide pour ${f.name} : fichier corrompu ou modifié.`);
    }
    files[f.name] = buf;
  }

  await idbSet(KEY, { version: manifest.version, sizeBytes: done, files });
  onProgress(100);
}

// Inférence : à brancher une fois onnxruntime-web et le tokenizer ajoutés dans vendor/.
export async function translate(_protectedText, _direction) {
  throw new Error(
    "Moteur d'inférence non embarqué (vendor/ort). Voir docs/NOTE_TECHNIQUE.md."
  );
}
