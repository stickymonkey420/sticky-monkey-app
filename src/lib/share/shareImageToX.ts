// Captures a DOM element as a PNG and gets it into an X (Twitter) post as
// an attached image -- for the "Share to X" buttons on HeadToHeadCard and
// ScoreboardCard. Client-side only (html2canvas -- a free, MIT-licensed
// library, no paid screenshot API): keeps this at $0/month instead of
// reaching for something like a headless-browser screenshot service.
//
// X's own web share-intent URL (https://twitter.com/intent/tweet) has NO
// parameter for attaching media -- only text/url/hashtags. There is no
// query-string trick around this; it's a real platform limitation, not a
// bug here. So this uses two paths instead:
//
// 1. Where the Web Share API supports sharing files (`navigator.share`
//    with a File, mainly mobile Safari/Chrome, and some desktop Chrome/Edge
//    builds) -- share the captured image directly through the OS share
//    sheet, where picking X hands it the image already attached, ready to
//    post. No text is passed, matching your "don't pre-type anything" call.
// 2. Everywhere else -- downloads the PNG to the member's device AND opens
//    a blank X compose tab (same as before), so they can drag/attach the
//    just-downloaded image into the post themselves. The compose tab is
//    opened synchronously (before the async capture), so popup blockers
//    don't swallow it.
export type ShareImageResult = "shared" | "downloaded" | "cancelled" | "failed";

const X_COMPOSE_URL = "https://twitter.com/intent/tweet";

export async function shareElementToX(el: HTMLElement, filename: string): Promise<ShareImageResult> {
  // Open first, synchronously with the click, so Safari/Chrome popup
  // blockers see it as a direct result of user interaction. Only used for
  // the download fallback path below; closed again if Web Share succeeds.
  const composeWindow = window.open("", "_blank", "noopener,noreferrer");

  let canvas: HTMLCanvasElement;
  try {
    const html2canvas = (await import("html2canvas")).default;
    canvas = await html2canvas(el, { backgroundColor: null, scale: 2 });
  } catch (err) {
    console.error("shareElementToX: capture failed", err);
    composeWindow?.close();
    return "failed";
  }

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    composeWindow?.close();
    return "failed";
  }

  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    composeWindow?.close();
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      console.error("shareElementToX: navigator.share failed", err);
      // Fall through to the download path below rather than leaving the
      // member with nothing.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  if (composeWindow) {
    composeWindow.location.href = X_COMPOSE_URL;
  } else {
    window.open(X_COMPOSE_URL, "_blank", "noopener,noreferrer");
  }
  return "downloaded";
}
