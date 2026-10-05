import { LOGO_HEAD_URL, LOGO_WORDMARK_URL } from "@/lib/brand/logo";
import UnsubscribeConfirm from "./UnsubscribeConfirm";

export const metadata = { title: "Unsubscribe | Sticky Monkey Finance" };

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f131c] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b26] p-6 text-center">
        <div className="mb-5 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_HEAD_URL} alt="" className="mb-0.5 h-14 w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_WORDMARK_URL}
            alt="Sticky Monkey"
            className="h-auto w-[170px]"
          />
          <span className="mt-1 text-[12px] font-light tracking-[0.35em] text-[#8a93a6]">
            FINANCE
          </span>
        </div>
        <UnsubscribeConfirm token={t ?? ""} />
      </div>
    </main>
  );
}
