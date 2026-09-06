"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/social/avatar";
import { RichBody } from "@/components/social/rich-body";
import { PriceCard } from "@/components/social/price-card";
import { CallChart } from "@/components/social/call-chart";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { StreamAction, StreamCard } from "@/components/stream/stream-shell";
import { useDossier } from "@/components/social/user-dossier";
import { TipDialog } from "@/components/tip/tip-dialog";
import { shareOrCopy } from "@/lib/share";
import { realmFetch } from "@/lib/auth/api";
import { muteMember, unmuteMember } from "@/lib/social/mutes";
import { useViewerId } from "@/lib/social/use-viewer";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { timeAgo, TIER_NAMES, type Post } from "@/lib/social/types";

/* A raven, on the Stream card chassis.

   Section 5 of the design system: one chassis, many bodies. The outer shell is
   identical for every card in the product and the type is encoded by the 2px
   accent rail alone, never by changing the shape, radius or width. Here that
   means gold for a member's raven, ember for a Call, steel for the Herald,
   which is the realm's system voice and must read quieter than a person. */

/* A whisper of haptic feedback on a positive action, where the device (and
   the browser) supports it. A no-op everywhere else, never throws. */
function buzz(ms = 12) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    /* vibration unsupported or blocked; ignore */
  }
}

function PollBlock({ post }: { post: Post }) {
  const { authenticated } = useRealmAuth();
  const [options, setOptions] = useState(post.poll?.options ?? []);
  const [voted, setVoted] = useState(false);
  const total = options.reduce((s, o) => s + o.votes, 0);

  const [voteError, setVoteError] = useState<string | null>(null);

  const vote = async (i: number) => {
    if (!authenticated) {
      window.location.assign("/signin");
      return;
    }
    if (voted) return;
    setVoted(true);
    setVoteError(null);
    const res = await realmFetch<{ options?: { text: string; votes: number }[] }>(
      "/api/polls",
      { method: "POST", json: { post_id: post.id, option: i } }
    );
    if (res.ok && res.data?.options) {
      setOptions(res.data.options);
      return;
    }
    /* Measured with the vote route answering 500: the first tap sent one
       request, and the tap after it sent none at all. `voted` had already
       latched, so the poll was closed to a member whose vote was never
       recorded, and nothing on screen said so. Unlatching is the fix; the
       tally never moved, so there is nothing else to roll back. */
    setVoted(false);
    setVoteError("That vote did not reach the realm. Try again.");
  };

  if (!options.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {options.map((o, i) => {
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        return (
          <Button
            key={i}
            variant="glass"
            size="lg"
            block
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              void vote(i);
            }}
            pad="sm"
            className="justify-between overflow-hidden text-xs font-medium text-bone-mut"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-gold/12"
              style={{ width: `${pct}%` }}
            />
            <span className="relative min-w-0 truncate">{o.text}</span>
            {total > 0 ? (
              <span className="tnum relative shrink-0 text-bone-faint">
                {pct}%
              </span>
            ) : null}
          </Button>
        );
      })}
      <p className="tnum px-1 text-[10px] text-bone-faint">
        {total} {total === 1 ? "voice" : "voices"}
      </p>
      {voteError && (
        <p role="status" className="px-1 text-[10px] text-state-danger">
          {voteError}
        </p>
      )}
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { authenticated } = useRealmAuth();
  const viewerId = useViewerId();
  const dossier = useDossier();
  const isOwn = viewerId !== null && viewerId === post.author_id;
  const [removed, setRemoved] = useState(false);
  /* Seed reaction state from the per-viewer flags the feed/profile query
     resolved server-side, so a returning member sees their real like / repost /
     bookmark state and cannot re-like or re-repost the same raven. */
  const [liked, setLiked] = useState(post.viewer_liked ?? false);
  const [likes, setLikes] = useState(post.like_count);
  const [reposted, setReposted] = useState(post.viewer_reposted ?? false);
  const [reposts, setReposts] = useState(post.repost_count);
  const [bookmarked, setBookmarked] = useState(post.viewer_bookmarked ?? false);
  /* Tactile feedback: a pop on the icon when an action toggles on, and a heart
     that blooms over the raven when it is liked. */
  const [likePop, setLikePop] = useState(false);
  const [bmPop, setBmPop] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [reported, setReported] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  /* Live view count. An impression is recorded the first time this raven
     scrolls into view, as it is on X, not only when its full page is
     opened, so the tally reflects reality. The server dedupes one view per
     member per day, and we only bump the visible number when it actually
     counted, so the figure stays honest. */
  const [views, setViews] = useState(post.view_count);
  const cardRef = useRef<HTMLElement | null>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || viewedRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.some((e) => e.isIntersecting);
        if (!seen || viewedRef.current) return;
        viewedRef.current = true;
        io.disconnect();
        void realmFetch<{ counted?: boolean }>("/api/views", {
          method: "POST",
          json: { post_id: post.id },
        }).then((res) => {
          if (res.ok && res.data?.counted) setViews((v) => v + 1);
        });
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [post.id]);
  /* Why this card is hidden, so the placeholder can offer the right undo. */
  const [hidden, setHidden] = useState<null | "mute" | "block">(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipSent, setTipSent] = useState(false);

  const requireAuth = () => {
    if (!authenticated) {
      window.location.assign("/signin");
      return false;
    }
    return true;
  };

  /* An optimistic control that cannot take itself back is a control that
     lies. Every one of these flipped instantly and then kept the new state
     for good when the server refused: measured with every write answering
     500, the like count went 13 to 14 and stayed, re-raven went 3 to 4 and
     stayed, and the bookmark stayed gold. The member is then looking at a
     tally the realm does not have.
     `refused` carries the one sentence that says so, announced politely
     because the change happens after the fact with no focus move. */
  const [refused, setRefused] = useState<string | null>(null);
  const refuse = (what: string) => {
    setRefused(what);
    window.setTimeout(() => setRefused(null), 2600);
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    const on = !liked;
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    if (on) {
      buzz();
      setLikePop(true);
      setHeartBurst(true);
      window.setTimeout(() => setLikePop(false), 360);
      window.setTimeout(() => setHeartBurst(false), 720);
    }
    const res = await realmFetch("/api/social", {
      method: "POST",
      json: { action: "like", subject_type: "post", subject_id: post.id, on },
    });
    if (!res.ok) {
      setLiked(!on);
      setLikes((n) => n - (on ? 1 : -1));
      refuse(on ? "That like did not reach the realm." : "That could not be undone.");
    }
  };
  const toggleBookmark = async () => {
    if (!requireAuth()) return;
    const on = !bookmarked;
    setBookmarked(on);
    if (on) {
      buzz();
      setBmPop(true);
      window.setTimeout(() => setBmPop(false), 360);
    }
    const res = await realmFetch("/api/social", {
      method: "POST",
      json: { action: "bookmark", subject_id: post.id, on },
    });
    if (!res.ok) {
      setBookmarked(!on);
      refuse("That bookmark did not reach the realm.");
    }
  };
  const toggleRepost = async () => {
    if (!requireAuth()) return;
    const on = !reposted;
    setReposted(on);
    setReposts((n) => Math.max(0, n + (on ? 1 : -1)));
    const res = await realmFetch("/api/social", {
      method: "POST",
      json: { action: "repost", subject_id: post.id, on },
    });
    if (!res.ok) {
      setReposted(!on);
      setReposts((n) => Math.max(0, n - (on ? 1 : -1)));
      refuse("That re-raven did not reach the realm.");
    }
  };
  const [shared, setShared] = useState<null | "shared" | "copied" | "failed">(
    null
  );
  const share = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    const author = a.handle ? `@${a.handle}` : "a member";
    const result = await shareOrCopy(url, `A raven from ${author} on The Ravenspire`);
    /* A dismissed sheet is a choice, not an outcome: the label stays as it was
       rather than flashing "Shared" at somebody who decided not to. */
    if (result === "dismissed") return;
    setShared(result);
    window.setTimeout(() => setShared(null), 1800);
  };
  const doDelete = async () => {
    if (!requireAuth()) return;
    if (!window.confirm("Delete this raven for good?")) return;
    setRemoved(true);
    const res = await realmFetch("/api/posts", {
      method: "DELETE",
      json: { id: post.id },
    });
    /* A raven that vanished from the timeline but still exists on the server
       is the worst of these: the member believes it is gone and it is not. */
    if (!res.ok) {
      setRemoved(false);
      refuse("The realm would not delete that raven. It is still there.");
    }
  };
  /* Copy a shareable link to this raven. Feedback lives in the menu label. */
  const doCopyLink = () => {
    const url = `${window.location.origin}/post/${post.id}`;
    void shareOrCopy(url).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1600);
    });
  };
  const doReport = async () => {
    if (!requireAuth()) return;
    if (reported) return;
    setReported(true);
    const res = await realmFetch("/api/reports", {
      method: "POST",
      json: { subject_type: "post", subject_id: post.id, reason: "member_flag" },
    });
    /* The menu item disables itself on "Reported", so a swallowed failure
       both lies and locks the member out of trying again. */
    if (!res.ok) {
      setReported(false);
      refuse("That report did not reach the stewards. Try again.");
    }
  };
  const doMute = async () => {
    if (!requireAuth()) return;
    setHidden("mute");
    const ok = await muteMember(post.author_id);
    /* Server refused the silence: bring the raven back so nothing is lost. */
    if (!ok) setHidden(null);
  };
  const doBlock = async () => {
    if (!requireAuth()) return;
    setHidden("block");
    const res = await realmFetch("/api/blocks", {
      method: "POST",
      json: { profile_id: post.author_id, on: true },
    });
    /* Mute already brought the raven back when the server refused. Block did
       not, so a failed banishment read as a successful one. */
    if (!res.ok) {
      setHidden(null);
      refuse("The realm would not banish them. Try again.");
    }
  };
  const undoHide = async () => {
    if (undoBusy) return;
    setUndoBusy(true);
    const ok =
      hidden === "block"
        ? (
            await realmFetch("/api/blocks", {
              method: "POST",
              json: { profile_id: post.author_id, on: false },
            })
          ).ok
        : await unmuteMember(post.author_id);
    setUndoBusy(false);
    if (ok) setHidden(null);
  };
  const a = post.author;
  const firstTag = post.cashtags[0];
  /* Type by rail, never by shape. A Call is ember, the Herald is the realm's
     own voice and takes the quieter steel, everything else is a member's gold. */
  const rail = post.call ? "ember" : a.is_agent ? "steel" : "gold";

  if (removed) return null;

  if (hidden) {
    const who = a.handle ? `@${a.handle}` : "this member";
    return (
      <StreamCard rail="steel" pad="sm">
        <div className="flex items-center gap-3 pl-2 text-xs text-bone-faint">
          <Icon
            name={hidden === "block" ? "shield" : "bell"}
            className="h-4 w-4 shrink-0"
          />
          <span className="min-w-0 flex-1">
            {hidden === "block"
              ? `You have banished ${who} from your sight.`
              : `You have silenced ${who}. Their ravens will not reach you.`}
          </span>
          <Button
            variant="glass"
            size="sm"
            disabled={undoBusy}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              void undoHide();
            }}
            className="shrink-0 text-gold"
          >
            Undo
          </Button>
        </div>
      </StreamCard>
    );
  }

  return (
    <StreamCard
      rail={rail}
      interactive
      /* One rung tighter than the Stream default, `sm` rather than `md`. This
         card carries the founder's density pass for the Ravenry specifically:
         "comfortable everywhere" is still the right call for a Stream that
         reads once, but the timeline reads dozens of times a session now that
         the product feels mature, and 14px/16px of air on every one of them
         was the loose feeling the founder named. The 44px controls inside are
         untouched; only the plate around them tightened. */
      pad="sm"
      render={<article ref={cardRef} />}
    >
      {heartBurst && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <Icon
            name="heart"
            className="heart-burst h-20 w-20 text-gold drop-shadow-[0_0_16px_rgba(217,176,64,0.6)]"
          />
        </span>
      )}
      {post.repostedBy && (
        <div className="mb-1.5 flex items-center gap-1.5 pl-1 text-xs text-bone-faint">
          <Icon name="repost" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Re-ravened by{" "}
            {post.repostedBy.handle
              ? `@${post.repostedBy.handle}`
              : (post.repostedBy.display_name ?? "a member")}
          </span>
        </div>
      )}
      {post.quote && (
        <p className="mb-1.5 border-l-2 border-gold/30 pl-2 text-sm text-bone-mut">
          {post.quote}
        </p>
      )}
      <div className="flex gap-3">
        {/* Tapping the avatar opens the member's dossier without leaving the
            timeline; the name below still links through to their Keep. */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dossier.open(post.author_id, a.handle);
          }}
          aria-label={`Open ${a.handle ? `@${a.handle}` : "member"} dossier`}
          /* A 36px avatar with 4px of bleed on every side is a 44px target,
             without the circle itself growing into the name row beside it.
             Down from 40px as part of the same density pass as the card's
             own padding; the bleed grew from 2px to 4px so the touch floor
             still lands exactly on 44 rather than drifting under it. */
          className="touch:min-h-11 touch:min-w-11 -m-1 shrink-0 self-start rounded-[var(--radius-full)] p-1 transition-opacity duration-fast ease-out-quint hover:opacity-90"
        >
          <Avatar author={a} size={36} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-sm">
              {/* The primary tap target on every raven in the feed, and it
                  measured 175x20. The 44px it needs is already in this row,
                  spent by the bookmark and overflow controls in the corner
                  opposite, so the link takes the height rather than the card
                  growing to give it one. */}
              <Link
                href={a.handle ? `/u/${a.handle}` : "#"}
                className="inline-flex items-center font-semibold text-bone hover:underline touch:min-h-11"
              >
                {a.display_name ?? a.handle ?? "A stranger"}
              </Link>
              {a.is_agent && <Badge variant="gold">Herald</Badge>}
              {a.handle && <span className="text-bone-faint">@{a.handle}</span>}
              <span className="text-bone-faint">·</span>
              <span className="text-xs text-bone-faint">
                {timeAgo(post.created_at)}
              </span>
            </div>
            <div className="relative flex shrink-0 items-center gap-1">
              {a.tier && !a.is_agent && (
                <span className="hidden text-[10px] uppercase tracking-[0.16em] text-bone-faint sm:inline">
                  {TIER_NAMES[a.tier] ?? a.tier}
                </span>
              )}
              <StreamAction
                icon="bookmark"
                label={bookmarked ? "Remove bookmark" : "Bookmark"}
                active={bookmarked}
                iconClassName={bmPop ? "action-pop" : ""}
                onClick={() => void toggleBookmark()}
              />
              <Menu
                trigger={<IconButton icon="dots" label="More" size="md" className="h-11 w-11" />}
              >
                <MenuItem icon="share" onClick={doCopyLink}>
                  {linkCopied ? "Link copied" : "Copy link"}
                </MenuItem>
                {isOwn ? (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      icon="flag"
                      tone="danger"
                      onClick={() => void doDelete()}
                    >
                      Delete raven
                    </MenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem icon="bell" onClick={() => void doMute()}>
                      Mute
                    </MenuItem>
                    <MenuItem icon="shield" onClick={() => void doBlock()}>
                      Block
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem
                      icon="flag"
                      tone="danger"
                      disabled={reported}
                      onClick={() => void doReport()}
                    >
                      {reported ? "Reported" : "Report"}
                    </MenuItem>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {/* 13px at 1.4 line height, down another step from the 14px at
              `leading-[1.5]` (21px lines) this already tightened once from
              15px at `leading-relaxed`. 13/1.4 is an 18px line, so a three
              line raven gives back about 9px more, and it is the second half
              of the same phone-read pass as the card's own padding and the
              avatar: a raven is short by design, so the saving is small on
              any one post and real across the forty that fit a screen. */}
          <Link href={`/post/${post.id}`} className="mt-1 block text-[13px] leading-[1.4] text-bone">
            <RichBody text={post.body} />
          </Link>

          {post.call && (
            <Card
              variant="inset"
              pad="none"
              className={`mt-1.5 flex items-center gap-3 px-3 py-2 ${
                post.call.stance === "up"
                  ? "border-chart-up/40"
                  : "border-chart-down/40"
              }`}
            >
              <Icon
                name="target"
                className={`h-4 w-4 shrink-0 ${
                  post.call.stance === "up"
                    ? "text-chart-up"
                    : "text-chart-down"
                }`}
              />
              <p className="min-w-0 text-xs text-bone-mut">
                <span className="font-bold text-bone">CALL</span> · $
                {post.call.token} {post.call.stance === "up" ? "rises" : "falls"}{" "}
                within {post.call.timeframe} · sealed at ${post.call.entry_price}
              </p>
              <span className="ml-auto shrink-0">
                <Badge
                  variant={
                    post.call.verdict === "hit"
                      ? "gold"
                      : post.call.verdict === "miss"
                        ? "danger"
                        : "default"
                  }
                >
                  {post.call.verdict}
                </Badge>
              </span>
            </Card>
          )}

          {post.call && (
            <CallChart
              symbol={post.call.token}
              entryPrice={post.call.entry_price}
              stance={post.call.stance}
            />
          )}

          {post.media.length > 0 && (
            <div
              className={`mt-1.5 grid gap-1.5 overflow-hidden rounded-2xl ${
                post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}
            >
              {post.media.slice(0, 4).map((m, i) =>
                m.type === "video" ? (
                  <video
                    key={i}
                    src={m.url}
                    controls
                    playsInline
                    muted
                    className="max-h-96 w-full rounded-xl border border-steel-line object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={m.url}
                    alt=""
                    loading="lazy"
                    className={`w-full rounded-xl border border-steel-line object-cover ${
                      post.media.length === 1 ? "max-h-96" : "aspect-square"
                    }`}
                  />
                )
              )}
            </div>
          )}

          {post.poll && <PollBlock post={post} />}

          {firstTag && !post.call && <PriceCard symbol={firstTag} />}

          {/* Constant-width action bar: views on the left, the actions spread
             evenly to the right so every raven reads the same. Bookmark lives
             up in the header corner.

             The arithmetic of this row is why it reaches back into the avatar
             gutter below `sm`. Five controls each hold a 44px width floor, so
             they cannot go below 220 together, and the views readout is 74:
             294 needed against a content column that has less than that on
             the narrowest phones this product supports, so the row reclaims
             the gutter under the avatar rather than a control giving up its
             floor. That gutter is 48px exactly, the avatar's 36px margin box
             plus the 12px gap, so the bar's leading edge still lands on the
             card's own content edge rather than a few pixels adrift of it.
             The avatar dropped from 40 to 36 in this same density pass, which
             shrank the gutter by 4px too, so `-ml-13` became `-ml-12`.

             `shrink-0` on the glyphs is the other half, and it was the worse
             half: at 390 the flex squeeze had shrunk every count-bearing icon
             to exactly 0px. Reply, re-raven and like rendered as bare numbers
             with no icon at all, while the class list said 18px. The glyphs
             are 16px now, one step down the same scale as everything else in
             this pass, and `shrink-0` still guards them from repeating that
             failure. */}
          <div className="mt-1.5 flex items-center justify-between max-sm:-ml-12">
            <span
              className="flex shrink-0 items-center gap-1.5 px-1 py-1 text-xs text-bone-faint"
              aria-label={`${views} views`}
              title={`${views.toLocaleString()} views`}
            >
              <Icon name="eye" className="h-4 w-4 shrink-0" />
              <span className="tnum">{views.toLocaleString()}</span>
            </span>
            <StreamAction
              icon="reply"
              label="Reply"
              count={post.reply_count}
              iconClassName="shrink-0"
              render={<Link href={`/post/${post.id}`} />}
            />
            <StreamAction
              icon="repost"
              count={reposts}
              active={reposted}
              label="Re-raven"
              iconClassName="shrink-0"
              onClick={toggleRepost}
            />
            <StreamAction
              icon="heart"
              count={likes}
              active={liked}
              label="Like"
              iconClassName={likePop ? "action-pop shrink-0" : "shrink-0"}
              onClick={toggleLike}
            />
            <StreamAction
              icon="coin"
              active={tipSent || tipOpen}
              label="Tip"
              iconClassName="shrink-0"
              onClick={() => {
                if (!requireAuth()) return;
                setTipOpen(true);
              }}
            />
            <StreamAction
              icon="share"
              active={shared !== null}
              label="Share"
              iconClassName="shrink-0"
              onClick={share}
            />
          </div>

          {/* Section 11: an optimistic change announces through a polite live
              region. Both of these appear after the fact with no focus move,
              so a screen reader would otherwise never learn the tap landed. */}
          {refused && (
            <p
              role="status"
              className="mt-1 flex items-center gap-1.5 pl-1 text-xs text-state-danger"
            >
              <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
              {refused}
            </p>
          )}
          {tipSent && (
            <p
              role="status"
              className="mt-1 flex items-center gap-1.5 pl-1 text-xs text-gold"
            >
              <Icon name="coin" className="h-3.5 w-3.5" />
              Tribute sent
            </p>
          )}
          {shared && (
            <p
              role="status"
              className={`mt-1 flex items-center gap-1.5 pl-1 text-xs ${shared === "failed" ? "text-state-danger" : "text-gold"}`}
            >
              <Icon name="share" className="h-3.5 w-3.5" />
              {shared === "shared"
                ? "Shared"
                : shared === "copied"
                  ? "Link copied"
                  : "Could not share, try again"}
            </p>
          )}
        </div>
      </div>

      {tipOpen && (
        <TipDialog
          recipientId={post.author_id}
          recipientName={
            a.display_name ?? (a.handle ? `@${a.handle}` : "this member")
          }
          subjectType="post"
          subjectId={post.id}
          onClose={() => setTipOpen(false)}
          onSent={() => setTipSent(true)}
        />
      )}
    </StreamCard>
  );
}
