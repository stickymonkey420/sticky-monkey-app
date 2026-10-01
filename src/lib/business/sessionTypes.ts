// Class-based businesses (group classes, privates, workshops) -- one session
// has MANY attendees, each with their own payment. Tables:
// business_sessions + business_session_attendees (owner-only RLS, free tier).
// Attendee rows double as the business's income log.

export const SESSION_TYPES = ["group_class", "private", "workshop"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  group_class: "Group Class",
  private: "Private Session",
  workshop: "Workshop",
};

export const SESSION_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_TYPES = ["drop_in", "class_pass", "private", "workshop", "comp"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  drop_in: "Drop-in",
  class_pass: "Class pass",
  private: "Private",
  workshop: "Workshop",
  comp: "Comp (free)",
};

export const PAYMENT_METHODS = ["cash", "card", "venmo", "zelle", "paypal", "cash_app", "check", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  venmo: "Venmo",
  zelle: "Zelle",
  paypal: "PayPal",
  cash_app: "Cash App",
  check: "Check",
  other: "Other",
};

export type BusinessSession = {
  id: string;
  user_id: string;
  business_id: string;
  session_type: SessionType;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  capacity: number | null;
  default_price: number | string | null;
  status: SessionStatus;
  notes: string | null;
  created_at: string;
};

export type SessionAttendee = {
  id: string;
  user_id: string;
  business_id: string;
  session_id: string;
  client_id: string | null;
  client_name: string;
  payment_type: PaymentType;
  payment_method: PaymentMethod | null;
  amount: number | string;
  paid: boolean;
  created_at: string;
};

// Gig categories that run classes (many clients per session) instead of the
// one-client-per-job board.
export function isClassBasedBusiness(categoryName: string | null | undefined): boolean {
  return /yoga|fitness|personal trainer/i.test(categoryName ?? "");
}

// The payment type a new attendee defaults to for a given session type.
export function defaultPaymentType(t: SessionType): PaymentType {
  if (t === "private") return "private";
  if (t === "workshop") return "workshop";
  return "drop_in";
}
