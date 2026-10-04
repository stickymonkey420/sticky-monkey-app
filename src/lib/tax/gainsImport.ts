// Realized gains CSV import (Taxes > Imported Gains). Two formats:
//  1. Robinhood "Account activity report" CSV (Activity Date, Process Date,
//     Settle Date, Instrument, Description, Trans Code, Quantity, Price,
//     Amount). Realized gains are COMPUTED here, FIFO per stock / option
//     contract. Approximation: assignment/exercise premiums are recognized
//     when assigned rather than folded into the stock's basis.
//  2. Any realized-gains / 1099-B style CSV (Fidelity, Schwab, IBKR exports,
//     1099 PDF->CSV converters): columns auto-detected by header name.
// Every row gets a deterministic dedupe_key so re-importing the same (or an
// overlapping) file never creates duplicates (unique index user_id+dedupe_key).

export type GainSource = "robinhood_activity" | "gains_csv";

export type ParsedGain = {
  symbol: string | null;
  description: string | null;
  is_option: boolean;
  quantity: number | null;
  date_acquired: string | null; // YYYY-MM-DD
  date_sold: string; // YYYY-MM-DD
  proceeds: number;
  cost_basis: number;
  wash_sale: number;
  gain: number;
  term: "short" | "long";
  dedupe_key: string;
};

export type ParseResult = {
  format: GainSource | null;
  gains: ParsedGain[];
  skipped: { reason: string; count: number }[];
  notes: string[];
};

// ---------- CSV + value helpers ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function parseMoney(v: string | undefined): number | null {
  if (v == null) return null;
  let t = v.trim();
  if (!t || t === "-" || t === "--") return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/[$,\s]/g, "");
  if (t.startsWith("-")) {
    neg = !neg;
    t = t.slice(1);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function daysBetween(a: string, b: string) {
  return (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000;
}
const termFor = (acq: string | null, sold: string): "short" | "long" => (acq && daysBetween(acq, sold) > 365 ? "long" : "short");
const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function keyed(prefix: string, parts: (string | number | null)[], seen: Map<string, number>) {
  const base = `${prefix}|${parts.map((p) => (p == null ? "" : String(p))).join("|")}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

// ---------- entry point ----------

export function parseGainsFile(text: string): ParseResult {
  const rows = parseCsv(text);
  // Header = first row that looks like one (some exports have preamble lines).
  const hIdx = rows.findIndex((r) => r.filter((c) => c.trim()).length >= 3 && r.some((c) => /date/i.test(c)));
  if (hIdx < 0) return { format: null, gains: [], skipped: [], notes: ["Couldn't find a header row with dates in this file."] };
  const header = rows[hIdx].map(norm);
  const body = rows.slice(hIdx + 1);
  if (header.includes("transcode") && header.includes("activitydate")) return parseRobinhood(header, body);
  return parseGenericGains(header, body);
}

// ---------- generic realized gains / 1099-B CSV ----------

const ALIASES: Record<string, string[]> = {
  description: ["description", "security", "securitydescription", "name", "instrument", "1adescriptionofproperty"],
  symbol: ["symbol", "ticker"],
  quantity: ["quantity", "qty", "shares", "quantitysold"],
  acquired: ["dateacquired", "acquired", "acquireddate", "opendate", "dateopened", "purchasedate", "1bdateacquired"],
  sold: ["datesold", "sold", "solddate", "closedate", "dateclosed", "saledate", "datesoldordisposed", "1cdatesoldordisposed", "closingdate"],
  proceeds: ["proceeds", "salesproceeds", "grossproceeds", "1dproceeds", "totalproceeds", "salesprice"],
  cost: ["costbasis", "cost", "costorotherbasis", "basis", "1ecostorotherbasis", "adjustedcostbasis", "totalcost"],
  wash: ["washsale", "washsalelossdisallowed", "1gwashsalelossdisallowed", "disallowedloss", "washsaleadjustment"],
  gain: ["gainloss", "gain", "realizedgainloss", "totalgainloss", "gainorloss", "netgainloss", "realizedpl", "profitloss"],
  term: ["term", "holdingperiod", "shortlong", "type", "termtype", "longtermshortterm"],
};

function col(header: string[], key: string) {
  return header.findIndex((h) => ALIASES[key].includes(h));
}

function parseGenericGains(header: string[], body: string[][]): ParseResult {
  const c = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(header, k)])) as Record<string, number>;
  if (c.sold < 0 || (c.proceeds < 0 && c.gain < 0)) {
    return {
      format: null,
      gains: [],
      skipped: [],
      notes: ["This doesn't look like a realized-gains file: it needs a Date Sold column and Proceeds or Gain/Loss."],
    };
  }
  const seen = new Map<string, number>();
  const gains: ParsedGain[] = [];
  let noDate = 0;
  for (const r of body) {
    const sold = parseDate(r[c.sold]);
    if (!sold) {
      noDate++;
      continue;
    }
    const acq = c.acquired >= 0 ? parseDate(r[c.acquired]) : null;
    const proceeds = parseMoney(r[c.proceeds]) ?? 0;
    const cost = parseMoney(r[c.cost]) ?? 0;
    const wash = Math.abs(parseMoney(r[c.wash]) ?? 0);
    const gainCol = c.gain >= 0 ? parseMoney(r[c.gain]) : null;
    const gain = gainCol ?? proceeds - cost + wash;
    const termRaw = c.term >= 0 ? (r[c.term] ?? "").toLowerCase() : "";
    const term: "short" | "long" = /long/.test(termRaw) ? "long" : /short/.test(termRaw) ? "short" : termFor(acq, sold);
    const desc = c.description >= 0 ? r[c.description]?.trim() || null : null;
    const sym = c.symbol >= 0 ? r[c.symbol]?.trim() || null : desc?.split(/\s+/)[0] ?? null;
    const qty = c.quantity >= 0 ? parseMoney(r[c.quantity]) : null;
    gains.push({
      symbol: sym,
      description: desc,
      is_option: /\b(call|put)\b/i.test(desc ?? ""),
      quantity: qty,
      date_acquired: acq,
      date_sold: sold,
      proceeds: r2(proceeds),
      cost_basis: r2(cost),
      wash_sale: r2(wash),
      gain: r2(gain),
      term,
      dedupe_key: keyed("csv", [(desc ?? sym ?? "").toUpperCase(), acq, sold, qty, r2(proceeds), r2(cost), r2(gain)], seen),
    });
  }
  return {
    format: "gains_csv",
    gains,
    skipped: noDate ? [{ reason: "rows without a sale date (totals, notes)", count: noDate }] : [],
    notes: [],
  };
}

// ---------- Robinhood account activity CSV (FIFO) ----------

type Lot = { date: string; qty: number; amount: number }; // amount = total cost (long) or total credit (short), positive

function parseRobinhood(header: string[], body: string[][]): ParseResult {
  const ix = (name: string) => header.indexOf(name);
  const iDate = ix("activitydate");
  const iInst = ix("instrument");
  const iDesc = ix("description");
  const iCode = ix("transcode");
  const iQty = ix("quantity");
  const iAmt = ix("amount");

  type Tx = { date: string; inst: string; desc: string; code: string; qty: number; amount: number; order: number };
  const txs: Tx[] = [];
  body.forEach((r, order) => {
    const date = parseDate(r[iDate]);
    const code = (r[iCode] ?? "").trim().toUpperCase();
    if (!date || !code) return;
    txs.push({
      date,
      inst: (r[iInst] ?? "").trim().toUpperCase(),
      desc: (r[iDesc] ?? "").split("\n")[0].trim(),
      code,
      qty: Math.abs(parseMoney((r[iQty] ?? "").replace(/[A-Za-z]+$/, "")) ?? 0),
      amount: parseMoney(r[iAmt]) ?? 0,
      order,
    });
  });
  // Robinhood lists newest first; process oldest first (stable within a day: later rows happened earlier).
  txs.sort((a, b) => (a.date === b.date ? b.order - a.order : a.date < b.date ? -1 : 1));

  const longLots = new Map<string, Lot[]>();
  const shortLots = new Map<string, Lot[]>();
  const seen = new Map<string, number>();
  const gains: ParsedGain[] = [];
  const skip: Record<string, number> = {};
  const bump = (k: string) => (skip[k] = (skip[k] ?? 0) + 1);

  const optKey = (t: Tx) => (t.desc || t.inst).replace(/\s+/g, " ").toUpperCase();
  const isOption = (t: Tx) => ["BTO", "STC", "STO", "BTC", "OEXP", "OASGN", "OEXCS"].includes(t.code);

  function take(map: Map<string, Lot[]>, key: string, qty: number) {
    const lots = map.get(key) ?? [];
    const used: Lot[] = [];
    let need = qty;
    while (need > 1e-9 && lots.length) {
      const lot = lots[0];
      const q = Math.min(need, lot.qty);
      const part = (lot.amount * q) / lot.qty;
      used.push({ date: lot.date, qty: q, amount: part });
      lot.qty -= q;
      lot.amount -= part;
      need -= q;
      if (lot.qty <= 1e-9) lots.shift();
    }
    map.set(key, lots);
    return { used, missing: need };
  }

  function emit(t: Tx, key: string, used: Lot[], proceedsTotal: number, shortSide: boolean, totalQty: number) {
    for (const u of used) {
      const share = totalQty ? u.qty / totalQty : 1;
      const proceeds = shortSide ? u.amount : proceedsTotal * share; // short: proceeds = credit received
      const cost = shortSide ? proceedsTotal * share : u.amount; // short: cost = what it cost to close
      const acq = u.date;
      gains.push({
        symbol: (t.inst || key.split(" ")[0]) || null,
        description: isOption(t) ? key : t.inst,
        is_option: isOption(t),
        quantity: r2(u.qty * 1e4) / 1e4,
        date_acquired: acq,
        date_sold: t.date,
        proceeds: r2(proceeds),
        cost_basis: r2(cost),
        wash_sale: 0,
        gain: r2(proceeds - cost),
        // Closing a short option is always short-term.
        term: shortSide ? "short" : termFor(acq, t.date),
        dedupe_key: keyed("rh", [key, acq, t.date, u.qty.toFixed(6), r2(proceeds), r2(cost)], seen),
      });
    }
  }

  for (const t of txs) {
    switch (t.code) {
      case "BUY": {
        const k = t.inst;
        if (!k || !t.qty) break;
        longLots.set(k, [...(longLots.get(k) ?? []), { date: t.date, qty: t.qty, amount: Math.abs(t.amount) }]);
        break;
      }
      case "SELL": {
        const k = t.inst;
        const { used, missing } = take(longLots, k, t.qty);
        if (missing > 1e-6) bump("sells with no matching buy in this file (start the report earlier)");
        emit(t, k, used, Math.abs(t.amount), false, t.qty);
        break;
      }
      case "BTO": {
        const k = optKey(t);
        longLots.set(k, [...(longLots.get(k) ?? []), { date: t.date, qty: t.qty, amount: Math.abs(t.amount) }]);
        break;
      }
      case "STC": {
        const k = optKey(t);
        const { used, missing } = take(longLots, k, t.qty);
        if (missing > 1e-6) bump("option closes with no matching open in this file");
        emit(t, k, used, Math.abs(t.amount), false, t.qty);
        break;
      }
      case "STO": {
        const k = optKey(t);
        shortLots.set(k, [...(shortLots.get(k) ?? []), { date: t.date, qty: t.qty, amount: Math.abs(t.amount) }]);
        break;
      }
      case "BTC": {
        const k = optKey(t);
        const { used, missing } = take(shortLots, k, t.qty);
        if (missing > 1e-6) bump("option closes with no matching open in this file");
        emit(t, k, used, Math.abs(t.amount), true, t.qty);
        break;
      }
      case "OEXP":
      case "OASGN": {
        const k = optKey(t);
        const qty = t.qty || 1;
        if ((shortLots.get(k) ?? []).length) {
          const { used } = take(shortLots, k, qty);
          emit(t, k, used, 0, true, qty); // expired/assigned short: keep the full credit
        } else if (t.code === "OEXP" && (longLots.get(k) ?? []).length) {
          const { used } = take(longLots, k, qty);
          emit(t, k, used, 0, false, qty); // expired long: lose the premium paid
        } else bump("expirations/assignments with no matching open in this file");
        break;
      }
      case "OEXCS":
        bump("exercised options (premium rolls into the stock's cost basis; not counted here)");
        break;
      default:
        break; // dividends, transfers, fees, etc. are not sales
    }
  }

  return {
    format: "robinhood_activity",
    gains,
    skipped: Object.entries(skip).map(([reason, count]) => ({ reason, count })),
    notes: [
      "Gains are calculated first-in-first-out from this report. Your Robinhood 1099-B is the official record.",
      "Assigned options are counted when assigned (simplified).",
    ],
  };
}
