/* Shared notification-preference schema. Imported by both the settings UI
   (client) and the notification writer (server), so the per-type toggles the
   member sets are the same keys the server honors before filing a raven. Kept
   free of server-only imports on purpose. */

/* Every toggle key that lives inside profiles.settings.notifications. */
export const NOTIF_PREF_KEYS = [
  "mentions",
  "replies",
  "reposts",
  "likes",
  "follows",
  "tips",
  "whispers",
  "duels",
  "calls",
  "house",
  "announcements",
] as const;

export type NotifPrefKey = (typeof NOTIF_PREF_KEYS)[number];

/* Maps a notification kind to the toggle that governs it. A kind with no entry
   here is always delivered (for example raven_reply: the Herald answering a
   question the member explicitly asked cannot be muted from this panel). */
export const KIND_TO_PREF: Record<string, NotifPrefKey> = {
  like: "likes",
  reply: "replies",
  reraven: "reposts",
  follow: "follows",
  referral: "follows",
  tip: "tips",
  mention: "mentions",
  whisper: "whispers",
  duel_answered: "duels",
  duel_won: "duels",
  call_verdict: "calls",
  /* B4: the two follow alerts had no entry, so a member who turned everything
     off in the panel still got a raven every time someone they follow sealed a
     Call or made a trade, and those are the two loudest kinds in the realm
     because they fan out to every follower at once.

     There is no "follow alerts" toggle to map them to and inventing one here
     would ship a key the settings UI does not render, which is a toggle that
     exists only in the database. So each maps to the toggle a member would
     look for: follow_call to "calls", which is already the Call channel and is
     what somebody who does not want Call ravens would reach for; follow_trade
     to "tips", which is the money channel and the only existing toggle that
     covers a member's market activity. If the panel ever grows a toggle of
     their own, these two entries are the whole of what has to move. */
  follow_call: "calls",
  follow_trade: "tips",
  house: "house",
  announcement: "announcements",
};

/* Read a single notification preference from a member's settings blob. Absent
   or malformed values default to ON, so a member is reachable unless they have
   deliberately turned a channel off. */
export function notifPrefEnabled(
  settings: unknown,
  key: NotifPrefKey
): boolean {
  if (typeof settings !== "object" || settings === null) return true;
  const bucket = (settings as Record<string, unknown>).notifications;
  if (typeof bucket !== "object" || bucket === null) return true;
  const val = (bucket as Record<string, unknown>)[key];
  return typeof val === "boolean" ? val : true;
}

/* True when a notification of `kind` may be filed for a member with these
   settings. Unknown kinds are always allowed. */
export function kindAllowedBySettings(
  settings: unknown,
  kind: string
): boolean {
  const key = KIND_TO_PREF[kind];
  if (!key) return true;
  return notifPrefEnabled(settings, key);
}
