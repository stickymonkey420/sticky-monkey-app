"use client";

// Turn an uploaded image (PNG/JPG/WebP/SVG...) into a small PNG data URL for
// invoice branding: fit inside 600x240, keep transparency, no upscaling.
// Runs fully in the browser -- no storage service, no cost.

const MAX_W = 600;
const MAX_H = 240;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 400_000; // matches the DB check constraint

export async function fileToLogoPng(file: File): Promise<{ dataUrl: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) return { dataUrl: null, error: "Please choose an image file (PNG, JPG, SVG)." };
  if (file.size > MAX_INPUT_BYTES) return { dataUrl: null, error: "That image is over 5 MB. Please use a smaller file." };

  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  }).catch(() => null);
  if (!src) return { dataUrl: null, error: "Could not read that image." };

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
  if (!img || !img.naturalWidth || !img.naturalHeight) return { dataUrl: null, error: "Could not read that image." };

  let scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
  for (let attempt = 0; attempt < 4; attempt++) {
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { dataUrl: null, error: "Your browser couldn't process that image." };
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/png");
    if (out.length <= MAX_OUTPUT_CHARS) return { dataUrl: out, error: null };
    scale *= 0.7;
  }
  return { dataUrl: null, error: "That logo is too detailed to store. Try a simpler or smaller image." };
}
