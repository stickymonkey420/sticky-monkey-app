// Shared styles + formatters for the IT / Tech Support workspace.
export const itInput = "rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none";
export const itSmall = "rounded border border-card-border bg-[#0f131c] px-2 py-1.5 text-xs text-text-primary outline-none";
export const itBtn = "rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60";
export const itBtnSmall = "rounded bg-[#f5d020] px-3 py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60";

export function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
export const num = (v: number | string | null | undefined) => (v == null || v === "" ? 0 : Number(v));
