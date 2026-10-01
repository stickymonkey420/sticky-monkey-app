import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BusinessSession,
  PaymentMethod,
  PaymentType,
  SessionAttendee,
  SessionStatus,
  SessionType,
} from "./sessionTypes";

// CRUD for class sessions + their attendee rosters. RLS limits every row to
// its owner, so all calls run with the signed-in user's own client.

export async function fetchSessions(supabase: SupabaseClient, businessId: string): Promise<BusinessSession[]> {
  const { data, error } = await supabase
    .from("business_sessions")
    .select("*")
    .eq("business_id", businessId)
    .order("start_at", { ascending: true });
  if (error) {
    console.error("fetchSessions failed", error);
    return [];
  }
  return (data ?? []) as BusinessSession[];
}

export async function fetchAttendees(supabase: SupabaseClient, businessId: string): Promise<SessionAttendee[]> {
  const { data, error } = await supabase
    .from("business_session_attendees")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchAttendees failed", error);
    return [];
  }
  return (data ?? []) as SessionAttendee[];
}

export async function addSession(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: {
    session_type: SessionType;
    title: string;
    start_at: string;
    location: string | null;
    capacity: number | null;
    default_price: number | null;
  }
): Promise<{ session: BusinessSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from("business_sessions")
    .insert({ ...input, user_id: userId, business_id: businessId, status: "scheduled" })
    .select("*")
    .single();
  if (error) {
    console.error("addSession failed", error);
    return { session: null, error: error.message };
  }
  return { session: data as BusinessSession, error: null };
}

export async function updateSessionStatus(
  supabase: SupabaseClient,
  id: string,
  status: SessionStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_sessions").update({ status }).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteSession(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  // Attendees cascade-delete with their session.
  const { error } = await supabase.from("business_sessions").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export async function addAttendee(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  input: {
    session_id: string;
    client_id: string | null;
    client_name: string;
    payment_type: PaymentType;
    payment_method: PaymentMethod | null;
    amount: number;
    paid: boolean;
  }
): Promise<{ attendee: SessionAttendee | null; error: string | null }> {
  const { data, error } = await supabase
    .from("business_session_attendees")
    .insert({ ...input, user_id: userId, business_id: businessId })
    .select("*")
    .single();
  if (error) {
    console.error("addAttendee failed", error);
    return { attendee: null, error: error.message };
  }
  return { attendee: data as SessionAttendee, error: null };
}

export async function updateAttendeePaid(
  supabase: SupabaseClient,
  id: string,
  paid: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_session_attendees").update({ paid }).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteAttendee(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("business_session_attendees").delete().eq("id", id);
  return { error: error ? error.message : null };
}
