"""
LLM structuring provider abstraction.

Prompt-building, JSON parsing, and field validation are shared across
providers — only the actual network call to the model differs. Swap in a
new provider (Gemini, OpenAI, etc.) by subclassing LLMStructuringProvider
and implementing `_call_model`; register it in `app/llm/factory.py`.
"""
import json
import re
from abc import ABC, abstractmethod

from app.schemas import ExtractedField, FieldSchemaIn
from app.utils.invoice_number_fallback import INVOICE_NUMBER_NAME_HINTS
from app.utils.type_validation import is_valid_for_type

_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

SYSTEM_PROMPT = (
    "You are a precise document-structuring assistant. Briefly reason "
    "through tricky or ambiguous fields first — this measurably improves "
    "accuracy on messy real-world documents — then end your response with "
    "the JSON object as the very last thing you output, with nothing "
    "after it."
)


class LLMStructuringError(RuntimeError):
    """Raised when the LLM response can't be parsed into the expected shape,
    or the underlying API call fails."""


class LLMStructuringProvider(ABC):
    @abstractmethod
    def _call_model(self, system: str, prompt: str) -> str:
        """Call the underlying LLM and return its raw text response."""
        raise NotImplementedError

    def structure_fields(
        self, raw_text: str, fields: list[FieldSchemaIn]
    ) -> list[ExtractedField]:
        prompt = self._build_prompt(raw_text, fields)
        content = self._call_model(SYSTEM_PROMPT, prompt)
        data = self._parse_json_response(content)
        return self._to_extracted_fields(data, fields)

    @staticmethod
    def _build_prompt(raw_text: str, fields: list[FieldSchemaIn]) -> str:
        field_lines = []
        for f in fields:
            type_desc = f.field_type.value
            if f.field_type.value == "custom_regex":
                type_desc = f"custom_regex (must match pattern: {f.regex_pattern})"
            elif f.field_type.value == "gst_number":
                type_desc = (
                    "gst_number (Indian GSTIN: exactly 15 characters — 2-digit state "
                    "code, 10-character PAN, 1-digit entity number, the letter 'Z', "
                    "then 1 checksum character, e.g. 27AAPFU0939F1ZV). Look for it near "
                    "labels like 'GST', 'GSTIN', or 'GST No'."
                )
            elif f.field_type.value == "pan_number":
                type_desc = (
                    "pan_number (Indian PAN: exactly 10 characters — 5 letters, 4 digits, "
                    "1 letter, e.g. AAPFU0939F). Look for it near labels like 'PAN', "
                    "'PAN No', or 'PAN Card'. A GSTIN contains a PAN as characters 3-12 of "
                    "itself — don't extract that substring as the PAN unless the document "
                    "also independently shows a standalone PAN, since a GSTIN and a PAN are "
                    "different identifiers."
                )
            elif f.field_type.value == "date":
                type_desc = (
                    "date — normalize to DD/MM/YYYY (day/month/year) regardless of how "
                    "it's written in the document, e.g. '15 March 2024', '3/15/2024', and "
                    "'2024-03-15' must all be extracted as '15/03/2024'. Use the actual "
                    "date found, just reformatted."
                )
            field_lines.append(
                f'- "{f.name}": type={type_desc}, required={f.required}'
            )
            if f.name.strip().lower() in INVOICE_NUMBER_NAME_HINTS:
                field_lines.append(
                    '  Hint: In printed Indian invoice/challan books, standard practice '
                    'is to label this field with JUST the bare word "No." — no "Invoice" '
                    'or "Bill" qualifier at all — usually near the top of the form right '
                    'next to "Date" and BEFORE any "Your Order No." / "Our D.C. No." '
                    'lines. The first such bare "No." followed by a number, in that '
                    'position, ALWAYS IS the invoice number — extract it even though the '
                    'label doesn\'t literally say "Invoice". Do not leave this empty just '
                    'because the word "Invoice" isn\'t attached to the label. Do NOT use '
                    '"Your Order No.", "Our D.C. No.", "Challan No.", "P.O. No.", or a '
                    'line-item serial number column labeled "Sl. No." / "S. No." instead '
                    '— those are different reference numbers.'
                )
        fields_block = "\n".join(field_lines)

        return f"""Below is raw OCR text extracted from a handwritten document, followed by a
list of fields to extract from it.

RAW OCR TEXT:
---
{raw_text}
---

FIELDS TO EXTRACT:
{fields_block}

First, go through the fields ONE AT A TIME, in order, and write one short
line for each: quote the exact text you're using as evidence, or state
that it's genuinely absent. Pay special attention to any field with a
"Hint:" above — don't skip past it. Do this for every field, even ones
that seem obvious.

Then, after reasoning through all fields, end your response with a JSON
object in exactly this shape (this must be the last thing in your
response — no markdown code fences around it, nothing after it):
{{
  "fields": [
    {{
      "name": "<field name exactly as given above>",
      "value": "<extracted value as a string, or empty string if not present>",
      "valid": <true or false>,
      "reason": "<short reason if invalid or missing, else empty string>"
    }},
    ...
  ]
}}

Rules:
- Include every field listed above, in the same order, exactly once.
- If a field's value is not clearly present in the OCR text, set "value" to
  an empty string and "valid" to false. NEVER invent, guess, or hallucinate
  a value that isn't actually in the text.
- Set "valid" to false if the extracted value does not actually match the
  declared type (e.g. a Numeric field containing letters, an Email field
  without an @, a Date field that isn't a date). Do not silently coerce or
  reformat values to make them fit — flag the mismatch instead. The one
  exception is Date fields: always reformat the date you found to
  DD/MM/YYYY as described above — that's a required normalization, not a
  coercion of an invalid value.
- For Custom Regex fields, "valid" should be true only if the value matches
  the given pattern.
"""

    @staticmethod
    def _parse_json_response(content: str) -> dict:
        cleaned = _THINK_TAG_RE.sub("", content).strip()
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned.strip(), flags=re.MULTILINE)

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # The model may reason in prose before ending with the JSON object —
        # try from the last "{" onward first, since that's where the prompt
        # asks it to put the JSON.
        last_brace = cleaned.rfind("{")
        if last_brace != -1:
            try:
                return json.loads(cleaned[last_brace:])
            except json.JSONDecodeError:
                pass

        match = _JSON_BLOCK_RE.search(cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError as exc:
                raise LLMStructuringError(
                    f"Could not parse JSON from the model's response: {exc}"
                ) from exc

        raise LLMStructuringError(
            "The model's response did not contain any parseable JSON object."
        )

    @staticmethod
    def _to_extracted_fields(
        data: dict, fields: list[FieldSchemaIn]
    ) -> list[ExtractedField]:
        raw_fields = data.get("fields")
        if not isinstance(raw_fields, list):
            raise LLMStructuringError(
                "Model response JSON was missing the expected 'fields' array."
            )

        by_name = {}
        for item in raw_fields:
            if isinstance(item, dict) and "name" in item:
                by_name[str(item["name"]).strip().lower()] = item

        results: list[ExtractedField] = []
        for field_def in fields:
            item = by_name.get(field_def.name.strip().lower(), {})
            value = str(item.get("value", "") or "")
            reason = item.get("reason") or None

            if value.strip():
                # Trust a deterministic regex/format check over the LLM's own
                # judgment call — the LLM sometimes marks malformed values as
                # valid or vice versa.
                valid = is_valid_for_type(field_def.field_type, value, field_def.regex_pattern)
                if not valid and not reason:
                    reason = f"Value doesn't match the expected {field_def.field_type.value} format."
            else:
                valid = False
                reason = reason or (
                    "Required field was not found in the document."
                    if field_def.required
                    else "Not present in the document."
                )

            results.append(
                ExtractedField(
                    name=field_def.name,
                    value=value,
                    valid=valid,
                    required=field_def.required,
                    field_type=field_def.field_type,
                    reason=reason,
                )
            )
        return results
