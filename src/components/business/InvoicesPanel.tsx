"use client";

import { useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { deleteInvoice, setInvoiceStatus } from "@/lib/business/devQueries";
import { setBusinessLogo } from "@/lib/business/queries";
import { fileToLogoPng } from "@/lib/business/logoImage";
import { downloadInvoicePdf, type InvoicePdfParty } from "@/lib/business/invoicePdf";
import {
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_METHOD_LABELS,
  INVOICE_STATUS_LABELS,
  isOverdue,
  todayIso,
  type BusinessInvoice,
  type BusinessInvoiceLine,
  type InvoicePaymentMethod,
  type InvoiceStatus,
} from "@/lib/business/invoiceTypes";
import type { BusinessClient } from "@/lib/business/types";

// Shared invoices list (any business type): totals, status workflow
// Draft -> Sent -> Paid (or Void), line detail, and PDF download.

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<InvoiceStatus | "overdue", string> = {
  draft: "bg-white/10 text-text-muted",
  sent: "bg-[#4f8cff]/15 text-[#7aa8ff]",
  overdue: "bg-[#ff5c7a]/15 text-[#ff5c7a]",
  paid: "bg-[#3ddc97]/15 text-[#3ddc97]",
  void: "bg-white/5 text-text-muted line-through",
};

export default function InvoicesPanel({
  loading,
  invoices,
  lines,
  clients,
  projectNameById,
  from,
  businessId,
  onLogoChange,
  onChanged,
  onError,
}: {
  loading: boolean;
  invoices: BusinessInvoice[];
  lines: BusinessInvoiceLine[];
  clients: BusinessClient[];
  projectNameById: (id: string | null) => string | null;
  from: InvoicePdfParty;
  businessId: string;
  onLogoChange: (logo: string | null) => void;
  onChanged: () => void;
  onError: (msg: string | null) => void;
}) {
  const confirm = useConfirm();
  const [openId, setOpenId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<InvoicePaymentMethod>("bank_transfer");
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayIso();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  async function handleLogoFile(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true);
    onError(null);
    const { dataUrl, error } = await fileToLogoPng(file);
    if (error || !dataUrl) {
      setLogoBusy(false);
      return onError(error ?? "Could not use that image.");
    }
    const res = await setBusinessLogo(createClient(), businessId, dataUrl);
    setLogoBusy(false);
    if (res.error) return onError("Could not save the logo. Please try again.");
    onLogoChange(dataUrl);
  }

  async function handleRemoveLogo() {
    if (!(await confirm({ message: "Remove the logo from your invoices?", danger: true }))) return;
    setLogoBusy(true);
    const res = await setBusinessLogo(createClient(), businessId, null);
    setLogoBusy(false);
    if (res.error) return onError("Could not remove the logo. Please try again.");
    onLogoChange(null);
  }

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const linesByInvoice = useMemo(() => {
    const m = new Map<string, BusinessInvoiceLine[]>();
    for (const l of lines) m.set(l.invoice_id, [...(m.get(l.invoice_id) ?? []), l]);
    return m;
  }, [lines]);

  const totals = useMemo(() => {
    const sum = (f: (i: BusinessInvoice) => boolean) => invoices.filter(f).reduce((s, i) => s + Number(i.total), 0);
    return {
      draft: sum((i) => i.status === "draft"),
      sent: sum((i) => i.status === "sent" && !isOverdue(i, today)),
      overdue: sum((i) => isOverdue(i, today)),
      paid: sum((i) => i.status === "paid"),
    };
  }, [invoices, today]);

  async function changeStatus(inv: BusinessInvoice, status: InvoiceStatus, method: InvoicePaymentMethod | null = null) {
    if (status === "void") {
      const ok = await confirm({
        message: `Void ${inv.number}? Its milestones and hours go back to "ready to invoice".`,
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(inv.id);
    onError(null);
    const { error } = await setInvoiceStatus(createClient(), inv.id, status, method);
    setBusyId(null);
    setPayingId(null);
    if (error) return onError("Could not update that invoice. Please try again.");
    onChanged();
  }

  async function handleDelete(inv: BusinessInvoice) {
    if (!(await confirm({ message: `Delete ${inv.number}? Its milestones and hours go back to "ready to invoice".`, danger: true })))
      return;
    setBusyId(inv.id);
    const { error } = await deleteInvoice(createClient(), inv.id);
    setBusyId(null);
    if (error) return onError("Could not delete that invoice. Please try again.");
    onChanged();
  }

  async function handlePdf(inv: BusinessInvoice) {
    const c = inv.client_id ? clientById.get(inv.client_id) : null;
    try {
      await downloadInvoicePdf({
        invoice: inv,
        lines: linesByInvoice.get(inv.id) ?? [],
        from,
        billTo: { name: c?.name ?? "Client", lines: [c?.email, c?.phone] },
        projectName: projectNameById(inv.project_id),
      });
    } catch (err) {
      console.error("PDF failed", err);
      onError("Could not build the PDF. Please try again.");
    }
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Invoices</h4>
        {/* Invoice branding */}
        <div className="flex items-center gap-3 text-xs">
          {from.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
            <img src={from.logo} alt="Invoice logo" className="h-10 max-w-[140px] rounded bg-white object-contain p-1" />
          ) : (
            <span className="text-text-muted">No logo on invoices</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="hidden"
            onChange={(e) => {
              void handleLogoFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={logoBusy}
            onClick={() => fileRef.current?.click()}
            className="font-semibold text-[#f5d020] hover:underline disabled:opacity-60"
          >
            {logoBusy ? "Saving…" : from.logo ? "Replace logo" : "Upload logo"}
          </button>
          {from.logo && (
            <button type="button" disabled={logoBusy} onClick={handleRemoveLogo} className="text-[#ff5c7a] hover:underline">
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: "Draft", v: totals.draft },
          { k: "Sent", v: totals.sent, color: "text-[#7aa8ff]" },
          { k: "Overdue", v: totals.overdue, color: totals.overdue > 0 ? "text-[#ff5c7a]" : undefined },
          { k: "Paid (all time)", v: totals.paid, color: "text-[#3ddc97]" },
        ].map((t) => (
          <div key={t.k} className="rounded-xl bg-white/5 p-3">
            <div className="text-xs text-text-muted">{t.k}</div>
            <div className={`mt-0.5 text-lg font-semibold ${t.color ?? "text-text-primary"}`}>{loading ? "…" : money(t.v)}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : invoices.length === 0 ? (
        <div className="text-sm text-text-muted">No invoices yet. Open a project and use “Create invoice”.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const overdue = isOverdue(inv, today);
            const badge = overdue ? "overdue" : inv.status;
            const c = inv.client_id ? clientById.get(inv.client_id) : null;
            const project = projectNameById(inv.project_id);
            const isOpen = openId === inv.id;
            const busy = busyId === inv.id;
            return (
              <div key={inv.id} className="rounded-xl bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{inv.number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[badge]}`}>
                        {overdue ? "Overdue" : INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </div>
                    <div className="truncate text-xs text-text-muted">
                      {[c?.name ?? "No client", project, `issued ${fmtDate(inv.issue_date)}`, inv.due_date ? `due ${fmtDate(inv.due_date)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                      {inv.status === "paid" && inv.paid_date
                        ? ` · paid ${fmtDate(inv.paid_date)}${inv.payment_method ? ` via ${INVOICE_PAYMENT_METHOD_LABELS[inv.payment_method]}` : ""}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-sm font-semibold text-text-primary">{money(Number(inv.total))}</span>
                    {inv.status === "draft" && (
                      <button type="button" disabled={busy} onClick={() => changeStatus(inv, "sent")} className="font-semibold text-[#7aa8ff] hover:underline">
                        Mark sent
                      </button>
                    )}
                    {(inv.status === "sent" || inv.status === "draft") && payingId !== inv.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPayingId(inv.id)}
                        className="font-semibold text-[#3ddc97] hover:underline"
                      >
                        Mark paid
                      </button>
                    )}
                    {payingId === inv.id && (
                      <span className="flex items-center gap-1.5">
                        <select
                          aria-label="Payment method"
                          value={payMethod}
                          onChange={(e) => setPayMethod(e.target.value as InvoicePaymentMethod)}
                          className="rounded border border-card-border bg-[#0f131c] px-2 py-1 text-xs text-text-primary outline-none"
                        >
                          {INVOICE_PAYMENT_METHODS.map((m) => (
                            <option key={m} value={m}>
                              {INVOICE_PAYMENT_METHOD_LABELS[m]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(inv, "paid", payMethod)}
                          className="rounded bg-[#3ddc97] px-2 py-1 font-semibold text-[#0f131c] disabled:opacity-60"
                        >
                          Confirm
                        </button>
                        <button type="button" onClick={() => setPayingId(null)} className="text-text-muted hover:text-text-primary">
                          Cancel
                        </button>
                      </span>
                    )}
                    {inv.status === "paid" && (
                      <button type="button" disabled={busy} onClick={() => changeStatus(inv, "sent")} className="text-text-muted hover:underline">
                        Undo paid
                      </button>
                    )}
                    <button type="button" onClick={() => handlePdf(inv)} className="font-semibold text-[#f5d020] hover:underline">
                      PDF
                    </button>
                    <button type="button" onClick={() => setOpenId(isOpen ? null : inv.id)} className="text-text-muted hover:text-text-primary">
                      {isOpen ? "Hide" : "Details"}
                    </button>
                    {(inv.status === "sent" || inv.status === "draft") && (
                      <button type="button" disabled={busy} onClick={() => changeStatus(inv, "void")} className="text-[#ff5c7a] hover:underline">
                        Void
                      </button>
                    )}
                    {(inv.status === "draft" || inv.status === "void") && (
                      <button type="button" disabled={busy} onClick={() => handleDelete(inv)} className="text-[#ff5c7a] hover:underline">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-white/[0.08] px-3.5 py-3 text-xs">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="text-left uppercase text-text-muted">
                          <th className="py-1 pr-3">Description</th>
                          <th className="py-1 pr-3 text-right">Qty</th>
                          <th className="py-1 pr-3 text-right">Rate</th>
                          <th className="py-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {(linesByInvoice.get(inv.id) ?? []).map((l) => (
                          <tr key={l.id}>
                            <td className="py-1.5 pr-3 text-text-primary">{l.description}</td>
                            <td className="py-1.5 pr-3 text-right text-text-muted">{Number(l.quantity)}</td>
                            <td className="py-1.5 pr-3 text-right text-text-muted">{money(Number(l.unit_price))}</td>
                            <td className="py-1.5 text-right text-text-primary">{money(Number(l.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {inv.notes && <div className="mt-2 text-text-muted">Notes: {inv.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
