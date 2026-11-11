#!/usr/bin/env python3
"""Fusionne un CSV rempli par le locuteur natif dans resources/ewo.json.

Colonnes CSV attendues (séparateur , ou ;) :
  id, fr, ewo, status      (status : validated | a_valider)

Usage :
  python tools/csv_to_json.py export  resources/ewo.json  a_traduire.csv
  python tools/csv_to_json.py import  resources/ewo.json  rempli.csv
"""
import csv
import json
import sys
from pathlib import Path


def sniff(path):
    sample = Path(path).read_text(encoding="utf-8-sig")[:2048]
    return ";" if sample.count(";") > sample.count(",") else ","


def export(json_path, csv_path):
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "fr", "ewo", "status"])
        for e in data["terms"] + data["templates"]:
            w.writerow([e["id"], e["fr"], e["ewo"], e["status"]])
    print(f"CSV exporté : {csv_path}")


def import_(json_path, csv_path):
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    index = {e["id"]: e for e in data["terms"] + data["templates"]}
    n = 0
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=sniff(csv_path)):
            e = index.get(row["id"].strip())
            if not e:
                print(f"ID inconnu ignoré : {row['id']}")
                continue
            e["ewo"] = row["ewo"].strip()
            e["status"] = (row.get("status") or "a_valider").strip()
            n += 1
    Path(json_path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{n} entrées mises à jour. Lancez ensuite tools/validate.py.")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("export", "import"):
        sys.exit(__doc__)
    (export if sys.argv[1] == "export" else import_)(sys.argv[2], sys.argv[3])
