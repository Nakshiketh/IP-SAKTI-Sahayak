"""Check the locale files, and write down how far each language really got.

    python scripts/i18n/check_locales.py            # report, exit 1 on a failure
    python scripts/i18n/check_locales.py --write    # also update locales.meta.json

What it enforces, and why each one is a real failure rather than a preference:

* **Key parity.** A key present in English and missing elsewhere renders as a
  raw dotted key on screen. The i18n seed script fills these, so a gap here
  means someone edited a locale file by hand.
* **Placeholder parity.** `{{count}}` dropped in translation produces a sentence
  with a hole where a number should be. Worse, a placeholder *added* in
  translation renders literally.
* **No empty values.** An empty string is indistinguishable from a missing
  translation at runtime and silently renders as nothing at all.
* **English leakage in tier 1.** A tier-1 language is claimed to be reviewed. A
  value identical to English is either untranslated or a word that genuinely
  does not translate; above a small share it is the former, and the claim is
  false.

Coverage is then written back into `locales.meta.json`, so what the switcher
tells a reader about a language comes from the files rather than from memory.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCALES_DIR = REPO_ROOT / "frontend" / "src" / "locales"
META_PATH = REPO_ROOT / "frontend" / "src" / "i18n" / "locales.meta.json"

SOURCE = "en"
#: A value equal to English is untranslated, unless it is a brand name or a
#: term of art that stays as it is. Above this share of a file, the language is
#: not reviewed whatever its metadata says.
TIER_1_LEAKAGE_LIMIT = 0.5
PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")

#: Set by the translator to say a file is machine-drafted or untouched. Not a
#: translation key, so it never counts towards coverage.
MARKER = "__untranslated"


def flatten(node: object, prefix: str = "") -> dict[str, str]:
    """Every leaf, by its dotted path. The marker key is not a leaf."""
    out: dict[str, str] = {}
    if isinstance(node, dict):
        for key, value in node.items():
            if key == MARKER:
                continue
            out.update(flatten(value, f"{prefix}.{key}" if prefix else key))
    elif isinstance(node, str):
        out[prefix] = node
    return out


def load(locale: str) -> dict[str, dict[str, str]]:
    files: dict[str, dict[str, str]] = {}
    for path in sorted((LOCALES_DIR / locale).glob("*.json")):
        files[path.stem] = flatten(json.loads(path.read_text("utf-8")))
    return files


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="update locales.meta.json")
    args = parser.parse_args(argv)

    meta = json.loads(META_PATH.read_text("utf-8"))
    tiers = {entry["code"]: entry["tier"] for entry in meta["locales"]}
    english = load(SOURCE)
    problems: list[str] = []
    coverage: dict[str, float] = {SOURCE: 1.0}

    for locale in sorted(tiers):
        if locale == SOURCE:
            continue
        files = load(locale)
        translated = 0
        total = 0
        leaked = 0

        for namespace, source_keys in english.items():
            target_keys = files.get(namespace)
            if target_keys is None:
                problems.append(f"{locale}/{namespace}.json is missing entirely")
                total += len(source_keys)
                continue

            for key, source_value in source_keys.items():
                total += 1
                if key not in target_keys:
                    problems.append(f"{locale}/{namespace}: missing key {key}")
                    continue

                value = target_keys[key]
                if not value.strip():
                    problems.append(f"{locale}/{namespace}: empty value for {key}")
                    continue

                source_slots = sorted(PLACEHOLDER.findall(source_value))
                target_slots = sorted(PLACEHOLDER.findall(value))
                if source_slots != target_slots:
                    problems.append(
                        f"{locale}/{namespace}: placeholders differ for {key} "
                        f"({source_slots} vs {target_slots})"
                    )
                    continue

                if value == source_value:
                    leaked += 1
                else:
                    translated += 1

            for key in target_keys:
                if key not in source_keys:
                    problems.append(f"{locale}/{namespace}: key {key} is not in English")

        coverage[locale] = round(translated / total, 2) if total else 0.0
        share = leaked / total if total else 0.0
        if tiers[locale] == 1 and share > TIER_1_LEAKAGE_LIMIT:
            problems.append(
                f"{locale} is tier 1 but {share:.0%} of its values are still English; "
                "either translate it or drop it to tier 2"
            )

    for entry in meta["locales"]:
        entry["coverage"] = coverage.get(entry["code"], 0.0)
    if args.write:
        META_PATH.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
        )

    threshold = meta["min_coverage_to_show"]
    print(f"{'locale':8} {'coverage':>9}  {'tier':>4}  shown at {threshold:.0%}?")
    for entry in meta["locales"]:
        shown = "yes" if entry["coverage"] >= threshold else "no"
        print(f"{entry['code']:8} {entry['coverage']:>9.0%}  {entry['tier']:>4}  {shown}")

    if problems:
        print(f"\n{len(problems)} problem(s):", file=sys.stderr)
        for problem in problems[:40]:
            print("  " + problem, file=sys.stderr)
        if len(problems) > 40:
            print(f"  ... and {len(problems) - 40} more", file=sys.stderr)
        return 1

    print("\nKey parity, placeholders and empty values are all clean.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
