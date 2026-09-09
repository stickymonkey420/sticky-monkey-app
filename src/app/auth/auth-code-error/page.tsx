import Link from "next/link";
import AuthCard from "@/components/auth/AuthCard";

export default function AuthCodeErrorPage() {
  return (
    <AuthCard title="Link expired or invalid" subtitle="That confirmation link didn't work.">
      <p className="text-sm text-text-muted">
        It may have already been used, or it expired. Request a new one and try again.
      </p>
      <p className="mt-5 text-center text-sm">
        <Link href="/forgot-password" style={{ color: "#4f8cff" }}>
          Reset password
        </Link>
        <span className="mx-2 text-text-muted">·</span>
        <Link href="/sign-in" style={{ color: "#4f8cff" }}>
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
