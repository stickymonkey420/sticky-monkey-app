import Link from "next/link";
import { LOGO_HEAD_URL, LOGO_WORDMARK_URL } from "@/lib/brand/logo";

// Shared layout for the public Privacy Policy and Terms pages (no sign-in
// required -- see the proxy allow-list in lib/supabase/middleware.ts).
// Edit LEGAL below to change the contact address, effective date or
// governing law in one place.
export const LEGAL = {
  effective: "October 21, 2026",
  contact: "privacy@stickymonkey.net",
  governingLaw: "the State of Nevada, USA",
};

export type LegalSection = { h: string; p?: string[]; ul?: string[] };

export default function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto w-full max-w-3xl rounded-2xl border border-card-border bg-card-bg p-6 md:p-10">
        <header className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_HEAD_URL} alt="" className="mb-0.5 h-12 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_WORDMARK_URL} alt="Sticky Monkey" className="h-auto w-[150px]" />
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-text-primary">{title}</h1>
          <p className="mt-1 text-xs text-text-muted">Effective {LEGAL.effective}</p>
        </header>

        <p className="mb-8 text-sm leading-relaxed text-text-primary">{intro}</p>

        <div className="flex flex-col gap-7">
          {sections.map((s, i) => (
            <section key={s.h}>
              <h2 className="mb-2 text-base font-semibold text-text-primary">
                {i + 1}. {s.h}
              </h2>
              {s.p?.map((t) => (
                <p key={t} className="mb-2 text-sm leading-relaxed text-text-muted">
                  {t}
                </p>
              ))}
              {s.ul && (
                <ul className="ml-5 list-disc space-y-1.5 text-sm leading-relaxed text-text-muted">
                  {s.ul.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer className="mt-10 flex flex-wrap justify-center gap-4 border-t border-card-border pt-5 text-xs text-text-muted">
          <Link href="/privacy" className="hover:text-text-primary">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-text-primary">Terms of Service</Link>
          <a href={`mailto:${LEGAL.contact}`} className="hover:text-text-primary">{LEGAL.contact}</a>
        </footer>
      </article>
    </main>
  );
}
