// Test du mode « Traduire la page » sur demo/bank.html dans jsdom.
// Prérequis : npm install --no-save jsdom   puis   node tools/test_page.mjs
// Le moteur de traduction est simulé ; on teste le DOM : slots préservés, contenu dynamique,
// rejet d'un résultat qui perd un montant, et restauration exacte de la page.
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const HTML = readFileSync(ROOT + "demo/bank.html", "utf8");
const SCRIPT = readFileSync(ROOT + "content.js", "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DICT = {
  "Votre solde est ⟦Ea⟧": "EWO-SOLDE ⟦Ea⟧",
  "Frais de transfert : ⟦Ea⟧": "EWO-FRAIS ⟦Ea⟧",
  "Total à payer : ⟦Ea⟧": "EWO-TOTAL ⟦Ea⟧",
  "Pénalité : ⟦Ea⟧": "EWO-PEN", // résultat FAUTIF : perd le montant
  "Votre transfert sera traité sous 24 heures.": "EWO-INEDIT",
};

function fakeEngine(t) {
  if (DICT[t]) return { text: DICT[t], source: "dictionnaire" };
  const m = t.match(/^Transfert de (.+?) vers (.+?) réussi$/);
  if (m) return { text: `EWO-OK ${m[1]} ${m[2]}`, source: "dictionnaire" };
  return { text: t, source: "non traduit", untranslated: true };
}

async function scenario(withExt) {
  const listeners = [];
  let batchCalls = 0;
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://demo.test/",
    beforeParse(win) {
      win.chrome = {
        runtime: {
          lastError: undefined,
          sendMessage(msg, cb) {
            let r;
            if (msg.type === "frame-ready") r = { active: false };
            else if (msg.type === "translate-batch") {
              batchCalls++;
              r = { results: msg.texts.map(fakeEngine) };
            } else r = { ok: true };
            setTimeout(() => cb && cb(r), 0);
          },
          onMessage: { addListener: (fn) => listeners.push(fn) },
        },
      };
    },
  });
  const { window } = dom;
  const doc = window.document;
  await sleep(50);
  if (withExt) window.eval(SCRIPT);

  const setActive = (active) => listeners.forEach((fn) => fn({ type: "page-state", active }, {}, () => {}));
  const click = (id) => doc.getElementById(id).click();
  const out = { checks: [] };
  const check = (name, ok) => out.checks.push([name, !!ok]);

  const balance = doc.querySelector(".balance");
  doc.body.insertAdjacentHTML("beforeend", '<p id="bad">Pénalité : <span>7000 F CFA</span></p>');

  if (withExt) setActive(true);
  await sleep(400);

  if (withExt) {
    const p = balance.parentElement;
    check("phrase du solde traduite", p.textContent.startsWith("EWO-SOLDE"));
    check("montant intact dans la phrase", p.textContent.includes("12 500 F CFA"));
    check("élément montant = même nœud DOM", p.contains(balance) && balance.textContent === "12 500 F CFA");
    check("résultat qui perd le montant rejeté", doc.getElementById("bad").textContent === "Pénalité : 7000 F CFA");
    const calls = batchCalls;
    await sleep(500);
    check("pas de boucle de traduction", batchCalls === calls);
  }

  click("goTransfer");
  click("preview");
  await sleep(400);
  if (withExt) {
    const dt = doc.getElementById("rFee").closest("dt");
    check("frais traduits avec montant rempli après coup", dt.textContent.includes("EWO-FRAIS") && /\d+ F CFA/.test(dt.textContent));
    check("total traduit", doc.getElementById("rTot").closest("dt").textContent.includes("EWO-TOTAL"));
  }

  click("confirm");
  await sleep(400);
  if (withExt) {
    const t = doc.getElementById("doneMsg").textContent;
    check("message dynamique traduit", t.startsWith("EWO-OK"));
    check("montant et bénéficiaire intacts", t.includes("5 000 F CFA") && t.includes("Marie Ndzana"));
  }

  click("inject");
  await sleep(400);
  if (withExt) check("contenu inédit traduit", doc.getElementById("injected").textContent === "EWO-INEDIT");

  if (withExt) {
    setActive(false);
    await sleep(100);
    check("bouton restauré", doc.getElementById("nya-su-host").shadowRoot.querySelector(".fab").textContent === "Traduire en Ewondo");
  }
  out.html = doc.body.innerHTML;
  window.close();
  return out;
}

const withExt = await scenario(true);
const baseline = await scenario(false);
withExt.checks.push(["page restaurée à l'identique (octet pour octet)", withExt.html === baseline.html]);

let failed = 0;
for (const [name, ok] of withExt.checks) {
  console.log(ok ? "OK  " : "FAIL", name);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
