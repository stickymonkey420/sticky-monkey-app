"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Abu -- the in-app AI assistant / chat widget, ported byte-for-byte from
// the live Webflow site's Site Settings > Custom Code > Footer script
// (same CSS, SVG monkey figure, and DOM/animation logic -- extracted via
// Webflow's Data API and re-run through the ORIGINAL minified source to
// regenerate the exact CSS/HTML/SVG strings below, rather than hand-typed,
// so there is zero transcription risk on something this visual).
//
// What changed vs. the Webflow original (everything else is identical):
// - Session/token access goes through this app's real Supabase client
//   (`createClient()` + `supabase.auth.getSession()`) instead of Webflow's
//   custom `window.__smf*` localStorage-session bridge, which doesn't
//   exist here. Also now re-mounts/unmounts on `onAuthStateChange` so Abu
//   appears immediately after a client-side sign-in (no full page reload
//   in this app, unlike Webflow) and disappears on sign-out.
// - The Supabase Functions URL/anon key come from
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same env
//   vars every other client call in this app already uses) instead of
//   window.__smfSupabaseUrl/AnonKey.
// - ABU_CARDS (the per-page "which on-screen card does this answer touch"
//   map) is re-pointed at this app's actual current element ids, since the
//   React rewrite's dashboard/wallet/invest pages have different markup
//   than the original Webflow pages:
//     - "/my-wallet" -> "/wallet" (the route's new slug).
//     - "current-balance" and "income-expense" dropped -- the rebuilt
//       Dashboard combines what used to be a separate "current balance"
//       card into the Net Worth card, and has no single income-vs-expense
//       mini-stat distinct from the Income/Expense cards below.
//     - "net-worth" -> #nw-card (Dashboard's Net Worth card).
//     - "expense-categories" -> #expense-categories-card.
//     - "income-breakdown" -> #income-breakdown-card (the Options Income
//       card -- the closest current equivalent).
//     - "wallet-balance" -> #wallet-balance-card (Wallet Overview card).
//     - "brokerage-holdings" -> #eq-brokerage-card (Invest page's
//       Brokerage donut card).
//     - "invoices-list" dropped -- this app has no invoices feature.
//   Every key not listed above (or not present in the page's map at all)
//   silently no-ops when the backend suggests it, exactly like the
//   original's own `if(!pageMap[key])continue;` guard -- this is not new
//   behavior, just relying on it for the handful of concepts (e.g. a
//   separate "current balance" card) that don't have a distinct
//   equivalent in this rewrite.
// - The abu-chat Edge Function's CARD_REGISTRY and CORS allowlist were
//   updated to match (see Supabase dashboard; not part of this repo).
// - The launcher's face is now the two "clean" open/closed-eyes stills the
//   user made in Webflow (ABU_EYES_OPEN_URL/ABU_EYES_CLOSED_URL, hotlinked
//   from Webflow's own asset CDN -- no re-hosting cost), swapped on a timer
//   to blink, instead of the original's vector SVG face with animated
//   eyelid rects. The panel's full-body vector figure is untouched.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const MUTE_STORAGE_KEY = "abu_voice_muted";

type CardLocator = () => HTMLElement | null;

// Kept in sync with the abu-chat Edge Function's CARD_REGISTRY -- every key
// here must have a matching entry there, or the highlight silently no-ops.
// Page-body cards only -- left-sidebar MENU ITEMS are handled separately,
// below, since they're the same on every page and their ids are derived
// automatically (see AppShell.tsx's navLinkId) rather than hand-mapped one
// by one here.
const ABU_CARDS: Record<string, Record<string, CardLocator>> = {
  "/dashboard": {
    "net-worth": () => document.getElementById("nw-card"),
    "expense-categories": () => document.getElementById("expense-categories-card"),
    "income-breakdown": () => document.getElementById("income-breakdown-card"),
  },
  "/wallet": {
    "wallet-balance": () => document.getElementById("wallet-balance-card"),
  },
  "/invest": {
    "brokerage-holdings": () => document.getElementById("eq-brokerage-card"),
  },
};

// Cards that live in the persistent right-side profile pane (mounted once in
// the app layout, so visible -- and highlightable -- on every page, unlike
// ABU_CARDS above which is keyed per-page). Kept in sync with the abu-chat
// Edge Function's GLOBAL_REGISTRY the same way ABU_CARDS is kept in sync
// with CARD_REGISTRY.
const GLOBAL_CARDS: Record<string, CardLocator> = {
  "quick-access": () => document.getElementById("quick-access-section"),
};

// Verbatim from the Webflow footer script's injected <style> block.
const ABU_CSS = `.abu-figure{width:100%;height:100%;display:block;overflow:visible;}.abu-eyelid{transform:scaleY(0);}.abu-mouth-open{opacity:0;}.abu-mouth-closed{opacity:1;}.abu-laser-dot{opacity:0;filter:drop-shadow(0 0 4px #ff3b3b);transition:opacity .2s ease;}.abu-thinking-dots ellipse{opacity:0;}.abu-arm-r-rest{opacity:1;transition:opacity .25s ease;}.abu-arm-r-point{opacity:0;transition:opacity .25s ease;}#abu-launcher .abu-eyelid,#abu-stage .abu-eyelid{animation:abuBlink 4.6s infinite;}#abu-launcher .abu-body-group,#abu-stage .abu-body-group{animation:abuBreathe 3.2s ease-in-out infinite;}@keyframes abuBlink{0%,90%,100%{transform:scaleY(0);}94%{transform:scaleY(1);}}@keyframes abuBreathe{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.5px);}}#abu-stage.state-talking .abu-mouth-open{animation:abuTalk .24s steps(1) infinite;}#abu-stage.state-talking .abu-mouth-closed{animation:abuTalkInv .24s steps(1) infinite;}@keyframes abuTalk{0%,100%{opacity:0;}50%{opacity:1;}}@keyframes abuTalkInv{0%,100%{opacity:1;}50%{opacity:0;}}#abu-stage.state-thinking .abu-head-group{animation:abuThink 1.6s ease-in-out infinite;}@keyframes abuThink{0%,100%{transform:rotate(0deg);}50%{transform:rotate(3deg);}}#abu-stage.state-thinking .abu-thinking-dots ellipse{animation:abuDots 1.4s infinite;}#abu-stage.state-thinking .abu-thinking-dots ellipse:nth-child(2){animation-delay:.2s;}#abu-stage.state-thinking .abu-thinking-dots ellipse:nth-child(3){animation-delay:.4s;}#abu-stage.state-pointing .abu-arm-r-point{opacity:1;}#abu-stage.state-pointing .abu-arm-r-rest{opacity:0;}#abu-stage.state-pointing .abu-laser-dot{opacity:1;animation:abuLaser .9s ease-in-out infinite;}@keyframes abuLaser{0%,100%{opacity:.6;}50%{opacity:1;}}#abu-stage.state-entering .abu-figure{animation:abuEnter .6s cubic-bezier(.34,1.56,.64,1) both;}@keyframes abuEnter{0%{transform:translateY(70px) scale(.7);opacity:0;}60%{transform:translateY(-8px) scale(1.05);opacity:1;}100%{transform:translateY(0) scale(1);}}#abu-stage-wrap{width:100%;height:132px;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(ellipse at center 85%, rgba(245,208,32,0.08), transparent 70%);border-bottom:1px solid rgba(255,255,255,0.08);}#abu-stage{width:150px;height:150px;margin-bottom:-14px;}#abu-launcher .abu-figure{transform:scale(1.9) translateY(6px);}.abu-icon-btn{cursor:pointer;color:#8a90a8;font-size:15px;line-height:1;padding:4px 6px;border-radius:6px;user-select:none;}.abu-icon-btn:hover{background:rgba(255,255,255,0.08);color:#eef0f7;}.abu-icon-btn.active{color:#f5d020;}@keyframes abuMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,59,59,0.5);}50%{box-shadow:0 0 0 6px rgba(255,59,59,0);}}#abu-mic.listening{background:#ff3b3b !important;color:#fff !important;animation:abuMicPulse 1s infinite;}@keyframes abuCardPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,208,32,.65),0 0 0 0 rgba(245,208,32,.35);}50%{box-shadow:0 0 0 6px rgba(245,208,32,.45),0 0 26px 10px rgba(245,208,32,.25);}}.abu-card-glow{animation:abuCardPulse 1.3s ease-in-out 2;border-radius:12px;position:relative;z-index:5;}#abu-launcher.abu-dragging{cursor:grabbing !important;}#abu-stage-wrap{height:192px;}#abu-stage{width:128px;height:188px;margin-bottom:0;}.abu-bust{position:relative;transform-origin:50% 90%;}#abu-stage-img{width:100%;height:100%;object-fit:contain;display:block;user-select:none;pointer-events:none;}.abu-bust .abu-thinking-dots{position:absolute;top:-2px;right:-30px;width:40px;height:34px;overflow:visible;}#abu-stage.state-talking .abu-bust{animation:abuTalkBob .36s ease-in-out infinite;}@keyframes abuTalkBob{0%,100%{transform:translateY(0) scale(1);}50%{transform:translateY(-2px) scale(1.015);}}#abu-stage.state-thinking .abu-bust{animation:abuThink 1.6s ease-in-out infinite;}@keyframes abuDots{0%,100%{opacity:.15;}50%{opacity:1;}}#abu-stage.state-pointing .abu-bust{filter:drop-shadow(0 0 10px rgba(245,208,32,.55));}`;

// The two "clean" illustrated Abu-face stills the user had made in Webflow
// (open-eyed / closed-eyed), hosted permanently on Webflow's own asset CDN
// (site_id 665f5b07319971d77a6e12a1). Swapped on a timer below to blink the
// launcher button -- this replaces the old vector eyelid-blink SVG that used
// to sit here (the panel's full-body vector figure in ABU_PANEL_HTML is
// unchanged and still blinks via its own SVG eyelids).
const ABU_EYES_OPEN_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a97f76bdc2bb83ea21e174f_abu-eyes-open-clean.png";
const ABU_EYES_CLOSED_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a97f76b30947ecce636c900_abu-eyes-closed-clean.png";

// Verbatim from the Webflow footer script's panel innerHTML (header, the
// avatar stage, the messages list, and the input form). 2026-09-25: the
// stage shows the head-and-shoulders Abu artwork (ABU_BUST_*: tweed coat,
// blue shirt, glasses, yellow flower) instead of the old hand-drawn
// full-body SVG. State cues: talking = gentle bob, thinking = head tilt +
// thought dots, pointing = gold glow (the on-screen card highlight itself is
// unchanged), entering = pop-in; it blinks in sync with the launcher.
// Chat-panel stage artwork: head-and-shoulders Abu (tweed coat, blue shirt,
// glasses, yellow flower), background removed, plus a closed-eyes frame for
// blinking. Served from this app's own /public folder.
const ABU_BUST_OPEN_URL = "/images/abu/abu-bust-open.png?v=2";
const ABU_BUST_CLOSED_URL = "/images/abu/abu-bust-closed.png?v=2";

const ABU_PANEL_HTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);"><div style="flex:1;font-size:14px;font-weight:700;color:#eef0f7;">Abu</div><div id="abu-mute" class="abu-icon-btn" title="Toggle Abu's voice">🔊</div><div id="abu-close" class="abu-icon-btn" style="font-size:18px;">&times;</div></div><div id="abu-stage-wrap"><div id="abu-stage"><div class="abu-figure abu-bust"><img id="abu-stage-img" src="${ABU_BUST_OPEN_URL}" alt="Abu" draggable="false" /><svg class="abu-thinking-dots" viewBox="0 0 60 50"><ellipse cx="14" cy="40" rx="5" ry="5" fill="#eef0f7"/><ellipse cx="32" cy="26" rx="4.2" ry="4.2" fill="#eef0f7"/><ellipse cx="48" cy="12" rx="3.4" ry="3.4" fill="#eef0f7"/></svg></div></div></div><div id="abu-messages" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;"></div><form id="abu-form" style="display:flex;gap:6px;padding:12px;border-top:1px solid rgba(255,255,255,0.08);"><input id="abu-input" type="text" placeholder="Ask Abu..." autocomplete="off" style="flex:1;min-width:0;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:#0d0f17;color:#eef0f7;font-size:13.5px;" /><div id="abu-mic" class="abu-icon-btn" title="Ask by voice" style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:9px 10px;display:none;">🎤</div><button type="submit" style="padding:9px 14px;border-radius:8px;border:none;background:#4f8cff;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Send</button></form>`;

type SpeechRecognitionResultLike = { results: { [i: number]: { [j: number]: { transcript: string } } } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type WindowWithSpeech = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

type ChatHistoryEntry = { role: "user" | "assistant"; content: string };
type AbuChatResponse = { answer?: string; highlights?: string[]; audio?: string | null };

// Resolves one highlight key to a DOM element. Page-body card keys (e.g.
// "net-worth") only make sense on their own page, so those go through
// ABU_CARDS' per-page map first; anything else -- in practice, every
// left-sidebar menu item, whose key IS its DOM id (see AppShell.tsx's
// navLinkId, "nav-<slug>") -- falls back to a plain getElementById. A key
// for a menu item hidden from this member (paid-gated, or a different
// account type) simply isn't in the DOM, so this returns null and that key
// silently no-ops, same as an unknown key always has.
function locateHighlight(key: string): HTMLElement | null {
  const pageMap = ABU_CARDS[window.location.pathname];
  const locate = pageMap?.[key] || GLOBAL_CARDS[key];
  if (locate) return locate();
  return document.getElementById(key);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

// If `movable` (the open chat panel, in practice) is currently covering
// `target` (the card/nav item Abu just highlighted), slide it out of the way
// -- toward whichever side has more room, falling back to an up/down shift
// -- for `durationMs`, then slide it back to exactly where it was. This is
// what makes "ask about something Abu is sitting on top of" actually reveal
// the thing being talked about, instead of just glowing behind the panel.
function autoShiftIfOverlapping(movable: HTMLElement, target: HTMLElement, durationMs: number): void {
  if (!movable || getComputedStyle(movable).display === "none") return;
  const moRect = movable.getBoundingClientRect();
  if (moRect.width === 0 || moRect.height === 0) return;
  const targetRect = target.getBoundingClientRect();
  if (!rectsOverlap(moRect, targetRect)) return;

  const prevLeft = movable.style.left;
  const prevTop = movable.style.top;
  const prevRight = movable.style.right;
  const prevBottom = movable.style.bottom;
  const prevTransition = movable.style.transition;

  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxLeft = Math.max(margin, vw - moRect.width - margin);
  const maxTop = Math.max(margin, vh - moRect.height - margin);

  let newLeft = moRect.left;
  const movableCenterX = moRect.left + moRect.width / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  if (movableCenterX >= targetCenterX) {
    newLeft = clamp(Math.max(moRect.left, targetRect.right + margin), margin, maxLeft);
  } else {
    newLeft = clamp(Math.min(moRect.left, targetRect.left - margin - moRect.width), margin, maxLeft);
  }

  let newTop = moRect.top;
  const stillOverlapsHorizontally = !(newLeft + moRect.width <= targetRect.left || newLeft >= targetRect.right);
  if (stillOverlapsHorizontally) {
    newLeft = moRect.left;
    const movableCenterY = moRect.top + moRect.height / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    if (movableCenterY >= targetCenterY) {
      newTop = clamp(Math.max(moRect.top, targetRect.bottom + margin), margin, maxTop);
    } else {
      newTop = clamp(Math.min(moRect.top, targetRect.top - margin - moRect.height), margin, maxTop);
    }
  }

  movable.style.transition = "left .35s ease, top .35s ease";
  movable.style.right = "auto";
  movable.style.bottom = "auto";
  movable.style.left = `${newLeft}px`;
  movable.style.top = `${newTop}px`;

  window.setTimeout(() => {
    movable.style.left = prevLeft;
    movable.style.top = prevTop;
    movable.style.right = prevRight;
    movable.style.bottom = prevBottom;
    window.setTimeout(() => {
      movable.style.transition = prevTransition;
    }, 400);
  }, durationMs);
}

function highlightCards(keys: string[] | string | undefined, panelEl: HTMLElement | null, panelIsOpen: boolean): void {
  try {
    const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
    let scrolled = false;
    for (const key of list) {
      const el = locateHighlight(key);
      if (!el) continue;
      if (!scrolled) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        scrolled = true;
        // Give the smooth scroll a beat to settle before measuring/shifting
        // the panel -- checking overlap immediately would use pre-scroll
        // coordinates.
        if (panelIsOpen && panelEl) {
          const target = el;
          window.setTimeout(() => autoShiftIfOverlapping(panelEl, target, 2400), 380);
        }
      }
      el.classList.add("abu-card-glow");
      setTimeout(() => el.classList.remove("abu-card-glow"), 2700);
    }
  } catch {
    // Highlighting is a nice-to-have; never let it break the chat.
  }
}

function cleanForSpeech(text: string): string {
  return String(text || "")
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_`#~^]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const english = voices.filter((v) => /^en/i.test(v.lang));
  const pool = english.length ? english : voices;
  const qualityPatterns = [/natural/i, /neural/i, /premium|enhanced/i, /google/i];
  const malePattern = /(daniel|arthur|george|ryan|oliver|thomas|male|guy|david)/i;
  for (const pat of qualityPatterns) for (const v of pool) if (pat.test(v.name) && malePattern.test(v.name)) return v;
  for (const pat of qualityPatterns) for (const v of pool) if (pat.test(v.name)) return v;
  for (const v of pool) if (/^en[-_]gb/i.test(v.lang) && malePattern.test(v.name)) return v;
  for (const v of pool) if (/^en[-_]gb/i.test(v.lang)) return v;
  for (const v of pool) if (/\bmale\b/i.test(v.name)) return v;
  return pool[0] || voices[0] || null;
}

const LAUNCHER_POS_KEY = "abu_launcher_pos";

// Per-user (keyed by id, so a shared browser doesn't mark the tour "seen"
// for the wrong account) flag for the one-time proactive welcome greeting
// -- see maybeAutoOpenWelcomeTour() in mountAbu.
const WELCOME_TOUR_KEY_PREFIX = "abu_welcome_tour_shown_";

function hasSeenWelcomeTour(userId: string): boolean {
  try {
    return window.localStorage.getItem(WELCOME_TOUR_KEY_PREFIX + userId) === "1";
  } catch {
    return true; // storage unavailable -- err toward not interrupting the user
  }
}

function markWelcomeTourSeen(userId: string): void {
  try {
    window.localStorage.setItem(WELCOME_TOUR_KEY_PREFIX + userId, "1");
  } catch {
    // ignore -- best effort; worst case the greeting can show again next visit
  }
}

type SavedPos = { left: number; top: number };

function loadSavedPos(key: string): SavedPos | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPos>;
    if (typeof parsed.left === "number" && typeof parsed.top === "number") return parsed as SavedPos;
  } catch {
    // ignore -- fall back to the default docked position
  }
  return null;
}

function saveSavedPos(key: string, el: HTMLElement): void {
  try {
    const rect = el.getBoundingClientRect();
    window.localStorage.setItem(key, JSON.stringify({ left: rect.left, top: rect.top }));
  } catch {
    // ignore -- not worth surfacing a storage failure over a remembered position
  }
}

// Applies a previously-saved drag position to `el`, clamped to the current
// viewport so a saved spot from a wider window (or a since-resized one)
// never leaves the widget stranded off-screen. `fallbackW`/`fallbackH` cover
// the panel's case: it starts as `display:none`, so its measured rect is
// 0x0 until it's first opened.
function applySavedPos(el: HTMLElement, key: string, fallbackW: number, fallbackH: number): void {
  const pos = loadSavedPos(key);
  if (!pos) return;
  const rect = el.getBoundingClientRect();
  const w = rect.width || fallbackW;
  const h = rect.height || fallbackH;
  const maxLeft = Math.max(4, window.innerWidth - w - 4);
  const maxTop = Math.max(4, window.innerHeight - h - 4);
  el.style.right = "auto";
  el.style.bottom = "auto";
  el.style.left = `${clamp(pos.left, 4, maxLeft)}px`;
  el.style.top = `${clamp(pos.top, 4, maxTop)}px`;
}

// Makes `el` draggable by pressing and dragging on `handle` (`el` itself, in
// practice -- the launcher bubble). Uses the Pointer Events API so mouse,
// touch, and pen all work through one code path -- this is the "single
// click hold and drag" the user asked for. A small movement threshold keeps
// a plain click/dblclick on the handle working normally when the pointer
// doesn't actually move. `onDrag` fires on every qualifying move (so a
// caller -- the panel, attached to the launcher -- can follow along live);
// `onDragEnd` fires once, only after an actual drag (not a plain click).
// Returns a mutable state object whose `justDragged` flag callers can check
// to suppress the trailing click/dblclick a real drag gesture leaves behind.
function makeDraggable(
  el: HTMLElement,
  handle: HTMLElement,
  opts: { onDrag?: () => void; onDragEnd?: () => void } = {}
): { justDragged: boolean } {
  const THRESHOLD = 6;
  const state = { dragging: false, moved: false, justDragged: false };
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.style.touchAction = "none";

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    state.dragging = true;
    state.moved = false;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // ignore -- dragging still works without capture, just less robust
    }
  });

  handle.addEventListener("pointermove", (e: PointerEvent) => {
    if (!state.dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!state.moved && Math.hypot(dx, dy) < THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      el.style.transition = "none";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.classList.add("abu-dragging");
    }
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
    el.style.left = `${clamp(startLeft + dx, 4, maxLeft)}px`;
    el.style.top = `${clamp(startTop + dy, 4, maxTop)}px`;
    opts.onDrag?.();
  });

  function endDrag(e: PointerEvent) {
    if (!state.dragging) return;
    state.dragging = false;
    el.style.transition = "";
    el.classList.remove("abu-dragging");
    if (state.moved) {
      state.justDragged = true;
      window.setTimeout(() => {
        state.justDragged = false;
      }, 400);
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      opts.onDragEnd?.();
    }
    state.moved = false;
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("lostpointercapture", endDrag);

  return state;
}

// Anchors the (fixed-position) panel directly to the launcher's live
// coordinates, so it follows the icon to wherever it's been dragged --
// not just a binary "left half of the screen vs right half" choice
// between two fixed dock corners (which is what this used to do). The
// point of following the icon exactly, rather than snapping to a corner,
// is that Abu can be dragged next to whatever it's highlighting and the
// panel opens right beside it instead of potentially covering that same
// spot from clear across the screen.
//
// Horizontally: opens toward whichever side of the launcher has more
// room (so it opens away from the nearer screen edge, same spirit as the
// old left-half/right-half rule, just computed from the launcher's exact
// position instead of just which half it's in). Vertically: prefers
// opening above the launcher (matching the default docked look, where
// the panel sits right above the bottom-right launcher), flipping to
// open below if there isn't room above. Both axes clamp to the viewport
// so the panel can never end up partly off-screen. Called once when the
// panel opens, and continuously while the launcher is being dragged (if
// the panel happens to be open at the time).
function positionPanelNearLauncher(launcher: HTMLElement, panel: HTMLElement): void {
  const lRect = launcher.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 12; // space kept between the launcher and the panel's near edge
  const margin = 4; // minimum distance from any viewport edge

  // The panel starts as display:none, so before its first-ever open its
  // measured rect is 0x0 -- fall back to its declared CSS size for that
  // one frame (see the panel's own style.cssText below: 320x480).
  const pRect = panel.getBoundingClientRect();
  const panelW = pRect.width || 320;
  const panelH = pRect.height || 480;

  const launcherCenterX = lRect.left + lRect.width / 2;
  const launcherCenterY = lRect.top + lRect.height / 2;

  const onLeftHalf = launcherCenterX < vw / 2;
  const rawLeft = onLeftHalf ? lRect.left : lRect.right - panelW;
  const left = clamp(rawLeft, margin, Math.max(margin, vw - panelW - margin));

  const onTopHalf = launcherCenterY < vh / 2;
  let top: number;
  if (onTopHalf) {
    top = lRect.bottom + gap;
    if (top + panelH > vh - margin) top = lRect.top - gap - panelH; // no room below -- flip up
  } else {
    top = lRect.top - gap - panelH;
    if (top < margin) top = lRect.bottom + gap; // no room above -- flip down
  }
  top = clamp(top, margin, Math.max(margin, vh - panelH - margin));

  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

// Builds the whole widget (launcher + panel), wires every handler, and
// returns a cleanup function. Mirrors the Webflow script's single IIFE
// almost line for line -- this stays a plain DOM/closure module (not
// React state) on purpose, since the original also lived entirely outside
// any framework's render tree.
function mountAbu(getAccessToken: () => Promise<string | null>): () => void {
  if (document.getElementById("abu-launcher")) return () => {};

  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-abu-style", "1");
  styleEl.textContent = ABU_CSS;
  document.head.appendChild(styleEl);

  const launcher = document.createElement("div");
  launcher.id = "abu-launcher";
  launcher.title = "Double-click to summon Abu";
  launcher.style.cssText =
    "position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;background:#161925;border:2px solid #f5d020;box-shadow:0 4px 16px rgba(0,0,0,0.4);cursor:pointer;z-index:99998;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:transform .15s ease;";
  launcher.innerHTML = `<img id="abu-launcher-img" src="${ABU_EYES_OPEN_URL}" alt="Abu" draggable="false" style="width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;" />`;
  // Preload the closed-eyes frame so the first blink swap is instant.
  new Image().src = ABU_EYES_CLOSED_URL;
  new Image().src = ABU_BUST_CLOSED_URL;

  const panel = document.createElement("div");
  panel.id = "abu-panel";
  panel.style.cssText =
    "position:fixed;right:24px;bottom:96px;width:320px;max-width:calc(100vw - 48px);height:480px;max-height:calc(100vh - 140px);background:#161925;border:1px solid rgba(255,255,255,0.12);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:99999;display:none;flex-direction:column;overflow:hidden;";
  panel.innerHTML = ABU_PANEL_HTML;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  // Declared up here (rather than alongside the rest of mountAbu's other
  // `let`s below) so the drag wiring just below -- which needs to check
  // whether the panel is currently open -- can close over it without a
  // used-before-declared error.
  let panelOpen = false;

  // Restore wherever the user last dragged the launcher to (if anywhere) --
  // otherwise it stays at its default docked corner.
  applySavedPos(launcher, LAUNCHER_POS_KEY, 60, 60);

  // Let the user pick up the launcher bubble and drop it anywhere on the
  // page (click/tap, hold, and drag). The panel isn't independently
  // draggable -- per the user's preferred behavior, it just stays attached
  // to wherever the launcher is: it re-anchors on every drag frame (if
  // open) and again once the drag ends, and re-anchors fresh each time it's
  // opened. Launcher position persists across visits via localStorage.
  const launcherDrag = makeDraggable(launcher, launcher, {
    onDrag: () => {
      if (panelOpen) positionPanelNearLauncher(launcher, panel);
    },
    onDragEnd: () => {
      saveSavedPos(LAUNCHER_POS_KEY, launcher);
      if (panelOpen) positionPanelNearLauncher(launcher, panel);
    },
  });

  // Blink loop for the launcher's photo icon: same 4.6s cadence as the old
  // vector eyelid animation, briefly swapping to the closed-eyes frame.
  const launcherImg = launcher.querySelector<HTMLImageElement>("#abu-launcher-img")!;
  const BLINK_CYCLE_MS = 4600;
  const BLINK_DURATION_MS = 180;
  // The chat panel's stage uses the same two frames (see ABU_PANEL_HTML), so
  // it blinks on the same timer as the launcher.
  const stageImg = panel.querySelector<HTMLImageElement>("#abu-stage-img");
  const blinkInterval = window.setInterval(() => {
    launcherImg.src = ABU_EYES_CLOSED_URL;
    if (stageImg) stageImg.src = ABU_BUST_CLOSED_URL;
    window.setTimeout(() => {
      launcherImg.src = ABU_EYES_OPEN_URL;
      if (stageImg) stageImg.src = ABU_BUST_OPEN_URL;
    }, BLINK_DURATION_MS);
  }, BLINK_CYCLE_MS);

  const messagesEl = panel.querySelector<HTMLDivElement>("#abu-messages")!;
  const formEl = panel.querySelector<HTMLFormElement>("#abu-form")!;
  const inputEl = panel.querySelector<HTMLInputElement>("#abu-input")!;
  const closeEl = panel.querySelector<HTMLDivElement>("#abu-close")!;
  const muteEl = panel.querySelector<HTMLDivElement>("#abu-mute")!;
  const micEl = panel.querySelector<HTMLDivElement>("#abu-mic")!;
  const stageEl = panel.querySelector<HTMLDivElement>("#abu-stage")!;

  const history: ChatHistoryEntry[] = [];
  let waiting = false;
  let muted = false;
  let currentAudio: HTMLAudioElement | null = null;

  try {
    muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
  muteEl.textContent = muted ? "\ud83d\udd07" : "\ud83d\udd0a";

  let ttsVoice: SpeechSynthesisVoice | null = null;
  if (window.speechSynthesis) {
    ttsVoice = pickBrowserVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      ttsVoice = pickBrowserVoice();
    };
  }

  const speechWindow = window as WindowWithSpeech;
  const SpeechRecognitionCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  let recognizer: SpeechRecognitionLike | null = null;
  let listening = false;
  if (SpeechRecognitionCtor) {
    micEl.style.display = "flex";
    micEl.style.alignItems = "center";
    recognizer = new SpeechRecognitionCtor();
    recognizer.lang = "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      inputEl.value = transcript;
      sendMessage(transcript);
    };
    recognizer.onerror = () => {
      listening = false;
      micEl.classList.remove("listening");
    };
    recognizer.onend = () => {
      listening = false;
      micEl.classList.remove("listening");
    };
    micEl.addEventListener("click", () => {
      if (listening) {
        recognizer!.stop();
      } else {
        try {
          listening = true;
          micEl.classList.add("listening");
          recognizer!.start();
        } catch {
          listening = false;
          micEl.classList.remove("listening");
        }
      }
    });
  }

  function setStage(className: string) {
    stageEl.className = className || "";
  }

  function addMessage(role: "user" | "assistant", text: string): HTMLDivElement {
    const isUser = role === "user";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;" + (isUser ? "justify-content:flex-end;" : "justify-content:flex-start;");
    const bubble = document.createElement("div");
    bubble.style.cssText =
      "max-width:80%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.4;white-space:pre-wrap;" +
      (isUser ? "background:#4f8cff;color:#fff;" : "background:#0d0f17;color:#eef0f7;border:1px solid rgba(255,255,255,0.08);");
    bubble.textContent = text;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function speakBrowser(text: string) {
    if (!window.speechSynthesis) {
      setStage("state-pointing");
      setTimeout(() => {
        if (!waiting) setStage("");
      }, 900);
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    const utter = new SpeechSynthesisUtterance(cleanForSpeech(text));
    if (ttsVoice) utter.voice = ttsVoice;
    utter.rate = 1.02;
    utter.pitch = 0.95;
    utter.onstart = () => {
      setStage("state-talking state-pointing");
      setTimeout(() => {
        stageEl.className = stageEl.className.replace("state-pointing", "").trim();
      }, 1100);
    };
    utter.onend = () => setStage("");
    utter.onerror = () => setStage("");
    window.speechSynthesis.speak(utter);
  }

  function speak(text: string, base64?: string | null) {
    if (muted) {
      setStage("state-pointing");
      setTimeout(() => {
        if (!waiting) setStage("");
      }, 900);
      return;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // ignore
      }
      currentAudio = null;
    }
    if (base64) {
      try {
        const audio = new Audio("data:audio/mp3;base64," + base64);
        currentAudio = audio;
        audio.onplay = () => {
          setStage("state-talking state-pointing");
          setTimeout(() => {
            stageEl.className = stageEl.className.replace("state-pointing", "").trim();
          }, 1100);
        };
        audio.onended = () => {
          currentAudio = null;
          setStage("");
        };
        audio.onerror = () => {
          currentAudio = null;
          speakBrowser(text);
        };
        audio.play().catch(() => {
          currentAudio = null;
          speakBrowser(text);
        });
        return;
      } catch {
        // fall through to browser TTS
      }
    }
    speakBrowser(text);
  }

  function closePanel() {
    panelOpen = false;
    panel.style.display = "none";
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // ignore
      }
      currentAudio = null;
    }
    setStage("");
  }

  async function sendMessage(rawText: string) {
    const text = (rawText || "").trim();
    if (!text || waiting) return;
    inputEl.value = "";
    addMessage("user", text);
    history.push({ role: "user", content: text });
    waiting = true;
    setStage("state-thinking");
    const placeholder = addMessage("assistant", "...");

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("no_token");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/abu-chat`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: text, history: history.slice(0, -1), page: window.location.pathname }),
      });
      const data: AbuChatResponse = await res.json();
      placeholder.remove();
      const answer = data.answer || "Sorry, I didn\'t catch that -- try again?";
      addMessage("assistant", answer);
      history.push({ role: "assistant", content: answer });
      waiting = false;
      highlightCards(data.highlights, panel, panelOpen);
      speak(answer, data.audio);
    } catch {
      placeholder.remove();
      addMessage("assistant", "I couldn\'t reach the backend just now -- please try again in a moment.");
      waiting = false;
      setStage("");
    }
  }

  muteEl.addEventListener("click", () => {
    muted = !muted;
    muteEl.textContent = muted ? "\ud83d\udd07" : "\ud83d\udd0a";
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // ignore
    }
    if (muted) {
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      if (currentAudio) {
        try {
          currentAudio.pause();
        } catch {
          // ignore
        }
        currentAudio = null;
      }
      setStage("");
    }
  });

  // Shared open logic -- used by the manual double-click-to-open handler
  // below, and by the one-time proactive welcome greeting further down.
  // `greeting` overrides the default first message (only relevant the very
  // first time the panel opens, since messagesEl is otherwise non-empty);
  // `focusInput` is false for the proactive open so it doesn't yank focus
  // (or pop a mobile keyboard) on a page the user hasn't interacted with.
  function openPanel(greeting?: string, focusInput = true) {
    if (panelOpen) return;
    panelOpen = true;
    positionPanelNearLauncher(launcher, panel);
    panel.style.display = "flex";
    setStage("state-entering");
    setTimeout(() => {
      if (stageEl.className.indexOf("state-entering") !== -1) setStage("");
    }, 650);
    if (!messagesEl.children.length) {
      addMessage("assistant", greeting || "Hi, I\'m Abu. What can I help you with?");
    }
    if (focusInput) inputEl.focus();
  }

  launcher.addEventListener("dblclick", () => {
    if (launcherDrag.justDragged) return;
    launcher.style.transform = "scale(0.9)";
    setTimeout(() => {
      launcher.style.transform = "";
    }, 150);
    if (panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  closeEl.addEventListener("click", closePanel);
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(inputEl.value);
  });

  // Proactively greet a brand-new user instead of waiting for them to find
  // and click the launcher -- built for a fresh signup landing on an
  // all-$0 Dashboard with nothing else there to guide them. Fires at most
  // once ever per user (see WELCOME_TOUR_KEY_PREFIX) and only when there's
  // genuinely nothing set up yet: no manual accounts, no wheel trades, and
  // no Game-a-Fi challenge (pending or accepted) either. Any query error is
  // treated as "assume they're not new" rather than risk a false popup for
  // an existing user. Gated to /dashboard since that's where a new signup
  // actually lands -- checked only once the async lookups resolve, which is
  // an acceptable trade-off over wiring a route-change listener for this.
  (async function maybeAutoOpenWelcomeTour() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || hasSeenWelcomeTour(user.id)) return;

      const [accountsRes, tradesRes, challengesRes] = await Promise.all([
        supabase.from("manual_accounts").select("id").eq("user_id", user.id).limit(1),
        supabase.from("wheel_trades").select("id").eq("user_id", user.id).limit(1),
        supabase.rpc("game_afi_list_challenges"),
      ]);
      if (accountsRes.error || tradesRes.error || challengesRes.error) return;

      const hasAccounts = (accountsRes.data || []).length > 0;
      const hasTrades = (tradesRes.data || []).length > 0;
      const hasChallenges = (challengesRes.data || []).length > 0;
      if (hasAccounts || hasTrades || hasChallenges) return;
      if (window.location.pathname !== "/dashboard") return;
      if (panelOpen) return;

      markWelcomeTourSeen(user.id);
      openPanel("Welcome! I\'m Abu -- want a 30-second tour? Just ask me anything to get started.", false);
    } catch {
      // best-effort only -- a failed check just means no proactive greeting this time
    }
  })();

  return function cleanup() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // ignore
      }
      currentAudio = null;
    }
    window.clearInterval(blinkInterval);
    launcher.remove();
    panel.remove();
    styleEl.remove();
  };
}

export default function AbuChatWidget() {
  useEffect(() => {
    const supabase = createClient();
    let cleanup: (() => void) | null = null;

    async function getAccessToken(): Promise<string | null> {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    }

    async function syncMount() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const signedIn = Boolean(session?.access_token && session.user);
      if (signedIn && !cleanup) {
        cleanup = mountAbu(getAccessToken);
      } else if (!signedIn && cleanup) {
        cleanup();
        cleanup = null;
      }
    }

    syncMount();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      syncMount();
    });

    return () => {
      subscription.unsubscribe();
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    };
  }, []);

  return null;
}
