"use client";

import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/transactions/types";

type CategoryPickerProps = {
  categories: Category[];
  current: Category | null;
  onSelect: (key: string) => void;
  onAddCategory: (label: string) => Promise<string | null>; // returns the new category's key, or null on failure
};

// Self-contained "..." trigger + dropdown for one transaction row: pick an
// existing category, or add a new one inline. Ported from the live
// script's menu (built by hand with document.createElement + a
// MutationObserver-free show/hide), simplified for React: the menu is
// absolutely positioned under its own trigger (position:relative on the
// wrapper) rather than the live version's fixed-to-viewport + flip-above
// clamping -- a reasonable scope-down for a first pass since every row
// still has room to open downward in normal use.
export default function CategoryPicker({ categories, current, onSelect, onAddCategory }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // mousedown, not click: a click on "Add category" swaps the menu's
    // contents (categories -> the add-new form) via setAdding(true), and
    // React commits that DOM change synchronously for a discrete event
    // like click before the event finishes bubbling to document. That
    // detaches the original target node, so a document "click" listener
    // sees `wrapRef.current.contains(e.target)` as false (a detached node
    // is never "contained" by anything) and incorrectly closes the whole
    // menu instead of showing the form. mousedown fires before that
    // commit, so the target is still attached when this check runs.
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function pick(key: string) {
    onSelect(key);
    setOpen(false);
    setAdding(false);
  }

  async function submitNew() {
    const label = newLabel.trim();
    if (!label || saving) return;
    setSaving(true);
    const key = await onAddCategory(label);
    setSaving(false);
    setNewLabel("");
    if (key) pick(key);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2 py-1 text-text-muted hover:bg-white/10 hover:text-text-primary"
        aria-label="Change category"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-48 overflow-y-auto rounded-lg border border-card-border bg-card-bg p-1.5 shadow-lg">
          {!adding ? (
            <>
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-white/10 ${
                    current?.key === c.key ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.label}
                </button>
              ))}
              <div className="my-1 h-px bg-card-border" />
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-text-muted hover:bg-white/10"
              >
                <span className="inline-block w-2 text-center">+</span>
                Add category
              </button>
            </>
          ) : (
            <div className="p-1">
              <input
                autoFocus
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="New category name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNew();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setAdding(false);
                  }
                }}
                className="w-full rounded-md border border-card-border bg-[#0f131c] px-2.5 py-2 text-sm text-text-primary outline-none"
              />
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={submitNew}
                  className="flex-1 rounded-md bg-[#3ddc97] py-1.5 text-xs font-semibold text-[#0f131c] disabled:opacity-60"
                >
                  {saving ? "Adding…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="flex-1 rounded-md border border-card-border py-1.5 text-xs text-text-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
