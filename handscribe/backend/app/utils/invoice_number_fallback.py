"""
Deterministic fallback for the Invoice Number field.

Indian invoice/challan books very often label the invoice number with
just the bare word "No." (no "Invoice" qualifier), which the LLM
sometimes misses — especially when the document also has "Your Order
No.", "Our D.C. No.", or a line-item "Sl. No." column competing for the
same pattern. Even with a strengthened prompt, this remains genuinely
non-deterministic on some calls (confirmed: identical input at
temperature=0 succeeded 1 of 3 tries), so this regex fallback catches
the case the LLM misses.
"""
import re

from app.schemas import ExtractedField

INVOICE_NUMBER_NAME_HINTS = {
    "invoice number",
    "invoice no",
    "invoice no.",
    "bill number",
    "bill no",
    "bill no.",
}

# Optional "Inv."/"Invoice"/"Bill" qualifier, then "No", then any trailing
# punctuation OCR tends to produce (a printed underline often reads as a
# run of dots). Anchored at the start so "Your Order No." / "Our D.C.
# No." / "Sl.No  Particulars ..." never match — none of those begin with
# this pattern.
_LABEL_PREFIX = r"(?:inv(?:oice)?\.?|bill)?\s*no[.:\-\s]*"
_LABEL_WITH_VALUE = re.compile(
    rf"^{_LABEL_PREFIX}([A-Za-z0-9][A-Za-z0-9/\-]{{0,19}})$", re.IGNORECASE
)
_LABEL_ONLY = re.compile(rf"^{_LABEL_PREFIX}$", re.IGNORECASE)

# A standalone 3-6 digit line — long enough to plausibly be a serial
# number, short enough to exclude phone numbers/pincodes/GSTINs.
_STANDALONE_DIGITS = re.compile(r"^\d{3,6}$")


def guess_bare_no_value(raw_text: str) -> str | None:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]

    # Value directly on the label's own line (e.g. "No. 139", "Inv. No.: 4928").
    for line in lines:
        match = _LABEL_WITH_VALUE.match(line)
        if match:
            return match.group(1)

    label_lines = [i for i, line in enumerate(lines) if _LABEL_ONLY.match(line)]
    if not label_lines:
        return None

    # Multi-column layouts sometimes get linearized so the value ends up
    # on the line just before its own bare/empty label.
    for i in label_lines:
        if i > 0 and _STANDALONE_DIGITS.match(lines[i - 1]):
            return lines[i - 1]

    # No positionally-linked value found, even though a "No."-style label
    # exists somewhere — deliberately not falling back to "the first short
    # digit sequence anywhere in the document" here. That grabs unrelated
    # numbers (a quantity, a pincode fragment, a date component) often
    # enough that it does more harm than a blank field flagged as missing.
    return None


def apply_invoice_number_fallback(fields: list[ExtractedField], raw_text: str) -> None:
    """If an Invoice-Number-like field came back empty, try the bare "No."
    heuristic and fill it in flagged for manual verification. Mutates
    `fields` in place."""
    for field in fields:
        if field.name.strip().lower() not in INVOICE_NUMBER_NAME_HINTS:
            continue
        if field.value.strip():
            continue

        guess = guess_bare_no_value(raw_text)
        if guess:
            field.value = guess
            field.valid = False  # always flagged for a human to confirm
            field.reason = (
                f'Found "{guess}" near a "No." label on the document — '
                "please verify this is actually the invoice number."
            )
