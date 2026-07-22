/* Presentation helpers for ravens (notifications), shared by the notifications
   center and the in-app toast so both speak the same language. Plain data and
   pure functions only, safe to import from any client component. */

export interface NotifActor {
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface NotifLike {
  kind: string;
  subject_id: string | null;
  actor: NotifActor | null;
}

/* Icon name (from components/ui/icon) for each raven kind. */
export const NOTIF_KIND_ICON: Record<string, string> = {
  like: "heart",
  reply: "reply",
  reraven: "repost",
  follow: "user",
  tip: "coin",
  mention: "flag",
  whisper: "mail",
  referral: "banner",
  raven_reply: "raven",
  duel_answered: "swords",
  duel_won: "crown",
  call_verdict: "target",
  house: "banner",
  announcement: "bell",
};

/* The phrase that follows the actor's name. */
export const NOTIF_KIND_TEXT: Record<string, string> = {
  like: "admired your raven",
  reply: "answered your raven",
  reraven: "re-ravened your words",
  follow: "now follows your banner",
  tip: "sent you tribute",
  mention: "called your name",
  whisper: "sent you a whisper",
  referral: "joined under your banner",
  raven_reply: "the Herald has answered",
  duel_answered: "answered your duel",
  duel_won: "claimed victory in the duel",
  call_verdict: "your Call has been judged",
  house: "word from your banner",
  announcement: "a proclamation for the realm",
};

export function notifActorName(a: NotifActor | null): string {
  return a?.display_name ?? a?.handle ?? "The realm";
}

/* Where a raven carries the reader when tapped. */
export function notifHref(n: NotifLike): string {
  switch (n.kind) {
    case "follow":
    case "referral":
      return n.actor?.handle ? `/u/${n.actor.handle}` : "/home";
    case "whisper":
      return "/whispers";
    case "tip":
      return n.subject_id
        ? `/post/${n.subject_id}`
        : n.actor?.handle
          ? `/u/${n.actor.handle}`
          : "/home";
    default:
      return n.subject_id ? `/post/${n.subject_id}` : "/home";
  }
}
