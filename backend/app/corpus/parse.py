"""Turning a fetched file into ordered blocks of text with page numbers.

A parser's job is narrow: recover the document's text in reading order, keep the
page each run of text came from, and say which runs looked like headings. It
does not decide what a section is — that is the segmenter, and keeping the two
apart is what lets one chunking profile run over a PDF and an HTML page of the
same instrument and produce the same section paths.

Two parsers run with nothing installed. `text` and `html` are pure standard
library, and between them they cover the published-HTML sources that make up
most of what is freely redistributable. `pdf_layout` needs PyMuPDF and `ocr`
needs Tesseract; both report themselves unavailable rather than failing
obscurely, and a document whose parser is unavailable is skipped with that as
the reason rather than half-parsed.

Page numbers matter more here than they look. A citation carries a page, a
reader opens the source at that page, and a page recovered later by searching
for the text is a page that can be wrong.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol

from app.corpus.types import Block, ParsedDocument

#: A run of text shorter than this is a fragment — a page number, a running
#: header, a stray artefact — and carries nothing a citation could rest on.
MIN_BLOCK_CHARS = 2


class Parser(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def parse(self, path: Path, document_id: str) -> ParsedDocument: ...


class TextParser:
    """Plain text. Blank lines separate blocks; form feeds separate pages."""

    name = "text"

    @property
    def available(self) -> bool:
        return True

    def parse(self, path: Path, document_id: str) -> ParsedDocument:
        raw = path.read_text(encoding="utf-8", errors="replace")
        blocks: list[Block] = []
        for page_number, page in enumerate(raw.split("\f"), start=1):
            for paragraph in re.split(r"\n\s*\n", page):
                text = _tidy(paragraph)
                if len(text) >= MIN_BLOCK_CHARS:
                    blocks.append(Block(text=text, page=page_number))
        return ParsedDocument(
            document_id=document_id,
            blocks=tuple(blocks),
            parser=self.name,
            page_count=raw.count("\f") + 1,
        )


class _HtmlBlocks(HTMLParser):
    """Collect text per block-level element, marking headings.

    Written on the standard library rather than a parser dependency because
    `html.parser` is perfectly adequate for the published-legislation HTML this
    corpus draws on, and a dependency here would be one more thing between a
    person and a reproducible build. `selectolax` is worth reaching for when a
    source turns out to need real error recovery; nothing in the manifest does
    yet.
    """

    BLOCK_TAGS = frozenset(
        {"p", "div", "li", "td", "th", "blockquote", "pre", "section", "article", "dd", "dt"}
    )
    HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
    #: Content of these is not document text at any depth.
    DROP_TAGS = frozenset({"script", "style", "head", "nav", "footer", "noscript", "template"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self._buffer: list[str] = []
        self._heading_depth = 0
        self._drop_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self.DROP_TAGS:
            self._drop_depth += 1
            return
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush()
        if tag in self.HEADING_TAGS:
            self._heading_depth += 1
        if tag == "br":
            self._buffer.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.DROP_TAGS:
            self._drop_depth = max(0, self._drop_depth - 1)
            return
        if tag in self.BLOCK_TAGS or tag in self.HEADING_TAGS:
            self._flush()
        if tag in self.HEADING_TAGS:
            self._heading_depth = max(0, self._heading_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._drop_depth == 0:
            self._buffer.append(data)

    def _flush(self) -> None:
        text = _tidy("".join(self._buffer))
        self._buffer = []
        if len(text) >= MIN_BLOCK_CHARS:
            self.blocks.append(Block(text=text, page=None, is_heading=self._heading_depth > 0))

    def close(self) -> None:
        super().close()
        self._flush()


class HtmlParser:
    name = "html"

    @property
    def available(self) -> bool:
        return True

    def parse(self, path: Path, document_id: str) -> ParsedDocument:
        collector = _HtmlBlocks()
        collector.feed(path.read_text(encoding="utf-8", errors="replace"))
        collector.close()
        # HTML has no pages. Leaving `page` null is the honest answer; a
        # citation renders the section path and omits a page it does not have.
        return ParsedDocument(
            document_id=document_id, blocks=tuple(collector.blocks), parser=self.name
        )


class PdfLayoutParser:
    """PyMuPDF with layout retention. Optional, and says so when absent."""

    name = "pdf_layout"

    @property
    def available(self) -> bool:
        try:
            import fitz  # noqa: F401
        except ImportError:
            return False
        return True

    def parse(self, path: Path, document_id: str) -> ParsedDocument:
        import fitz

        blocks: list[Block] = []
        with fitz.open(path) as document:
            for page_number, page in enumerate(document, start=1):
                # Sorted so the reading order is the layout's, not the file's.
                for raw in page.get_text("blocks", sort=True):
                    text = _tidy(raw[4])
                    if len(text) >= MIN_BLOCK_CHARS:
                        blocks.append(Block(text=text, page=page_number))
            page_count = document.page_count
        return ParsedDocument(
            document_id=document_id,
            blocks=tuple(blocks),
            parser=self.name,
            page_count=page_count,
        )


class OcrParser:
    """Tesseract, for scanned documents only.

    Flagged `ocr=True` and confidence-scored so nothing downstream treats a
    recognised character as a read one. A scanned statute is the worst case for
    a product that quotes provisions verbatim, and the flag is what lets a later
    phase decide to refuse to cite from one.
    """

    name = "ocr"

    @property
    def available(self) -> bool:
        try:
            import pytesseract  # noqa: F401
            from PIL import Image  # noqa: F401
        except ImportError:
            return False
        return True

    def parse(self, path: Path, document_id: str) -> ParsedDocument:
        import fitz
        import pytesseract
        from PIL import Image

        blocks: list[Block] = []
        confidences: list[float] = []
        with fitz.open(path) as document:
            for page_number, page in enumerate(document, start=1):
                pixmap = page.get_pixmap(dpi=300)
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                data = pytesseract.image_to_data(
                    image, output_type=pytesseract.Output.DICT, lang="eng"
                )
                words = [
                    (word, float(conf))
                    for word, conf in zip(data["text"], data["conf"], strict=False)
                    if word.strip() and float(conf) >= 0
                ]
                confidences.extend(conf / 100.0 for _word, conf in words)
                text = _tidy(" ".join(word for word, _conf in words))
                if len(text) >= MIN_BLOCK_CHARS:
                    blocks.append(Block(text=text, page=page_number))
            page_count = document.page_count

        mean = sum(confidences) / len(confidences) if confidences else None
        return ParsedDocument(
            document_id=document_id,
            blocks=tuple(blocks),
            parser=self.name,
            ocr=True,
            ocr_confidence=round(mean, 4) if mean is not None else None,
            page_count=page_count,
        )


PARSERS: dict[str, Parser] = {
    parser.name: parser for parser in (TextParser(), HtmlParser(), PdfLayoutParser(), OcrParser())
}


def get_parser(name: str) -> Parser:
    parser = PARSERS.get(name)
    if parser is None:
        raise KeyError("unknown parser: " + name)
    return parser


def _tidy(text: str) -> str:
    """Collapse whitespace without joining what a line break separated.

    A statute's line breaks inside a paragraph are typesetting; the paragraph is
    the unit. Collapsing them is right. What must not be collapsed is the gap
    between paragraphs, which is why the callers split first and tidy second.
    """
    return re.sub(r"[ \t\r\n ]+", " ", text).strip()
