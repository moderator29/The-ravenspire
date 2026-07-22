export interface Author {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  house_slug: string | null;
  tier: string;
  is_agent?: boolean;
}

export interface CallData {
  token: string;
  stance: "up" | "down";
  timeframe: string;
  entry_price: number;
  verdict: "open" | "hit" | "miss";
}

export interface Post {
  id: string;
  author_id: string;
  kind: "raven" | "call" | "poll";
  body: string;
  media: { url: string; type: string }[];
  cashtags: string[];
  call: CallData | null;
  poll: { options: { text: string; votes: number }[] } | null;
  house_slug: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  view_count: number;
  created_at: string;
  author: Author;
  /* Set when this feed item reached the reader as a re-raven. */
  repostedBy?: { handle: string | null; display_name: string | null };
  /* Optional commentary a member attached to their re-raven. */
  quote?: string | null;
  /* The time this item takes its feed position from: the post's own
     creation time, or the re-raven time when repostedBy is set. */
  effectiveTime?: string;
  /* Per-viewer reaction state, resolved server-side for the signed-in reader
     so a card renders its true like/repost/bookmark state on load instead of
     defaulting to off (which let a returning member re-like the same raven).
     Absent for logged-out readers, who have no reactions. */
  viewer_liked?: boolean;
  viewer_reposted?: boolean;
  viewer_bookmarked?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  author: Author;
}

export interface PublicProfile extends Author {
  id: string;
  bio: string | null;
  banner_url: string | null;
  links: { label: string; url: string }[] | null;
  renown: number;
  points: number;
  glory: number;
  x_handle: string | null;
  created_at: string;
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export const TIER_NAMES: Record<string, string> = {
  smallfolk: "Smallfolk",
  squire: "Squire",
  knight: "Knight",
  lord: "Lord",
  warden: "Warden",
  hand: "Hand",
  king: "Monarch",
};
