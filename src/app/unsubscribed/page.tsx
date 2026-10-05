import UnsubscribeConfirm from "./UnsubscribeConfirm";

export const metadata = { title: "Unsubscribe | Sticky Monkey Finance" };

export default async function UnsubscribedPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f131c] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161b26] p-6 text-center">
        <div className="mb-2 text-lg font-semibold text-[#f5d020]">🐒 Sticky Monkey Finance</div>
        <UnsubscribeConfirm token={t ?? ""} />
      </div>
    </main>
  );
}
