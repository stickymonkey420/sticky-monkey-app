// One cell of a live-preview stat grid -- label on top (small, muted,
// uppercase, matching the account tiles' styling elsewhere in Game-a-Fi),
// value below in its own color. Kept tiny/borderless (no card-within-a-
// card) since it's meant to sit inside a preview box that already has its
// own border. Shared by SellContractWidget's "Sell a Contract" preview and
// BuySellSharesCard's price preview so both read as the same component.
export default function PreviewStat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="text-sm font-semibold" style={{ color: color ?? undefined }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
    </div>
  );
}
