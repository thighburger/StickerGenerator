# Pet Sticker ML

MLflow training harness for the pet sticker quality model.

## What it trains

The model predicts whether uploaded cutout images are suitable for sticker sheet production. It uses lightweight image-quality features that can also be computed in the browser:

- resolution score
- aspect balance
- brightness balance
- contrast score
- edge score
- alpha coverage balance
- sheet fill ratio

The initial dataset is a reproducible bootstrap dataset. Real prediction and feedback logs from the app can later be folded into the training data.

## Local MLflow run

```bash
python -m pip install -r pet-sticker-ml/requirements.txt
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.train
```

The training script records parameters, metrics, and artifacts in MLflow, writes a versioned model under `pet-sticker-ml/model-registry/sticker-quality/`, and promotes the best run to the app-facing champion model at `pet-sticker-next/lib/ml/sticker-quality-model.json`.

## Rollback

```bash
PYTHONPATH=pet-sticker-ml/src python -m pet_sticker_ml.rollback --version 2026-06-19-bootstrap
```

Rollback copies the selected registry version back into the app-facing champion model.
