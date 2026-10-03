"use client";

import OnboardingModal from "./OnboardingModal";

// First-run flow. The welcome video (WelcomeVideoModal) is paused while the
// intro is re-edited, so this goes straight to the mandatory survey. To
// bring the video back, render <WelcomeVideoModal onDone={...} /> first and
// mount <OnboardingModal /> once it's done (see git history).
export default function OnboardingFlow() {
  return <OnboardingModal />;
}
