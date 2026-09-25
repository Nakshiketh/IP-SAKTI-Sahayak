"""Write the reviewed shell translations into the locale files.

    python scripts/i18n/apply_shell.py            # report what would change
    python scripts/i18n/apply_shell.py --write    # write it

The shell is the twenty-seven strings a reader meets on every page: the
navigation, the two calls to action, the menu, the language selector and the
footer link. They are kept in `data/i18n/shell.json` rather than typed into the
locale files directly, for the same reason the machine drafts are generated
rather than hand-edited — one file to review per language, regenerable, and
diffable when the English changes.

Why only the shell, and why by hand at all. The full interface is 2,063 keys,
which across every locale is well over a hundred thousand strings of legal and
regulatory terminology; that needs a translation service, and
`translate_locales.py` is waiting for one. But a reader who switches to Tamil
and meets an English navigation bar has been told the language is not really
supported, whatever the corpus underneath does. These twenty-seven are short,
non-legal, and checkable by anyone who reads the language — the opposite of the
case against hand-translating, which is about volume nobody can verify.

`PATHS` is the contract between this file and the data. A row of the wrong
length is refused rather than written, because a silently shifted row would put
"Close menu" under `nav.home` in a language the reviewer cannot read.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LOCALES_DIR = REPO_ROOT / "frontend" / "src" / "locales"
SHELL_PATH = REPO_ROOT / "data" / "i18n" / "shell.json"

#: Dotted paths into common.json, in the order the values are listed.
#: `brand.name` is deliberately absent: "IP-SAKTI Sahayak" is a name, and a
#: transliterated product name is one nobody can search for.
PATHS = (
    "brand.descriptor",
    "nav.label",
    "nav.home",
    "nav.sahayak",
    "nav.covered",
    "nav.howItWorks",
    "nav.sources",
    "nav.about",
    "menu.open",
    "menu.close",
    "menu.title",
    "cta.ask",
    "cta.check",
    "actions.close",
    "actions.remove",
    "skipToContent",
    "language.label",
    "language.partial",
    "language.groupIndian",
    "language.groupInternational",
    "language.selectTitle",
    "language.searchPlaceholder",
    "language.clearSearch",
    "language.noResults",
    "footer.privacy",
    "jurisdiction.IN",
    "jurisdiction.INTL",
)


def put(tree: dict, dotted: str, value: str) -> None:
    parts = dotted.split(".")
    node = tree
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def get(tree: dict, dotted: str) -> str | None:
    node: object = tree
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if isinstance(node, str) else None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="write the locale files")
    args = parser.parse_args(argv)

    shell = json.loads(SHELL_PATH.read_text("utf-8"))
    english = json.loads((LOCALES_DIR / "en" / "common.json").read_text("utf-8"))

    problems: list[str] = []
    changed = 0

    for code, values in sorted(shell.items()):
        target = LOCALES_DIR / code / "common.json"
        if not target.exists():
            problems.append(f"{code}: no locale directory")
            continue
        if len(values) != len(PATHS):
            # A shifted row would put "Close menu" under nav.home in a language
            # the reviewer cannot read. Refuse the whole row.
            problems.append(f"{code}: {len(values)} values for {len(PATHS)} paths")
            continue

        data = json.loads(target.read_text("utf-8"))
        wrote = 0
        for dotted, value in zip(PATHS, values, strict=True):
            source = get(english, dotted)
            if source is None:
                problems.append(f"{dotted} is not in English any more")
                continue
            # A placeholder dropped in translation leaves a hole where a number
            # belongs; one invented renders literally on screen.
            if ("{{" in source) != ("{{" in value):
                problems.append(f"{code}/{dotted}: placeholder mismatch")
                continue
            if get(data, dotted) != value:
                put(data, dotted, value)
                wrote += 1

        if wrote and args.write:
            target.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
        changed += wrote
        print(f"  {code:8} {wrote:3} string(s)")

    print(f"\n{len(shell)} language(s), {changed} string(s) {'written' if args.write else 'to write'}")
    if problems:
        print(f"\n{len(problems)} problem(s):", file=sys.stderr)
        for problem in problems[:20]:
            print("  " + problem, file=sys.stderr)
        return 1
    if not args.write:
        print("Nothing was written. Pass --write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
