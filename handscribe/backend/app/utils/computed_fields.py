"""
Deterministic recomputation/checks for fields that are simple arithmetic
over other extracted fields — more reliable than trusting OCR+LLM to read
a printed total correctly.
"""
import re

from app.schemas import ExtractedField
from app.utils.number_to_words import amount_to_words_indian

_TAXABLE_VALUE = "taxable value"
_CGST_AMOUNT = "cgst amount"
_SGST_AMOUNT = "sgst amount"
_IGST_AMOUNT = "igst amount"
_GRAND_TOTAL = "grand total"
_AMOUNT_IN_WORDS = "amount in words"

_MATCH_TOLERANCE = 0.01


def _parse_currency(value: str) -> float:
    cleaned = re.sub(r"[^\d.\-]", "", value)
    if not cleaned or cleaned in {"-", "."}:
        return 0.0
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _compute_expected_total(fields: list[ExtractedField]) -> float | None:
    """Taxable Value + CGST + SGST + IGST (whichever are present). None if
    there's no Taxable Value to start from."""
    by_name = {f.name.strip().lower(): f for f in fields}
    taxable_field = by_name.get(_TAXABLE_VALUE)
    if not taxable_field or not taxable_field.value.strip():
        return None

    total = _parse_currency(taxable_field.value)
    for key in (_CGST_AMOUNT, _SGST_AMOUNT, _IGST_AMOUNT):
        component = by_name.get(key)
        if component and component.value.strip():
            total += _parse_currency(component.value)
    return total


def apply_grand_total_check(fields: list[ExtractedField]) -> float | None:
    """
    Grand Total is high-stakes, so it's never auto-marked "Valid" — it
    always shows as "Check" so a human confirms it, regardless of whether
    the arithmetic lines up. The displayed value stays exactly what was
    extracted from the document (never overwritten); a background
    calculation of Taxable + CGST + SGST + IGST is compared against it,
    and any mismatch is called out in `reason`. Mutates `fields` in place.

    Returns the computed Taxable+tax total (for Amount in Words to use),
    or None if there wasn't enough to compute one.
    """
    by_name = {f.name.strip().lower(): f for f in fields}
    grand_total_field = by_name.get(_GRAND_TOTAL)
    computed_total = _compute_expected_total(fields)
    if not grand_total_field:
        return computed_total

    extracted_raw = grand_total_field.value.strip()
    if not extracted_raw:
        # required-but-missing is already handled as "Missing" by the
        # frontend regardless of `valid`, so nothing more to do here.
        return computed_total

    grand_total_field.valid = False  # always "Check", never "Valid"

    if computed_total is None:
        grand_total_field.reason = "Please verify this total against the document."
    else:
        extracted_total = _parse_currency(extracted_raw)
        if abs(extracted_total - computed_total) > _MATCH_TOLERANCE:
            grand_total_field.reason = (
                f"Doesn't match Taxable Value + tax (calculated: {computed_total:.2f}) "
                f"— please verify against the document."
            )
        else:
            grand_total_field.reason = (
                "Matches Taxable Value + tax — please verify against the document."
            )

    return computed_total


def apply_amount_in_words_computation(
    fields: list[ExtractedField], computed_total: float | None
) -> None:
    """
    If there's an "Amount in Words" field, set it to the spelled-out
    Indian-currency-word form of the computed Taxable+tax total — e.g.
    1180.00 -> "Rupees One Thousand One Hundred Eighty Only" — instead of
    whatever handwriting OCR happened to read there. Uses the computed
    total (not the possibly-mismatched extracted Grand Total) since it's
    the more reliable of the two. Mutates `fields` in place.
    """
    by_name = {f.name.strip().lower(): f for f in fields}
    words_field = by_name.get(_AMOUNT_IN_WORDS)
    if not words_field or computed_total is None:
        return

    words_field.value = amount_to_words_indian(computed_total)
    words_field.valid = True
    words_field.reason = None
