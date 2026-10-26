export type SmuVideo = {
  id: string;
  title: string;
  description: string | null;
  section: string;
  sort_order: number;
  r2_key: string;
  size_bytes: number | null;
  duration_sec: number | null;
  published: boolean;
  version: number;
  updated_at: string;
};
export type SmuVideoWithUrl = SmuVideo & { url: string | null };
