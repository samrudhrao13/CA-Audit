"""
Presence check for verifying a known/expected value against OCR'd text.

Handwriting OCR regularly misreads individual characters (0/O, 1/I/7,
5/S, ...), so a strict substring check would miss values that are
genuinely present but read slightly wrong. Instead we search the whole
document text for the *closest* matching span and score how similar it
is, so a near-miss still shows up as "found" (or at least as a visible
close match) rather than silently failing.
"""
import re
from difflib import SequenceMatcher
from typing import NamedTuple

# Similarity (0.0-1.0) at or above this counts as "found".
FOUND_THRESHOLD = 0.75

# Cap how much text we fuzzy-scan — a multi-page PDF's OCR text is large
# enough that a full character-by-character sliding window would be slow,
# and anything past this is unlikely to be worth the extra scan time.
MAX_HAYSTACK_LENGTH = 8000


class MatchResult(NamedTuple):
    found: bool
    similarity: float  # 0.0-1.0
    matched_text: str | None  # closest span found in the document, if any


def _compact(text: str) -> str:
    """Uppercase with all whitespace stripped, for comparing tokens like
    GSTINs/phone numbers where OCR may add or drop spaces mid-token."""
    return re.sub(r"\s+", "", text).upper()


def _best_fuzzy_span(needle: str, haystack: str) -> tuple[str, float]:
    """Slide a window of ~needle-length across haystack and return the
    highest-similarity span and its score."""
    n = len(needle)
    if n == 0 or len(haystack) == 0:
        return "", 0.0

    best_text = ""
    best_ratio = 0.0
    matcher = SequenceMatcher(None, needle)

    for window_len in range(max(1, n - 2), n + 3):
        for start in range(0, len(haystack) - window_len + 1):
            candidate = haystack[start : start + window_len]
            matcher.set_seq2(candidate)
            # quick_ratio() is a cheap upper bound — skip the expensive
            # exact ratio() call unless this candidate could plausibly beat
            # the best score found so far.
            if matcher.quick_ratio() < best_ratio:
                continue
            ratio = matcher.ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_text = candidate
    return best_text, best_ratio


def is_present_in_text(expected_value: str, haystack: str) -> MatchResult:
    expected_clean = expected_value.strip()
    if not expected_clean:
        return MatchResult(found=False, similarity=0.0, matched_text=None)

    normalized_expected = re.sub(r"\s+", " ", expected_clean).upper()
    normalized_haystack = re.sub(r"\s+", " ", haystack).upper()
    if normalized_expected in normalized_haystack:
        return MatchResult(found=True, similarity=1.0, matched_text=expected_clean)

    expected_compact = _compact(expected_clean)
    haystack_compact = _compact(haystack)[:MAX_HAYSTACK_LENGTH]
    if expected_compact and expected_compact in haystack_compact:
        return MatchResult(found=True, similarity=1.0, matched_text=expected_clean)

    best_text, best_ratio = _best_fuzzy_span(expected_compact, haystack_compact)
    return MatchResult(
        found=best_ratio >= FOUND_THRESHOLD,
        similarity=round(best_ratio, 3),
        matched_text=best_text or None,
    )
