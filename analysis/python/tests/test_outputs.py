import os, csv


def _read_rows(path):
    assert os.path.exists(path), f"missing artifact: {path}"
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def test_problems_enriched_exists_and_nonempty():
    rows = _read_rows('docs/data/problems_enriched.csv')
    assert len(rows) >= 1, "problems_enriched.csv must have at least 1 row"


def test_micmac_when_edges_exist():
    # MICMAC می‌تواند خالی باشد اگر edges نداریم؛ در غیر اینصورت باید حداقل 1 ردیف داشته باشد
    edges_path = 'data/edges.csv'
    edges_rows = 0
    if os.path.exists(edges_path):
        with open(edges_path, newline='', encoding='utf-8') as f:
            edges_rows = max(0, sum(1 for _ in f) - 1)  # minus header
    micmac = _read_rows('docs/data/micmac.csv')
    if edges_rows > 0:
        assert len(micmac) >= 1, "micmac.csv should not be empty when edges exist"


def test_ism_levels_exists():
    _ = _read_rows('docs/data/ism_levels.csv')
