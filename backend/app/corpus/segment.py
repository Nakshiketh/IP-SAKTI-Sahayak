"""Section-aware chunking. The step everything else rests on.

A citation is only worth reading if it says *where* the text came from, and a
fixed token window cannot say that. Split a statute every 500 tokens and you get
passages that begin mid-sub-clause and belong to no section anyone can name; the
citation then says "page 14", which is not an answer to "where does it say
that". So the document's own structure decides the boundaries: Chapter, Section,
sub-section, clause; Article, paragraph; Rule, sub-rule.

A profile is a list of level rules, outermost first, plus which level a chunk is
emitted at. Recognising a level is a pattern match at the start of a block — a
deliberately conservative test, because a false positive silently invents a
section that does not exist and every citation into it is then wrong about where
it came from.

Two size rules sit on top of the structure and never override it:

* A section longer than the target is split at its own sub-clause boundaries,
  and every part keeps the parent path. A reader is told "Section 3, part 2 of
  3", never handed an unlabelled fragment.
* Overlap is 15%, and only *within* a section. Overlapping across a section
  boundary would put one section's words inside another section's citation,
  which is the same failure as a fixed window, arrived at more slowly.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field

from app.core.tokens import estimate_tokens
from app.corpus.types import Block, ParsedDocument, SegmentedChunk

#: What text before the first recognised level is called. A statute's long title
#: and enacting formula are genuinely citable, so they get a path rather than an
#: empty one — and the validator refuses an empty path, because a citation that
#: cannot say where it came from is the thing this whole stage exists to avoid.
PREAMBLE = "Preamble"

#: The size band the spec sets. It is a target, not a rule, and it never
#: overrides the structure. A section shorter than the minimum stays its own
#: chunk: merging it into its neighbour would put one section's words inside
#: another section's citation, which is the exact failure a fixed window causes.
#: The minimum is used only to decide where to break a section that is too long.
TARGET_MIN_TOKENS = 300
TARGET_MAX_TOKENS = 800
OVERLAP_SHARE = 0.15


@dataclass(frozen=True)
class Level:
    """One rung of a document's structure."""

    name: str
    pattern: re.Pattern[str]
    #: How the captured groups become the label a citation shows.
    label: str
    #: The group holding the heading that follows the marker, where there is one.
    heading_group: int | None = None
    #: Group indices consumed by the label, so the rest becomes body text.
    body_group: int | None = None


@dataclass(frozen=True)
class ChunkingProfile:
    name: str
    levels: tuple[Level, ...]
    #: Index into `levels`. A chunk is emitted for each of these, and for
    #: anything before the first one.
    chunk_level: int

    def level_of(self, block: Block) -> tuple[int, re.Match[str]] | None:
        for index, level in enumerate(self.levels):
            match = level.pattern.match(block.text)
            if match:
                return index, match
        return None


def _statute_levels() -> tuple[Level, ...]:
    return (
        Level(
            name="chapter",
            pattern=re.compile(r"^(CHAPTER|PART)\s+([IVXLCDM]+|\d+)\b[.:\-—]?\s*(.*)$", re.I),
            label="{1} {2}",
            heading_group=3,
        ),
        Level(
            # A section marker is a number, a full stop, then whitespace or a
            # dash. Requiring what follows is what stops "1.2 Scope" in a
            # guideline being read as section 1.
            name="section",
            pattern=re.compile(r"^(\d+[A-Z]{0,2})\.(?:\s+|—)(.*)$"),
            label="Section {1}",
            heading_group=2,
        ),
        Level(
            name="subsection",
            pattern=re.compile(r"^\((\d+[A-Z]?)\)\s*(.*)$"),
            label="({1})",
            body_group=2,
        ),
        Level(
            name="clause",
            pattern=re.compile(r"^\(([a-z]{1,3})\)\s*(.*)$"),
            label="({1})",
            body_group=2,
        ),
    )


def _rules_levels() -> tuple[Level, ...]:
    return (
        Level(
            name="part",
            pattern=re.compile(r"^(PART|CHAPTER)\s+([IVXLCDM]+|\d+)\b[.:\-—]?\s*(.*)$", re.I),
            label="{1} {2}",
            heading_group=3,
        ),
        Level(
            name="rule",
            pattern=re.compile(r"^(?:Rule\s+)?(\d+[A-Z]{0,2})\.(?:\s+|—)(.*)$"),
            label="Rule {1}",
            heading_group=2,
        ),
        Level(
            name="subrule",
            pattern=re.compile(r"^\((\d+[A-Z]?)\)\s*(.*)$"),
            label="({1})",
            body_group=2,
        ),
        Level(
            name="clause",
            pattern=re.compile(r"^\(([a-z]{1,3})\)\s*(.*)$"),
            label="({1})",
            body_group=2,
        ),
    )


def _treaty_levels() -> tuple[Level, ...]:
    return (
        Level(
            name="part",
            pattern=re.compile(r"^(PART|SECTION)\s+([IVXLCDM]+|\d+)\b[.:\-—]?\s*(.*)$", re.I),
            label="{1} {2}",
            heading_group=3,
        ),
        Level(
            name="article",
            pattern=re.compile(r"^Article\s+(\d+[a-z]{0,2})\b[.:\-—]?\s*(.*)$", re.I),
            label="Article {1}",
            heading_group=2,
        ),
        Level(
            name="paragraph",
            pattern=re.compile(r"^(\d+)\.\s+(.*)$"),
            label="Paragraph {1}",
            body_group=2,
        ),
        Level(
            name="subparagraph",
            pattern=re.compile(r"^\(([a-z]{1,3})\)\s*(.*)$"),
            label="({1})",
            body_group=2,
        ),
    )


def _heading_levels(top: str, second: str) -> tuple[Level, ...]:
    return (
        Level(
            name=top,
            pattern=re.compile(r"^(\d+)\.\s+(.{2,120})$"),
            label="{1}. {2}",
            heading_group=2,
        ),
        Level(
            name=second,
            pattern=re.compile(r"^(\d+\.\d+)\s+(.{2,120})$"),
            label="{1} {2}",
            heading_group=2,
        ),
    )


PROFILES: dict[str, ChunkingProfile] = {
    "statute_section_aware": ChunkingProfile(
        "statute_section_aware", _statute_levels(), chunk_level=1
    ),
    "rules_section_aware": ChunkingProfile("rules_section_aware", _rules_levels(), chunk_level=1),
    "treaty_article_aware": ChunkingProfile(
        "treaty_article_aware", _treaty_levels(), chunk_level=1
    ),
    "guideline_heading_aware": ChunkingProfile(
        "guideline_heading_aware", _heading_levels("heading", "subheading"), chunk_level=0
    ),
    "pharmacopoeia_monograph": ChunkingProfile(
        "pharmacopoeia_monograph", _heading_levels("monograph", "part"), chunk_level=0
    ),
}


def get_profile(name: str) -> ChunkingProfile:
    profile = PROFILES.get(name)
    if profile is None:
        raise KeyError("unknown chunking profile: " + name)
    return profile


@dataclass
class _Section:
    """One emitted unit, before it is sized."""

    path: list[str]
    heading: str | None
    blocks: list[Block] = field(default_factory=list)
    #: Where each sub-level began, so a long section can be split at its own
    #: boundaries rather than mid-sentence.
    breaks: list[int] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(block.text for block in self.blocks).strip()

    @property
    def pages(self) -> tuple[int | None, int | None]:
        numbered = [block.page for block in self.blocks if block.page is not None]
        return (min(numbered), max(numbered)) if numbered else (None, None)


def _label(level: Level, match: re.Match[str]) -> str:
    label = level.label
    for index in range(1, (match.re.groups or 0) + 1):
        label = label.replace("{" + str(index) + "}", (match.group(index) or "").strip())
    return re.sub(r"\s+", " ", label).strip()


def _slug(parts: list[str]) -> str:
    joined = "-".join(parts)
    slug = re.sub(r"[^a-z0-9]+", "-", joined.casefold()).strip("-")
    return slug or "body"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sections(parsed: ParsedDocument, profile: ChunkingProfile) -> list[_Section]:
    """Walk the blocks, maintaining a path stack. Structure only, no sizing."""
    open_labels: list[str | None] = [None] * len(profile.levels)
    current = _Section(path=[PREAMBLE], heading=None)
    out: list[_Section] = []

    def flush() -> None:
        if current.blocks:
            out.append(current)

    for block in parsed.blocks:
        matched = profile.level_of(block)
        if matched is None:
            current.blocks.append(block)
            continue

        index, match = matched
        level = profile.levels[index]
        label = _label(level, match)

        # Everything deeper than the level that just opened is now closed.
        for deeper in range(index, len(open_labels)):
            open_labels[deeper] = None
        open_labels[index] = label

        remainder = ""
        if level.heading_group is not None:
            remainder = (match.group(level.heading_group) or "").strip()
        elif level.body_group is not None:
            remainder = (match.group(level.body_group) or "").strip()

        if index <= profile.chunk_level:
            flush()
            path = [entry for entry in open_labels[: index + 1] if entry]
            heading = remainder if level.heading_group is not None and remainder else None
            current = _Section(path=path, heading=heading)
            # A heading is the section's name, not its body. Body that arrived
            # on the same line as a sub-level marker is body.
            if level.heading_group is None and remainder:
                current.blocks.append(Block(text=remainder, page=block.page))
            continue

        # A sub-level inside the current section: a split point, and its label
        # is carried into the text so the reader can see the structure.
        current.breaks.append(len(current.blocks))
        marker = label + " " + remainder if remainder else label
        current.blocks.append(Block(text=marker.strip(), page=block.page))

    flush()
    return out


def _overlap_prefix(text: str) -> str:
    words = text.split()
    keep = max(1, int(len(words) * OVERLAP_SHARE))
    return " ".join(words[-keep:])


def _split_long(section: _Section) -> list[tuple[str, int | None, int | None]]:
    """Split one over-long section at its own sub-clause boundaries.

    Returns (text, page_from, page_to) per part. Overlap is applied between
    parts of the same section and nowhere else — a part never carries words from
    a different section, because a citation into it would then be wrong about
    where those words came from.
    """
    blocks = section.blocks
    whole = section.text
    if estimate_tokens(whole) <= TARGET_MAX_TOKENS:
        return [(whole, *section.pages)]

    # Candidate boundaries: the sub-level markers this section actually has. If
    # it has none, fall back to block boundaries, which are paragraphs.
    boundaries = sorted(set(section.breaks) | {0, len(blocks)})
    if len(boundaries) <= 2:
        boundaries = sorted(set(range(len(blocks) + 1)))

    parts: list[tuple[str, int | None, int | None]] = []
    start = 0
    carried = ""
    for boundary in boundaries[1:]:
        window = blocks[start:boundary]
        if not window:
            continue
        text = "\n".join(block.text for block in window).strip()
        candidate = (carried + "\n" + text).strip() if carried else text
        if estimate_tokens(candidate) < TARGET_MIN_TOKENS and boundary != boundaries[-1]:
            continue
        numbered = [block.page for block in window if block.page is not None]
        parts.append(
            (candidate, min(numbered) if numbered else None, max(numbered) if numbered else None)
        )
        carried = _overlap_prefix(text)
        start = boundary

    if start < len(blocks):
        window = blocks[start:]
        text = "\n".join(block.text for block in window).strip()
        if text:
            candidate = (carried + "\n" + text).strip() if carried else text
            numbered = [block.page for block in window if block.page is not None]
            parts.append(
                (
                    candidate,
                    min(numbered) if numbered else None,
                    max(numbered) if numbered else None,
                )
            )

    return parts or [(whole, *section.pages)]


def segment(parsed: ParsedDocument, profile: ChunkingProfile) -> list[SegmentedChunk]:
    chunks: list[SegmentedChunk] = []
    used: set[str] = set()
    for section in sections(parsed, profile):
        parts = _split_long(section)
        for index, (text, page_from, page_to) in enumerate(parts, start=1):
            if not text.strip():
                continue
            digest = content_hash(text)
            slug_parts = list(section.path) or ["body"]
            if len(parts) > 1:
                slug_parts = [*slug_parts, "part-" + str(index)]
            section_key = parsed.document_id + "-" + _slug(slug_parts)
            chunk_id = section_key + "-" + digest[:8]
            # Two identical parts in one document would collide. Rare, and
            # silently dropping one would lose a passage, so it is disambiguated.
            ordinal = 2
            base = chunk_id
            while chunk_id in used:
                chunk_id = base + "-" + str(ordinal)
                ordinal += 1
            used.add(chunk_id)

            chunks.append(
                SegmentedChunk(
                    chunk_id=chunk_id,
                    document_id=parsed.document_id,
                    text=text,
                    section_path=tuple(section.path),
                    heading=section.heading,
                    page_from=page_from,
                    page_to=page_to,
                    token_count=estimate_tokens(text),
                    content_hash=digest,
                    section_key=section_key,
                )
            )
    return chunks
