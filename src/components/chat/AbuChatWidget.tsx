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
const ABU_CSS = `.abu-figure{width:100%;height:100%;display:block;overflow:visible;}.abu-eyelid{transform:scaleY(0);}.abu-mouth-open{opacity:0;}.abu-mouth-closed{opacity:1;}.abu-laser-dot{opacity:0;filter:drop-shadow(0 0 4px #ff3b3b);transition:opacity .2s ease;}.abu-thinking-dots ellipse{opacity:0;}.abu-arm-r-rest{opacity:1;transition:opacity .25s ease;}.abu-arm-r-point{opacity:0;transition:opacity .25s ease;}#abu-launcher .abu-eyelid,#abu-stage .abu-eyelid{animation:abuBlink 4.6s infinite;}#abu-launcher .abu-body-group,#abu-stage .abu-body-group{animation:abuBreathe 3.2s ease-in-out infinite;}@keyframes abuBlink{0%,90%,100%{transform:scaleY(0);}94%{transform:scaleY(1);}}@keyframes abuBreathe{0%,100%{transform:translateY(0);}50%{transform:translateY(-1.5px);}}#abu-stage.state-talking .abu-mouth-open{animation:abuTalk .24s steps(1) infinite;}#abu-stage.state-talking .abu-mouth-closed{animation:abuTalkInv .24s steps(1) infinite;}@keyframes abuTalk{0%,100%{opacity:0;}50%{opacity:1;}}@keyframes abuTalkInv{0%,100%{opacity:1;}50%{opacity:0;}}#abu-stage.state-thinking .abu-head-group{animation:abuThink 1.6s ease-in-out infinite;}@keyframes abuThink{0%,100%{transform:rotate(0deg);}50%{transform:rotate(3deg);}}#abu-stage.state-thinking .abu-thinking-dots ellipse{animation:abuDots 1.4s infinite;}#abu-stage.state-thinking .abu-thinking-dots ellipse:nth-child(2){animation-delay:.2s;}#abu-stage.state-thinking .abu-thinking-dots ellipse:nth-child(3){animation-delay:.4s;}#abu-stage.state-pointing .abu-arm-r-point{opacity:1;}#abu-stage.state-pointing .abu-arm-r-rest{opacity:0;}#abu-stage.state-pointing .abu-laser-dot{opacity:1;animation:abuLaser .9s ease-in-out infinite;}@keyframes abuLaser{0%,100%{opacity:.6;}50%{opacity:1;}}#abu-stage.state-entering .abu-figure{animation:abuEnter .6s cubic-bezier(.34,1.56,.64,1) both;}@keyframes abuEnter{0%{transform:translateY(70px) scale(.7);opacity:0;}60%{transform:translateY(-8px) scale(1.05);opacity:1;}100%{transform:translateY(0) scale(1);}}#abu-stage-wrap{width:100%;height:132px;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;background:radial-gradient(ellipse at center 85%, rgba(245,208,32,0.08), transparent 70%);border-bottom:1px solid rgba(255,255,255,0.08);}#abu-stage{width:150px;height:150px;margin-bottom:-14px;}#abu-launcher .abu-figure{transform:scale(1.9) translateY(6px);}.abu-icon-btn{cursor:pointer;color:#8a90a8;font-size:15px;line-height:1;padding:4px 6px;border-radius:6px;user-select:none;}.abu-icon-btn:hover{background:rgba(255,255,255,0.08);color:#eef0f7;}.abu-icon-btn.active{color:#f5d020;}@keyframes abuMicPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,59,59,0.5);}50%{box-shadow:0 0 0 6px rgba(255,59,59,0);}}#abu-mic.listening{background:#ff3b3b !important;color:#fff !important;animation:abuMicPulse 1s infinite;}@keyframes abuCardPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,208,32,.65),0 0 0 0 rgba(245,208,32,.35);}50%{box-shadow:0 0 0 6px rgba(245,208,32,.45),0 0 26px 10px rgba(245,208,32,.25);}}.abu-card-glow{animation:abuCardPulse 1.3s ease-in-out 2;border-radius:12px;position:relative;z-index:5;}#abu-launcher.abu-dragging{cursor:grabbing !important;}`;

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
// full-body avatar stage, the messages list, and the input form) --
// already includes the same monkey SVG at the full-body viewBox.
const ABU_PANEL_HTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.08);"><div style="flex:1;font-size:14px;font-weight:700;color:#eef0f7;">Abu</div><div id="abu-mute" class="abu-icon-btn" title="Toggle Abu's voice">🔊</div><div id="abu-close" class="abu-icon-btn" style="font-size:18px;">&times;</div></div><div id="abu-stage-wrap"><div id="abu-stage"><svg class="abu-figure " viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg"><g class="abu-head-group" transform-origin="100 70"><path d="M56,72 C60,40 80,30 100,32 C120,30 140,40 144,72 C132,58 120,50 100,48 C80,50 68,58 56,72 Z" fill="#4a4038"/><ellipse class="abu-fur" cx="54" cy="100" rx="11" ry="16" fill="#5b4a3f"/><ellipse cx="54" cy="100" rx="6" ry="10" fill="#caa27a"/><ellipse class="abu-fur" cx="146" cy="100" rx="11" ry="16" fill="#5b4a3f"/><ellipse cx="146" cy="100" rx="6" ry="10" fill="#caa27a"/><g transform="translate(50,76)"><ellipse cx="0" cy="-9" rx="6" ry="8" fill="#f7c948"/><ellipse cx="0" cy="9" rx="6" ry="8" fill="#f7c948"/><ellipse cx="-9" cy="0" rx="8" ry="6" fill="#f7c948"/><ellipse cx="9" cy="0" rx="8" ry="6" fill="#f7c948"/><circle cx="0" cy="0" r="5" fill="#e8963c"/></g><ellipse class="abu-fur" cx="100" cy="92" rx="50" ry="56" fill="#5b4a3f"/><ellipse cx="100" cy="100" rx="36" ry="42" fill="#caa27a"/><path d="M67,80 Q78,74 92,79" stroke="#3a2e22" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M108,79 Q122,74 133,80" stroke="#3a2e22" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="64" y="84" width="34" height="28" rx="14" ry="13" fill="rgba(255,255,255,0.06)" stroke="#3a2e22" stroke-width="3.5"/><rect x="102" y="84" width="34" height="28" rx="14" ry="13" fill="rgba(255,255,255,0.06)" stroke="#3a2e22" stroke-width="3.5"/><line x1="98" y1="97" x2="102" y2="97" stroke="#3a2e22" stroke-width="3.5"/><line x1="64" y1="92" x2="54" y2="90" stroke="#3a2e22" stroke-width="3"/><line x1="136" y1="92" x2="146" y2="90" stroke="#3a2e22" stroke-width="3"/><ellipse cx="81" cy="99" rx="8" ry="8" fill="#fff"/><circle class="abu-pupil" cx="81" cy="100" r="3.4" fill="#2a1f18"/><ellipse cx="119" cy="99" rx="8" ry="8" fill="#fff"/><circle class="abu-pupil" cx="119" cy="100" r="3.4" fill="#2a1f18"/><rect class="abu-eyelid" x="72" y="90" width="18" height="17" rx="8" transform-origin="81 90" fill="#caa27a"/><rect class="abu-eyelid" x="110" y="90" width="18" height="17" rx="8" transform-origin="119 90" fill="#caa27a"/><ellipse cx="100" cy="118" rx="6" ry="4" fill="#3a2e22"/><path class="abu-mouth-closed" d="M82,128 Q100,138 118,128" stroke="#3a2e22" stroke-width="3.5" fill="none" stroke-linecap="round"/><g class="abu-mouth-open"><ellipse cx="100" cy="130" rx="13" ry="9" fill="#3a2e22"/><rect x="90" y="123" width="20" height="5" rx="2" fill="#f5f1e6"/></g></g><g class="abu-body-group"><path d="M50,155 C35,165 30,196 34,226 L48,226 C50,196 55,171 60,159 Z" fill="#b9a583"/><circle cx="37" cy="229" r="9" fill="#caa27a"/><path d="M50,150 C40,150 40,152 42,240 L158,240 C160,152 160,150 150,150 Z" fill="#b9a583"/><path d="M50,150 L88,150 L78,186 L55,165 Z" fill="#a08e6c"/><path d="M150,150 L112,150 L122,186 L145,165 Z" fill="#a08e6c"/><path d="M92,150 L108,150 L100,172 Z" fill="#f5f1e6"/><path d="M97,156 L103,156 L107,182 L100,226 L93,182 Z" fill="#6b4a2f"/><path d="M88,150 L112,150 L102,224 L98,224 Z" fill="#8d7a5c" opacity="0.55"/><circle cx="63" cy="169" r="5.5" fill="#1f2a4d"/><circle cx="63" cy="169" r="2.2" fill="#f5d020"/><g class="abu-arm-r-rest"><path d="M150,155 C165,165 170,196 166,226 L152,226 C150,196 145,171 140,159 Z" fill="#b9a583"/><circle cx="163" cy="229" r="9" fill="#caa27a"/></g><g class="abu-arm-r-point"><path d="M150,156 C168,150 178,130 176,108 L162,104 C162,122 156,138 145,150 Z" fill="#b9a583"/><circle cx="174" cy="102" r="9" fill="#caa27a"/><rect x="175.5" y="66" width="5" height="34" rx="2.5" fill="#8a8f9c" transform="rotate(18 178 83)"/><circle class="abu-laser-dot" cx="184" cy="61" r="3" fill="#ff3b3b"/></g></g><g class="abu-thinking-dots"><ellipse cx="132" cy="34" rx="4" ry="4" fill="#eef0f7"/><ellipse cx="148" cy="24" rx="3.4" ry="3.4" fill="#eef0f7"/><ellipse cx="162" cy="12" rx="2.8" ry="2.8" fill="#eef0f7"/></g></svg></div></div><div id="abu-messages" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;"></div><form id="abu-form" style="display:flex;gap:6px;padding:12px;border-top:1px solid rgba(255,255,255,0.08);"><input id="abu-input" type="text" placeholder="Ask Abu..." autocomplete="off" style="flex:1;min-width:0;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:#0d0f17;color:#eef0f7;font-size:13.5px;" /><div id="abu-mic" class="abu-icon-btn" title="Ask by voice" style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:9px 10px;display:none;">🎤</div><button type="submit" style="padding:9px 14px;border-radius:8px;border:none;background:#4f8cff;color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Send</button></form>`;

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

// Positions the (fixed-position) panel snug against the launcher's current
// spot -- above it when there's room, below it otherwise, and hugging
// whichever side of the screen the launcher is nearer to -- so the panel
// visually stays "attached" to the launcher no matter where it's been
// dragged. Called once when the panel opens, and continuously while the
// launcher is being dragged (if the panel happens to be open at the time),
// per the user's preferred "it just goes where the icon goes" behavior.
function positionPanelNearLauncher(launcher: HTMLElement, panel: HTMLElement): void {
  const lRect = launcher.getBoundingClientRect();
  const pRect = panel.getBoundingClientRect();
  const pw = pRect.width || 320;
  const ph = pRect.height || 480;
  const margin = 12;
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const launcherCenterX = lRect.left + lRect.width / 2;
  let left = launcherCenterX > vw / 2 ? lRect.right - pw : lRect.left;
  left = clamp(left, margin, Math.max(margin, vw - pw - margin));

  let top = lRect.top - ph - gap >= margin ? lRect.top - ph - gap : Math.min(lRect.bottom + gap, vh - ph - margin);
  top = clamp(top, margin, Math.max(margin, vh - ph - margin));

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
  const blinkInterval = window.setInterval(() => {
    launcherImg.src = ABU_EYES_CLOSED_URL;
    window.setTimeout(() => {
      launcherImg.src = ABU_EYES_OPEN_URL;
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

  launcher.addEventListener("dblclick", () => {
    if (launcherDrag.justDragged) return;
    launcher.style.transform = "scale(0.9)";
    setTimeout(() => {
      launcher.style.transform = "";
    }, 150);
    if (panelOpen) {
      closePanel();
    } else {
      panelOpen = true;
      positionPanelNearLauncher(launcher, panel);
      panel.style.display = "flex";
      setStage("state-entering");
      setTimeout(() => {
        if (stageEl.className.indexOf("state-entering") !== -1) setStage("");
      }, 650);
      if (!messagesEl.children.length) addMessage("assistant", "Hi, I\'m Abu. What can I help you with?");
      inputEl.focus();
    }
  });

  closeEl.addEventListener("click", closePanel);
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(inputEl.value);
  });

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
