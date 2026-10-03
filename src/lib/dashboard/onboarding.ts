// Ported 1:1 from the live Webflow Dashboard's onboarding survey modal
// (head-code script, "smf-onboard-*" elements).

export type UseCase = {
  key: string;
  label: string;
  desc: string;
};

export const USE_CASES: UseCase[] = [
  { key: "personal_tracking", label: "Personal Tracking", desc: "Budgets, manual accounts, everyday money." },
  { key: "investment_income", label: "Investment Tracking & Income Generating", desc: "Portfolio, options income, market alerts." },
  { key: "games_paper_trading_derby", label: "Games - Paper Trading Derby", desc: "Game-O-Fi paper trading contests and Trade Off leaderboards." },
  { key: "financial_literacy", label: "Financial Literacy", desc: "Learn how money really works: SMU lessons, guides, and plain-language explainers." },
];

export type YesNoQuestion = {
  key: string;
  q: string;
};

export const YES_NO_QUESTIONS: YesNoQuestion[] = [
  { key: "side_gigs", q: "Got any side gigs? (Uber, DoorDash, Etsy...) 💰" },
  { key: "owns_business", q: "Do you own your own business? 💼" },
  { key: "sell_options_income", q: "Interested in selling options to generate income? 📈" },
];

// Self-rated financial literacy, 1 (just starting) to 10 (expert). Stored in
// profiles.onboarding_survey under this key.
export const LITERACY_KEY = "financial_literacy_level";

export type OnboardingAnswers = {
  financial_literacy_level?: number | null;
  sell_options_track_in_app?: boolean | null;
  [key: string]: string | number | boolean | null | undefined;
};

export function buildUseCasesArray(selected: Record<string, boolean>, answers: OnboardingAnswers): string[] {
  const arr = Object.keys(selected).filter((k) => selected[k]);
  if (answers.sell_options_track_in_app === true && !arr.includes("investment_income")) {
    arr.push("investment_income");
  }
  return arr;
}
