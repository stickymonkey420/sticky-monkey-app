"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Site-styled replacement for window.confirm(). The native dialog (chrome
// like "app.stickymonkey.net says", OS-drawn buttons) looks out of place
// next to the app's own dark card UI, so every call site that used to do
// `if (!window.confirm("...")) return;` now does
// `if (!(await confirm({ message: "..." }))) return;` instead, rendering a
// modal that matches the rest of the app (see e.g. CloseToCloseModal.tsx for
// the same card/button conventions this reuses).
//
// Implemented as a single provider mounted once at the app root
// (src/app/layout.tsx) exposing a promise-based confirm() via context, so
// the ~17 existing call sites only need their one line changed instead of
// each having to manage its own modal-open state.

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive actions (delete/remove)
};

type PendingConfirm = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) settle(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5">
            <h3 className="mb-2 text-base font-semibold text-text-primary">{pending.title ?? "Are you sure?"}</h3>
            <p className="mb-5 text-sm text-text-muted">{pending.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => settle(true)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: pending.danger ? "#ff5c7a" : "#4f8cff" }}
              >
                {pending.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
