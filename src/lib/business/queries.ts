import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BusinessAppointment,
  BusinessClient,
  BusinessJob,
  GigCategory,
  JobStatus,
  UserBusiness,
} from "./types";

export async function fetchGigCategories(supabase: SupabaseClient): Promise<GigCategory[]> {
  const { data, error } = await supabase
    .from("gig_categories")
    .select("id,name,group_label,description,icon,target_url")
    .order("group_label", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("fetchGigCategories failed", error);
    return [];
  }
  return (data ?? []) as GigCategory[];
}

export async function fetchUserBusinesses(supabase: SupabaseClient, userId: string): Promise<UserBusiness[]> {
  const { data, error } = await supabase
    .from("user_businesses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchUserBusinesses failed", error);
    return [];
  }
  return (data ?? []) as UserBusiness[];
}

// Called from Side Gigs after picking a category + naming the business --
// creates the row that My Business then manages.
export async function addUserBusiness(
  supabase: SupabaseClient,
  userId: string,
  input: { gig_category_id: string; category_name: string; group_label: string; business_name: string }
): Promise<{ business: UserBusiness | null; error: string | null }> {
  const { data, error } = await supabase
    .from("user_businesses")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) {
    console.error("addUserBusiness failed", error);
    return { business: null, error: error.message };
  }
  return { business: data as UserBusiness, error: null };
}

export async function renameUserBusiness(
  supabase: SupabaseClient,
  id: string,
  business_name: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("user_businesses").update({ business_name }).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteUserBusiness(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("user_businesses").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export async function fetchBusinessClients(supabase: SupabaseClient, businessId: string): Promise<BusinessClient[]> {
  const { data, error } = await supabase
    .from("business_clients")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchBusinessClients failed", error);
    return [];
  }
  return (data ?? []) as BusinessClient[];
}

export async function addBusinessClient(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: { name: string; email: string | null; phone: string | null; notes: string | null }
): Promise<{ client: BusinessClient | null; error: string | null }> {
  const { data, error } = await supabase
    .from("business_clients")
    .insert({ ...input, user_id: userId, business_id: businessId })
    .select("*")
    .single();
  if (error) {
    console.error("addBusinessClient failed", error);
    return { client: null, error: error.message };
  }
  return { client: data as BusinessClient, error: null };
}

export async function deleteBusinessClient(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_clients").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export async function fetchBusinessJobs(supabase: SupabaseClient, businessId: string): Promise<BusinessJob[]> {
  const { data, error } = await supabase
    .from("business_jobs")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchBusinessJobs failed", error);
    return [];
  }
  return (data ?? []) as BusinessJob[];
}

export async function addBusinessJob(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: { title: string; client_id: string | null; amount: number | null; due_date: string | null; notes: string | null }
): Promise<{ job: BusinessJob | null; error: string | null }> {
  const { data, error } = await supabase
    .from("business_jobs")
    .insert({ ...input, user_id: userId, business_id: businessId, status: "lead" })
    .select("*")
    .single();
  if (error) {
    console.error("addBusinessJob failed", error);
    return { job: null, error: error.message };
  }
  return { job: data as BusinessJob, error: null };
}

export async function updateJobStatus(
  supabase: SupabaseClient,
  id: string,
  status: JobStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_jobs").update({ status }).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteBusinessJob(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_jobs").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export async function fetchBusinessAppointments(
  supabase: SupabaseClient,
  businessId: string
): Promise<BusinessAppointment[]> {
  const { data, error } = await supabase
    .from("business_appointments")
    .select("*")
    .eq("business_id", businessId)
    .order("start_at", { ascending: true });
  if (error) {
    console.error("fetchBusinessAppointments failed", error);
    return [];
  }
  return (data ?? []) as BusinessAppointment[];
}

export async function addBusinessAppointment(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: { title: string; start_at: string; end_at: string | null; location: string | null; notes: string | null }
): Promise<{ appointment: BusinessAppointment | null; error: string | null }> {
  const { data, error } = await supabase
    .from("business_appointments")
    .insert({ ...input, user_id: userId, business_id: businessId, status: "scheduled" })
    .select("*")
    .single();
  if (error) {
    console.error("addBusinessAppointment failed", error);
    return { appointment: null, error: error.message };
  }
  return { appointment: data as BusinessAppointment, error: null };
}

export async function deleteBusinessAppointment(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_appointments").delete().eq("id", id);
  return { error: error ? error.message : null };
}
