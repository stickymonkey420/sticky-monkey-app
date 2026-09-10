"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/client";
import { CATEGORICAL_PALETTE } from "@/lib/palette";
import {
  addCustomCategory,
  deleteCustomCategory,
  fetchCustomCategories,
  updateCustomCategory,
} from "@/lib/transactions/queries";
import { BUILTIN_CATEGORIES, nextCustomCategoryColor, slugifyCategoryLabel } from "@/lib/transactions/calc";
import type { CustomCategory } from "@/lib/transactions/types";

function Swatch({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Use color ${color}`}
      className="h-6 w-6 shrink-0 rounded-full"
      style={{
        backgroundColor: color,
        outline: selected ? "2px solid #fff" : "2px solid transparent",
        outlineOffset: 2,
      }}
    />
  );
}

// Port of the live Webflow "Edit Categories" page (page id
// 6a863d1bd66c329084fc92b8). This page's own custom code and the
// site-wide head/footer scripts were all searched and came up empty for
// any category-CRUD logic -- the only real signal was the SEO
// description ("Add, rename, recolor, and remove your custom transaction
// categories") plus the already-known custom_transaction_categories
// table (used by the Transactions page's inline "Add category" flow).
// Rather than a hidden script to port 1:1, this is built directly from
// that table's schema (key/label/color) and its RLS policies (verified
// via Supabase: plain per-user SELECT/INSERT/UPDATE/DELETE, no RPC
// needed for any of the four actions). Colors are chosen from the app's
// shared validated categorical palette rather than a freeform color
// picker, matching the dataviz skill's fixed-hue-order rule used
// everywhere else in the app.
export default function EditCategoriesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);
      const rows = await fetchCustomCategories(supabase, user.id);
      if (cancelled) return;
      setCustomCategories(rows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const existingKeys = useMemo(
    () => new Set([...BUILTIN_CATEGORIES.map((c) => c.key), ...customCategories.map((c) => c.key)]),
    [customCategories]
  );

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label || !userId || adding) return;
    setAdding(true);
    const existing = customCategories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      setNewLabel("");
      setAdding(false);
      return;
    }
    const key = slugifyCategoryLabel(label, existingKeys);
    const color = nextCustomCategoryColor(customCategories.length);
    const supabase = createClient();
    const { category, error } = await addCustomCategory(supabase, userId, key, label, color);
    setAdding(false);
    if (error || !category) {
      window.alert("Could not add that category. Please try again.");
      return;
    }
    setCustomCategories((rows) => [...rows, category]);
    setNewLabel("");
  }

  function startRename(c: CustomCategory) {
    setEditingId(c.id);
    setEditLabel(c.label);
  }

  async function submitRename(c: CustomCategory) {
    const label = editLabel.trim();
    if (!label) {
      setEditingId(null);
      return;
    }
    if (label === c.label) {
      setEditingId(null);
      return;
    }
    setSavingId(c.id);
    const supabase = createClient();
    const { category, error } = await updateCustomCategory(supabase, c.id, { label });
    setSavingId(null);
    setEditingId(null);
    if (error || !category) {
      window.alert("Could not rename that category. Please try again.");
      return;
    }
    setCustomCategories((rows) => rows.map((r) => (r.id === c.id ? category : r)));
  }

  async function handleRecolor(c: CustomCategory, color: string) {
    if (color === c.color) {
      setColorPickerId(null);
      return;
    }
    const prev = customCategories;
    setCustomCategories((rows) => rows.map((r) => (r.id === c.id ? { ...r, color } : r)));
    setColorPickerId(null);
    const supabase = createClient();
    const { error } = await updateCustomCategory(supabase, c.id, { color });
    if (error) {
      window.alert("Could not recolor that category. Please try again.");
      setCustomCategories(prev);
    }
  }

  async function handleDelete(c: CustomCategory) {
    if (!window.confirm(`Delete the "${c.label}" category? Past transactions keep their tag but it can no longer be assigned.`)) {
      return;
    }
    setDeletingId(c.id);
    const prev = customCategories;
    setCustomCategories((rows) => rows.filter((r) => r.id !== c.id));
    const supabase = createClient();
    const { error } = await deleteCustomCategory(supabase, c.id);
    setDeletingId(null);
    if (error) {
      window.alert("Could not delete that category. Please try again.");
      setCustomCategories(prev);
    }
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Edit Categories</h1>
      </div>

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-1 text-sm font-semibold text-text-primary">Built-in Categories</h3>
          <p className="mb-4 text-xs text-text-muted">
            These come with the app and can&apos;t be renamed, recolored, or removed.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {BUILTIN_CATEGORIES.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                style={{ borderColor: c.color, color: c.color }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-1 text-sm font-semibold text-text-primary">Your Custom Categories</h3>
          <p className="mb-4 text-xs text-text-muted">Add, rename, recolor, and remove your own transaction categories.</p>

          {loading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : customCategories.length === 0 ? (
            <div className="mb-4 text-sm text-text-muted">You haven&apos;t added any custom categories yet.</div>
          ) : (
            <div className="mb-4 flex flex-col gap-2">
              {customCategories.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 px-3.5 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setColorPickerId((id) => (id === c.id ? null : c.id))}
                    aria-label="Change color"
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />

                  {editingId === c.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(c);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => submitRename(c)}
                      className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-2 py-1 text-sm text-text-primary outline-none"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-text-primary">{c.label}</span>
                  )}

                  {savingId === c.id && <span className="text-xs text-text-muted">Saving…</span>}

                  {editingId !== c.id && (
                    <button
                      type="button"
                      onClick={() => startRename(c)}
                      className="text-xs text-[#4f8cff] hover:underline"
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={deletingId === c.id}
                    onClick={() => handleDelete(c)}
                    className="text-xs text-[#ff5c7a] hover:underline disabled:opacity-50"
                  >
                    {deletingId === c.id ? "Removing…" : "Remove"}
                  </button>

                  {colorPickerId === c.id && (
                    <div className="flex w-full flex-wrap items-center gap-2 pt-1">
                      {CATEGORICAL_PALETTE.map((color) => (
                        <Swatch key={color} color={color} selected={color === c.color} onClick={() => handleRecolor(c, color)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="New category name"
              className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
            />
            <button
              type="button"
              disabled={!newLabel.trim() || adding || !userId}
              onClick={handleAdd}
              className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60"
            >
              {adding ? "Adding…" : "Add Category"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
