/**
 * Validated chart colors. Each array is a checked instance, not a hand-picked one --
 * see the data-viz method's six-check validator. Only swap these hexes after re-running it
 * (node scripts/validate_palette.js "<hex,hex,...>" --mode light [--ordinal]).
 */

// Categorical -- workflow identity (GST, TDS, and whatever's added later). Fixed order,
// assigned in sequence, never cycled or reassigned by value. Passes the categorical
// six-check validator for its first 4 slots (light mode); past 4, fold into "Other".
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

// Ordinal -- one hue, monotone lightness, for the stage funnel (order carries meaning:
// documents requested -> ... -> billed). Passes the ordinal ramp check; light end still
// clears 2:1 contrast against the card surface.
export const STAGE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

// Not "the lightest stage" -- a workflow with no progress yet is absence, not the low end
// of the ramp, so it gets a true neutral instead of stretching the hue to a 6th step.
export const NOT_STARTED_COLOR = "#94a3b8";
