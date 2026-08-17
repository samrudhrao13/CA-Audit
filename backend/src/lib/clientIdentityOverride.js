// Same 15-character GSTIN pattern used by HandScribe's own validation
// (handscribe/backend/app/utils/type_validation.py) — kept in sync since this file re-validates
// the client profile's stored value independently of whatever HandScribe already checked.
const GST_NUMBER_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_NUMBER_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const DUMMY_ADDRESS_VALUES = new Set(["n/a", "na", "none", "nil", "-", "test", "xxx", "tbd", "unknown", "."]);

// A handwritten/printed invoice often has an illegible or missing GSTIN/PAN/address for the
// client's own side of the transaction — but that's already known, authoritative data sitting
// on the client's profile. Rather than trust OCR to re-read something we already have on file,
// these field names (exact match against what the two standard templates — Purchase Invoice,
// Sales Invoice — actually call them) get overwritten with the profile's value whenever it's
// present and looks like a real one. The other party's GSTIN/PAN/address (Vendor GSTIN, Buyer
// GSTIN on a sales invoice, etc.) is untouched — we have no profile data for outside companies,
// and GSTR-2B reconciliation depends on that value being read from the actual document.
const CLIENT_GSTIN_FIELD_NAMES = new Set(["Buyer (Your Co.) GSTIN", "Seller GSTIN"]);
const CLIENT_PAN_FIELD_NAMES = new Set(["Buyer (Your Co.) PAN", "Seller PAN"]);
const CLIENT_ADDRESS_FIELD_NAMES = new Set(["Buyer (Your Co.) Address", "Seller Address"]);

const PROFILE_FILL_REASON = "Filled from the client's profile — not read from the document.";

function validGstin(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return GST_NUMBER_PATTERN.test(v) ? v : null;
}

function validPan(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return PAN_NUMBER_PATTERN.test(v) ? v : null;
}

function validAddress(client) {
  const parts = [client?.addressLine1, client?.addressLine2, client?.addressLine3]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const joined = parts.join(", ");
  if (joined.length < 5 || DUMMY_ADDRESS_VALUES.has(joined.toLowerCase())) return null;
  return joined;
}

/** Overrides GSTIN/PAN/address fields that represent the client's own identity with the
 *  client's profile data, whenever the profile actually has a valid-looking value for that
 *  field — otherwise leaves whatever OCR/the LLM extracted untouched. Returns a new fields
 *  array; doesn't mutate the input. */
export function applyClientIdentityOverride(fields, client) {
  const trustedGstin = validGstin(client?.gstin);
  const trustedPan = validPan(client?.pan);
  const trustedAddress = validAddress(client);

  return (fields || []).map((f) => {
    if (trustedGstin && CLIENT_GSTIN_FIELD_NAMES.has(f.name)) {
      return { ...f, value: trustedGstin, valid: true, reason: PROFILE_FILL_REASON };
    }
    if (trustedPan && CLIENT_PAN_FIELD_NAMES.has(f.name)) {
      return { ...f, value: trustedPan, valid: true, reason: PROFILE_FILL_REASON };
    }
    if (trustedAddress && CLIENT_ADDRESS_FIELD_NAMES.has(f.name)) {
      return { ...f, value: trustedAddress, valid: true, reason: PROFILE_FILL_REASON };
    }
    return f;
  });
}
