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
];

export type YesNoQuestion = {
  key: string;
  q: string;
};

export const YES_NO_QUESTIONS: YesNoQuestion[] = [
  { key: "travels_a_lot", q: "Do you travel a lot? ✈️" },
  { key: "side_gigs", q: "Got any side gigs? (Uber, DoorDash, Etsy...) 💰" },
  { key: "owns_business", q: "Do you own your own business? 💼" },
  { key: "digital_nomad", q: "Are you a digital nomad? 🌍" },
  { key: "outside_us_50pct", q: "Outside the US more than half the year? 🌐" },
  { key: "other_citizenship", q: "Hold any citizenships other than US? 📘" },
  { key: "sell_options_income", q: "Interested in selling options to generate income? 📈" },
];

export type OnboardingAnswers = {
  nationality?: string | null;
  sell_options_track_in_app?: boolean | null;
  [key: string]: string | boolean | null | undefined;
};

export function buildUseCasesArray(selected: Record<string, boolean>, answers: OnboardingAnswers): string[] {
  const arr = Object.keys(selected).filter((k) => selected[k]);
  if (answers.sell_options_track_in_app === true && !arr.includes("investment_income")) {
    arr.push("investment_income");
  }
  return arr;
}
