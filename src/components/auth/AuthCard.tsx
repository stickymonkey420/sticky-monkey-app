import { LOGO_HEAD_URL, LOGO_WORDMARK_URL } from "@/lib/brand/logo";

export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-7">
        <div className="mb-6 text-center">
          {/* Same logo lockup as the app sidebar: head icon, script wordmark,
              divider, FINANCE label. */}
          <div className="mb-5 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_HEAD_URL} alt="" className="mb-0.5 h-16 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_WORDMARK_URL} alt="Sticky Monkey" className="h-auto w-[188px]" />
            <div className="mb-2 h-px w-[25px]" style={{ backgroundColor: "rgba(255,255,255,0.25)" }} />
            <span className="text-[13px] font-light tracking-[0.35em] text-text-muted">FINANCE</span>
          </div>
          <h1 className="text-base font-medium text-text-primary">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
