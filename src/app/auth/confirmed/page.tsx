import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";
import { safeNext } from "@/lib/auth/safeNext";

// Landed on from /auth/confirm after a *successful* verifyOtp() for a type
// where "you're confirmed" is itself worth telling the user, rather than
// silently continuing straight to `next` (see CONFIRMATION_ACK_TYPES in
// src/app/auth/confirm/route.ts).
const COPY: Record<string, { title: string; subtitle: string; body: string }> = {
  signup: {
    title: "You're confirmed!",
    subtitle: "Thanks for confirming your email.",
    body: "Your account is ready to go.",
  },
  invite: {
    title: "Invitation accepted",
    subtitle: "Your account is ready.",
    body: "You're all set to get started.",
  },
  email_change: {
    title: "Email updated",
    subtitle: "Your new email address is confirmed.",
    body: "You can keep using your account as normal.",
  },
};

const DEFAULT_COPY = {
  title: "Confirmed",
  subtitle: "You're all set.",
  body: "You can continue to your account.",
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const copy = (params.type && COPY[params.type]) || DEFAULT_COPY;

  return (
    <AuthCard title={copy.title} subtitle={copy.subtitle}>
      <p className="text-center text-sm text-text-muted">{copy.body}</p>
      <Link
        href={next}
        className="mt-5 block rounded-lg py-2.5 text-center text-sm font-semibold text-white"
        style={{ backgroundColor: "#4f8cff" }}
      >
        Continue
      </Link>
    </AuthCard>
  );
}
