// Port of the live Webflow "Users & Groups" admin page (page id
// 6a83f9f879dd9a50c8e75e96). Full spec came from the project doc
// claude/users-groups-head-code.html (the page's own head-code script) --
// this is a straight port, not a from-schema rebuild like Investors.
export type Role = "app_director" | "support" | "developer" | "paid" | "free";

export const ROLE_LABELS: Record<Role, string> = {
  app_director: "App Director",
  support: "Support",
  developer: "Developer",
  paid: "Paid",
  free: "Free",
};

export const ALL_ROLES: Role[] = ["app_director", "support", "developer", "paid", "free"];
export const LIMITED_ROLES: Role[] = ["paid", "free"];

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  is_demo: boolean;
  created_at: string | null;
  use_cases: string[] | null;
  onboarding_survey: Record<string, unknown> | null;
  onboarding_completed_at: string | null;
  username: string | null;
  date_of_birth: string | null;
  present_address: string | null;
  permanent_address: string | null;
  postal_code: string | null;
  avatar_url: string | null;
  account_types: string[] | null;
};

export const ACCOUNT_TYPE_DEFS: { key: string; label: string }[] = [
  { key: "brokerage", label: "Brokerage (Taxable)" },
  { key: "traditional", label: "Traditional IRA" },
  { key: "roth", label: "Roth IRA" },
  { key: "sdira", label: "SDIRA" },
  { key: "metals", label: "Precious Metals" },
  { key: "crypto", label: "Crypto" },
];

export const USE_CASE_DEFS: { key: string; label: string }[] = [
  { key: "personal_tracking", label: "Personal Tracking" },
  { key: "investment_income", label: "Investment Tracking & Income Generating" },
  { key: "travel_connections", label: "Travel Connections" },
];

export const TRI_STATE_FIELD_DEFS: { key: string; label: string }[] = [
  { key: "travels_a_lot", label: "Travels a lot" },
  { key: "side_gigs", label: "Has side gigs (Uber, DoorDash, Etsy...)" },
  { key: "owns_business", label: "Owns their own business" },
  { key: "digital_nomad", label: "Digital nomad" },
  { key: "outside_us_50pct", label: "Outside the US >50% of the year" },
  { key: "other_citizenship", label: "Holds non-US citizenship" },
  { key: "sell_options_income", label: "Interested in selling options for income" },
  { key: "sell_options_track_in_app", label: "Wants to track that income in-app" },
];

export type TriState = true | false | null;
