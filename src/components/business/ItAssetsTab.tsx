"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { itDelete, itInsert, itUpdate } from "@/lib/business/itQueries";
import { ASSET_TYPES, ASSET_TYPE_LABELS, type AssetType, type ItAsset, type ItSite } from "@/lib/business/itTypes";
import type { BusinessClient } from "@/lib/business/types";
import { itBtnSmall, itSmall } from "./itUi";

// Assets & Sites for IT / Tech Support: per-client sites and device
// inventory with warranty alerts. Credentials are NEVER stored here -- only
// where to find them (e.g. "Bitwarden > Acme vault").

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EMPTY_ASSET = {
  name: "",
  asset_type: "workstation" as AssetType,
  site_id: "",
  make_model: "",
  serial: "",
  os: "",
  ip_address: "",
  assigned_user: "",
  warranty_end: "",
  credentials_location: "",
};

export default function ItAssetsTab({
  userId,
  businessId,
  clients,
  sites,
  assets,
  now,
  onChanged,
  onError,
}: {
  userId: string;
  businessId: string;
  clients: BusinessClient[];
  sites: ItSite[];
  assets: ItAsset[];
  now: number;
  onChanged: () => void;
  onError: (m: string | null) => void;
}) {
  const confirm = useConfirm();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [siteForm, setSiteForm] = useState({ name: "", address: "", contact: "" });
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET);
  const [showRetired, setShowRetired] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = new Date(now).toISOString().slice(0, 10);
  const in60 = new Date(now + 60 * 86_400_000).toISOString().slice(0, 10);
  const clientSites = sites.filter((s) => s.client_id === clientId);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const clientAssets = assets.filter((a) => a.client_id === clientId && (showRetired || a.status === "active"));

  if (clients.length === 0) return <div className="text-sm text-text-muted">Add a client first (Clients section above).</div>;

  async function addSite() {
    if (busy || !siteForm.name.trim() || !clientId) return;
    setBusy(true);
    const { error } = await itInsert(createClient(), "it_sites", {
      user_id: userId,
      business_id: businessId,
      client_id: clientId,
      name: siteForm.name.trim(),
      address: siteForm.address.trim() || null,
      contact: siteForm.contact.trim() || null,
    });
    setBusy(false);
    if (error) return onError("Could not add that site. Please try again.");
    setSiteForm({ name: "", address: "", contact: "" });
    onChanged();
  }

  async function deleteSite(s: ItSite) {
    if (!(await confirm({ message: `Remove site "${s.name}"? Assets and tickets keep their other details.`, danger: true }))) return;
    const { error } = await itDelete(createClient(), "it_sites", s.id);
    if (error) return onError("Could not remove that site. Please try again.");
    onChanged();
  }

  async function addAsset() {
    if (busy || !assetForm.name.trim() || !clientId) return;
    setBusy(true);
    const f = assetForm;
    const { error } = await itInsert(createClient(), "it_assets", {
      user_id: userId,
      business_id: businessId,
      client_id: clientId,
      site_id: f.site_id || null,
      asset_type: f.asset_type,
      name: f.name.trim(),
      make_model: f.make_model.trim() || null,
      serial: f.serial.trim() || null,
      os: f.os.trim() || null,
      ip_address: f.ip_address.trim() || null,
      assigned_user: f.assigned_user.trim() || null,
      warranty_end: f.warranty_end || null,
      credentials_location: f.credentials_location.trim() || null,
    });
    setBusy(false);
    if (error) return onError("Could not add that asset. Please try again.");
    setAssetForm(EMPTY_ASSET);
    onChanged();
  }

  async function toggleRetired(a: ItAsset) {
    const { error } = await itUpdate(createClient(), "it_assets", a.id, { status: a.status === "active" ? "retired" : "active" });
    if (error) return onError("Could not update that asset. Please try again.");
    onChanged();
  }

  async function deleteAsset(a: ItAsset) {
    if (!(await confirm({ message: `Delete asset "${a.name}"?`, danger: true }))) return;
    const { error } = await itDelete(createClient(), "it_assets", a.id);
    if (error) return onError("Could not delete that asset. Please try again.");
    onChanged();
  }

  const field = (key: keyof typeof EMPTY_ASSET, placeholder: string, w = "w-36") => (
    <input
      placeholder={placeholder}
      value={assetForm[key]}
      onChange={(e) => setAssetForm((f) => ({ ...f, [key]: e.target.value }))}
      className={`${itSmall} ${w}`}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Client</span>
        <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={itSmall}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Sites */}
      <div className="rounded-xl bg-white/5 p-3.5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Sites</div>
        {clientSites.length === 0 ? (
          <div className="mb-2 text-xs text-text-muted">No sites yet.</div>
        ) : (
          <div className="mb-2 flex flex-col gap-1">
            {clientSites.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded bg-[#0f131c] px-2.5 py-1.5 text-xs">
                <span className="text-text-primary">
                  {s.name}
                  <span className="text-text-muted">{[s.address, s.contact].filter(Boolean).length ? ` · ${[s.address, s.contact].filter(Boolean).join(" · ")}` : ""}</span>
                </span>
                <button type="button" onClick={() => deleteSite(s)} className="text-[#ff5c7a] hover:underline">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <input placeholder="Site name (e.g. Main office)" value={siteForm.name} onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))} className={itSmall} />
          <input placeholder="Address" value={siteForm.address} onChange={(e) => setSiteForm((f) => ({ ...f, address: e.target.value }))} className={`${itSmall} min-w-[200px] flex-1`} />
          <input placeholder="On-site contact" value={siteForm.contact} onChange={(e) => setSiteForm((f) => ({ ...f, contact: e.target.value }))} className={itSmall} />
          <button type="button" disabled={busy || !siteForm.name.trim()} onClick={addSite} className={itBtnSmall}>
            Add site
          </button>
        </div>
      </div>

      {/* Assets */}
      <div className="rounded-xl bg-white/5 p-3.5">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-muted">
          <span>Assets</span>
          <label className="flex items-center gap-1 normal-case">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show retired
          </label>
        </div>
        {clientAssets.length === 0 ? (
          <div className="mb-2 text-xs text-text-muted">No assets yet.</div>
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-left uppercase text-text-muted">
                  <th className="py-1.5 pr-3">Name</th>
                  <th className="py-1.5 pr-3">Type</th>
                  <th className="py-1.5 pr-3">Make / model</th>
                  <th className="py-1.5 pr-3">Serial</th>
                  <th className="py-1.5 pr-3">User</th>
                  <th className="py-1.5 pr-3">Site</th>
                  <th className="py-1.5 pr-3">Warranty</th>
                  <th className="py-1.5 pr-3">Credentials at</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {clientAssets.map((a) => {
                  const expired = !!a.warranty_end && a.warranty_end < today;
                  const soon = !expired && !!a.warranty_end && a.warranty_end <= in60;
                  return (
                    <tr key={a.id} className={a.status === "retired" ? "opacity-50" : ""}>
                      <td className="py-1.5 pr-3 text-text-primary">
                        {a.name}
                        {(a.os || a.ip_address) && <div className="text-text-muted">{[a.os, a.ip_address].filter(Boolean).join(" · ")}</div>}
                      </td>
                      <td className="py-1.5 pr-3 text-text-muted">{ASSET_TYPE_LABELS[a.asset_type]}</td>
                      <td className="py-1.5 pr-3 text-text-muted">{a.make_model ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-text-muted">{a.serial ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-text-muted">{a.assigned_user ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-text-muted">{a.site_id ? siteName.get(a.site_id) ?? "—" : "—"}</td>
                      <td className={`py-1.5 pr-3 ${expired ? "font-semibold text-[#ff5c7a]" : soon ? "text-[#f5d020]" : "text-text-muted"}`}>
                        {fmtDate(a.warranty_end)}
                        {expired ? " (expired)" : soon ? " (soon)" : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-text-muted">{a.credentials_location ?? "—"}</td>
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <button type="button" onClick={() => toggleRetired(a)} className="mr-2 text-text-muted hover:text-text-primary">
                          {a.status === "active" ? "Retire" : "Reactivate"}
                        </button>
                        <button type="button" onClick={() => deleteAsset(a)} className="text-[#ff5c7a] hover:underline">
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {field("name", "Name / hostname")}
          <select
            aria-label="Asset type"
            value={assetForm.asset_type}
            onChange={(e) => setAssetForm((f) => ({ ...f, asset_type: e.target.value as AssetType }))}
            className={itSmall}
          >
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {clientSites.length > 0 && (
            <select aria-label="Site" value={assetForm.site_id} onChange={(e) => setAssetForm((f) => ({ ...f, site_id: e.target.value }))} className={itSmall}>
              <option value="">No site</option>
              {clientSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {field("make_model", "Make / model")}
          {field("serial", "Serial")}
          {field("os", "OS", "w-28")}
          {field("ip_address", "IP", "w-28")}
          {field("assigned_user", "Assigned user")}
          <label className="flex items-center gap-1 text-xs text-text-muted">
            Warranty end
            <input
              type="date"
              value={assetForm.warranty_end}
              onChange={(e) => setAssetForm((f) => ({ ...f, warranty_end: e.target.value }))}
              className={itSmall}
            />
          </label>
          {field("credentials_location", "Credentials location (e.g. Bitwarden > Acme)", "w-72")}
          <button type="button" disabled={busy || !assetForm.name.trim()} onClick={addAsset} className={itBtnSmall}>
            Add asset
          </button>
        </div>
        <div className="mt-1.5 text-xs text-text-muted">Store only where credentials live — never the passwords themselves.</div>
      </div>
    </div>
  );
}
