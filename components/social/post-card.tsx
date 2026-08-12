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

  const vote = async (i: number) => {
    if (!authenticated) {
      window.location.assign("/signin");
      return;
    }
    if (voted) return;
    setVoted(true);
    const res = await realmFetch<{ options?: { text: string; votes: number }[] }>(
      "/api/polls",
      { method: "POST", json: { post_id: post.id, option: i } }
    );
    if (res.data?.options) setOptions(res.data.options);
  };

  if (!options.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
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
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "like", subject_type: "post", subject_id: post.id, on },
    });
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
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "bookmark", subject_id: post.id, on },
    });
  };
  const toggleRepost = async () => {
    if (!requireAuth()) return;
    const on = !reposted;
    setReposted(on);
    setReposts((n) => Math.max(0, n + (on ? 1 : -1)));
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "repost", subject_id: post.id, on },
    });
  };
  const [shared, setShared] = useState<null | "shared" | "copied" | "failed">(
    null
  );
  const share = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    const author = a.handle ? `@${a.handle}` : "a member";
    const result = await shareOrCopy(url, `A raven from ${author} on The Ravenspire`);
    setShared(result);
    window.setTimeout(() => setShared(null), 1800);
  };
  const doDelete = async () => {
    if (!requireAuth()) return;
    if (!window.confirm("Delete this raven for good?")) return;
    setRemoved(true);
    await realmFetch("/api/posts", {
      method: "DELETE",
      json: { id: post.id },
    });
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
    await realmFetch("/api/reports", {
      method: "POST",
      json: { subject_type: "post", subject_id: post.id, reason: "member_flag" },
    });
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
    await realmFetch("/api/blocks", {
      method: "POST",
      json: { profile_id: post.author_id, on: true },
    });
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
        <div className="mb-2 flex items-center gap-1.5 pl-1 text-xs text-bone-faint">
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
        <p className="mb-2 border-l-2 border-gold/30 pl-2 text-sm text-bone-mut">
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
          /* A 40px avatar with 2px of bleed on every side is a 44px target,
             without the circle itself growing into the name row beside it. */
          className="-m-0.5 shrink-0 self-start rounded-[var(--radius-full)] p-0.5 transition-opacity duration-fast ease-out-quint hover:opacity-90"
        >
          <Avatar author={a} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-sm">
              <Link
                href={a.handle ? `/u/${a.handle}` : "#"}
                className="font-semibold text-bone hover:underline"
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

          <Link href={`/post/${post.id}`} className="mt-1 block text-[15px] leading-relaxed text-bone">
            <RichBody text={post.body} />
          </Link>

          {post.call && (
            <Card
              variant="inset"
              pad="none"
              className={`mt-2 flex items-center gap-3 px-3 py-2 ${
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
              className={`mt-2 grid gap-1.5 overflow-hidden rounded-2xl ${
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
             up in the header corner. */}
          <div className="mt-2 flex items-center justify-between">
            <span
              className="flex items-center gap-1.5 px-1 py-1 text-xs text-bone-faint"
              aria-label={`${views} views`}
              title={`${views.toLocaleString()} views`}
            >
              <Icon name="eye" className="h-[18px] w-[18px]" />
              <span className="tnum">{views.toLocaleString()}</span>
            </span>
            <StreamAction
              icon="reply"
              label="Reply"
              count={post.reply_count}
              render={<Link href={`/post/${post.id}`} />}
            />
            <StreamAction
              icon="repost"
              count={reposts}
              active={reposted}
              label="Re-raven"
              onClick={toggleRepost}
            />
            <StreamAction
              icon="heart"
              count={likes}
              active={liked}
              label="Like"
              iconClassName={likePop ? "action-pop" : ""}
              onClick={toggleLike}
            />
            <StreamAction
              icon="coin"
              active={tipSent || tipOpen}
              label="Tip"
              onClick={() => {
                if (!requireAuth()) return;
                setTipOpen(true);
              }}
            />
            <StreamAction
              icon="share"
              active={shared !== null}
              label="Share"
              onClick={share}
            />
          </div>

          {/* Section 11: an optimistic change announces through a polite live
              region. Both of these appear after the fact with no focus move,
              so a screen reader would otherwise never learn the tap landed. */}
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
