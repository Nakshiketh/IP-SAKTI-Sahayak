"""Generate schemas/domain.schema.json from the Pydantic domain model.

This file is the contract between backend and frontend. It is checked in, and two
tests guard it:

* ``backend/tests/test_schema_drift.py`` regenerates it and fails if the checked-in
  copy is stale (the Pydantic side drifted).
* ``frontend/src/types/domain.test.ts`` reads it and fails if the TypeScript types
  no longer match (the TypeScript side drifted).

Run ``python scripts/gen_schema.py`` after any change to ``app/models/domain.py``.
Run with ``--check`` to verify without writing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.models.domain import CONTRACT_ENUMS, CONTRACT_MODELS  # noqa: E402

SCHEMA_PATH = REPO_ROOT / "schemas" / "domain.schema.json"


def build_schema() -> dict:
    """Produce a flat, stable schema: one definition per enum and per model."""
    definitions: dict[str, dict] = {}

    for enum_cls in CONTRACT_ENUMS:
        definitions[enum_cls.__name__] = {
            "title": enum_cls.__name__,
            "type": "string",
            "enum": [member.value for member in enum_cls],
        }

    for model_cls in CONTRACT_MODELS:
        schema = model_cls.model_json_schema(
            ref_template="#/$defs/{model}",
            mode="serialization",
        )
        # Pydantic inlines referenced enums under $defs of each model; the flat
        # top-level $defs above already carries them, so drop the local copies.
        schema.pop("$defs", None)
        definitions[model_cls.__name__] = schema

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "IP-SAKTI Sahayak domain model",
        "description": (
            "Generated from backend/app/models/domain.py by scripts/gen_schema.py. "
            "Do not edit by hand."
        ),
        "$defs": definitions,
    }


def render(schema: dict) -> str:
    return json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if the checked-in schema is out of date",
    )
    args = parser.parse_args()

    rendered = render(build_schema())

    if args.check:
        if not SCHEMA_PATH.exists():
            print(f"missing {SCHEMA_PATH}; run: python scripts/gen_schema.py")
            return 1
        if SCHEMA_PATH.read_text(encoding="utf-8") != rendered:
            print(
                f"{SCHEMA_PATH} is out of date with app/models/domain.py.\n"
                "Run: python scripts/gen_schema.py"
            )
            return 1
        print(f"{SCHEMA_PATH.name} is current.")
        return 0

    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_PATH.write_text(rendered, encoding="utf-8")
    print(f"wrote {SCHEMA_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
