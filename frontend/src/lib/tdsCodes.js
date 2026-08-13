/**
 * Reference list of TDS section/payment codes, split by regime:
 *
 * - "old": section codes under the Income-tax Act, 1961 (192, 194C, 194J...).
 *   Well-established, but officially superseded for TDS deposited/returns
 *   filed on or after 1 April 2026.
 * - "new": numeric payment codes (1001-1092) under the Income-tax Act, 2025,
 *   introduced by the CBDT notification of 20 March 2026 (parent sections
 *   392/393/394). This is a starter list compiled from secondary summaries
 *   of that notification, NOT the primary CBDT text — entries marked
 *   `provisional: true` were explicitly flagged by those sources as not yet
 *   individually notified. Confirm against TRACES/the official notification
 *   before relying on any of these for an actual filing.
 *
 * Must match backend/src/lib/tdsCodes.js.
 */

export const TDS_OLD_CODES = [
  { code: "192", description: "Salary" },
  { code: "192A", description: "Premature withdrawal from EPF" },
  { code: "193", description: "Interest on securities" },
  { code: "194", description: "Dividends" },
  { code: "194A", description: "Interest other than interest on securities (e.g. bank/FD interest)" },
  { code: "194B", description: "Winnings from lottery, crossword puzzles, card games" },
  { code: "194BA", description: "Winnings from online games" },
  { code: "194BB", description: "Winnings from horse races" },
  { code: "194C", description: "Payments to contractors/sub-contractors" },
  { code: "194D", description: "Insurance commission" },
  { code: "194DA", description: "Payment on life insurance policy (including bonus)" },
  { code: "194E", description: "Payment to non-resident sportsmen or sports associations" },
  { code: "194EE", description: "Payment from National Savings Scheme deposits" },
  { code: "194G", description: "Commission on sale of lottery tickets" },
  { code: "194H", description: "Commission or brokerage" },
  { code: "194-I(a)", description: "Rent on plant and machinery (2%)" },
  { code: "194-I(b)", description: "Rent on land, building or furniture (10%)" },
  { code: "194-IA", description: "Transfer of immovable property (other than agricultural land)" },
  { code: "194-IB", description: "Rent paid by individual/HUF not otherwise covered under 194-I" },
  { code: "194-IC", description: "Payment under a Joint Development Agreement" },
  { code: "194J(a)", description: "Fees for technical services / royalty (2%)" },
  { code: "194J(b)", description: "Fees for professional services / other royalty (10%)" },
  { code: "194K", description: "Income in respect of units of a mutual fund" },
  { code: "194LA", description: "Compensation on compulsory acquisition of immovable property" },
  { code: "194LB", description: "Interest from an infrastructure debt fund" },
  { code: "194LBA", description: "Certain income from units of a business trust" },
  { code: "194LBB", description: "Income from units of an investment fund" },
  { code: "194LBC", description: "Income from investment in a securitisation trust" },
  { code: "194LC", description: "Interest from an Indian company (foreign currency borrowing/bonds)" },
  { code: "194LD", description: "Interest on certain government securities and rupee-denominated bonds" },
  { code: "194M", description: "Contract/commission/brokerage/professional fees paid by individual/HUF" },
  { code: "194N", description: "Cash withdrawal exceeding the specified limit" },
  { code: "194O", description: "Payment by e-commerce operator to e-commerce participant" },
  { code: "194P", description: "TDS on specified senior citizens (75+, pension + interest income)" },
  { code: "194Q", description: "Purchase of goods (value exceeding ₹50 lakh)" },
  { code: "194R", description: "Benefit or perquisite in business/profession" },
  { code: "194S", description: "Transfer of virtual digital assets (crypto)" },
  { code: "195", description: "Payments to non-residents" },
  { code: "196A", description: "Income from units payable to a non-resident" },
  { code: "196B", description: "Income from units of an offshore fund" },
  { code: "196C", description: "Income from foreign currency bonds/GDRs" },
  { code: "196D", description: "Income of Foreign Institutional Investors from securities" },
  { code: "206C(1)", description: "TCS on sale of scrap, alcohol, timber, minerals etc." },
  { code: "206C(1G)", description: "TCS on overseas remittance under LRS / overseas tour packages" },
];

export const TDS_NEW_CODES = [
  { code: "1002", description: "Salary payments, non-government employees — s.392" },
  { code: "1005", description: "Insurance commission (2%) — s.393(1)" },
  { code: "1006", description: "Commission or brokerage, other (2%) — s.393(1)" },
  {
    code: "1007",
    description: "Rent paid by individual/HUF deductor (2%) — s.393(1)",
    provisional: true,
  },
  { code: "1008", description: "Rent on plant and machinery (2%) — s.393(1)" },
  { code: "1009", description: "Rent on land, building or furniture (10%) — s.393(1)" },
  { code: "1011", description: "Payment under a Joint Development Agreement — s.393(1)" },
  { code: "1012", description: "Compensation on compulsory acquisition of immovable property — s.393(1)" },
  { code: "1019", description: "Interest on securities — s.393(1)" },
  { code: "1020", description: "Interest other than on securities, senior-citizen payee — s.393(1)" },
  { code: "1021", description: "Interest other than on securities, bank/other, non-senior payee (10%) — s.393(1)" },
  { code: "1022", description: "Interest other than on securities, non-bank (10%) — s.393(1)" },
  { code: "1023", description: "Contractor payments, individual/HUF deductee (1%) — s.393(1)" },
  { code: "1024", description: "Contractor payments, other deductee (2%) — s.393(1)" },
  { code: "1026", description: "Technical fees / royalty (2%) — s.393(1)" },
  { code: "1027", description: "Professional fees (10%) — s.393(1)" },
  { code: "1028", description: "Director's remuneration (e.g. sitting fees) — s.393(1)" },
  { code: "1029", description: "Dividends (10%) — s.393(1)" },
  { code: "1030", description: "Life insurance policy proceeds — s.393(1)" },
  { code: "1031", description: "Purchase of goods, value above ₹50 lakh (0.1%) — s.393(1)" },
  { code: "1033", description: "Benefit or perquisite in business/profession, cash (10%) — s.393(1)" },
  { code: "1035", description: "Payment by e-commerce operator to participant (0.1%) — s.393(1)" },
  { code: "1037", description: "Transfer of virtual digital assets (1%) — s.393(1)" },
  { code: "1057", description: "Payments to non-residents (rates in force / DTAA) — s.393(2)" },
  { code: "1064", description: "Cash withdrawal — banks/co-operative societies — s.393(3)" },
  { code: "1065", description: "Cash withdrawal, other cases (2%) — s.393(3)" },
  { code: "1067", description: "Partner remuneration/salary — s.393(3)" },
  { code: "1071", description: "TCS on scrap, alcohol, timber and similar goods (1%) — s.394" },
  { code: "1072", description: "TCS on motor vehicle sale above ₹10 lakh — s.394" },
  { code: "1074", description: "TCS on LRS remittance / overseas tour package — s.394" },
];

export function codesForRegime(regime) {
  return regime === "old" ? TDS_OLD_CODES : TDS_NEW_CODES;
}

export function describeTdsCode(regime, code) {
  if (!code) return "";
  const entry = codesForRegime(regime).find((c) => c.code === code);
  if (!entry) return "";
  return entry.provisional ? `${entry.description} (provisional — not yet individually notified by CBDT)` : entry.description;
}
