// W-2 jobs (table w2_jobs, owner-only RLS -- see w2-jobs-table.sql). Kept
// separate from options/business income on purpose: W-2 pay is shown as its
// own line on the Income page and does NOT feed Income History or the
// monthly income goal.

export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
};

export const CHECKS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

export type W2Job = {
  id: string;
  user_id: string;
  employer: string;
  job_title: string | null;
  annual_salary: number | string;
  pay_frequency: PayFrequency;
  net_per_check: number | string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
} & PaystubFields;

// Last paystub: this period ("paystub_*") and year-to-date ("ytd_*").
export const PAYSTUB_LINES = [
  { key: "gross", label: "Gross pay" },
  { key: "federal", label: "Federal income tax" },
  { key: "social_security", label: "Social Security (FICA)" },
  { key: "medicare", label: "Medicare" },
  { key: "state", label: "State income tax" },
  { key: "other", label: "Other taxes (SDI, local)" },
  { key: "pretax", label: "Pre-tax 401(k) / HSA" },
] as const;
export type PaystubLineKey = (typeof PAYSTUB_LINES)[number]["key"];

export type PaystubFields = {
  paystub_date?: string | null;
} & { [K in PaystubLineKey as `paystub_${K}`]?: number | string | null } & {
  [K in PaystubLineKey as `ytd_${K}`]?: number | string | null;
};

export type W2JobInput = {
  employer: string;
  job_title: string | null;
  annual_salary: number;
  pay_frequency: PayFrequency;
  net_per_check: number | null;
  start_date: string | null;
  is_active: boolean;
} & PaystubFields;

// Fired on window after any add/edit/delete so every mounted W-2 view
// (Income page card, Quick Access) refreshes without a page reload.
export const W2_CHANGED_EVENT = "sm:w2-jobs-changed";
