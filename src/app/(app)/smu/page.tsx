
// Port of the live Webflow "SMU" (Sticky Monkey University) page (page id
// 6a96641b0e5cff2da16490ad). Unlike every other ported page, this one's
// own custom-code block held nothing but test placeholder tags
// (<meta name="smu-test" ...>) -- no business logic to port. Fetching the
// live published page directly (webflow.io preview URL, no auth needed
// for static markup) confirmed there's genuinely no course/lesson content
// built yet: just the hero heading, the SEO description, and a single
// intro video placeholder ("AbuIntro.mp4"). Rather than inventing lesson
// content that doesn't exist on the real site, this ports exactly that --
// the real hosted video asset (found via the Webflow MCP data_assets_tool,
// asset id 6a96aefe185e5f18cc9542d3) plus a plain "more lessons coming
// soon" note, so it's honest about the page's actual current scope.
const VIDEO_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a96aefe185e5f18cc9542d3_AbuIntro.mp4";
const ABU_AVATAR_URL =
  "https://s3.amazonaws.com/webflow-prod-assets/665f5b07319971d77a6e12a1/6a97f76bdc2bb83ea21e174f_abu-eyes-open-clean.png";
// Shown as the video's placeholder frame before it's played, per your call
// to swap in the SMU crest there instead of Abu's avatar. Served from this
// app's own public/ folder (not S3, unlike the two URLs above) since it's a
// new asset with nowhere else hosted yet.
const SMU_CREST_URL = "/images/smu-crest.png";

export default function SmuPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Sticky Monkey University</h1>
      </div>
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="flex flex-wrap items-center gap-4">
            <img
              src={ABU_AVATAR_URL}
              alt="Abu"
              className="h-16 w-16 shrink-0 rounded-full border border-card-border object-cover"
            />
            <div>
              <h2 className="text-base font-semibold text-text-primary">Meet Abu, your finance guide</h2>
              <p className="mt-1 max-w-2xl text-sm text-text-muted">
                Learn how to use the app, analyze your own portfolio, and get lessons custom-built from
                your real numbers.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Get Started</h3>
          <video
            controls
            preload="metadata"
            poster={SMU_CREST_URL}
            className="w-full max-w-2xl rounded-xl border border-card-border"
          >
            <source src={VIDEO_URL} type="video/mp4" />
            Your browser doesn&apos;t support embedded video. You can{" "}
            <a href={VIDEO_URL} className="underline">
              download the intro video
            </a>{" "}
            instead.
          </video>
        </div>

        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          More lessons are coming soon -- this page mirrors the live site exactly, which doesn&apos;t
          have any course content published yet beyond the intro video above.
        </div>
      </div>
    </>
  );
}
