import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BillingModel,
  DevMilestone,
  DevProject,
  DevTimeEntry,
  MilestoneStatus,
  ProjectStatus,
  ProjectType,
} from "./devTypes";
import type { BusinessInvoice, BusinessInvoiceLine, InvoicePaymentMethod, InvoiceStatus } from "./invoiceTypes";

// Data layer for App / Web Developer businesses + the shared invoices.
// Every call runs as the signed-in user; RLS keeps rows owner-only.

type Result<T> = { data: T | null; error: string | null };

function fail<T>(label: string, error: { message: string }): Result<T> {
  console.error(`${label} failed`, error);
  return { data: null, error: error.message };
}

// ---------- load everything for one business ----------
export async function fetchDevWorkspace(supabase: SupabaseClient, businessId: string) {
  const { data: projects } = await supabase
    .from("dev_projects")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  const projectIds = (projects ?? []).map((p) => p.id as string);
  const [milestones, time, invoices] = await Promise.all([
    projectIds.length
      ? supabase.from("dev_milestones").select("*").in("project_id", projectIds).order("sort_order").order("created_at")
      : Promise.resolve({ data: [] }),
    projectIds.length
      ? supabase.from("dev_time_entries").select("*").in("project_id", projectIds).order("work_date", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("business_invoices").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
  ]);
  const invoiceIds = (invoices.data ?? []).map((i) => i.id as string);
  const lines = invoiceIds.length
    ? await supabase.from("business_invoice_lines").select("*").in("invoice_id", invoiceIds).order("sort_order")
    : { data: [] };
  return {
    projects: (projects ?? []) as DevProject[],
    milestones: (milestones.data ?? []) as DevMilestone[],
    time: (time.data ?? []) as DevTimeEntry[],
    invoices: (invoices.data ?? []) as BusinessInvoice[],
    lines: (lines.data ?? []) as BusinessInvoiceLine[],
  };
}

// ---------- projects ----------
export async function addProject(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: {
    name: string;
    client_id: string | null;
    project_type: ProjectType;
    billing_model: BillingModel;
    hourly_rate: number | null;
    budget: number | null;
    due_date: string | null;
  }
): Promise<Result<DevProject>> {
  const { data, error } = await supabase
    .from("dev_projects")
    .insert({ ...input, user_id: userId, business_id: businessId, status: "lead" })
    .select("*")
    .single();
  return error ? fail("addProject", error) : { data: data as DevProject, error: null };
}

export async function updateProject(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      DevProject,
      | "name"
      | "client_id"
      | "project_type"
      | "status"
      | "billing_model"
      | "hourly_rate"
      | "budget"
      | "start_date"
      | "due_date"
      | "repo_url"
      | "live_url"
      | "staging_url"
      | "notes"
    >
  > & { status?: ProjectStatus }
): Promise<Result<DevProject>> {
  const { data, error } = await supabase.from("dev_projects").update(patch).eq("id", id).select("*").single();
  return error ? fail("updateProject", error) : { data: data as DevProject, error: null };
}

export async function deleteProject(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dev_projects").delete().eq("id", id);
  return { error: error ? error.message : null };
}

// ---------- milestones ----------
export async function addMilestone(
  supabase: SupabaseClient,
  userId: string,
  input: { project_id: string; title: string; amount: number; due_date: string | null; sort_order: number }
): Promise<Result<DevMilestone>> {
  const { data, error } = await supabase
    .from("dev_milestones")
    .insert({ ...input, user_id: userId, status: "pending" })
    .select("*")
    .single();
  return error ? fail("addMilestone", error) : { data: data as DevMilestone, error: null };
}

export async function updateMilestone(
  supabase: SupabaseClient,
  id: string,
  patch: { title?: string; amount?: number; due_date?: string | null; status?: MilestoneStatus }
): Promise<Result<DevMilestone>> {
  const { data, error } = await supabase.from("dev_milestones").update(patch).eq("id", id).select("*").single();
  return error ? fail("updateMilestone", error) : { data: data as DevMilestone, error: null };
}

export async function deleteMilestone(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dev_milestones").delete().eq("id", id);
  return { error: error ? error.message : null };
}

// ---------- time ----------
export async function addTimeEntry(
  supabase: SupabaseClient,
  userId: string,
  input: {
    project_id: string;
    milestone_id: string | null;
    work_date: string;
    hours: number;
    description: string | null;
    billable: boolean;
  }
): Promise<Result<DevTimeEntry>> {
  const { data, error } = await supabase
    .from("dev_time_entries")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  return error ? fail("addTimeEntry", error) : { data: data as DevTimeEntry, error: null };
}

export async function deleteTimeEntry(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("dev_time_entries").delete().eq("id", id);
  return { error: error ? error.message : null };
}

// ---------- invoices (shared) ----------
export async function createDevInvoice(
  supabase: SupabaseClient,
  input: { projectId: string; milestoneIds: string[]; timeIds: string[]; dueDate: string | null; notes: string | null }
): Promise<Result<string>> {
  const { data, error } = await supabase.rpc("create_dev_invoice", {
    p_project_id: input.projectId,
    p_milestone_ids: input.milestoneIds,
    p_time_ids: input.timeIds,
    p_due_date: input.dueDate,
    p_notes: input.notes,
  });
  return error ? fail("createDevInvoice", error) : { data: data as string, error: null };
}

export async function setInvoiceStatus(
  supabase: SupabaseClient,
  id: string,
  status: InvoiceStatus,
  paymentMethod: InvoicePaymentMethod | null = null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("set_business_invoice_status", {
    p_invoice_id: id,
    p_status: status,
    p_payment_method: paymentMethod,
    p_paid_date: null,
  });
  if (error) console.error("setInvoiceStatus failed", error);
  return { error: error ? error.message : null };
}

export async function updateInvoiceDetails(
  supabase: SupabaseClient,
  id: string,
  patch: { due_date?: string | null; notes?: string | null }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_invoices").update(patch).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteInvoice(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("delete_business_invoice", { p_invoice_id: id });
  if (error) console.error("deleteInvoice failed", error);
  return { error: error ? error.message : null };
}
