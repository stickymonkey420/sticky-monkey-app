"use client";

import type { Currency } from "./model";

// "Request for price quote" PDF a member emails to a clinic, so they can get
// prices without visiting. It's a FILLABLE form: the clinic types the brand
// and price on each line, a total, availability, how long the quote is valid
// and notes (any PDF reader: Preview, Acrobat, Chrome, phone Files/Markup),
// saves and replies. Built in the browser with jsPDF (MIT, $0, loaded on
// demand). Currency is written as its code (PHP, THB…): the PDF's built-in
// fonts have no ₱/฿/₫ glyphs.

export type QuoteItem = { service: string; details: string; qty: number };
export type QuoteRequest = {
  clinic: { name: string; city?: string | null; country?: string | null } | null;
  from: { name: string; email: string | null; phone: string | null };
  patient: { age: number | null; sex: string | null } | null;
  items: QuoteItem[];
  currency: Currency;
  preferredDates: string;
  notes: string;
};

// jsPDF's standard fonts are Latin-1: drop anything else so text never turns to garbage.
const latin1 = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export function quoteFileName(clinicName: string | null | undefined): string {
  const slug = (clinicName || "clinic").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clinic";
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `Quote-request-${slug}-${iso}.pdf`;
}

// The plain-text message to paste into the email (mail apps handle a pasted
// message reliably; pre-filled mailto bodies break in some, e.g. Proton Mail).
export function quoteMessage(q: { clinicName?: string | null; name: string; phone: string; count: number; currency: Currency; dates: string }): string {
  return [
    `Hello${q.clinicName ? ` ${q.clinicName}` : ""},`,
    "",
    `I'd like a price quote for the ${q.count} service${q.count === 1 ? "" : "s"} in the attached PDF. The PDF is fillable: please type the brand and price (${q.currency}) for each item, your earliest availability, and how long the quote is valid, then save it and reply with it attached. A reply in the email body works too.`,
    ...(q.dates.trim() ? ["", `Preferred dates: ${q.dates.trim()}`] : []),
    "",
    "Thank you,",
    q.name.trim(),
    ...(q.phone.trim() ? [q.phone.trim()] : []),
  ].join("\n");
}

export async function buildQuotePdf(q: QuoteRequest): Promise<Blob> {
  const mod = await import("jspdf");
  const { jsPDF, AcroFormTextField } = mod;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const dark: [number, number, number] = [20, 24, 33];
  const muted: [number, number, number] = [100, 106, 124];
  const t = (s: string) => latin1(s);

  // A fillable text box with a light outline so the clinic sees where to type.
  const field = (name: string, x: number, top: number, w: number, h: number, opts: { multiline?: boolean; align?: "left" | "right"; size?: number } = {}) => {
    doc.setDrawColor(170, 176, 192);
    doc.setFillColor(250, 251, 253);
    doc.rect(x, top, w, h, "FD");
    const f = new AcroFormTextField();
    f.fieldName = name;
    f.x = x;
    f.y = top;
    f.width = w;
    f.height = h;
    f.fontSize = opts.size ?? 9;
    f.textAlign = opts.align ?? "left";
    f.multiline = !!opts.multiline;
    f.value = "";
    doc.addField(f);
  };

  // Header
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Request for price quote", M, 68);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), W - M, 68, { align: "right" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.5);
  doc.line(M, 82, W - M, 82);
  doc.setLineWidth(0.6);

  // To / From
  let y = 108;
  doc.setFontSize(9);
  doc.text("TO", M, y);
  doc.text("FROM", W / 2 + 10, y);
  doc.setTextColor(...dark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(t(q.clinic?.name || "Clinic / hospital"), M, y + 16, { maxWidth: W / 2 - M - 10 });
  doc.text(t(q.from.name || "Patient"), W / 2 + 10, y + 16, { maxWidth: W / 2 - M - 10 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const toLines = [[q.clinic?.city, q.clinic?.country].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const fromLines = [
    q.from.email,
    q.from.phone,
    q.patient && (q.patient.age || q.patient.sex)
      ? ["Patient", q.patient.age ? `age ${q.patient.age}` : null, q.patient.sex].filter(Boolean).join(", ")
      : null,
  ].filter(Boolean) as string[];
  toLines.forEach((l, i) => doc.text(t(l), M, y + 32 + i * 14));
  fromLines.forEach((l, i) => doc.text(t(l), W / 2 + 10, y + 32 + i * 14));
  y += 44 + Math.max(toLines.length, fromLines.length) * 14;

  // Intro
  doc.setTextColor(...dark);
  const intro = doc.splitTextToSize(
    t(
      `Hello, I would like a price quote for the services below. This form is fillable: please type the brand you would use ` +
        `and the price per item in ${q.currency}, plus your availability, then save the PDF and reply with it attached. Thank you.`,
    ),
    W - 2 * M,
  ) as string[];
  doc.text(intro, M, y);
  y += intro.length * 14 + 12;

  // Table: # | Service | Qty | Brand | Price (each)
  const cNum = M + 6;
  const cSvc = M + 24;
  const cQtyR = M + 250;
  const cBrand = M + 262;
  const wBrand = 120;
  const cPrice = cBrand + wBrand + 10;
  const wPrice = W - M - cPrice - 4;
  const svcW = cQtyR - cSvc - 30;
  const newPageIfNeeded = (h: number) => {
    if (y + h > H - 90) {
      doc.addPage();
      y = M;
    }
  };
  const header = () => {
    doc.setFillColor(242, 244, 248);
    doc.rect(M, y, W - 2 * M, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("#", cNum, y + 15);
    doc.text("SERVICE", cSvc, y + 15);
    doc.text("QTY", cQtyR, y + 15, { align: "right" });
    doc.text("BRAND / PRODUCT", cBrand, y + 15);
    doc.text(`PRICE EACH (${q.currency})`, cPrice, y + 15);
    y += 24;
  };
  header();
  q.items.forEach((it, i) => {
    doc.setFontSize(10);
    const name = doc.splitTextToSize(t(it.service), svcW) as string[];
    doc.setFontSize(8.5);
    const det = it.details ? (doc.splitTextToSize(t(it.details), svcW) as string[]) : [];
    const h = Math.max(34, 12 + name.length * 12 + det.length * 10 + 6);
    if (y + h > H - 90) {
      doc.addPage();
      y = M;
      header();
    }
    doc.setTextColor(...dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(String(i + 1), cNum, y + 16);
    doc.setFont("helvetica", "bold");
    doc.text(name, cSvc, y + 16);
    doc.setFont("helvetica", "normal");
    if (det.length) {
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text(det, cSvc, y + 16 + name.length * 12);
    }
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(String(it.qty), cQtyR, y + 16, { align: "right" });
    field(`brand_${i + 1}`, cBrand, y + 6, wBrand, 20);
    field(`price_${i + 1}`, cPrice, y + 6, wPrice, 20, { align: "right" });
    doc.setDrawColor(225, 228, 235);
    doc.line(M, y + h, W - M, y + h);
    y += h;
  });

  // Total + quote details
  newPageIfNeeded(150);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text(`Total (${q.currency})`, cPrice - 10, y + 15, { align: "right" });
  field("total", cPrice, y + 2, wPrice, 22, { align: "right", size: 10 });
  y += 38;

  const labelAt = (label: string, x: number, top: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(label, x, top);
  };
  const half = (W - 2 * M - 16) / 2;
  labelAt("EARLIEST AVAILABILITY", M, y);
  labelAt("QUOTE VALID UNTIL", M + half + 16, y);
  field("availability", M, y + 6, half, 22);
  field("valid_until", M + half + 16, y + 6, half, 22);
  y += 44;
  labelAt("CLINIC NOTES (stock, requirements, other costs)", M, y);
  field("clinic_notes", M, y + 6, W - 2 * M, 54, { multiline: true });
  y += 76;

  // Member's dates + notes
  const block = (label: string, body: string) => {
    if (!body.trim()) return;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(t(body.trim()), W - 2 * M) as string[];
    newPageIfNeeded(20 + lines.length * 13);
    labelAt(label, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(lines, M, y + 15);
    y += 24 + lines.length * 13;
  };
  block("PREFERRED DATES", q.preferredDates);
  block("PATIENT NOTES", q.notes);

  // Footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const reply = q.from.email ? `Please fill in, save and reply to ${q.from.email}.` : "Please fill in, save and reply to the sender.";
    doc.text(t(reply), M, H - 46);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 46, { align: "right" });
    doc.setFontSize(8);
    doc.text("Prepared with Sticky Monkey Lifestyle. This is a price inquiry, not a prescription or medical record.", M, H - 32);
  }
  return doc.output("blob");
}
