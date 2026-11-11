#!/usr/bin/env python3
"""Fine-tuning d'un modèle Marian (OPUS-MT) sur votre corpus Ewondo–Français.

Corpus attendu : un fichier TSV ou CSV avec deux colonnes (fr, ewo), avec ou sans en-tête.
  python training/train.py --corpus corpus.tsv --direction fr-ewo --out out/fr-ewo

IMPORTANT
- Le modèle de base (opus-mt-fr-en par défaut) n'a jamais vu l'ewondo. Son tokenizer
  peut mal gérer ɛ ɔ ŋ ɓ et les tons. Le script mesure le taux de <unk> et vous avertit.
- Les montants sont remplacés par des jetons ⟦0⟧… dans le corpus, comme dans l'extension,
  pour que le modèle apprenne à les recopier tels quels.
- Séparez toujours un jeu de test (--test-size) et faites-le relire par un locuteur natif :
  le score BLEU seul ne garantit pas une traduction correcte en ewondo.

Dépendances : pip install transformers datasets sentencepiece sacrebleu accelerate torch
"""
import argparse
import csv
import random
import re
import sys
from pathlib import Path

AMOUNT_RE = re.compile(r"\d[\d\s .,]*\d?\s?(?:F\s?CFA|FCFA|XAF|XOF|F|CFA|€|EUR|\$|USD)?", re.I)


def protect_pair(fr, ewo):
    """Remplace les montants par ⟦i⟧ des deux côtés, si les deux phrases contiennent les mêmes."""
    a, b = AMOUNT_RE.findall(fr), AMOUNT_RE.findall(ewo)
    if sorted(x.strip() for x in a) != sorted(x.strip() for x in b):
        return fr, ewo  # montants différents : on laisse tel quel (à vérifier à la main)
    for i, m in enumerate(a):
        fr = fr.replace(m, f"⟦{i}⟧", 1)
        ewo = ewo.replace(m, f"⟦{i}⟧", 1)
    return fr, ewo


def read_corpus(path):
    p = Path(path)
    sample = p.read_text(encoding="utf-8-sig")[:4096]
    delim = "\t" if sample.count("\t") >= max(sample.count(";"), sample.count(",")) else (";" if sample.count(";") > sample.count(",") else ",")
    rows = []
    with open(p, newline="", encoding="utf-8-sig") as f:
        for r in csv.reader(f, delimiter=delim):
            if len(r) < 2:
                continue
            fr, ewo = r[0].strip(), r[1].strip()
            if not fr or not ewo or fr.lower() in ("fr", "french", "français"):
                continue
            rows.append((fr, ewo))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--direction", choices=["fr-ewo", "ewo-fr"], default="fr-ewo")
    ap.add_argument("--base", default="Helsinki-NLP/opus-mt-fr-en")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--test-size", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    from datasets import Dataset
    from transformers import (AutoModelForSeq2SeqLM, AutoTokenizer, DataCollatorForSeq2Seq,
                              Seq2SeqTrainer, Seq2SeqTrainingArguments)

    pairs = [protect_pair(fr, ewo) for fr, ewo in read_corpus(args.corpus)]
    if len(pairs) < 200:
        print(f"ATTENTION : seulement {len(pairs)} paires. En dessous de quelques milliers, "
              "attendez-vous à des traductions fragiles sur les phrases inédites.", file=sys.stderr)
    if args.direction == "ewo-fr":
        pairs = [(e, f) for f, e in pairs]

    random.Random(args.seed).shuffle(pairs)
    n_test = max(1, int(len(pairs) * args.test_size))
    test, train = pairs[:n_test], pairs[n_test:]
    print(f"train={len(train)}  test={len(test)}")

    tok = AutoTokenizer.from_pretrained(args.base)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.base)

    # Taux de <unk> côté cible : signal d'alerte sur la couverture des caractères ewondo.
    tgt_sample = [t for _, t in train[:500]]
    ids = tok(text_target=tgt_sample)["input_ids"]
    unk = sum(i.count(tok.unk_token_id) for i in ids) / max(1, sum(len(i) for i in ids))
    print(f"Taux de <unk> côté cible : {unk:.2%}")
    if unk > 0.02:
        print("ATTENTION : taux de <unk> élevé. Envisagez un modèle de base dont le tokenizer "
              "couvre mieux vos caractères, ou entraînez un tokenizer dédié.", file=sys.stderr)

    def prep(batch):
        enc = tok(batch["src"], text_target=batch["tgt"], truncation=True, max_length=128)
        return enc

    mk = lambda data: Dataset.from_dict({"src": [s for s, _ in data], "tgt": [t for _, t in data]}).map(
        prep, batched=True, remove_columns=["src", "tgt"])
    ds_train, ds_test = mk(train), mk(test)

    targs = Seq2SeqTrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        predict_with_generate=False,
        fp16=False,
        seed=args.seed,
        report_to=[],
    )
    trainer = Seq2SeqTrainer(model=model, args=targs, train_dataset=ds_train, eval_dataset=ds_test,
                             data_collator=DataCollatorForSeq2Seq(tok, model=model), tokenizer=tok)
    trainer.train()
    trainer.save_model(args.out)
    tok.save_pretrained(args.out)

    # Jeu de test écrit en clair pour relecture par un locuteur natif.
    with open(Path(args.out) / "test_pairs.tsv", "w", encoding="utf-8") as f:
        for s, t in test:
            f.write(f"{s}\t{t}\n")
    print(f"Modèle sauvegardé dans {args.out}")


if __name__ == "__main__":
    main()
