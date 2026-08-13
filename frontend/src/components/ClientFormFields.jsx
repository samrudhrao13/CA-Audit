import { INDIAN_STATES } from "../lib/indianStates";
import { COMPANY_TYPES } from "../lib/companyTypes";
import { TdsCodePicker } from "./TdsCodePicker";
import { CustomFieldsEditor } from "./CustomFieldsEditor";
import { SAC_CODES, describeSacCode } from "../lib/sacCodes";

/** Company/registration/address/contact/TDS fields shared by the create-client form and the edit-client form. */
export function ClientFormFields({ form, setField, setFormValue }) {
  return (
    <>
      <div className="form-section">
        <h3>Company details</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="name">Client name</label>
            <input id="name" required value={form.name} onChange={setField("name")} />
          </div>
          <div className="field">
            <label htmlFor="companyType">Type of company</label>
            <select id="companyType" value={form.companyType} onChange={setField("companyType")}>
              <option value="">Select...</option>
              {COMPANY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="natureOfBusiness">Nature of company</label>
            <input
              id="natureOfBusiness"
              placeholder="e.g. Trading, Manufacturing, Services"
              value={form.natureOfBusiness}
              onChange={setField("natureOfBusiness")}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Registration details</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="gstin">GSTIN</label>
            <input id="gstin" value={form.gstin} onChange={setField("gstin")} />
          </div>
          <div className="field">
            <label htmlFor="pan">PAN number</label>
            <input id="pan" value={form.pan} onChange={setField("pan")} />
          </div>
          <div className="field">
            <label htmlFor="tan">TAN number</label>
            <input id="tan" value={form.tan} onChange={setField("tan")} />
          </div>
          <div className="field">
            <label htmlFor="hsnCode">HSN code (goods)</label>
            <input
              id="hsnCode"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={form.hsnCode}
              onChange={(e) => setField("hsnCode")({ target: { value: e.target.value.replace(/\D/g, "") } })}
            />
          </div>
          <div className="field">
            <label htmlFor="cin">CIN</label>
            <input id="cin" maxLength={21} value={form.cin} onChange={setField("cin")} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>SAC code (services)</h3>
        <p className="muted" style={{ margin: "0 0 4px" }}>
          Common Services Accounting Codes — a starter list, not the full official 681-entry
          CBIC classification. Extend it later if a client needs a code that isn't here yet.
        </p>
        <div className="row">
          <div className="field" style={{ flex: "0 1 200px" }}>
            <label htmlFor="sacCode">SAC code</label>
            <select id="sacCode" value={form.sacCode} onChange={setField("sacCode")}>
              <option value="">None</option>
              {SAC_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "2 1 280px" }}>
            <label>Description</label>
            <div className="copy-field">
              <span className="copy-field-value">{describeSacCode(form.sacCode) || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Address</h3>
        <div className="field">
          <label htmlFor="addressLine1">Address line 1</label>
          <input id="addressLine1" value={form.addressLine1} onChange={setField("addressLine1")} />
        </div>
        <div className="field">
          <label htmlFor="addressLine2">Address line 2</label>
          <input id="addressLine2" value={form.addressLine2} onChange={setField("addressLine2")} />
        </div>
        <div className="field">
          <label htmlFor="addressLine3">Address line 3</label>
          <input id="addressLine3" value={form.addressLine3} onChange={setField("addressLine3")} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={form.city} onChange={setField("city")} />
          </div>
          <div className="field">
            <label htmlFor="state">State</label>
            <select id="state" value={form.state} onChange={setField("state")}>
              <option value="">Select...</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="country">Country</label>
            <input id="country" value="India" disabled />
          </div>
          <div className="field">
            <label htmlFor="pinCode">PIN code</label>
            <input id="pinCode" inputMode="numeric" maxLength={6} value={form.pinCode} onChange={setField("pinCode")} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Company contact</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="phoneNumber">Phone number</label>
            <input id="phoneNumber" value={form.phoneNumber} onChange={setField("phoneNumber")} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={setField("email")} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>TDS applicability</h3>
        <p className="muted" style={{ margin: "0 0 4px" }}>
          Which TDS sections this client is liable under. New-regime codes are a starter reference
          compiled from secondary summaries of the March 2026 CBDT notification, not the primary
          text — confirm against TRACES/the official notification before relying on them for filing.
        </p>
        <TdsCodePicker
          entries={form.tdsApplicability || []}
          onChange={(entries) => setFormValue("tdsApplicability", entries)}
        />
      </div>

      <div className="form-section">
        <h3>Contact person</h3>
        <div className="row">
          <div className="field">
            <label htmlFor="contactPersonName">Name</label>
            <input id="contactPersonName" value={form.contactPersonName} onChange={setField("contactPersonName")} />
          </div>
          <div className="field">
            <label htmlFor="contactPersonPhone">Contact number</label>
            <input
              id="contactPersonPhone"
              value={form.contactPersonPhone}
              onChange={setField("contactPersonPhone")}
            />
          </div>
          <div className="field">
            <label htmlFor="contactPersonEmail">Email</label>
            <input
              id="contactPersonEmail"
              type="email"
              required
              value={form.contactPersonEmail}
              onChange={setField("contactPersonEmail")}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Custom fields</h3>
        <p className="muted" style={{ margin: "0 0 4px" }}>
          Anything this client needs beyond the standard fields above — add a field name, then
          its value.
        </p>
        <CustomFieldsEditor
          entries={form.customFields || []}
          onChange={(entries) => setFormValue("customFields", entries)}
        />
      </div>
    </>
  );
}
