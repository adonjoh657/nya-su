#!/usr/bin/env python3
"""Génère resources/ewo.json avec les entrées FRANÇAISES uniquement.

Les champs 'ewo' sont laissés vides avec status 'a_valider' : aucune traduction
n'est inventée. Un locuteur natif (ou votre corpus via csv_to_json.py) les remplit.
Seules les entrées status == 'validated' ET ewo non vide sont utilisées par l'extension.
"""
import json
import sys
from pathlib import Path

TERMS = [
    # (fr, domaine, critique)
    ("solde", "account", False), ("votre solde", "account", False),
    ("compte", "account", False), ("numéro de compte", "account", True),
    ("transfert", "transfer", False), ("envoyer de l'argent", "transfer", False),
    ("recevoir de l'argent", "transfer", False), ("bénéficiaire", "transfer", True),
    ("montant", "transfer", True), ("frais", "fees", True), ("frais de transfert", "fees", True),
    ("total à payer", "fees", True), ("confirmer", "action", False), ("annuler", "action", False),
    ("valider", "action", False), ("continuer", "action", False), ("retour", "action", False),
    ("code PIN", "security", True), ("mot de passe", "security", True),
    ("code de confirmation", "security", True), ("ne partagez jamais votre code PIN", "security", True),
    ("opération réussie", "status", False), ("opération échouée", "status", False),
    ("solde insuffisant", "error", True), ("montant invalide", "error", True),
    ("numéro invalide", "error", True), ("erreur de connexion", "error", False),
    ("réessayez plus tard", "error", False), ("transaction en cours", "status", False),
    ("historique des transactions", "account", False), ("dépôt", "account", False),
    ("retrait", "account", False), ("paiement", "payment", False), ("payer une facture", "payment", False),
    ("recharge", "payment", False), ("crédit", "account", False), ("épargne", "account", False),
    ("prêt", "loan", False), ("remboursement", "loan", False), ("taux d'intérêt", "loan", True),
    ("date d'échéance", "loan", True), ("agent", "service", False), ("agence", "service", False),
    ("service client", "service", False), ("aide", "service", False), ("bonjour", "general", False),
    ("merci", "general", False), ("oui", "general", False), ("non", "general", False),
    ("récapitulatif", "transfer", False), ("vérifiez les informations avant de confirmer", "transfer", True),
]

TEMPLATES = [
    # (fr, regex, critique)
    ("Votre solde est {amount}", r"^Votre solde est (?<amount>.+?)\.?$", True),
    ("Les frais sont de {amount}", r"^Les frais sont de (?<amount>.+?)\.?$", True),
    ("Frais de transfert : {amount}", r"^Frais de transfert\s*:\s*(?<amount>.+?)\.?$", True),
    ("Total à payer : {amount}", r"^Total à payer\s*:\s*(?<amount>.+?)\.?$", True),
    ("Vous allez envoyer {amount} à {beneficiary}",
     r"^Vous allez envoyer (?<amount>.+?) à (?<beneficiary>.+?)\.?$", True),
    ("Transfert de {amount} vers {beneficiary} réussi",
     r"^Transfert de (?<amount>.+?) vers (?<beneficiary>.+?) réussi\.?$", True),
    ("Vous avez reçu {amount} de {sender}", r"^Vous avez reçu (?<amount>.+?) de (?<sender>.+?)\.?$", True),
    ("Veuillez confirmer le transfert de {amount}",
     r"^Veuillez confirmer le transfert de (?<amount>.+?)\.?$", True),
    ("Solde insuffisant. Votre solde est {amount}",
     r"^Solde insuffisant\. Votre solde est (?<amount>.+?)\.?$", True),
    ("Montant minimum : {amount}", r"^Montant minimum\s*:\s*(?<amount>.+?)\.?$", True),
    ("Montant maximum : {amount}", r"^Montant maximum\s*:\s*(?<amount>.+?)\.?$", True),
    ("Entrez le code envoyé au {phone}", r"^Entrez le code envoyé au (?<phone>.+?)\.?$", True),
    ("Votre remboursement de {amount} est dû le {date}",
     r"^Votre remboursement de (?<amount>.+?) est dû le (?<date>.+?)\.?$", True),
]


def main(out_path):
    terms = [
        {"id": f"t.{i:03d}", "fr": fr, "ewo": "", "domain": dom, "critical": crit, "status": "a_valider"}
        for i, (fr, dom, crit) in enumerate(TERMS, 1)
    ]
    templates = [
        {"id": f"tpl.{i:03d}", "fr": fr, "ewo": "", "regex": rx, "critical": crit, "status": "a_valider"}
        for i, (fr, rx, crit) in enumerate(TEMPLATES, 1)
    ]
    data = {
        "meta": {
            "name": "ewondo-financial-dictionary",
            "version": "0.1.0",
            "languages": ["fr", "ewo"],
            "domain": "financial_ui",
            "validated_by": "",
            "note": "Champs ewo vides : à remplir et valider par un locuteur natif. status = validated pour activer.",
        },
        "templates": templates,
        "terms": terms,
        "fallbacks": [],
    }
    Path(out_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(terms)} termes + {len(templates)} templates écrits dans {out_path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "resources/ewo.json")
