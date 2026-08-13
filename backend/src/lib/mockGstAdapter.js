export const GST_RETURN_TYPES = ["GSTR1", "GSTR3B"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomAmount(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

/**
 * Phase 1 stand-in for the real GST portal automation. Simulates realistic
 * timing and the login -> OTP -> download flow without touching the live
 * portal, so the whole pipeline (trigger -> OTP relay -> data mapping ->
 * export) can be exercised and tested end to end. Swapping this out later
 * for a real Playwright-driven scrape (or an official GSP/API integration)
 * only means replacing this file — everything that calls it (runStore.js)
 * only depends on the four functions below.
 */
export const mockGstAdapter = {
  async startSession({ username, password, gstin }) {
    if (!username || !password) {
      throw new Error("Missing GST portal credentials");
    }
    if (!gstin) {
      throw new Error("Client has no GSTIN on file");
    }
    await delay(800);
  },

  async submitOtp(otp) {
    if (!/^\d{4,8}$/.test(otp)) {
      throw new Error("OTP rejected by portal");
    }
    await delay(500);
  },

  async fetchReturn(period, returnType) {
    await delay(700);
    const taxableValue = randomAmount(50_000, 500_000);
    const igst = randomAmount(0, taxableValue * 0.18);
    const cgst = randomAmount(0, taxableValue * 0.09);
    const sgst = cgst;
    const cess = randomAmount(0, taxableValue * 0.01);
    return { returnType, period, taxableValue, igst, cgst, sgst, cess, details: {} };
  },
};
