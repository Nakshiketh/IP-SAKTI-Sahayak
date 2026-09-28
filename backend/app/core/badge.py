"""The one authorised sign-in QR code, and how a camera frame is checked against it.

The authorised code is the QR that was printed in the Digital QR Badge. It has a
correct QR structure — finder squares, timing strips, format bits — but its data
region does not decode, so no reader can recover a payload to compare. What it
does have is an exact pattern, and the pattern is what is compared: the code is
located in a camera frame, warped square, sampled into its 29 x 29 modules and
checked module by module against the badge's own grid. Any other QR code —
random, newly generated, or carrying the same words — has a different grid and
is refused.

The comparison runs on the server rather than in the browser, so a client cannot
claim a match it did not see. It is still a picture: whoever holds a copy of the
badge holds the credential, as with any printed QR code.
"""

from __future__ import annotations

import cv2
import numpy as np

SIZE = 29

#: The authorised code, one row per line: `#` is a dark module. Sampled from the
#: Digital QR Badge image (kept as a test fixture, no longer served).
BADGE = (
    "#######..#.###..##.#..#######",
    "#.....#.#..#...##.##..#.....#",
    "#.###.#..#..#.#.##.##.#.###.#",
    "#.###.#..###..##..#...#.###.#",
    "#.###.#.#..#.....#.#..#.###.#",
    "#.....#..###.###.###..#.....#",
    "#######.#.#.#.#.#.#.#.#######",
    "..........##...#.#.#.........",
    "#.#.#.#..##...##.#.#....#..#.",
    "#.##.#.#####.#..###..##.##..#",
    ".#######.#####.####..###.####",
    ".#.#####.#####.###..####..###",
    "#..###.#..#..##.##..#....#.#.",
    "##.#.##...#.#.#####...####.##",
    "#.#.#..#.##.###.##..###..#..#",
    "#....##...##.....###.##..#..#",
    "#.##.#.#.#..##.##...#.#...#.#",
    ".####.##.....#.#..#..##.##.##",
    "#.#..#.##..###.#.##.###.#..##",
    ".#.#.##..###..#.##..#..#.#.#.",
    "#.#.#..#.####..#.#.#.##..#...",
    ".........#.##.##..#.#####.###",
    "#######...#...#..####...##.##",
    "#.....#...#..##.#.#.#.#.###..",
    "#.###.#.#..####....##...#...#",
    "#.###.#..#..#..#.##.######.##",
    "#.###.#.#..#.#..###.....#.#.#",
    "#.....#...#..#.###.#.#.###.#.",
    "#######.##..#.#.###.##....###",
)

_REFERENCE = np.array([[cell == "#" for cell in row] for row in BADGE], dtype=bool)

#: The three finder squares and their separators are the same on every code of
#: this size, so they say nothing about which code this is. Only the rest is
#: compared.
_DISTINCTIVE = np.ones((SIZE, SIZE), dtype=bool)
_DISTINCTIVE[:8, :8] = _DISTINCTIVE[:8, -8:] = _DISTINCTIVE[-8:, :8] = False

#: Share of the distinctive modules that must agree. Two unrelated codes agree
#: on about half of them; a camera frame of the badge agrees on 95% or more. The
#: margin below 100% absorbs glare and a slightly-off warp, not a different code.
THRESHOLD = 0.9

_CELL = 12


def _detectors():
    yield cv2.QRCodeDetector()
    # The ArUco-based detector finds codes the classic one misses: odd scales, busy
    # backgrounds. A code it finds but the first did not still has to be judged.
    aruco = getattr(cv2, "QRCodeDetectorAruco", None)
    if aruco is not None:
        yield aruco()


def _locate(pixels: np.ndarray) -> tuple[str, np.ndarray | None]:
    """A QR code in the image: its decoded text ("" if it does not decode) and corners."""
    for detector in _detectors():
        try:
            text, corners, _ = detector.detectAndDecode(pixels)
        except cv2.error:
            continue
        if corners is not None and len(corners):
            return text or "", corners
    return "", None


def examine(image: bytes) -> tuple[str, np.ndarray] | None:
    """The decoded text and 29 x 29 module grid of the QR code in an image, or None.

    The grid is the one that best matches the badge among small nudges of the
    detected corners, so a warp that is slightly off still reads the badge.
    """
    pixels = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
    if pixels is None:
        return None
    text, corners = _locate(pixels)
    if corners is None:
        return None
    return text, max(_grids(pixels, corners), key=similarity)


#: Corner nudges, in modules. The detector's corners can sit half a module off
#: (and the fourth corner of a tilted code is only estimated), which shifts every
#: sample. Trying a few nudges costs little; an unrelated code still agrees on
#: about half its modules at best, far below THRESHOLD.
_SHIFTS = (-0.4, 0.0, 0.4)
_GROWTH = (-0.4, 0.0, 0.4)
_FOURTH = (-0.6, 0.0, 0.6)


def _grids(pixels: np.ndarray, corners: np.ndarray):
    quad = corners.reshape(4, 2).astype(np.float64)
    # One module along each edge of the code, in image pixels.
    across = (quad[1] - quad[0]) / SIZE
    down = (quad[3] - quad[0]) / SIZE
    outward = np.array([-1, 1, 1, -1])[:, None] * across + np.array([-1, -1, 1, 1])[:, None] * down
    for grow in _GROWTH:
        grown = quad + outward * grow
        for sx in _SHIFTS:
            for sy in _SHIFTS:
                shifted = grown + across * sx + down * sy
                if sx == sy == 0:
                    for fx in _FOURTH:
                        for fy in _FOURTH:
                            nudged = shifted.copy()
                            nudged[2] += across * fx + down * fy
                            yield _grid(pixels, nudged)
                else:
                    yield _grid(pixels, shifted)


def _grid(pixels: np.ndarray, corners: np.ndarray) -> np.ndarray:
    side = SIZE * _CELL
    transform = cv2.getPerspectiveTransform(
        corners.reshape(4, 2).astype(np.float32),
        np.float32([[0, 0], [side, 0], [side, side], [0, side]]),
    )
    square = cv2.warpPerspective(pixels, transform, (side, side))
    _, square = cv2.threshold(square, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # The middle half of each module, so a slightly-off warp samples ink, not an edge.
    cells = square.reshape(SIZE, _CELL, SIZE, _CELL)[:, 3:9, :, 3:9]
    return cells.mean(axis=(1, 3)) < 128


def similarity(grid: np.ndarray) -> float:
    """How closely a grid matches the badge, at whichever quarter-turn fits best."""
    return max(
        float((np.rot90(grid, turn)[_DISTINCTIVE] == _REFERENCE[_DISTINCTIVE]).mean())
        for turn in range(4)
    )


def is_badge(image: bytes) -> bool | None:
    """True if the image shows the authorised code, False if another code, None if none."""
    found = examine(image)
    if found is None:
        return None
    text, grid = found
    # The authorised code decodes to nothing. A code that decodes to anything at
    # all — a URL, a name, the badge's own words — came from a QR generator.
    if text:
        return False
    return similarity(grid) >= THRESHOLD
