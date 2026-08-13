"""
Generalized fallback for required fields the LLM left empty.

Real invoices aren't standardized — the field a template calls "Buyer
GSTIN" might be printed as "GST No.", "GSTIN", or "Reg. No." depending on
whose invoice book it is, and OCR adds its own noise on top. When the
LLM's structured mapping comes back empty for a field marked required,
this scans the raw OCR text for a value shaped like the field's declared
type sitting on (or right after) a line whose label text fuzzy-matches
the field's name — handles both "Label: Value" and "Label" / "Value"
split across two OCR lines, and tolerates label misreads the way
`text_match.py` tolerates value misreads.

If no such label is found on the document at all, the field is left
blank rather than guessed — deliberately: a field that's genuinely absent
(e.g. IGST on an intrastate invoice that only has CGST/SGST) must stay
blank, not get filled with an unrelated number pulled from elsewhere on
the page just because it happens to be the right shape. Guessing without
any on-document evidence for *this* field produced exactly that failure
mode in practice, which is why there's no "best guess anywhere" tier here.

Every fallback guess that IS made is still flagged invalid (`reason`
explains what label it matched) so a human confirms it.

This runs in addition to (not instead of) `invoice_number_fallback.py`,
which stays as a more tightly-tuned special case for one especially
common, especially finicky field.
"""
import re
from difflib import SequenceMatcher

from app.schemas import ExtractedField, FieldType

# Below this, a line's label text isn't considered a confident match for
# the field name — SequenceMatcher ratio, tolerant of OCR character noise
# and of the label not being an exact, complete match for the field name
# (e.g. field "Buyer GSTIN" vs. document label "GST No.").
LABEL_SIMILARITY_THRESHOLD = 0.4

# Search-oriented counterparts to type_validation.py's fullmatch patterns —
# these run against a whole line/document with re.finditer instead of being
# anchored to an already-isolated value.
_SEARCH_PATTERNS: dict[FieldType, list[re.Pattern]] = {
    FieldType.GST_NUMBER: [re.compile(r"\b[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]\b")],
    FieldType.EMAIL: [re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")],
    FieldType.PHONE: [re.compile(r"(?:\+?\d[\d\s().-]{6,14}\d)")],
    FieldType.CURRENCY: [
        re.compile(r"[₹$€£]\s?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?"),
        re.compile(r"\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b"),
        # Indian invoices frequently drop the thousands comma when handwritten/typed
        # quickly — this catches plain "11800.50" that the comma-grouped pattern above
        # requires a separator for.
        re.compile(r"\b\d+\.\d{2}\b"),
    ],
    FieldType.DATE: [
        re.compile(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b"),
        re.compile(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b"),
        re.compile(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\b"),
        re.compile(r"\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}\b"),
    ],
    FieldType.NUMERIC: [re.compile(r"\b\d+(?:\.\d+)?\b")],
}

# "Label: value" / "Label - value" split, for types with no shape pattern
# above (alphabetic/alphanumeric/custom_regex) — no type filter, just
# whatever follows a label that looks like this field, so still better
# than nothing for e.g. a "Buyer Name" field.
_LABEL_VALUE_SPLIT = re.compile(r"^(.*?)[:\-]\s*(.+)$")


def _label_similarity(field_name: str, label_text: str) -> float:
    return SequenceMatcher(None, field_name.strip().lower(), label_text.strip().lower()).ratio()


def _label_matches(field_name: str, label_text: str) -> bool:
    field_stripped = field_name.strip()
    if len(field_stripped) <= 6 and " " not in field_stripped:
        # Short acronym-style field names (CGST/SGST/IGST, PAN, TAN, HSN...)
        # are only one or two characters apart from each other by design —
        # fuzzy character-overlap scoring can't tell them apart ("IGST" vs
        # "CGST" scores 0.75, comfortably over the 0.4 threshold below,
        # despite meaning something completely different — confirmed this
        # actually happens on a real invoice). These require an exact,
        # whole-word match instead of a fuzzy ratio.
        words = re.findall(r"[A-Za-z0-9]+", label_text.lower())
        return field_stripped.lower() in words
    return _label_similarity(field_name, label_text) >= LABEL_SIMILARITY_THRESHOLD


def _type_candidates(field_type: FieldType, text: str) -> list[str]:
    patterns = _SEARCH_PATTERNS.get(field_type)
    if not patterns:
        return []
    found: list[str] = []
    for pattern in patterns:
        found.extend(m.group(0) for m in pattern.finditer(text))
    return found


def guess_value_for_field(field_name: str, field_type: FieldType, raw_text: str) -> tuple[str, str] | None:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    has_type_pattern = field_type in _SEARCH_PATTERNS

    # Type-shaped (or label-split, for untyped fields) value on a line whose
    # remaining label text fuzzy-matches the field name, or on the very next
    # line after such a label. No match anywhere on the document -> None,
    # left blank by the caller — see the module docstring for why there's
    # deliberately no "guess anywhere" fallback beyond this.
    for i, line in enumerate(lines):
        if has_type_pattern:
            candidates = _type_candidates(field_type, line)
            label_part = line
            for c in candidates:
                label_part = label_part.replace(c, "")
            if candidates and _label_matches(field_name, label_part):
                return candidates[0], (
                    f'Found "{candidates[0]}" on a line that looks like it labels "{field_name}" '
                    "— please verify."
                )
            if _label_matches(field_name, line) and i + 1 < len(lines):
                next_candidates = _type_candidates(field_type, lines[i + 1])
                if next_candidates:
                    return next_candidates[0], (
                        f'Found "{next_candidates[0]}" just below a line that looks like it labels '
                        f'"{field_name}" — please verify.'
                    )
        else:
            split = _LABEL_VALUE_SPLIT.match(line)
            if split and _label_matches(field_name, split.group(1)):
                value = split.group(2).strip()
                if value:
                    return value, (
                        f'Found "{value}" next to a label that looks like "{field_name}" — please verify.'
                    )

    return None


def apply_mandatory_field_fallback(fields: list[ExtractedField], raw_text: str) -> None:
    """Any required field the LLM (and any earlier, more specific fallback)
    left empty gets a best-effort guess filled in, always flagged invalid
    for manual confirmation. Mutates `fields` in place."""
    for field in fields:
        if not field.required or field.value.strip():
            continue
        guess = guess_value_for_field(field.name, field.field_type, raw_text)
        if guess:
            field.value, field.reason = guess
            field.valid = False
