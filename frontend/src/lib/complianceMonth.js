const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Which month's compliance cycle is "current" right now, given the day that
 * closes it out (usually the filing due day). Once that day has passed this
 * month, the relevant cycle rolls forward to next month.
 */
export function relevantMonthLabel(anchorDay) {
  const now = new Date();
  let month = now.getMonth();
  let year = now.getFullYear();

  if (anchorDay != null && now.getDate() > anchorDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return `${MONTH_NAMES[month]} ${year}`;
}
