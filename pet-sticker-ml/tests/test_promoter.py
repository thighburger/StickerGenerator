import pytest

from pet_sticker_ml import config, model_promoter
from pet_sticker_ml.champion_export import (
    MODEL_FILENAME,
    build_metadata,
    export_model,
    load_metadata,
)
from pet_sticker_ml.train import train_model


@pytest.fixture
def isolated_dirs(tmp_path, monkeypatch):
    champion = tmp_path / "champion"
    candidate = tmp_path / "candidate"
    history = tmp_path / "history"
    monkeypatch.setattr(config, "CHAMPION_DIR", champion)
    monkeypatch.setattr(config, "CANDIDATE_DIR", candidate)
    monkeypatch.setattr(config, "MODEL_HISTORY_DIR", history)
    return champion, candidate, history


@pytest.fixture(scope="module")
def small_pipeline():
    return train_model("v1", seed=1, n_estimators=30).pipeline


def _export(pipeline, target, version, macro_f1):
    metadata = build_metadata(
        version=version,
        run_id=None,
        data_version="v1",
        metrics={"macro_f1": macro_f1},
        params={},
    )
    export_model(pipeline, metadata, target)


def test_promote_when_better(isolated_dirs, small_pipeline):
    champion, candidate, history = isolated_dirs
    _export(small_pipeline, champion, 1, 0.50)
    _export(small_pipeline, candidate, 2, 0.60)
    decision = model_promoter.promote(min_delta=0.0)
    assert decision["promoted"] is True
    assert decision["new_version"] == 2
    assert load_metadata(champion)["metrics"]["macro_f1"] == 0.60
    assert (history / "v1" / MODEL_FILENAME).exists()  # 이전 챔피언 보관


def test_keep_when_worse(isolated_dirs, small_pipeline):
    champion, candidate, _ = isolated_dirs
    _export(small_pipeline, champion, 1, 0.70)
    _export(small_pipeline, candidate, 2, 0.65)
    decision = model_promoter.promote(min_delta=0.0)
    assert decision["promoted"] is False
    assert load_metadata(champion)["metrics"]["macro_f1"] == 0.70


def test_bootstrap_when_no_champion(isolated_dirs, small_pipeline):
    champion, candidate, _ = isolated_dirs
    _export(small_pipeline, candidate, 1, 0.55)
    decision = model_promoter.promote(min_delta=0.0)
    assert decision["promoted"] is True
    assert load_metadata(champion) is not None
