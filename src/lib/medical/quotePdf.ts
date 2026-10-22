"use client";

import type { Currency } from "./model";

// "Request for price quote" PDF a member emails to a clinic, so they can get
// prices without visiting. Built in the browser with jsPDF (MIT, $0, loaded on
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

export async function buildQuotePdf(q: QuoteRequest): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const dark: [number, number, number] = [20, 24, 33];
  const muted: [number, number, number] = [100, 106, 124];
  const t = (s: string) => latin1(s);

  // Header
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Request for price quote", M, 70);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), W - M, 70, { align: "right" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.5);
  doc.line(M, 84, W - M, 84);
  doc.setLineWidth(0.6);

  // To / From
  let y = 112;
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
      `Hello, I would like a price quote for the services below. Please reply with the price of each item in ${q.currency} ` +
        `(or your local currency), whether you have it in stock, and your earliest availability. Thank you.`,
    ),
    W - 2 * M,
  ) as string[];
  doc.text(intro, M, y);
  y += intro.length * 14 + 14;

  // Table
  const colQty = W - M - 150;
  const colPrice = W - M;
  const row = (cells: () => void, h: number, fill?: [number, number, number]) => {
    if (y + h > H - 110) {
      doc.addPage();
      y = M;
    }
    if (fill) {
      doc.setFillColor(...fill);
      doc.rect(M, y, W - 2 * M, h, "F");
    }
    cells();
    doc.setDrawColor(220, 223, 230);
    doc.line(M, y + h, W - M, y + h);
    y += h;
  };
  row(
    () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...muted);
      doc.text("#", M + 8, y + 16);
      doc.text("SERVICE", M + 30, y + 16);
      doc.text("QTY", colQty, y + 16, { align: "right" });
      doc.text(`YOUR PRICE (${q.currency})`, colPrice - 8, y + 16, { align: "right" });
    },
    24,
    [242, 244, 248],
  );
  doc.setFont("helvetica", "normal");
  q.items.forEach((it, i) => {
    const name = doc.splitTextToSize(t(it.service), colQty - M - 70) as string[];
    const det = it.details ? (doc.splitTextToSize(t(it.details), colQty - M - 70) as string[]) : [];
    const h = Math.max(30, 10 + name.length * 13 + det.length * 12 + 6);
    row(() => {
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      doc.text(String(i + 1), M + 8, y + 17);
      doc.setFont("helvetica", "bold");
      doc.text(name, M + 30, y + 17);
      doc.setFont("helvetica", "normal");
      if (det.length) {
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(det, M + 30, y + 17 + name.length * 13);
      }
      doc.setFontSize(10);
      doc.setTextColor(...dark);
      doc.text(String(it.qty), colQty, y + 17, { align: "right" });
      doc.setDrawColor(160, 166, 180);
      doc.line(colPrice - 110, y + 20, colPrice - 8, y + 20); // blank line for the clinic's price
    }, h);
  });
  row(() => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text("Total", colQty, y + 18, { align: "right" });
    doc.setDrawColor(160, 166, 180);
    doc.line(colPrice - 110, y + 21, colPrice - 8, y + 21);
  }, 30);
  y += 18;

  // Dates + notes
  const block = (label: string, body: string) => {
    if (!body.trim()) return;
    const lines = doc.splitTextToSize(t(body.trim()), W - 2 * M) as string[];
    if (y + 20 + lines.length * 13 > H - 90) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(label, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(lines, M, y + 15);
    y += 24 + lines.length * 13;
  };
  block("PREFERRED DATES", q.preferredDates);
  block("NOTES", q.notes);

  // Footer
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const reply = q.from.email ? `Please reply to ${q.from.email}.` : "Please reply to the sender of this email.";
    doc.text(t(reply), M, H - 48);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 48, { align: "right" });
    doc.setFontSize(8);
    doc.text("Prepared with Sticky Monkey Lifestyle. This is a price inquiry, not a prescription or medical record.", M, H - 34);
  }
  return doc.output("blob");
}
