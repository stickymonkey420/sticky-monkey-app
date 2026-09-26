"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "US Markets" -- the top-bar ticker strip: major indexes, the 10-year
// yield, VIX, gold, bitcoin and crude with last price, change vs previous
// close and an intraday sparkline. Data comes from the market-strip Edge
// Function (Yahoo Finance, cached server-side for 60s, $0). Polls once a
// minute, only while the tab is visible, and keeps the last good values on
// a failed poll so the strip never flashes empty.
//
// Placement: rendered inside AppShell's <main>, absolutely positioned on the
// same line as the page's <h1> title -- starting just right of the title and
// ending before any buttons that share the title row -- so it never pushes
// the page content down. Re-measured on resize and whenever the page changes
// (route change, buttons appearing); hidden if there's under 260px of room.

type Quote = {
  key: string;
  label: string;
  symbol: string;
  decimals: number;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  spark: number[];
};

const POLL_MS = 60_000;
const UP = "#3ddc97";
const DOWN = "#ff5c7a";

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Sparkline({ points, prevClose, up }: { points: number[]; prevClose: number; up: boolean }) {
  const W = 64;
  const H = 26;
  if (points.length < 2) return <svg width={W} height={H} aria-hidden="true" />;
  const min = Math.min(prevClose, ...points);
  const max = Math.max(prevClose, ...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const color = up ? UP : DOWN;
  const id = `ms-${up ? "u" : "d"}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={y(prevClose)} y2={y(prevClose)} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" strokeWidth="1" />
      <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketStrip() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  // When the tickers don't all fit, the row scrolls slowly on a loop
  // (pauses on hover) so every symbol comes into view -- no hidden items.
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const main = host?.parentElement;
    if (!host || !main) return;
    const STRIP_H = 62;
    const ROW_H = 44;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const h1 = main.querySelector("h1");
      if (!h1) {
        setPlace((p) => (p ? null : p));
        return;
      }
      const mr = main.getBoundingClientRect();
      // Width of the title TEXT, not the h1 box (a block h1 spans the row).
      const range = document.createRange();
      range.selectNodeContents(h1);
      const tr = range.getBoundingClientRect();
      const row = h1.parentElement && h1.parentElement !== main ? h1.parentElement : h1;
      const rr = row.getBoundingClientRect();
      let right = Math.min(rr.right, mr.right - 16);
      if (row !== h1) {
        for (const sib of Array.from(row.children)) {
          if (sib === h1 || sib.contains(host)) continue;
          const r = sib.getBoundingClientRect();
          if (r.width > 0 && r.left > tr.right) right = Math.min(right, r.left - 24);
        }
      }
      const left = tr.right + 40;
      const width = Math.floor(right - left);
      const next =
        width >= 260
          ? {
              // Line the ticker row (not the small label above it) up with
              // the title; the label sits in the space above.
              top: Math.round(tr.top - mr.top + tr.height / 2 - (STRIP_H - ROW_H / 2)),
              left: Math.round(left - mr.left),
              width,
            }
          : null;
      setPlace((p) =>
        p === next || (p && next && p.top === next.top && p.left === next.left && p.width === next.width) ? p : next,
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(main);
    const mo = new MutationObserver((records) => {
      // Ignore the strip's own ticking text.
      if (records.every((r) => host.contains(r.target))) return;
      schedule();
    });
    mo.observe(main, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    const tr = trackRef.current;
    if (!vp || !tr) return;
    const measure = () => {
      // The track holds two copies while scrolling; compare one copy's width.
      const single = overflowing ? tr.scrollWidth / 2 : tr.scrollWidth;
      setOverflowing(single > vp.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    ro.observe(tr);
    return () => ro.disconnect();
  }, [quotes.length, overflowing]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function poll() {
      try {
        const { data, error } = await supabase.functions.invoke<{ quotes: (Quote | null)[]; asOf: string | null }>(
          "market-strip",
          { method: "POST" },
        );
        if (cancelled || error || !data) return;
        const good = (data.quotes || []).filter((q): q is Quote => !!q);
        if (good.length) {
          setQuotes(good);
          setAsOf(data.asOf);
        }
      } catch {
        // keep last good values
      }
    }

    function schedule() {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        if (document.visibilityState === "visible") poll();
      }, POLL_MS);
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };

    poll();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const asOfLabel = asOf
    ? new Date(asOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute z-10 hidden md:block"
      style={
        place && quotes.length
          ? { top: place.top, left: place.left, width: place.width }
          : { visibility: "hidden", top: 0, left: 0, width: 0 }
      }
    >
    {quotes.length > 0 && (
    <div className="pointer-events-auto relative flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2 pl-3" title={asOfLabel ? `Updated ${asOfLabel}` : undefined}>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f5d020]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f5d020] opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f5d020]" />
          </span>
          US Markets
        </span>
        {asOfLabel && <span className="text-[10px] text-text-muted">as of {asOfLabel}</span>}
      </div>

      <div
        ref={viewportRef}
        className="group w-full min-w-0 overflow-hidden motion-reduce:overflow-x-auto"
        style={{
          maskImage: "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
        }}
      >
        <div
          ref={trackRef}
          className={`flex w-max ${overflowing ? "animate-[sm-marquee_var(--sm-dur)_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none" : ""}`}
          style={{ ["--sm-dur" as string]: `${Math.max(30, quotes.length * 6)}s` }}
        >
          {(overflowing ? [0, 1] : [0]).map((copy) => (
            <div key={copy} className="flex shrink-0 gap-5 pl-3 pr-5" aria-hidden={copy === 1 ? true : undefined}>
              {quotes.map((q) => {
                const up = q.change >= 0;
                const color = up ? UP : DOWN;
                const sign = up ? "+" : "";
                return (
                  <div key={q.key} className="flex shrink-0 items-center gap-2.5 py-1" title={q.symbol}>
                    <div className="leading-tight">
                      <div className="text-[11px] font-semibold text-[#f5d020]">{q.label}</div>
                      <div className="text-[13px] font-semibold tabular-nums text-text-primary">
                        {fmt(q.price, q.decimals)}
                        {q.key === "tnx" ? "%" : ""}
                      </div>
                      <div className="text-[11px] font-medium tabular-nums" style={{ color }}>
                        {sign}
                        {fmt(q.change, q.decimals)} {sign}
                        {q.changePct.toFixed(2)}%
                      </div>
                    </div>
                    <Sparkline points={q.spark} prevClose={q.prevClose} up={up} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
    )}
    </div>
  );
}
