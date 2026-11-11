#!/usr/bin/env python3
"""Contrôle l'intégrité de resources/ewo.json.

Vérifie : JSON valide, ids uniques, regex compilables, variables {x} identiques
entre fr et ewo, et que toute entrée 'validated' a une traduction non vide.
Code de sortie 1 en cas d'erreur.
"""
import json
import re
import sys
from pathlib import Path

VAR = re.compile(r"\{(\w+)\}")


def main(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    errors, seen = [], set()
    entries = [("terme", e) for e in data["terms"]] + [("template", e) for e in data["templates"]]

    for kind, e in entries:
        eid = e.get("id", "?")
        if eid in seen:
            errors.append(f"{eid}: id en double")
        seen.add(eid)

        if e["status"] == "validated" and not e["ewo"].strip():
            errors.append(f"{eid}: validated mais ewo vide")

        if kind == "template":
            # La syntaxe (?<nom>...) est celle de JavaScript ; on la convertit pour Python.
            try:
                re.compile(e["regex"].replace("(?<", "(?P<"))
            except re.error as ex:
                errors.append(f"{eid}: regex invalide ({ex})")
            if e["ewo"].strip() and set(VAR.findall(e["fr"])) != set(VAR.findall(e["ewo"])):
                errors.append(f"{eid}: variables {{}} différentes entre fr et ewo")

    total = len(entries)
    validated = sum(1 for _, e in entries if e["status"] == "validated" and e["ewo"].strip())
    print(f"{total} entrées, {validated} validées, {total - validated} à traiter.")
    for err in errors:
        print("ERREUR", err)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "resources/ewo.json")
