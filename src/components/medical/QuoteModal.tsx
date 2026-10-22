"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, checkRow, doseRows, isoToday, type Currency, type MedicalData } from "@/lib/medical/model";
import { buildQuotePdf, quoteFileName, type QuoteItem } from "@/lib/medical/quotePdf";
import { INPUT, LABEL, Shell } from "./MedicalModals";

type Line = QuoteItem & { key: string; open: boolean };

// Build a "Request for price quote" PDF of the services still needed and send
// it to a clinic. On a phone the PDF goes straight into the share sheet (pick
// Mail/Gmail and it's attached). On a computer it downloads and your email app
// opens addressed to the clinic; attach the downloaded PDF. It's sent from the
// member's own email, so the clinic replies to them directly. $0.
export default function QuoteModal({
  data,
  currency,
  patient,
  onClose,
}: {
  data: MedicalData;
  currency: Currency;
  patient: { age: number | null; sex: string | null } | null;
  onClose: () => void;
}) {
  const today = isoToday();
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const v of data.vaccines.filter((x) => x.active)) {
      const rows = doseRows(v, data.doses, today);
      const open = rows.filter((r) => !r.record);
      const total = v.doses.length;
      const labels = open.map((r) => (r.isBooster ? "booster" : `dose ${r.label} of ${total}`));
      out.push({
        key: `v-${v.id}`,
        service: `${v.name} vaccine`,
        details: open.length ? labels.join(", ") : total > 1 ? `${total}-dose series` : "1 dose",
        qty: Math.max(1, open.length),
        open: open.length > 0,
      });
    }
    for (const c of data.checks.filter((x) => x.active)) {
      const st = checkRow(c, data.events, today).status;
      out.push({
        key: `c-${c.id}`,
        service: c.name,
        details: c.why ?? "",
        qty: 1,
        open: st !== "done" && st !== "info",
      });
    }
    return out;
  }, [data, today]);

  const withEmail = data.providers;
  const [providerId, setProviderId] = useState<string>(withEmail.find((p) => p.email)?.id ?? withEmail[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(lines.filter((l) => l.open).map((l) => l.key)));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cur, setCur] = useState<Currency>(currency);
  const [dates, setDates] = useState("");
  const [notes, setNotes] = useState("");
  const [includePatient, setIncludePatient] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setEmail((e) => e || user.email || "");
      setName((n) => n || (prof as { name: string | null } | null)?.name || "");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const clinic = data.providers.find((p) => p.id === providerId) ?? null;
  const chosen = lines.filter((l) => picked.has(l.key));
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function makePdf(): Promise<{ blob: Blob; file: string }> {
    const blob = await buildQuotePdf({
      clinic: clinic ? { name: clinic.name, city: clinic.city, country: clinic.country } : null,
      from: { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null },
      patient: includePatient ? patient : null,
      items: chosen.map(({ service, details, qty }) => ({ service, details, qty })),
      currency: cur,
      preferredDates: dates,
      notes,
    });
    return { blob, file: quoteFileName(clinic?.name) };
  }

  function download(blob: Blob, file: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const subject = `Price quote request${name.trim() ? ` - ${name.trim()}` : ""}`;
  const body = [
    `Hello${clinic ? ` ${clinic.name}` : ""},`,
    "",
    `I'd like a price quote for the services in the attached PDF (${chosen.length} item${chosen.length === 1 ? "" : "s"}). Please reply with the price of each in ${cur}, whether you have them in stock, and your earliest availability.`,
    dates.trim() ? `\nPreferred dates: ${dates.trim()}` : "",
    "",
    "Thank you,",
    name.trim(),
    phone.trim(),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  async function run(fn: () => Promise<void>) {
    if (!chosen.length) return setMsg("Pick at least one service.");
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setMsg(e instanceof Error ? e.message : "Couldn't create the PDF.");
    } finally {
      setBusy(false);
    }
  }

  const onDownload = () =>
    run(async () => {
      const { blob, file } = await makePdf();
      download(blob, file);
      setMsg("PDF downloaded.");
    });

  const onEmail = () =>
    run(async () => {
      const { blob, file } = await makePdf();
      const pdf = new File([blob], file, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      // Phones: share sheet with the PDF attached (choose Mail or Gmail).
      if (nav.canShare?.({ files: [pdf] }) && /Mobi|iPhone|iPad|Android/i.test(navigator.userAgent)) {
        if (clinic?.email) await navigator.clipboard?.writeText(clinic.email).catch(() => {});
        await navigator.share({ files: [pdf], title: subject, text: body });
        setMsg(clinic?.email ? `Sent to your share sheet. The clinic's email (${clinic.email}) is copied; paste it in the To field.` : "Sent to your share sheet.");
        return;
      }
      // Computers: download, then open the email app addressed to the clinic.
      download(blob, file);
      const to = clinic?.email ? encodeURIComponent(clinic.email) : "";
      window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setMsg("PDF downloaded and your email app opened. Attach the PDF from your Downloads folder, then send.");
    });

  return (
    <Shell
      title="Request a price quote"
      subtitle="Email a clinic the services you need and get prices before you go."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
            Close
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-2 text-sm text-text-primary hover:bg-white/5 disabled:opacity-50"
          >
            <Download size={15} /> Download PDF
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEmail}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            <Mail size={15} /> {busy ? "Preparing…" : "Email to clinic"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={LABEL}>Clinic</label>
          <select className={INPUT} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">No clinic selected</option>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.city, p.country].filter(Boolean).join(", ")}
                {p.email ? "" : " (no email)"}
              </option>
            ))}
          </select>
          {clinic && !clinic.email && <p className="mt-1 text-[11px] text-[#f5d020]">Add this clinic&apos;s email (Clinics › tap the clinic) to address it automatically.</p>}
          {clinic?.email && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(clinic.email!).then(() => setMsg("Email copied."), () => {})}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#4f8cff] hover:underline"
            >
              <Copy size={12} /> {clinic.email}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Services ({chosen.length})</span>
          <span className="flex gap-3 text-[11px]">
            <button type="button" className="text-[#4f8cff] hover:underline" onClick={() => setPicked(new Set(lines.filter((l) => l.open).map((l) => l.key)))}>
              Still needed
            </button>
            <button type="button" className="text-[#4f8cff] hover:underline" onClick={() => setPicked(new Set(lines.map((l) => l.key)))}>
              All
            </button>
            <button type="button" className="text-text-muted hover:underline" onClick={() => setPicked(new Set())}>
              None
            </button>
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.08]">
          {lines.map((l) => (
            <label key={l.key} className="flex cursor-pointer items-start gap-2.5 border-b border-white/[0.05] px-3 py-2 last:border-b-0 hover:bg-white/[0.03]">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={picked.has(l.key)} onChange={() => toggle(l.key)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-text-primary">{l.service}</span>
                {l.details && <span className="block truncate text-[11px] text-text-muted">{l.details}</span>}
              </span>
              {l.qty > 1 && <span className="text-[11px] text-text-muted">×{l.qty}</span>}
              {!l.open && <span className="text-[11px] text-[#3ddc97]">done</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Your name</label>
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div>
          <label className={LABEL}>Reply-to email</label>
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label className={LABEL}>Phone / WhatsApp (optional)</label>
          <input className={INPUT} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className={LABEL}>Prices in</label>
          <select className={INPUT} value={cur} onChange={(e) => setCur(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Preferred dates (optional)</label>
          <input className={INPUT} value={dates} onChange={(e) => setDates(e.target.value)} maxLength={200} placeholder="e.g. Week of Nov 10, mornings" />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Notes (optional)</label>
          <textarea className={`${INPUT} min-h-[56px]`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="e.g. Please confirm the vaccine brand you stock." />
        </div>
        {patient && (patient.age || patient.sex) && (
          <label className="col-span-2 flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" className="h-4 w-4" checked={includePatient} onChange={(e) => setIncludePatient(e.target.checked)} />
            Include my age and sex (some prices depend on them)
          </label>
        )}
      </div>
      <p className="mt-3 text-[11px] text-text-muted">Only the services you tick are included. No results, conditions or other health data go in the PDF.</p>
      {msg && <p className="mt-2 text-sm text-text-primary">{msg}</p>}
    </Shell>
  );
}
