"""Draft the non-English locale files with the configured model.

    python scripts/i18n/translate_locales.py --locale hi
    python scripts/i18n/translate_locales.py --all --dry-run

The key comes from ANTHROPIC_API_KEY or SAHAYAK_LLM_API_KEY, in the environment
or in a gitignored `.env` at the repo root. Without one this exits cleanly and
changes nothing. That is the designed behaviour, not a failure: a language with no translation stays as it is and
stays labelled, rather than being filled in by hand in a chat window where
nobody can check it later or regenerate it when the English changes.

What the model is held to, and why each constraint is here:

* **Acronyms stay.** PCT, TKDL, NBA, ABS, WIPO, FSSAI, AYUSH name institutions
  and instruments. A phonetic rendering is a word the reader cannot search for.
* **Instrument names stay, with a gloss.** "Patents Act, 1970, Section 3(p)" is
  how a reader finds the provision and how a professional recognises it. The
  translation may explain it; it may not replace it.
* **Placeholders survive exactly.** `{{count}}` dropped leaves a hole where a
  number belongs; one invented renders literally on screen.
* **Nothing is added.** A translation that helpfully explains a rule has written
  law this product never retrieved.

Output is written with `__untranslated` removed and the file marked as a machine
draft, so `check_locales.py` and the switcher can both tell a drafted language
from a reviewed one.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCALES_DIR = REPO_ROOT / "frontend" / "src" / "locales"
META_PATH = REPO_ROOT / "frontend" / "src" / "i18n" / "locales.meta.json"

SOURCE = "en"
API_KEY_VARS = ("ANTHROPIC_API_KEY", "SAHAYAK_LLM_API_KEY")
MODEL = os.environ.get("SAHAYAK_TRANSLATE_MODEL", "claude-sonnet-5")

#: Never translated. See the module docstring.
KEEP_VERBATIM = (
    "PCT",
    "TKDL",
    "NBA",
    "ABS",
    "WIPO",
    "FSSAI",
    "AYUSH",
    "CGPDTM",
    "CDSCO",
    "IP-SAKTI Sahayak",
)

SYSTEM_PROMPT = """You translate interface strings for an Indian intellectual property
guidance product, from English into {language} ({code}).

Rules, in order of importance:

1. Keep these exactly as written, in Latin script: {verbatim}. Where the target
   language needs it, add a short gloss in the target language in brackets the
   first time it appears in a value.
2. Keep the names and numbers of legal instruments exactly: "Patents Act, 1970",
   "Section 3(p)", "Rule 158B", "Schedule T". You may add a gloss; you may not
   replace or renumber them.
3. Keep every {{{{placeholder}}}} exactly as it appears, including its spelling.
   Do not add placeholders that are not in the source.
4. Translate the meaning, not the words. These are read by vaidyas, small
   manufacturers and students, not lawyers.
5. Add nothing. Do not explain a rule, soften a warning, or make an answer sound
   more or less certain than the English does.

Return only a JSON object mapping each key to its translated string."""


def load_dotenv() -> None:
    """Read `.env` at the repo root into the environment, if it exists.

    Without this the key has to be exported in the same shell that runs the
    script, which rules out anything driving it from another process. `.env` is
    gitignored, so the key stays out of the history and out of every transcript
    and log that quotes a command line.

    Deliberately tiny and dependency-free: KEY=value, one per line, `#` starts a
    comment, surrounding quotes are stripped. Anything already in the
    environment wins, so an explicit export still overrides the file.
    """
    path = REPO_ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and value and name not in os.environ:
            os.environ[name] = value


def api_key() -> str | None:
    load_dotenv()
    for name in API_KEY_VARS:
        value = os.environ.get(name)
        if value:
            return value
    return None


def flatten(node: object, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "__untranslated":
                continue
            out.update(flatten(value, f"{prefix}.{key}" if prefix else key))
    elif isinstance(node, str):
        out[prefix] = node
    return out


def unflatten(flat: dict[str, str]) -> dict:
    root: dict = {}
    for dotted, value in flat.items():
        node = root
        parts = dotted.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return root


def translate(strings: dict[str, str], *, language: str, code: str, key: str) -> dict[str, str]:
    """One call per namespace. Raises if the model returns anything unusable."""
    try:
        import anthropic
    except ImportError:  # pragma: no cover - depends on the optional extra
        raise SystemExit(
            "The anthropic package is not installed. Run: pip install -e '.[llm]' in backend/"
        ) from None

    client = anthropic.Anthropic(api_key=key)
    system = SYSTEM_PROMPT.format(language=language, code=code, verbatim=", ".join(KEEP_VERBATIM))
    response = client.messages.create(
        model=MODEL,
        max_tokens=8192,
        system=system,
        messages=[{"role": "user", "content": json.dumps(strings, ensure_ascii=False, indent=1)}],
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("the model returned no JSON object")
    drafted = json.loads(text[start : end + 1])

    missing = set(strings) - set(drafted)
    if missing:
        raise ValueError(f"the model dropped {len(missing)} key(s), e.g. {sorted(missing)[:3]}")
    return {key_: str(drafted[key_]) for key_ in strings}


def main(argv: list[str] | None = None) -> int:
    meta = json.loads(META_PATH.read_text("utf-8"))
    codes = [entry["code"] for entry in meta["locales"] if entry["code"] != SOURCE]

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--locale", action="append", choices=codes, help="repeatable")
    parser.add_argument("--all", action="store_true", help="every non-English locale")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = parser.parse_args(argv)

    wanted = codes if args.all else (args.locale or [])
    if not wanted:
        parser.error("choose --locale or --all")

    key = api_key()
    if not key:
        print(
            "No API key in " + " or ".join(API_KEY_VARS) + ". Nothing was translated and "
            "nothing was changed; those languages stay as they are and stay labelled.",
            file=sys.stderr,
        )
        return 0

    names = {entry["code"]: entry["english_name"] for entry in meta["locales"]}
    english = sorted((LOCALES_DIR / SOURCE).glob("*.json"))

    for code in wanted:
        for source_path in english:
            strings = flatten(json.loads(source_path.read_text("utf-8")))
            target_path = LOCALES_DIR / code / source_path.name
            print(f"{code}/{source_path.name}: {len(strings)} strings", end="")
            if args.dry_run:
                print(" (dry run)")
                continue
            try:
                drafted = translate(strings, language=names[code], code=code, key=key)
            except (ValueError, OSError) as error:
                print(f" — failed: {error}", file=sys.stderr)
                continue
            body = unflatten(drafted)
            # Marked as a draft, so the switcher and check script can tell a
            # machine draft from something a person has read.
            body["__machine_drafted"] = True
            target_path.write_text(
                json.dumps(body, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            print(" — written")

    print("\nNow run: python scripts/i18n/check_locales.py --write")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
