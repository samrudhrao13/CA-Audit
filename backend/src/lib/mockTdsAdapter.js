export const TDS_RETURN_TYPES = ["Form24Q", "Form26Q"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomAmount(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/**
 * Phase 1 stand-in for the real TDS portal (TRACES) automation. Same shape
 * as mockGstAdapter.js on purpose — simulates the login -> OTP -> download
 * flow so the whole pipeline can be tested without touching the live portal.
 * Swapping this out later for a real integration only means replacing this
 * file — everything that calls it (tdsRunStore.js) only depends on these
 * four functions.
 */
export const mockTdsAdapter = {
  async startSession({ username, password, tan }) {
    if (!username || !password) {
      throw new Error("Missing TDS portal credentials");
    }
    if (!tan) {
      throw new Error("Client has no TAN on file");
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
    const totalDeducteeCount = randomInt(1, 40);
    const tdsDeducted = randomAmount(5_000, 150_000);
    const interestAmount = randomAmount(0, tdsDeducted * 0.02);
    const totalChallanAmount = tdsDeducted + interestAmount;
    return { returnType, period, totalDeducteeCount, tdsDeducted, interestAmount, totalChallanAmount, details: {} };
  },
};
