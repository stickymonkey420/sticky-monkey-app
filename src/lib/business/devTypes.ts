// App / Web Developer businesses: projects -> milestones + time log ->
// invoices (shared business_invoices). Tables: dev_projects, dev_milestones,
// dev_time_entries (owner-only RLS, free tier).

export const PROJECT_STATUSES = ["lead", "proposal", "active", "delivered", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: "Lead",
  proposal: "Proposal",
  active: "Active",
  delivered: "Delivered",
  done: "Done",
  cancelled: "Cancelled",
};
// Board columns (Cancelled shows under Done, dimmed).
export const BOARD_COLUMNS: ProjectStatus[] = ["lead", "proposal", "active", "delivered", "done"];

export const PROJECT_TYPES = ["website", "web_app", "mobile_app", "maintenance", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  web_app: "Web App",
  mobile_app: "Mobile App",
  maintenance: "Maintenance",
  other: "Other",
};

export const BILLING_MODELS = ["fixed", "hourly", "retainer"] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];
export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  fixed: "Fixed price",
  hourly: "Hourly",
  retainer: "Retainer",
};

export const MILESTONE_STATUSES = ["pending", "in_progress", "delivered", "invoiced", "paid"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  delivered: "Delivered",
  invoiced: "Invoiced",
  paid: "Paid",
};
// Statuses a user can pick by hand; invoiced/paid are set by invoices.
export const MANUAL_MILESTONE_STATUSES: MilestoneStatus[] = ["pending", "in_progress", "delivered"];

export type DevProject = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string | null;
  name: string;
  project_type: ProjectType;
  status: ProjectStatus;
  billing_model: BillingModel;
  hourly_rate: number | string | null;
  budget: number | string | null;
  start_date: string | null;
  due_date: string | null;
  repo_url: string | null;
  live_url: string | null;
  staging_url: string | null;
  notes: string | null;
  created_at: string;
};

export type DevMilestone = {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  amount: number | string;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
  invoice_id: string | null;
  created_at: string;
};

export type DevTimeEntry = {
  id: string;
  user_id: string;
  project_id: string;
  milestone_id: string | null;
  work_date: string;
  hours: number | string;
  description: string | null;
  billable: boolean;
  invoice_id: string | null;
  created_at: string;
};

export function isDevBusiness(categoryName: string | null | undefined): boolean {
  return /developer/i.test(categoryName ?? "");
}
