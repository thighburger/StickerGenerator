from pet_sticker_ml.features import DatasetConfig, FEATURE_NAMES, generate_bootstrap_dataset


def test_bootstrap_dataset_shape_and_range():
    x, y = generate_bootstrap_dataset(DatasetConfig(n_samples=32, seed=7))

    assert x.shape == (32, len(FEATURE_NAMES))
    assert y.shape == (32,)
    assert x.min() >= 0
    assert x.max() <= 1
    assert y.min() >= 0
    assert y.max() <= 100
