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
  follow_trade: "coin",
  follow_call: "target",
  watch_alert: "signal",
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
  follow_trade: "made a move in the markets",
  follow_call: "sealed a new Call",
  /* No actor: this fires from the member's own armed alert, not from another
     member's action, so notifActorName falls back to "The realm" and this
     phrase is written to still read cleanly after it. The real coin and
     percent move live in the body text, shown as a second line. */
  watch_alert: "flagged a move on a coin you're watching",
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
    case "follow_trade":
      // subject_id carries the traded coin's contract address.
      return n.subject_id
        ? `/coin/${n.subject_id}`
        : n.actor?.handle
          ? `/u/${n.actor.handle}`
          : "/home";
    case "watch_alert":
      // subject_id carries the alerted coin's contract address, same shape
      // as follow_trade above, so a tap lands straight on its coin page.
      return n.subject_id ? `/coin/${n.subject_id}` : "/home";
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
