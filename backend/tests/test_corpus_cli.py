"""The two entry points, driven the way a person drives them.

Worth testing separately from the pipeline because the bugs here are argument
bugs, and one of them was real: `refresh --write` ignored `--index-dir` and
rebuilt the default index from the sample manifest, which put fictional
instruments where the served corpus lives.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import ingest as ingest_cli  # noqa: E402
import refresh as refresh_cli  # noqa: E402

SAMPLES = "corpus/samples/manifest.json"


@pytest.fixture
def manifest_copy(tmp_path) -> Path:
    """A copy, so a run's write-back does not touch the committed fixture."""
    home = tmp_path / "samples"
    home.mkdir()
    source = REPO_ROOT / "corpus" / "samples"
    for path in source.glob("*.*"):
        if path.is_file():
            (home / path.name).write_bytes(path.read_bytes())
    return home / "manifest.json"


def test_ingest_builds_where_it_is_told(manifest_copy: Path, tmp_path, capsys) -> None:
    index = tmp_path / "somewhere-else"
    code = ingest_cli.main(
        ["--manifest", str(manifest_copy), "--index-dir", str(index), "--no-review"]
    )
    assert code == 0
    assert (index / "chunks-in.sqlite3").exists()
    assert not (REPO_ROOT / "data" / "index" / "chunks-in.sqlite3").exists()

    out = capsys.readouterr().out
    assert "chunks written" in out
    assert "never fetches it" in out


def test_ingest_over_the_real_manifest_builds_nothing_and_says_why(tmp_path, capsys) -> None:
    """37 sources, no verified URLs. The honest outcome is a report, not a build."""
    code = ingest_cli.main(["--index-dir", str(tmp_path / "index"), "--no-review"])
    assert code == 0
    out = capsys.readouterr().out
    assert "no source_url has been verified" in out
    assert "Nothing was indexed. Nothing was guessed either." in out
    assert not (tmp_path / "index" / "chunks-in.sqlite3").exists()


def test_ingest_reports_a_missing_manifest_rather_than_raising(capsys) -> None:
    assert ingest_cli.main(["--manifest", "corpus/does-not-exist.json"]) == 2
    assert "No such manifest" in capsys.readouterr().err


def test_a_failing_document_makes_the_run_exit_non_zero(
    manifest_copy: Path, tmp_path, capsys
) -> None:
    raw = json.loads(manifest_copy.read_text(encoding="utf-8"))
    raw["documents"][0]["effective_from"] = None
    manifest_copy.write_text(json.dumps(raw), encoding="utf-8")

    code = ingest_cli.main(
        ["--manifest", str(manifest_copy), "--index-dir", str(tmp_path / "i"), "--no-review"]
    )
    assert code == 1
    assert "FAILED" in capsys.readouterr().out


def test_refresh_reports_without_writing(manifest_copy: Path, tmp_path, capsys) -> None:
    index = tmp_path / "index"
    ingest_cli.main(["--manifest", str(manifest_copy), "--index-dir", str(index), "--no-review"])
    capsys.readouterr()

    assert refresh_cli.main(["--manifest", str(manifest_copy), "--index-dir", str(index)]) == 0
    out = capsys.readouterr().out
    assert "UNCHANGED (3)" in out
    assert "SKIPPED (1)" in out


def test_refresh_rebuilds_where_it_is_told(manifest_copy: Path, tmp_path, capsys) -> None:
    index = tmp_path / "index"
    ingest_cli.main(["--manifest", str(manifest_copy), "--index-dir", str(index), "--no-review"])
    capsys.readouterr()

    statute = manifest_copy.parent / "sample-instruments-act-2020.txt"
    statute.write_text(
        statute.read_text(encoding="utf-8").replace(
            "evidence of the particulars entered in it and of nothing else",
            "evidence of the particulars entered in it, and of nothing else at all",
        ),
        encoding="utf-8",
    )

    code = refresh_cli.main(
        ["--manifest", str(manifest_copy), "--index-dir", str(index), "--write"]
    )
    assert code == 0
    out = capsys.readouterr().out
    assert "CHANGED (1)" in out
    assert "retained from a previous version" in out
    # The one thing this must never do: build the sample corpus into the
    # place the served corpus lives.
    assert not (REPO_ROOT / "data" / "index" / "chunks-in.sqlite3").exists()


def test_refresh_names_what_moved_in_the_changelog(manifest_copy: Path, tmp_path, capsys) -> None:
    index = tmp_path / "index"
    ingest_cli.main(["--manifest", str(manifest_copy), "--index-dir", str(index), "--no-review"])
    statute = manifest_copy.parent / "sample-instruments-act-2020.txt"
    statute.write_text(
        statute.read_text(encoding="utf-8").replace(
            "evidence of the particulars entered in it and of nothing else",
            "evidence of the particulars entered in it, and of nothing else at all",
        ),
        encoding="utf-8",
    )
    refresh_cli.main(["--manifest", str(manifest_copy), "--index-dir", str(index), "--write"])
    capsys.readouterr()

    changelog = (manifest_copy.parent / "CHANGELOG.md").read_text(encoding="utf-8")
    assert "CHAPTER III › Section 6" in changelog
    assert "retained and closed" in changelog
