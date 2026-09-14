// Row shapes for the "Side Gigs" / "My Business" feature. Verified
// column-by-column via the Supabase MCP against project
// gxxjxslnsjgsuonnxxgq. Unlike most of this app's other tables, none of
// these five carry a paid/app_director RLS restriction -- every policy is
// a plain per-user "owner_all" (or, for gig_categories, a public SELECT)
// with no role check at all, so this whole feature is free-tier.

export type GigCategory = {
  id: string;
  name: string;
  group_label: string;
  description: string | null;
  icon: string | null;
  target_url: string | null;
};

export type UserBusiness = {
  id: string;
  user_id: string;
  gig_category_id: string | null;
  category_name: string;
  group_label: string;
  business_name: string | null;
  created_at: string;
};

export type BusinessClient = {
  id: string;
  user_id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

// Matches business_jobs_status_check exactly.
export const JOB_STATUSES = ["lead", "scheduled", "in_progress", "completed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  lead: "Lead",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type BusinessJob = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string | null;
  title: string;
  status: JobStatus;
  amount: number | string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
};

// Matches business_appointments_status_check exactly.
export const APPOINTMENT_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type BusinessAppointment = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string | null;
  job_id: string | null;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
};
