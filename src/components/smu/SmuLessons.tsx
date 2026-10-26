"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Play, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import type { SmuVideo, SmuVideoWithUrl } from "@/lib/smu/types";

// SMU lessons: video cards grouped by section, played from private
// Cloudflare R2 storage through short-lived signed links. The App Director
// gets a "Manage videos" panel to add, replace, retitle, reorder, hide or
// delete videos. Popups close only with their buttons (or Escape).

const CARD = "rounded-2xl border border-card-border bg-card-bg p-5";
const INPUT = "w-full rounded-md border border-[rgba(148,158,189,0.35)] bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-text-muted";

const fmtDur = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const fmtSize = (b: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");

function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
}

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

// Signed PUT straight to R2, with progress.
async function uploadFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  const res = await fetch("/api/admin/smu/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "video/mp4", size: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !body.url || !body.key) throw new Error(body.error || "Couldn't start the upload.");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", body.url!);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}). Check the bucket's CORS settings.`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check the bucket's CORS settings."));
    xhr.send(file);
  });
  return body.key;
}

async function deleteKey(key: string) {
  await fetch("/api/admin/smu/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => undefined);
}

export default function SmuLessons() {
  const [videos, setVideos] = useState<SmuVideoWithUrl[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isDirector, setIsDirector] = useState(false);
  const [playing, setPlaying] = useState<SmuVideoWithUrl | null>(null);
  const [managing, setManaging] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!cancelled) setIsDirector(p?.role === "app_director");
      }
      const res = await fetch("/api/smu/videos", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { videos?: SmuVideoWithUrl[]; configured?: boolean };
      if (cancelled) return;
      setVideos(body.videos ?? []);
      setConfigured(body.configured !== false);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const sections = useMemo(() => {
    const m = new Map<string, SmuVideoWithUrl[]>();
    for (const v of videos.filter((x) => x.published)) m.set(v.section, [...(m.get(v.section) ?? []), v]);
    return [...m.entries()];
  }, [videos]);

  return (
    <div className="flex flex-col gap-6">
      {isDirector && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f5d020]/30 bg-[#f5d020]/5 px-4 py-3">
          <p className="text-sm text-text-muted">
            {configured ? "Only you see this. Add or update lesson videos anytime." : "Video storage isn't connected yet: add the R2 settings in Vercel."}
          </p>
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="rounded-md bg-[#f5d020] px-3 py-1.5 text-sm font-semibold text-[#0f131c]"
          >
            Manage videos
          </button>
        </div>
      )}

      {loading ? (
        <div className={`${CARD} text-sm text-text-muted`}>Loading lessons…</div>
      ) : sections.length === 0 ? (
        <div className={`${CARD} text-center`}>
          <span className="rounded-full bg-[#f5d020] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0f131c]">Coming soon</span>
          <h3 className="mt-3 text-lg font-semibold text-text-primary">Abu&apos;s first lessons</h3>
          <p className="mx-auto mt-1 max-w-xl text-sm text-text-muted">
            Plain-language walkthroughs of every part of the app, plus lessons on budgeting, credit and investing. Check back soon.
          </p>
        </div>
      ) : (
        sections.map(([section, list]) => (
          <section key={section}>
            <h2 className="mb-3 text-base font-semibold text-text-primary">{section}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => v.url && setPlaying(v)}
                  disabled={!v.url}
                  className="group overflow-hidden rounded-2xl border border-card-border bg-card-bg text-left transition hover:border-[#f5d020]/50 disabled:opacity-60"
                >
                  <div className="relative aspect-video bg-black">
                    {v.url && <video src={`${v.url}#t=1`} preload="metadata" muted playsInline className="h-full w-full object-cover opacity-80" />}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f5d020] text-[#0f131c] shadow-lg transition group-hover:scale-110">
                        <Play size={24} className="ml-1" fill="currentColor" />
                      </span>
                    </span>
                    {v.duration_sec ? (
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{fmtDur(v.duration_sec)}</span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-text-primary">{v.title}</div>
                    {v.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{v.description}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {playing && <PlayerModal video={playing} onClose={() => setPlaying(null)} />}
      {managing && (
        <ManageModal
          videos={videos}
          onClose={() => setManaging(false)}
          onChanged={() => setReload((x) => x + 1)}
        />
      )}
    </div>
  );
}

function PlayerModal({ video, onClose }: { video: SmuVideoWithUrl; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h3 className="truncate text-base font-semibold text-text-primary">{video.title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        <video src={video.url ?? undefined} controls autoPlay playsInline controlsList="nodownload" className="max-h-[75vh] w-full bg-black" />
        {video.description && <p className="px-4 py-3 text-sm text-text-muted">{video.description}</p>}
      </div>
    </div>
  );
}

type Draft = { title: string; description: string; section: string; sort_order: string; published: boolean };
const toDraft = (v?: SmuVideo): Draft => ({
  title: v?.title ?? "",
  description: v?.description ?? "",
  section: v?.section ?? "App walkthroughs",
  sort_order: String(v?.sort_order ?? 100),
  published: v?.published ?? true,
});

function ManageModal({ videos, onClose, onChanged }: { videos: SmuVideoWithUrl[]; onClose: () => void; onChanged: () => void }) {
  useEscape(onClose);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<SmuVideo | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback((v: SmuVideo | "new") => {
    setEditing(v);
    setDraft(toDraft(v === "new" ? undefined : v));
    setFile(null);
    setError(null);
    setProgress(null);
  }, []);

  async function save() {
    if (!editing) return;
    if (!draft.title.trim()) return setError("Add a title.");
    if (editing === "new" && !file) return setError("Choose a video file.");
    setError(null);
    try {
      const supabase = createClient();
      let key: string | null = null;
      let meta: { size_bytes?: number; duration_sec?: number | null } = {};
      if (file) {
        setProgress(0);
        const [k, dur] = await Promise.all([uploadFile(file, setProgress), readDuration(file)]);
        key = k;
        meta = { size_bytes: file.size, duration_sec: dur };
      }
      const fields = {
        title: draft.title.trim().slice(0, 120),
        description: draft.description.trim().slice(0, 600) || null,
        section: draft.section.trim().slice(0, 60) || "App walkthroughs",
        sort_order: Math.round(Number(draft.sort_order) || 100),
        published: draft.published,
        updated_at: new Date().toISOString(),
      };
      if (editing === "new") {
        const { error: e } = await supabase.from("smu_videos").insert({ ...fields, ...meta, r2_key: key });
        if (e) {
          if (key) await deleteKey(key);
          throw new Error(e.message);
        }
      } else {
        const patch = key ? { ...fields, ...meta, r2_key: key, version: editing.version + 1 } : fields;
        const { error: e } = await supabase.from("smu_videos").update(patch).eq("id", editing.id);
        if (e) {
          if (key) await deleteKey(key);
          throw new Error(e.message);
        }
        if (key) await deleteKey(editing.r2_key); // old file
      }
      setEditing(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setProgress(null);
    }
  }

  async function remove(v: SmuVideo) {
    if (!(await confirm({ message: `Delete "${v.title}"? The video file is removed too.`, danger: true, confirmLabel: "Delete" }))) return;
    const { error: e } = await createClient().from("smu_videos").delete().eq("id", v.id);
    if (e) return setError(e.message);
    await deleteKey(v.r2_key);
    onChanged();
  }

  const busy = progress !== null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 px-3 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-card-border bg-card-bg p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Manage SMU videos</h3>
            <p className="mt-0.5 text-xs text-text-muted">Upload MP4 (720p keeps it fast on phones). Replacing a video keeps its title and spot.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
            <X size={20} />
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-[#ff5c7a]">{error}</p>}

        {editing ? (
          <div className="flex flex-col gap-3">
            <label className={LABEL}>
              Title
              <input className={`${INPUT} mt-1`} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className={LABEL}>
              Description
              <textarea className={`${INPUT} mt-1`} rows={2} value={draft.description} maxLength={600} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className={LABEL}>
                Section
                <input className={`${INPUT} mt-1`} value={draft.section} maxLength={60} onChange={(e) => setDraft({ ...draft, section: e.target.value })} />
              </label>
              <label className={LABEL}>
                Order
                <input className={`${INPUT} mt-1`} type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
              </label>
              <label className={`${LABEL} flex items-center gap-2 pt-5`}>
                <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} className="h-4 w-4" />
                Visible to members
              </label>
            </div>
            <div>
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-card-border px-3 py-2 text-sm text-text-primary">
                <Upload size={15} /> {file ? file.name : editing === "new" ? "Choose video" : "Replace video (optional)"}
              </button>
              {file && <span className="ml-2 text-xs text-text-muted">{fmtSize(file.size)}</span>}
              {busy && (
                <div className="mt-2 h-2 overflow-hidden rounded bg-white/10">
                  <div className="h-full bg-[#f5d020] transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className="rounded-md px-3 py-2 text-sm text-text-muted hover:text-text-primary">
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={save} className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-60">
                {busy ? `Uploading ${progress}%` : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => open("new")} className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-[#f5d020] px-3 py-1.5 text-sm font-semibold text-[#0f131c]">
              <Plus size={15} /> Add video
            </button>
            {videos.length === 0 ? (
              <p className="text-sm text-text-muted">No videos yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {videos.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {v.title}
                        {!v.published && <span className="ml-2 text-[11px] font-normal text-[#f5d020]">hidden</span>}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        {v.section} · #{v.sort_order} {v.duration_sec ? `· ${fmtDur(v.duration_sec)}` : ""} {v.size_bytes ? `· ${fmtSize(v.size_bytes)}` : ""} · v{v.version}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button type="button" onClick={() => open(v)} aria-label="Edit" className="text-text-muted hover:text-text-primary">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => remove(v)} aria-label="Delete" className="text-text-muted hover:text-[#ff5c7a]">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-text-muted hover:text-text-primary">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
