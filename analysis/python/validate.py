#!/usr/bin/env python3
"""Validate the problems CSV against the JSON schema."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


def load_schema(root: Path) -> Dict[str, Any]:
    schema_paths = [
        root / "schemas" / "problem.schema.json",
        root / "schemas" / "problems.schema.json",
    ]
    for candidate in schema_paths:
        if candidate.exists():
            with candidate.open("r", encoding="utf-8") as handle:
                return json.load(handle)
    print("Schema file not found in expected locations.", file=sys.stderr)
    sys.exit(1)


def read_rows(csv_path: Path) -> List[Dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    return rows


def validate_row(index: int, row: Dict[str, str], schema: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    item_schema = schema.get("items", {})
    properties: Dict[str, Any] = item_schema.get("properties", {})
    required_fields = item_schema.get("required", [])

    for field in required_fields:
        value = row.get(field, "")
        if value is None or str(value).strip() == "":
            errors.append(f"Missing required field '{field}'")

    for field, definition in properties.items():
        raw_value = row.get(field, "")
        if raw_value is None or str(raw_value).strip() == "":
            if field in required_fields:
                errors.append(f"Field '{field}' cannot be empty")
            continue

        expected_type = definition.get("type")
        if expected_type == "integer":
            try:
                numeric_value = int(str(raw_value).strip())
            except (TypeError, ValueError):
                errors.append(f"Field '{field}' must be an integer")
                continue
            minimum = definition.get("minimum")
            maximum = definition.get("maximum")
            if minimum is not None and numeric_value < minimum:
                errors.append(
                    f"Field '{field}' must be >= {minimum} (got {numeric_value})"
                )
            if maximum is not None and numeric_value > maximum:
                errors.append(
                    f"Field '{field}' must be <= {maximum} (got {numeric_value})"
                )
            continue

        if expected_type == "string":
            if not isinstance(raw_value, str):
                errors.append(f"Field '{field}' must be a string")

        enum_values = definition.get("enum")
        if enum_values and str(raw_value).strip() not in enum_values:
            errors.append(
                f"Field '{field}' must be one of {enum_values} (got '{raw_value}')"
            )

    return errors


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    csv_path = root / "data" / "problems.csv"

    if not csv_path.exists():
        print("CSV file data/problems.csv does not exist.", file=sys.stderr)
        sys.exit(1)

    schema = load_schema(root)
    rows = read_rows(csv_path)

    if not rows:
        print("No records found in problems.csv.", file=sys.stderr)
        sys.exit(1)

    all_errors: List[str] = []
    for idx, row in enumerate(rows, start=2):
        row_errors = validate_row(idx, row, schema)
        if row_errors:
            for error in row_errors:
                all_errors.append(f"Row {idx}: {error}")

    if all_errors:
        print("Validation failed:")
        for error in all_errors:
            print(f" - {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
