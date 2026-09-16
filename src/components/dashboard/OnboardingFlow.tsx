"use client";

import { useState } from "react";
import OnboardingModal from "./OnboardingModal";
import WelcomeVideoModal from "./WelcomeVideoModal";

// Coordinates the two first-login popups so they never show at once: the
// welcome video plays first, and only once it's dismissed (or immediately,
// for a member who's already finished onboarding -- WelcomeVideoModal calls
// onDone() right away in that case) does OnboardingModal get to mount and
// run its own "has this member onboarded?" check. Dashboard renders this
// instead of <OnboardingModal /> directly.
export default function OnboardingFlow() {
  const [videoDone, setVideoDone] = useState(false);

  return (
    <>
      <WelcomeVideoModal onDone={() => setVideoDone(true)} />
      {videoDone && <OnboardingModal />}
    </>
  );
}
