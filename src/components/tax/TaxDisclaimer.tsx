"use client";

import { TAX_YEAR } from "@/lib/tax/data2026";

// Shared disclaimer for every Taxes page.
export default function TaxDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#f5d020]/40 bg-[#f5d020]/10 p-4 text-xs leading-relaxed text-text-primary">
      <b className="text-[#f5d020]">⚠ Estimate only. Not tax advice.</b>{" "}
      {compact ? (
        <>All &quot;projected&quot; income and gains are estimates. Consult a CPA for official tax information.</>
      ) : (
        <>
          The &quot;projected&quot; income, gains and taxes on this page are rough estimates based on what you enter and on {TAX_YEAR} federal and
          state rates. They leave out many items (AMT, most credits, local/city taxes, state-specific adjustments, and more) and can differ
          from what you actually owe. <b>Consult a CPA or licensed tax professional for official tax information.</b> Your entries stay in this
          browser only.
        </>
      )}
    </div>
  );
}

