// IT / Tech Support Consultant: tickets (ITIL-style, P1-P4 SLAs), time log
// billed in 15-minute increments (MSP style), parts, contracts (managed /
// prepaid block / ad-hoc rate card), sites, asset inventory. Invoices are the
// shared business_invoices. Owner-only RLS, free tier.

export const TICKET_STATUSES = ["new", "assigned", "in_progress", "waiting", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting: "Waiting on client",
  resolved: "Resolved",
  closed: "Closed",
};
export const OPEN_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress"];

export const PRIORITIES = ["p1", "p2", "p3", "p4"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  p1: "P1 Critical",
  p2: "P2 High",
  p3: "P3 Normal",
  p4: "P4 Low",
};
export const PRIORITY_BADGE: Record<Priority, string> = {
  p1: "bg-[#ff5c7a]/20 text-[#ff5c7a]",
  p2: "bg-[#ff9f43]/20 text-[#ffb36b]",
  p3: "bg-[#4f8cff]/15 text-[#7aa8ff]",
  p4: "bg-white/10 text-text-muted",
};
// Mirrors the it_ticket_before_insert trigger (for display only).
export const SLA_TEXT: Record<Priority, string> = {
  p1: "respond 1h · resolve 4h",
  p2: "respond 4h · resolve 1 day",
  p3: "respond 1 day · resolve 3 days",
  p4: "respond 2 days · resolve 5 days",
};

export const TICKET_TYPES = ["incident", "service_request", "project"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  incident: "Incident",
  service_request: "Service request",
  project: "Project",
};

export const WORK_TYPES = ["remote", "onsite", "travel", "after_hours"] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  remote: "Remote",
  onsite: "On-site",
  travel: "Travel",
  after_hours: "After-hours",
};

export const CONTRACT_TYPES = ["managed", "prepaid", "ad_hoc"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  managed: "Managed (monthly)",
  prepaid: "Prepaid hours block",
  ad_hoc: "Ad-hoc rate card",
};

export const ASSET_TYPES = ["workstation", "laptop", "server", "printer", "network", "mobile", "license", "other"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  workstation: "Workstation",
  laptop: "Laptop",
  server: "Server",
  printer: "Printer",
  network: "Network",
  mobile: "Mobile",
  license: "License",
  other: "Other",
};

export type ItSite = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string;
  name: string;
  address: string | null;
  contact: string | null;
  notes: string | null;
  created_at: string;
};

export type ItContract = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string;
  title: string;
  contract_type: ContractType;
  monthly_fee: number | string | null;
  hours_purchased: number | string | null;
  hourly_rate: number | string | null;
  covers_remote: boolean;
  covers_onsite: boolean;
  covers_after_hours: boolean;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  created_at: string;
};

export type ItAsset = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string;
  site_id: string | null;
  asset_type: AssetType;
  name: string;
  make_model: string | null;
  serial: string | null;
  os: string | null;
  ip_address: string | null;
  assigned_user: string | null;
  purchase_date: string | null;
  warranty_end: string | null;
  credentials_location: string | null;
  status: "active" | "retired";
  notes: string | null;
  created_at: string;
};

export type ItTicket = {
  id: string;
  user_id: string;
  business_id: string;
  client_id: string | null;
  site_id: string | null;
  asset_id: string | null;
  contract_id: string | null;
  number: string;
  ticket_type: TicketType;
  priority: Priority;
  status: TicketStatus;
  subject: string;
  description: string | null;
  resolution: string | null;
  opened_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  respond_due_at: string | null;
  resolve_due_at: string | null;
  created_at: string;
};

export type ItTimeEntry = {
  id: string;
  user_id: string;
  ticket_id: string;
  work_date: string;
  minutes: number;
  work_type: WorkType;
  description: string | null;
  billable: boolean;
  covered: boolean;
  invoice_id: string | null;
  created_at: string;
};

export type ItPart = {
  id: string;
  user_id: string;
  ticket_id: string;
  item: string;
  quantity: number | string;
  unit_cost: number | string;
  unit_price: number | string;
  invoice_id: string | null;
  created_at: string;
};

export function isItBusiness(categoryName: string | null | undefined): boolean {
  return /tech support|it\s*\/\s*tech/i.test(categoryName ?? "");
}

// MSP billing: each entry rounds UP to the next 15 minutes.
export function billedMinutes(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Does a contract cover this kind of work? (prepaid blocks draw down hours.)
export function contractCovers(c: ItContract | null | undefined, w: WorkType): boolean {
  if (!c || !c.active || c.contract_type === "ad_hoc") return false;
  if (w === "after_hours") return c.covers_after_hours;
  if (w === "onsite" || w === "travel") return c.covers_onsite;
  return c.covers_remote;
}

export type SlaState = { label: string; tone: "ok" | "soon" | "breach" | "met" } | null;

export function slaState(t: ItTicket, nowMs: number): SlaState {
  if (t.status === "resolved" || t.status === "closed") {
    if (t.resolve_due_at && t.resolved_at && t.resolved_at > t.resolve_due_at) return { label: "Resolved late", tone: "breach" };
    return { label: "SLA met", tone: "met" };
  }
  if (t.status === "waiting") return null; // SLA clock effectively paused while waiting on the client
  const check = (due: string | null, what: string): SlaState => {
    if (!due) return null;
    const d = new Date(due).getTime();
    const left = d - nowMs;
    if (left < 0) return { label: `${what} overdue`, tone: "breach" };
    const total = d - new Date(t.opened_at).getTime();
    if (total > 0 && left / total < 0.25) {
      const mins = Math.max(1, Math.round(left / 60000));
      return { label: `${what} due in ${mins >= 120 ? `${Math.round(mins / 60)}h` : `${mins}m`}`, tone: "soon" };
    }
    return { label: `${what} by ${new Date(due).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, tone: "ok" };
  };
  if (!t.first_response_at) {
    const r = check(t.respond_due_at, "Response");
    if (r && r.tone !== "ok") return r;
  }
  return check(t.resolve_due_at, "Resolve");
}
