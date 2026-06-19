"""Feature generation for the sticker quality model."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

FEATURE_NAMES = [
    "resolution_score",
    "aspect_balance",
    "brightness_balance",
    "contrast_score",
    "edge_score",
    "alpha_balance",
    "sheet_fill_ratio",
]


@dataclass(frozen=True)
class DatasetConfig:
    """Controls deterministic bootstrap data generation."""

    n_samples: int = 900
    seed: int = 42
    noise: float = 2.2


TARGET_WEIGHTS = np.array([0.18, 0.12, 0.13, 0.13, 0.14, 0.13, 0.17])


def generate_bootstrap_dataset(config: DatasetConfig) -> tuple[np.ndarray, np.ndarray]:
    """Create a reproducible bootstrap dataset for initial MLOps runs."""
    rng = np.random.default_rng(config.seed)
    x = rng.beta(2.4, 1.8, size=(config.n_samples, len(FEATURE_NAMES)))

    # Real sticker sheets usually target a high fill ratio, so shift that feature upward.
    x[:, FEATURE_NAMES.index("sheet_fill_ratio")] = rng.beta(5.0, 2.0, size=config.n_samples)

    interaction_bonus = (
        4.0
        * x[:, FEATURE_NAMES.index("resolution_score")]
        * x[:, FEATURE_NAMES.index("edge_score")]
    )
    target = (x @ TARGET_WEIGHTS) * 100.0 + interaction_bonus
    target += rng.normal(0.0, config.noise, size=config.n_samples)
    y = np.clip(target, 0.0, 100.0)
    return x.astype(float), y.astype(float)
