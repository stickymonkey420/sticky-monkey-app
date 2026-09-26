"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchSecretStatuses, updateSecret } from "@/lib/apiKeys/queries";
import { API_KEY_DEFS } from "@/lib/apiKeys/types";
import type { SecretStatus } from "@/lib/apiKeys/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "Never set";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "Never set";
  }
}

// Port of the live Webflow "Update API Key" admin page (page id
// 6a8473633590940db9b55561). Thin UI over the list-app-secrets /
// update-app-secret edge functions, which already enforce the
// app_director-only role gate (2026-09-23) and never expose a stored
// value once saved -- "write-only" is a server guarantee here, not just a
// UI convention, so this page never has a value to display or lose.
export default function UpdateApiKeyPage() {
  const [statusByKey, setStatusByKey] = useState<Record<string, SecretStatus>>({});
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function refresh() {
    const supabase = createClient();
    const res = await fetchSecretStatuses(supabase);
    if (res.ok) {
      const map: Record<string, SecretStatus> = {};
      for (const s of res.secrets) map[s.key] = s;
      setStatusByKey(map);
      setForbidden(false);
    } else if (res.kind === "forbidden") {
      setForbidden(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const res = await fetchSecretStatuses(supabase);
      if (cancelled) return;
      if (res.ok) {
        const map: Record<string, SecretStatus> = {};
        for (const s of res.secrets) map[s.key] = s;
        setStatusByKey(map);
        setForbidden(false);
      } else if (res.kind === "forbidden") {
        setForbidden(true);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openEditor(key: string) {
    setOpenKey(key);
    setNewValue("");
    setMessage(null);
  }

  async function handleSave(key: string) {
    const value = newValue.trim();
    if (!value || saving) return;
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const res = await updateSecret(supabase, key, value);
    setSaving(false);
    if (!res.ok) {
      const text =
        res.kind === "forbidden"
          ? "Your account doesn't have access to update keys."
          : res.kind === "invalid"
            ? "That value couldn't be saved. Check it and try again."
            : "Could not save. Please try again.";
      setMessage({ text, isError: true });
      return;
    }
    setMessage({ text: "Saved.", isError: false });
    setNewValue("");
    setOpenKey(null);
    refresh();
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Update API Key</h1>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : forbidden ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          Your account doesn&apos;t have access to this tool.
        </div>
      ) : (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <p className="mb-5 text-xs text-text-muted">
            Values are write-only -- once saved, they&apos;re never shown again here or anywhere else in the app.
          </p>

          <div className="flex flex-col gap-2">
            {API_KEY_DEFS.map((def) => {
              const status = statusByKey[def.key];
              const isSet = status?.is_set ?? false;
              return (
                <div key={def.key} className="rounded-xl bg-white/5 px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-text-primary">{def.label}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: isSet ? "#f5d020" : "hsla(224,18%,42%,0.6)" }}
                        />
                        {isSet ? `Set · last updated ${fmtDate(status?.updated_at ?? null)}` : "Not set"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => (openKey === def.key ? setOpenKey(null) : openEditor(def.key))}
                      className="rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/10"
                    >
                      {openKey === def.key ? "Cancel" : "Update"}
                    </button>
                  </div>

                  {openKey === def.key && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        data-abu-private
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSave(def.key);
                        }}
                        placeholder="New value"
                        className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
                      />
                      <button
                        type="button"
                        disabled={!newValue.trim() || saving}
                        onClick={() => handleSave(def.key)}
                        className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: "#4f8cff" }}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {message && (
            <div className="mt-4 text-sm" style={{ color: message.isError ? "#ff5c7a" : "#f5d020" }}>
              {message.text}
            </div>
          )}
        </div>
      )}
    </>
  );
}
