import csv
from pathlib import Path


def _data_rows(csv_path: Path) -> int:
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return sum(1 for _ in csv.DictReader(handle))


def test_required_csv_files_exist():
    data_dir = Path(__file__).resolve().parents[3] / "docs" / "data"
    required_files = [
        data_dir / "problems_enriched.csv",
        data_dir / "micmac.csv",
        data_dir / "ism_levels.csv",
    ]

    missing = [path for path in required_files if not path.exists()]
    assert not missing, f"Missing expected CSV files: {missing}"


def test_problems_enriched_has_data():
    data_dir = Path(__file__).resolve().parents[3] / "docs" / "data"
    problems_enriched = data_dir / "problems_enriched.csv"
    assert _data_rows(problems_enriched) >= 1, "problems_enriched.csv must have at least one data row"


def test_micmac_has_data_when_edges_present():
    data_dir = Path(__file__).resolve().parents[3] / "docs" / "data"
    edges = data_dir / "edges.csv"
    micmac = data_dir / "micmac.csv"

    if edges.exists() and _data_rows(edges) > 0:
        assert _data_rows(micmac) >= 1, "micmac.csv must have at least one data row when edges are provided"
