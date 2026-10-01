"use client";

import type { BusinessInvoice, BusinessInvoiceLine } from "./invoiceTypes";
import { INVOICE_PAYMENT_METHOD_LABELS } from "./invoiceTypes";

// Client-side invoice PDF (jsPDF, MIT, no server / no cost). Letter size,
// vector text -- prints and zooms cleanly. jsPDF is loaded on demand so it
// never weighs down the page until someone clicks "PDF".

export type InvoicePdfParty = {
  name: string;
  lines?: (string | null | undefined)[];
  // PNG data URL; shown top-left of the invoice header.
  logo?: string | null;
};

// Natural pixel size of a data-URL image (browser only).
function imageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function downloadInvoicePdf(opts: {
  invoice: BusinessInvoice;
  lines: BusinessInvoiceLine[];
  from: InvoicePdfParty;
  billTo: InvoicePdfParty;
  projectName?: string | null;
}) {
  const { jsPDF } = await import("jspdf");
  const { invoice, lines, from, billTo, projectName } = opts;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  // Header: white background (printer-friendly; works with any logo,
  // transparent or not), then a solid black rule separating it from the body.
  const headerMid = 56;
  if (from.logo) {
    const size = (await imageSize(from.logo)) ?? { w: 3, h: 1 };
    const maxW = 170;
    const maxH = 60;
    const scale = Math.min(maxW / size.w, maxH / size.h);
    const lw = size.w * scale;
    const lh = size.h * scale;
    try {
      doc.addImage(from.logo, "PNG", M, headerMid - lh / 2, lw, lh, undefined, "FAST");
    } catch (err) {
      console.error("logo addImage failed", err);
    }
  }
  doc.setTextColor(20, 24, 33);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  // Title centered on the page, above the divider rule.
  doc.text("INVOICE", W / 2, headerMid + 9, { align: "center" });
  doc.setFontSize(11);
  doc.text(invoice.number, W - M, headerMid - 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 86, 104);
  doc.text(`Issued ${fmtDate(invoice.issue_date)}`, W - M, headerMid + 2, { align: "right" });
  doc.text(`Due ${fmtDate(invoice.due_date)}`, W - M, headerMid + 18, { align: "right" });
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(2);
  doc.line(M, 100, W - M, 100);
  doc.setLineWidth(1);
  y = 130;

  // From / Bill to
  doc.setTextColor(110, 116, 136);
  doc.setFontSize(9);
  doc.text("FROM", M, y);
  doc.text("BILL TO", W / 2 + 10, y);
  doc.setTextColor(20, 24, 33);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(from.name, M, y + 16);
  doc.text(billTo.name, W / 2 + 10, y + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const fromLines = (from.lines ?? []).filter(Boolean) as string[];
  const toLines = (billTo.lines ?? []).filter(Boolean) as string[];
  fromLines.forEach((l, i) => doc.text(l, M, y + 32 + i * 14));
  toLines.forEach((l, i) => doc.text(l, W / 2 + 10, y + 32 + i * 14));
  y += 40 + Math.max(fromLines.length, toLines.length) * 14;

  if (projectName) {
    doc.setTextColor(110, 116, 136);
    doc.setFontSize(9);
    doc.text("PROJECT", M, y);
    doc.setTextColor(20, 24, 33);
    doc.setFontSize(11);
    doc.text(projectName, M, y + 15);
    y += 34;
  }

  // Line items table
  const colQty = W - M - 200;
  const colRate = W - M - 110;
  const colAmt = W - M;
  doc.setFillColor(242, 244, 248);
  doc.rect(M, y, W - 2 * M, 24, "F");
  doc.setTextColor(80, 86, 104);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", M + 8, y + 16);
  doc.text("QTY", colQty, y + 16, { align: "right" });
  doc.text("RATE", colRate, y + 16, { align: "right" });
  doc.text("AMOUNT", colAmt - 8, y + 16, { align: "right" });
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(20, 24, 33);
  for (const l of lines) {
    const desc = doc.splitTextToSize(l.description, colQty - M - 60) as string[];
    const rowH = Math.max(22, desc.length * 13 + 9);
    if (y + rowH > H - 140) {
      doc.addPage();
      y = M;
    }
    doc.text(desc, M + 8, y + 15);
    const qty = Number(l.quantity);
    doc.text(Number.isInteger(qty) ? String(qty) : qty.toFixed(2), colQty, y + 15, { align: "right" });
    doc.text(money(Number(l.unit_price)), colRate, y + 15, { align: "right" });
    doc.text(money(Number(l.amount)), colAmt - 8, y + 15, { align: "right" });
    y += rowH;
    doc.setDrawColor(228, 231, 238);
    doc.line(M, y, W - M, y);
  }

  // Totals
  y += 18;
  doc.setFontSize(10);
  doc.setTextColor(80, 86, 104);
  doc.text("Subtotal", colRate, y, { align: "right" });
  doc.setTextColor(20, 24, 33);
  doc.text(money(Number(invoice.subtotal)), colAmt - 8, y, { align: "right" });
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Total due", colRate, y, { align: "right" });
  doc.text(money(invoice.status === "paid" ? 0 : Number(invoice.total)), colAmt - 8, y, { align: "right" });
  doc.setFont("helvetica", "normal");

  // PAID / VOID stamp
  if (invoice.status === "paid" || invoice.status === "void") {
    const paid = invoice.status === "paid";
    doc.setTextColor(paid ? 46 : 200, paid ? 170 : 60, paid ? 110 : 80);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.text(paid ? "PAID" : "VOID", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    if (paid) {
      const via = invoice.payment_method ? ` via ${INVOICE_PAYMENT_METHOD_LABELS[invoice.payment_method]}` : "";
      doc.text(`${money(Number(invoice.total))} received ${fmtDate(invoice.paid_date)}${via}`, M, y + 16);
    }
  }

  // Notes + footer
  if (invoice.notes) {
    y += 46;
    doc.setTextColor(110, 116, 136);
    doc.setFontSize(9);
    doc.text("NOTES", M, y);
    doc.setTextColor(20, 24, 33);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(invoice.notes, W - 2 * M) as string[], M, y + 14);
  }
  doc.setTextColor(150, 156, 172);
  doc.setFontSize(9);
  doc.text("Thank you for your business.", W / 2, H - 36, { align: "center" });

  doc.save(`${invoice.number}.pdf`);
}
