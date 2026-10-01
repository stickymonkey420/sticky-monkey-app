// Business / gig feedback & feature requests (table business_feedback).
// Users submit from a business on My Business; the App Director triages
// them under Users & Groups → Feedback. RLS: submitters see/delete their
// own (delete only while "new"); app_director sees and updates all. A DB
// trigger stops submitters from setting any triage field.

export const FEEDBACK_KINDS = ["bug", "feature", "improvement", "question", "praise", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "Bug",
  feature: "Feature request",
  improvement: "Improvement",
  question: "Question",
  praise: "Praise",
  other: "Other",
};
export const KIND_BADGE: Record<FeedbackKind, string> = {
  bug: "bg-[#ff5c7a]/20 text-[#ff8aa0]",
  feature: "bg-[#4f8cff]/20 text-[#7aa8ff]",
  improvement: "bg-[#a855f7]/20 text-[#c79bff]",
  question: "bg-[#f5d020]/20 text-[#f5d020]",
  praise: "bg-[#3ddc97]/20 text-[#3ddc97]",
  other: "bg-white/10 text-text-muted",
};

export const URGENCIES = ["low", "medium", "high", "critical"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_LABELS: Record<Urgency, string> = {
  low: "Low – nice to have",
  medium: "Medium",
  high: "High – slowing me down",
  critical: "Critical – blocking me",
};

export const IMPACTS = ["me", "some", "all"] as const;
export type Impact = (typeof IMPACTS)[number];
export const IMPACT_LABELS: Record<Impact, string> = {
  me: "Just me",
  some: "Some users",
  all: "Everyone using this",
};

export const FEEDBACK_STATUSES = ["new", "triaged", "planned", "in_progress", "done", "wont_do", "duplicate"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  wont_do: "Won't do",
  duplicate: "Duplicate",
};
export const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: "bg-[#f5d020]/20 text-[#f5d020]",
  triaged: "bg-white/10 text-text-primary",
  planned: "bg-[#4f8cff]/20 text-[#7aa8ff]",
  in_progress: "bg-[#a855f7]/20 text-[#c79bff]",
  done: "bg-[#3ddc97]/20 text-[#3ddc97]",
  wont_do: "bg-white/5 text-text-muted",
  duplicate: "bg-white/5 text-text-muted",
};
export const OPEN_FEEDBACK: FeedbackStatus[] = ["new", "triaged", "planned", "in_progress"];

// Common areas of a business workspace; free text is allowed too.
export const FEEDBACK_AREAS = ["Clients", "Jobs / Scheduler", "Sessions / Classes", "Projects / Tickets", "Time tracking", "Invoices / PDF", "Rentals", "Assets", "Reports / Summary", "Look & feel", "Other"];

export type BusinessFeedback = {
  id: string;
  user_id: string;
  business_id: string | null;
  business_name: string | null;
  category_name: string | null;
  kind: FeedbackKind;
  area: string | null;
  title: string;
  details: string | null;
  steps_to_reproduce: string | null;
  user_urgency: Urgency;
  user_impact: Impact;
  page_path: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  priority_weight: number | null;
  tags: string[];
  director_notes: string | null;
  response: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

const URGENCY_PTS: Record<Urgency, number> = { low: 1, medium: 2, high: 3, critical: 4 };
const IMPACT_MULT: Record<Impact, number> = { me: 1, some: 1.5, all: 2 };

// Triage score = your weight (1–5, defaults to 3 until set) × submitter
// urgency (1–4) × reach (1 / 1.5 / 2); bugs get a 1.25 bump. Max 50.
export function feedbackScore(f: Pick<BusinessFeedback, "priority_weight" | "user_urgency" | "user_impact" | "kind">): number {
  const w = f.priority_weight ?? 3;
  const s = w * URGENCY_PTS[f.user_urgency] * IMPACT_MULT[f.user_impact] * (f.kind === "bug" ? 1.25 : 1);
  return Math.round(s * 10) / 10;
}
