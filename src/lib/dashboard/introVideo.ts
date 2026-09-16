// Shared by the SMU "Get Started" video card (src/app/(app)/smu/page.tsx)
// and the first-login WelcomeVideoModal popup, so both point at the exact
// same asset instead of two copies that can drift.
export const INTRO_VIDEO_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a96aefe185e5f18cc9542d3_AbuIntro.mp4";

// Poster/placeholder frame shown before the video plays. Served from this
// app's own public/ folder (not S3, unlike the URL above).
export const INTRO_VIDEO_POSTER_URL = "/images/smu-crest.png";
