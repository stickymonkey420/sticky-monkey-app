"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { INTRO_VIDEO_URL, INTRO_VIDEO_POSTER_URL } from "@/lib/dashboard/introVideo";

// Shown once, before OnboardingModal, to a member who hasn't finished the
// onboarding survey yet -- same "has this member onboarded?" check
// OnboardingModal itself does (profiles.onboarding_completed_at), so a
// returning/already-onboarded member never sees this pop up again.
//
// Calls onDone() the instant it knows it won't show (already onboarded, or
// no signed-in user) so OnboardingFlow can mount OnboardingModal right
// away for that case -- no extra delay for existing members. onDone() also
// fires once the member closes or finishes the video, at which point
// OnboardingModal takes over exactly as it did before this existed. See
// OnboardingFlow.tsx for how the two are wired together.
export default function WelcomeVideoModal({ onDone }: { onDone: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) onDone();
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (error || data?.onboarding_completed_at) {
        onDone();
      } else {
        setVisible(true);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
    // onDone only ever needs to fire once per mount (this component
    // unmounts itself right after, via OnboardingFlow's videoDone state),
    // so it doesn't need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setVisible(false);
    onDone();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-5">
      <div className="w-full max-w-4xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Get Started with Sticky Monkey Finance</h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
          >
            Skip ✕
          </button>
        </div>
        <video
          controls
          autoPlay
          preload="auto"
          poster={INTRO_VIDEO_POSTER_URL}
          className="max-h-[80vh] w-full rounded-2xl border border-card-border shadow-2xl"
          onEnded={close}
        >
          <source src={INTRO_VIDEO_URL} type="video/mp4" />
          Your browser doesn&apos;t support embedded video. You can{" "}
          <a href={INTRO_VIDEO_URL} className="underline">
            download the intro video
          </a>{" "}
          instead.
        </video>
      </div>
    </div>
  );
}
