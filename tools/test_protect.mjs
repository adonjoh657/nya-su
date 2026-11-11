// Test rapide de protect.js : node tools/test_protect.mjs
import { protect, restore, amountsPreserved } from "../protect.js";

const cases = [
  "Votre solde est 12 500 F CFA",
  "Vous allez envoyer 5000 FCFA à Marie Ndzana.",
  "Frais de transfert : 50 F CFA",
  "Montant maximum : 500 000 F CFA",
  "Entrez le code envoyé au 699 12 34 56",
];

let failed = 0;
for (const c of cases) {
  const { text, tokens } = protect(c);
  const back = restore(text, tokens);
  const ok = back === c && amountsPreserved(c, back);
  if (!ok) failed++;
  console.log(ok ? "OK  " : "FAIL", JSON.stringify(c), "->", JSON.stringify(text));
}

// Les noms propres et numéros ne doivent jamais apparaître dans le texte envoyé à l'API.
{
  const c = "Vous allez envoyer 5000 FCFA à Marie Ndzana au 699 12 34 56.";
  const { text, tokens } = protect(c);
  const leak = ["Marie", "Ndzana", "5000", "699"].some((s) => text.includes(s));
  const ok = !leak && restore(text, tokens) === c;
  if (!ok) failed++;
  console.log(ok ? "OK  " : "FAIL", "noms et numéros masqués puis restaurés :", JSON.stringify(text));
}

// Un modèle qui altère un montant doit être détecté.
const altered = "Solde ewo 12 000 F CFA";
const bad = !amountsPreserved("Votre solde est 12 500 F CFA", altered);
console.log(bad ? "OK  " : "FAIL", "altération détectée");
if (!bad) failed++;

process.exit(failed ? 1 : 0);
