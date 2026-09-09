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
          <div className="mb-1 text-lg font-semibold text-text-primary">Sticky Monkey Finance</div>
          <h1 className="text-base font-medium text-text-primary">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
