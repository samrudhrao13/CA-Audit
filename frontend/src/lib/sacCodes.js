/**
 * Curated starter list of SAC (Services Accounting Code) entries — the
 * common 6-digit service codes a CA firm's clients are likely to use, plus a
 * handful of broad 4-digit group headings (marked "heading") for services
 * that don't need finer classification.
 *
 * The official CBIC Scheme of Classification of Services runs to 681 SAC
 * codes across chapter 99 — far too many to hand-compile and verify here.
 * This is a starter set, not the complete official list; extend it as
 * clients need codes that aren't covered yet.
 */
export const SAC_CODES = [
  { code: "998211", description: "Legal advisory and representation services — criminal law" },
  { code: "998212", description: "Legal advisory and representation services — other fields of law" },
  { code: "998213", description: "Legal documentation and certification — patents, copyrights, IP" },
  { code: "998221", description: "Financial auditing services" },
  { code: "998222", description: "Accounting and bookkeeping services" },
  { code: "998223", description: "Payroll services" },
  { code: "998231", description: "Corporate tax consulting and preparation services" },
  { code: "998232", description: "Individual tax preparation and planning services" },
  { code: "998311", description: "Management consulting (financial, strategic, HR, marketing, operations)" },
  { code: "998313", description: "Information technology consulting and support services" },
  { code: "998314", description: "Information technology design and development services" },
  { code: "998315", description: "Hosting and IT infrastructure provisioning services" },
  { code: "998316", description: "IT infrastructure and network management services" },
  { code: "998321", description: "Architectural advisory services" },
  { code: "998331", description: "Engineering advisory services" },
  { code: "998339", description: "Project management services for construction projects" },
  { code: "998511", description: "Executive or retained personnel search services" },
  { code: "998512", description: "Permanent placement services, other than executive search" },
  { code: "998555", description: "Tour operator services" },
  { code: "998593", description: "Telephone-based support services" },
  { code: "9954", description: "Construction services (heading)" },
  { code: "9961", description: "Services in wholesale trade (heading)" },
  { code: "9962", description: "Services in retail trade (heading)" },
  { code: "9963", description: "Accommodation, food and beverage services (heading)" },
  { code: "9964", description: "Passenger transport services (heading)" },
  { code: "9965", description: "Goods transport services (heading)" },
  { code: "9966", description: "Rental services of transport vehicles (heading)" },
  { code: "9967", description: "Supporting services in transport (heading)" },
  { code: "9968", description: "Postal and courier services (heading)" },
  { code: "9971", description: "Financial and related services (heading)" },
  { code: "9972", description: "Real estate services (heading)" },
  { code: "9973", description: "Leasing or rental services, without operator (heading)" },
  { code: "9981", description: "Research and development services (heading)" },
  { code: "9991", description: "Public administration and other community services (heading)" },
  { code: "9992", description: "Education services (heading)" },
  { code: "9993", description: "Human health and social care services (heading)" },
  { code: "9994", description: "Sewage, waste collection and environmental services (heading)" },
  { code: "9995", description: "Services of membership organizations (heading)" },
  { code: "9996", description: "Recreational, cultural and sporting services (heading)" },
  { code: "9997", description: "Other services — repair, maintenance, personal services (heading)" },
];

export function describeSacCode(code) {
  if (!code) return "";
  return SAC_CODES.find((c) => c.code === code)?.description || "";
}
