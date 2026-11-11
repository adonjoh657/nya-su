#!/usr/bin/env python3
"""Exporte le modèle fine-tuné en ONNX int8 et génère le manifest.json (avec SHA-256)
à héberger pour le bouton « Installer le mode hors-ligne ».

  python training/export_onnx.py --model out/fr-ewo --out dist/ewo-model-v1 --version 1

Dépendances : pip install "optimum[onnxruntime]" onnxruntime
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--version", default="1")
    ap.add_argument("--no-quantize", action="store_true")
    args = ap.parse_args()

    from optimum.onnxruntime import ORTModelForSeq2SeqLM, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    out = Path(args.out)
    raw = out / "_raw"
    raw.mkdir(parents=True, exist_ok=True)

    model = ORTModelForSeq2SeqLM.from_pretrained(args.model, export=True)
    model.save_pretrained(raw)
    AutoTokenizer.from_pretrained(args.model).save_pretrained(raw)

    keep = []
    if args.no_quantize:
        for n in ("encoder_model.onnx", "decoder_model.onnx", "decoder_with_past_model.onnx"):
            if (raw / n).exists():
                shutil.copy(raw / n, out / n)
                keep.append(n)
    else:
        qconf = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
        for n in ("encoder_model.onnx", "decoder_model.onnx", "decoder_with_past_model.onnx"):
            if (raw / n).exists():
                ORTQuantizer.from_pretrained(raw, file_name=n).quantize(save_dir=out / "_q", quantization_config=qconf)
                src = out / "_q" / n.replace(".onnx", "_quantized.onnx")
                shutil.move(src, out / n)
                keep.append(n)

    for n in ("tokenizer.json", "tokenizer_config.json", "config.json", "generation_config.json",
              "source.spm", "target.spm", "vocab.json"):
        if (raw / n).exists():
            shutil.copy(raw / n, out / n)
            keep.append(n)

    shutil.rmtree(raw, ignore_errors=True)
    shutil.rmtree(out / "_q", ignore_errors=True)

    files = [{"name": n, "sha256": sha256(out / n), "size": (out / n).stat().st_size} for n in keep]
    (out / "manifest.json").write_text(json.dumps({"version": args.version, "files": files}, indent=2))
    total = sum(f["size"] for f in files) / 1048576
    print(f"Export terminé : {len(files)} fichiers, {total:.1f} Mo dans {out}")


if __name__ == "__main__":
    main()
