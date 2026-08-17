"""
Deterministic, regex-based validation for each FieldType.

The Groq LLM extracts values and makes its own judgment call about
validity, but LLM judgment on "does this look like a valid email/date/GST
number" is inconsistent — this module re-checks every non-empty extracted
value against a fixed pattern so the "valid" flag shown to the user is
actually trustworthy, not just the model's opinion.
"""
import re

from app.schemas import FieldType

# GSTIN: 2-digit state code + 10-char PAN + 1-digit entity number +
# 'Z' (fixed) + 1 alphanumeric checksum. Standard 15-character format.
GST_NUMBER_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")

# PAN: 5 letters + 4 digits + 1 letter. Standard 10-character format.
PAN_NUMBER_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")

NUMERIC_PATTERN = re.compile(r"^\d+(\.\d+)?$")
ALPHABETIC_PATTERN = re.compile(r"^[A-Za-z\s.'-]+$")
ALPHANUMERIC_PATTERN = re.compile(r"^[A-Za-z0-9\s.,#/-]+$")
CURRENCY_PATTERN = re.compile(r"^[₹$€£]?\s?\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_PATTERN = re.compile(r"^[+]?[\d\s().-]{7,15}$")
DATE_PATTERNS = [
    re.compile(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}$"),  # 2024-03-15, 2024/3/15
    re.compile(r"^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$"),  # 15-03-2024, 3/15/24
    re.compile(r"^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$"),  # 15 March 2024
    re.compile(r"^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$"),  # March 15, 2024
]


def is_valid_for_type(field_type: FieldType, value: str, regex_pattern: str | None) -> bool:
    """Returns True if `value` matches the declared type's expected shape."""
    value = value.strip()
    if not value:
        return False

    if field_type == FieldType.CUSTOM_REGEX:
        if not regex_pattern:
            return False
        try:
            return re.fullmatch(regex_pattern, value) is not None
        except re.error:
            return False

    if field_type == FieldType.GST_NUMBER:
        return GST_NUMBER_PATTERN.fullmatch(value.upper()) is not None
    if field_type == FieldType.PAN_NUMBER:
        return PAN_NUMBER_PATTERN.fullmatch(value.upper()) is not None
    if field_type == FieldType.NUMERIC:
        return NUMERIC_PATTERN.fullmatch(value) is not None
    if field_type == FieldType.ALPHABETIC:
        return ALPHABETIC_PATTERN.fullmatch(value) is not None
    if field_type == FieldType.ALPHANUMERIC:
        return ALPHANUMERIC_PATTERN.fullmatch(value) is not None
    if field_type == FieldType.CURRENCY:
        return CURRENCY_PATTERN.fullmatch(value) is not None
    if field_type == FieldType.EMAIL:
        return EMAIL_PATTERN.fullmatch(value) is not None
    if field_type == FieldType.PHONE:
        digit_count = sum(ch.isdigit() for ch in value)
        return bool(PHONE_PATTERN.fullmatch(value)) and digit_count >= 7
    if field_type == FieldType.DATE:
        return any(p.fullmatch(value) for p in DATE_PATTERNS)

    return True
