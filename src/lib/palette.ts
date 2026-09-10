// Shared fixed categorical color order for every chart/donut in this app --
// per the dataviz skill's non-negotiable "assign categorical hues in fixed
// order, never cycled." One sequence, reused everywhere, so two features
// (Invest's portfolio donuts, Wallet's spending donut/debit-credit chart)
// never independently invent their own ad hoc colors.
//
// Ported from the dataviz skill's reference palette (dark-mode steps -- this
// app has no light theme, see src/app/globals.css) and re-validated for this
// app via `node scripts/validate_palette.js "<hexes>" --mode dark`: all 8
// pass the lightness band, chroma floor, CVD adjacent-separation (worst
// 8.4), normal-vision floor (worst 19.3), and contrast checks.
export const CATEGORICAL_PALETTE = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

// Muted gray, distinct from every categorical slot above -- reserved for
// "not a real category" (a folded-in long tail, e.g. donut "Other" slices).
// Never reused as a real series color.
export const OTHER_COLOR = "#5c6478";

// A ranked list (largest-first) is capped to this many real categories
// before the rest folds into "Other" -- keeps donut legends and chart
// legends scannable regardless of how many raw categories exist upstream.
export const MAX_CATEGORICAL_SLICES = 6;
