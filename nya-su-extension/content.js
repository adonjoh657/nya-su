// nya-su — content script. Design : docs/DESIGN_FRONTEND.md
// - Traduit la page en place (nœuds texte uniquement), de façon réversible à l'identique.
// - Préserve les éléments « données » (montants, noms) : les nœuds d'origine sont réutilisés, jamais recréés.
// - Surveille les nouveaux contenus (messages d'erreur, contenu inédit).
// - UI (bouton, toast, bulle) isolée dans un Shadow DOM.

(() => {
  if (window.__nyaSuLoaded) return;
  window.__nyaSuLoaded = true;

  const IS_TOP = window === window.top;

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG", "CANVAS", "IFRAME", "OBJECT"]);
  const INLINE_TAGS = new Set(["SPAN", "B", "STRONG", "I", "EM", "A", "SMALL", "U", "MARK", "SUB", "SUP", "BDI", "TIME"]);
  const ATTRS = ["placeholder", "title", "aria-label"];
  const HAS_LETTER = /\p{L}/u;
  const WORD3 = /\p{L}{3,}/u;
  const CURRENCY_RE = /F\s?CFA|FCFA|XAF|XOF|CFA|EUR|USD/gi;
  const NAME_RE = /^[A-ZÀ-ÝŒ][\p{L}'’-]*(?:\s+[A-ZÀ-ÝŒ][\p{L}'’-]*)+$/u;
  const SLOT_SPLIT = /⟦E([a-z])⟧/;

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          void chrome.runtime.lastError;
          resolve(r);
        });
      } catch {
        resolve(undefined);
      }
    });

  // ------------------------------------------------------------------ UI (Shadow DOM)

  const UI_CSS = `
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .fab{position:fixed;right:16px;bottom:16px;min-height:48px;padding:0 18px;border-radius:999px;border:0;
      background:#1b7a3d;color:#fff;font-size:16px;font-weight:600;cursor:pointer;pointer-events:auto;
      box-shadow:0 4px 16px rgba(0,0,0,.28)}
    .fab[aria-pressed="true"]{background:#0b5cad}
    .fab:focus-visible,.bubble button:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}
    .toast{position:fixed;right:16px;bottom:76px;max-width:min(320px,calc(100vw - 32px));padding:10px 14px;
      border-radius:10px;background:#20242b;color:#fff;font-size:14px;line-height:1.4;pointer-events:auto;
      box-shadow:0 4px 16px rgba(0,0,0,.28)}
    .toast[hidden],.bubble[hidden]{display:none}
    .bubble{position:fixed;max-width:min(360px,calc(100vw - 16px));padding:12px 14px;border-radius:10px;
      background:#fff;color:#1a1a1a;border:1px solid #c9ced6;border-left:5px solid #1b7a3d;pointer-events:auto;
      box-shadow:0 6px 24px rgba(0,0,0,.2);font-size:15px;line-height:1.45}
    .bubble.machine{border-left-color:#d98a00}.bubble.none{border-left-color:#b3261e}
    .bubble .text{font-size:16px;font-weight:600;margin-bottom:6px;word-break:break-word}
    .bubble .meta{font-size:13px;color:#4a5563;margin-bottom:4px}
    .bubble .orig{font-size:12px;color:#4a5563;margin-bottom:10px;word-break:break-word}
    .bubble .actions{display:flex;gap:8px}
    .bubble button{min-height:36px;padding:0 14px;border-radius:8px;border:1px solid #c9ced6;background:#f3f5f8;
      color:#1a1a1a;font-size:14px;cursor:pointer}
    @media (prefers-color-scheme:dark){
      .bubble{background:#20242b;color:#eef1f5;border-color:#3a414c}
      .bubble .meta,.bubble .orig{color:#a9b3c0}
      .bubble button{background:#2c323b;color:#eef1f5;border-color:#3a414c}
      .toast{background:#eef1f5;color:#1a1a1a}
    }`;

  let ui = null;
  let toastTimer = null;
  let active = false;

  function ensureUI() {
    if (ui) return ui;
    const host = document.createElement("div");
    host.id = "nya-su-host";
    host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = UI_CSS;
    root.appendChild(style);

    ui = { host, root, fab: null, toast: null, bubble: null };

    if (IS_TOP) {
      const fab = document.createElement("button");
      fab.className = "fab";
      fab.type = "button";
      fab.addEventListener("click", () => send({ type: "toggle-page" }));
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.hidden = true;
      root.append(toast, fab);
      ui.fab = fab;
      ui.toast = toast;
    }
    document.documentElement.appendChild(host);
    renderFab();
    return ui;
  }

  function renderFab() {
    if (!ui || !ui.fab) return;
    ui.fab.setAttribute("aria-pressed", String(active));
    ui.fab.textContent = active ? "Voir l'original" : "Traduire en Ewondo";
  }

  function showToast(text) {
    if (!ui || !ui.toast) return;
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (ui.toast.hidden = true), 7000);
  }

  const stats = { dict: 0, machine: 0, none: 0 };
  const noneSeen = new WeakSet();

  function summary() {
    const parts = [`${stats.dict + stats.machine} texte(s) traduit(s)`];
    if (stats.machine) parts.push(`${stats.machine} automatique(s) à vérifier (soulignés)`);
    if (stats.none) parts.push(`${stats.none} non traduit(s)`);
    return parts.join(" · ");
  }

  // ------------------------------------------------------------------ Bulle (sélection)

  const SOURCE_LABEL = {
    "dictionnaire": "✓ Dictionnaire validé",
    "modèle local": "⚠ Traduction automatique (modèle local) — à vérifier",
    "API": "⚠ Traduction automatique (API) — à vérifier",
    "non traduit": "✕ Aucune traduction fiable disponible",
  };

  function closeBubble() {
    if (ui && ui.bubble) {
      ui.bubble.remove();
      ui.bubble = null;
    }
  }

  function showBubble(original, result) {
    ensureUI();
    closeBubble();
    let rect = { left: 20, bottom: 20 };
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width || r.height)) rect = r;
    }

    const b = document.createElement("div");
    b.className = "bubble" + (result.machine ? " machine" : "") + (result.untranslated ? " none" : "");
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-label", "Traduction en Ewondo");

    const text = document.createElement("div");
    text.className = "text";
    text.textContent = result.untranslated ? "[non traduit]" : result.text;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      result.reason === "critique"
        ? "✕ Texte financier : seule une traduction validée est affichée"
        : SOURCE_LABEL[result.source] || result.source;

    const orig = document.createElement("div");
    orig.className = "orig";
    orig.textContent = "Original : " + original;

    const actions = document.createElement("div");
    actions.className = "actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copier";
    copy.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(result.text));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fermer";
    close.addEventListener("click", closeBubble);
    actions.append(copy, close);

    b.append(text, meta, orig, actions);
    ui.root.appendChild(b);
    ui.bubble = b;

    const top = Math.min(window.innerHeight - b.offsetHeight - 8, rect.bottom + 8);
    const left = Math.max(8, Math.min(window.innerWidth - b.offsetWidth - 8, rect.left));
    b.style.top = Math.max(8, top) + "px";
    b.style.left = left + "px";
    close.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBubble();
  });
  document.addEventListener("mousedown", (e) => {
    if (ui && ui.bubble && e.target !== ui.host) closeBubble();
  });

  // ------------------------------------------------------------------ Traduction de la page

  const state = new Map(); // nœud texte | élément composite -> enregistrement d'origine
  const attrState = new Map(); // élément -> { attr: {orig, translated} }
  const cache = new Map(); // texte -> résultat du moteur
  let hl = null;

  function skipEl(el) {
    return (
      SKIP_TAGS.has(el.localName.toUpperCase()) ||
      el.id === "nya-su-host" ||
      el.isContentEditable === true ||
      el.hasAttribute("data-nya-skip")
    );
  }

  // Élément « donnée » : montant, nom propre, ou vide (rempli plus tard par le site).
  function isSlot(el) {
    const t = el.textContent.trim();
    if (t === "") return true;
    if (NAME_RE.test(t)) return true;
    return !WORD3.test(t.replace(CURRENCY_RE, ""));
  }

  // Bloc « texte + éléments données » traduit comme une seule phrase : "Votre solde est ⟦Ea⟧".
  function buildComposite(el) {
    const nodes = Array.from(el.childNodes);
    const slots = [];
    let str = "";
    let hasText = false;
    for (const n of nodes) {
      if (n.nodeType === 3) {
        str += n.nodeValue;
        if (n.nodeValue.trim()) hasText = true;
      } else if (n.nodeType === 1) {
        if (!INLINE_TAGS.has(n.localName.toUpperCase()) || !isSlot(n)) return null;
        str += `⟦E${String.fromCharCode(97 + slots.length)}⟧`;
        slots.push(n);
      } else if (n.nodeType !== 8) {
        return null;
      }
    }
    if (!hasText || !slots.length || !HAS_LETTER.test(str.replace(/⟦E[a-z]⟧/g, ""))) return null;
    return { str, slots, nodes };
  }

  const sameChildren = (el, list) =>
    el.childNodes.length === list.length && list.every((n, i) => el.childNodes[i] === n);

  const norm = (s) => s.replace(/\s+/g, " ").trim();

  function collect(root) {
    const jobs = [];
    const skip = new Set();

    const visit = (el) => {
      if (skip.has(el)) return;

      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v || !HAS_LETTER.test(v)) continue;
        if (attrState.get(el)?.[a]?.translated === v) continue;
        jobs.push({ kind: "attr", el, attr: a, orig: v, text: norm(v) });
      }

      const comp = buildComposite(el);
      if (comp) {
        const rec = state.get(el);
        if (rec && sameChildren(el, rec.produced)) return;
        if (rec) state.delete(el);
        comp.slots.forEach((s) => skip.add(s));
        jobs.push({ kind: "composite", el, nodes: comp.nodes, slots: comp.slots, text: norm(comp.str), raw: comp.str });
        return;
      }

      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !HAS_LETTER.test(n.nodeValue)) continue;
        const rec = state.get(n);
        if (rec && n.nodeValue === rec.translated) continue;
        if (rec) state.delete(n);
        jobs.push({ kind: "text", node: n, value: n.nodeValue, text: norm(n.nodeValue) });
      }
    };

    if (root.nodeType === 1 && !skipEl(root)) visit(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (skipEl(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = walker.nextNode())) visit(n);
    return jobs;
  }

  async function resolveTexts(texts) {
    const need = [...new Set(texts)].filter((t) => !cache.has(t));
    for (let i = 0; i < need.length; i += 40) {
      const chunk = need.slice(i, i + 40);
      const res = await send({ type: "translate-batch", texts: chunk, direction: "fr-ewo" });
      if (!res || !res.results) continue;
      chunk.forEach((t, k) => res.results[k] && cache.set(t, res.results[k]));
    }
  }

  function mark(nodes) {
    try {
      if (!(window.CSS && CSS.highlights && window.Highlight)) return;
      if (!hl) {
        hl = new Highlight();
        CSS.highlights.set("nya-machine", hl);
        const sheet = new CSSStyleSheet();
        sheet.replaceSync("::highlight(nya-machine){text-decoration:underline wavy #d98a00;text-decoration-thickness:2px;}");
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
      for (const n of nodes) {
        const r = document.createRange();
        r.selectNodeContents(n);
        hl.add(r);
      }
    } catch {
      /* marquage facultatif */
    }
  }

  function clearMarks() {
    try {
      if (hl) {
        hl.clear();
        CSS.highlights.delete("nya-machine");
        hl = null;
      }
    } catch {
      /* facultatif */
    }
  }

  function noteNone(key) {
    if (!noneSeen.has(key)) {
      noneSeen.add(key);
      stats.none++;
    }
  }

  // Reconstruit les enfants d'un bloc composite à partir de la phrase traduite.
  // Refuse le résultat si un élément « donnée » manque, est dupliqué ou inventé.
  function rebuild(translated, slots, lead, trail) {
    const parts = translated.split(SLOT_SPLIT);
    const out = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        if (parts[i]) out.push(document.createTextNode(parts[i]));
      } else {
        const idx = parts[i].charCodeAt(0) - 97;
        if (!slots[idx] || seen.has(idx)) return null;
        seen.add(idx);
        out.push(slots[idx]);
      }
    }
    if (seen.size !== slots.length) return null;
    if (lead) out.unshift(document.createTextNode(lead));
    if (trail) out.push(document.createTextNode(trail));
    return out;
  }

  function applyJob(job) {
    const r = cache.get(job.text);
    if (!r) return;
    const key = job.node || job.el;
    if (r.untranslated || !r.text || r.text === job.text) {
      if (job.kind !== "attr") noteNone(key);
      return;
    }

    if (job.kind === "text") {
      if (!job.node.isConnected || job.node.nodeValue !== job.value || SLOT_SPLIT.test(r.text)) return;
      const lead = job.value.match(/^\s*/)[0];
      const trail = job.value.match(/\s*$/)[0];
      const nv = lead + r.text + trail;
      job.node.nodeValue = nv;
      state.set(job.node, { type: "text", orig: job.value, translated: nv });
      r.machine ? stats.machine++ : stats.dict++;
      if (r.machine) mark([job.node]);
    } else if (job.kind === "attr") {
      if (!job.el.isConnected || job.el.getAttribute(job.attr) !== job.orig || SLOT_SPLIT.test(r.text)) return;
      job.el.setAttribute(job.attr, r.text);
      const o = attrState.get(job.el) || {};
      o[job.attr] = { orig: job.orig, translated: r.text };
      attrState.set(job.el, o);
    } else {
      if (!job.el.isConnected || !sameChildren(job.el, job.nodes)) return;
      const lead = job.raw.match(/^\s*/)[0];
      const trail = job.raw.match(/\s*$/)[0];
      const produced = rebuild(r.text, job.slots, lead, trail);
      if (!produced) {
        noteNone(key);
        return;
      }
      while (job.el.firstChild) job.el.removeChild(job.el.firstChild);
      produced.forEach((n) => job.el.appendChild(n));
      state.set(job.el, { type: "composite", origNodes: job.nodes, produced });
      r.machine ? stats.machine++ : stats.dict++;
      if (r.machine) mark(produced.filter((n) => n.nodeType === 3));
    }
  }

  async function process(roots) {
    const jobs = [];
    for (const root of roots) if (root.isConnected) jobs.push(...collect(root));
    if (!jobs.length) return;
    await resolveTexts(jobs.map((j) => j.text));
    if (!active) return;
    jobs.forEach(applyJob);
    observer.takeRecords(); // écarte nos propres modifications
  }

  // ---- Surveillance du contenu dynamique

  const pending = new Set();
  let timer = null;
  let running = false;

  function schedule(node) {
    if (!active) return;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.id === "nya-su-host") return;
    pending.add(el);
    clearTimeout(timer);
    timer = setTimeout(flush, 120);
  }

  async function flush() {
    if (running) {
      timer = setTimeout(flush, 120);
      return;
    }
    running = true;
    try {
      const roots = [...pending];
      pending.clear();
      await process(roots);
    } finally {
      running = false;
    }
    if (IS_TOP && active && stats.dict + stats.machine + stats.none > 0) showToast(summary());
  }

  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(schedule);
      else if (m.type === "characterData") schedule(m.target);
    }
  });

  function startPage() {
    if (active) return;
    active = true;
    ensureUI();
    renderFab();
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    schedule(document.body || document.documentElement);
  }

  function stopPage() {
    if (!active) return;
    active = false;
    observer.disconnect();
    clearTimeout(timer);
    pending.clear();

    for (const [k, rec] of state) {
      if (rec.type === "text") {
        if (k.nodeValue === rec.translated) k.nodeValue = rec.orig;
      } else if (k.isConnected && sameChildren(k, rec.produced)) {
        while (k.firstChild) k.removeChild(k.firstChild);
        rec.origNodes.forEach((n) => k.appendChild(n));
      }
    }
    for (const [el, o] of attrState) {
      for (const [a, v] of Object.entries(o)) if (el.getAttribute(a) === v.translated) el.setAttribute(a, v.orig);
    }
    state.clear();
    attrState.clear();
    cache.clear();
    clearMarks();
    stats.dict = stats.machine = stats.none = 0;
    renderFab();
    if (IS_TOP) showToast("Page d'origine restaurée");
  }

  // ------------------------------------------------------------------ Messages et démarrage

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "page-state") {
      msg.active ? startPage() : stopPage();
      if (IS_TOP) sendResponse({ ok: true });
    } else if (msg.type === "show-translation") {
      showBubble(msg.original, msg.result);
    }
    return false;
  });

  if (IS_TOP) ensureUI();
  send({ type: "frame-ready" }).then((r) => {
    if (r && r.active) startPage();
  });
})();
