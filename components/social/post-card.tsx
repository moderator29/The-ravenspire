"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/social/avatar";
import { RichBody } from "@/components/social/rich-body";
import { PriceCard } from "@/components/social/price-card";
import { CallChart } from "@/components/social/call-chart";
import { Icon } from "@/components/ui/icon";
import { TipDialog } from "@/components/tip/tip-dialog";
import { realmFetch } from "@/lib/auth/api";
import { muteMember, unmuteMember } from "@/lib/social/mutes";
import { useViewerId } from "@/lib/social/use-viewer";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import { timeAgo, TIER_NAMES, type Post } from "@/lib/social/types";

function PollBlock({ post }: { post: Post }) {
  const { authenticated } = useRealmAuth();
  const [options, setOptions] = useState(post.poll?.options ?? []);
  const [voted, setVoted] = useState(false);
  const total = options.reduce((s, o) => s + o.votes, 0);

  const vote = async (i: number) => {
    if (!authenticated) {
      window.location.href = "/signin";
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
          <button
            key={i}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void vote(i);
            }}
            className="hairline relative overflow-hidden rounded-xl bg-void px-3 py-2 text-left text-xs text-bone-mut transition hover:border-gold/40"
          >
            <span
              className="absolute inset-y-0 left-0 bg-gold/12"
              style={{ width: `${pct}%` }}
            />
            <span className="relative flex justify-between gap-2">
              <span className="truncate">{o.text}</span>
              {total > 0 && <span className="tnum shrink-0 text-bone-faint">{pct}%</span>}
            </span>
          </button>
        );
      })}
      <p className="tnum px-1 text-[10px] text-bone-faint">
        {total} {total === 1 ? "voice" : "voices"}
      </p>
    </div>
  );
}

function ActionButton({
  icon,
  count,
  active,
  activeClass,
  label,
  onClick,
}: {
  icon: string;
  count?: number;
  active?: boolean;
  activeClass?: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={label}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm transition hover:bg-panel ${
        active ? (activeClass ?? "text-gold") : "text-bone-faint hover:text-bone-mut"
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {count !== undefined && count > 0 && (
        <span className="tnum text-xs">{count}</span>
      )}
    </button>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { authenticated } = useRealmAuth();
  const viewerId = useViewerId();
  const isOwn = viewerId !== null && viewerId === post.author_id;
  const [removed, setRemoved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.like_count);
  const [reposted, setReposted] = useState(false);
  const [reposts, setReposts] = useState(post.repost_count);
  const [bookmarked, setBookmarked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reported, setReported] = useState(false);
  /* Why this card is hidden, so the placeholder can offer the right undo. */
  const [hidden, setHidden] = useState<null | "mute" | "block">(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipSent, setTipSent] = useState(false);

  const requireAuth = () => {
    if (!authenticated) {
      window.location.href = "/signin";
      return false;
    }
    return true;
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    const on = !liked;
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "like", subject_type: "post", subject_id: post.id, on },
    });
  };
  const toggleBookmark = async () => {
    if (!requireAuth()) return;
    const on = !bookmarked;
    setBookmarked(on);
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "bookmark", subject_id: post.id, on },
    });
  };
  const doRepost = async () => {
    if (!requireAuth() || reposted) return;
    setReposted(true);
    setReposts((n) => n + 1);
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "repost", subject_id: post.id },
    });
  };
  const share = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* no clipboard, no drama */
    }
  };
  const doDelete = async () => {
    if (!requireAuth()) return;
    setMenuOpen(false);
    if (!window.confirm("Delete this raven for good?")) return;
    setRemoved(true);
    await realmFetch("/api/posts", {
      method: "DELETE",
      json: { id: post.id },
    });
  };
  const doReport = async () => {
    if (!requireAuth()) return;
    setMenuOpen(false);
    if (reported) return;
    setReported(true);
    await realmFetch("/api/reports", {
      method: "POST",
      json: { subject_type: "post", subject_id: post.id, reason: "member_flag" },
    });
  };
  const doMute = async () => {
    if (!requireAuth()) return;
    setMenuOpen(false);
    setHidden("mute");
    const ok = await muteMember(post.author_id);
    /* Server refused the silence: bring the raven back so nothing is lost. */
    if (!ok) setHidden(null);
  };
  const doBlock = async () => {
    if (!requireAuth()) return;
    setMenuOpen(false);
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

  if (removed) return null;

  if (hidden) {
    const who = a.handle ? `@${a.handle}` : "this member";
    return (
      <article className="glass glass-sm flex items-center gap-3 p-4 text-xs text-bone-faint">
        <Icon
          name={hidden === "block" ? "shield" : "bell"}
          className="h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          {hidden === "block"
            ? `You have banished ${who} from your sight.`
            : `You have silenced ${who}. Their ravens will not reach you.`}
        </span>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void undoHide();
          }}
          disabled={undoBusy}
          className="btn-glass shrink-0 rounded-full px-3 py-1 text-xs text-gold transition hover:text-gold-bright disabled:opacity-50"
        >
          Undo
        </button>
      </article>
    );
  }

  return (
    <article className="glass glass-sm glass-hover p-4">
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
        <Link href={a.handle ? `/u/${a.handle}` : "#"}>
          <Avatar author={a} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm">
            <Link
              href={a.handle ? `/u/${a.handle}` : "#"}
              className="font-semibold text-bone hover:underline"
            >
              {a.display_name ?? a.handle ?? "A stranger"}
            </Link>
            {a.is_agent && (
              <span className="rounded-full border border-gold/40 px-1.5 text-[9px] font-bold uppercase tracking-wider text-gold">
                Herald
              </span>
            )}
            {a.handle && (
              <span className="text-bone-faint">@{a.handle}</span>
            )}
            <span className="text-bone-faint">·</span>
            <span className="text-xs text-bone-faint">
              {timeAgo(post.created_at)}
            </span>
            <div className="relative ml-auto flex items-center gap-1.5">
              {a.tier && !a.is_agent && (
                <span className="hidden text-[10px] uppercase tracking-[0.16em] text-bone-faint sm:inline">
                  {TIER_NAMES[a.tier] ?? a.tier}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void toggleBookmark();
                }}
                aria-label="Bookmark"
                className={`flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-panel ${
                  bookmarked ? "text-gold" : "text-bone-faint hover:text-bone-mut"
                }`}
              >
                <Icon name="bookmark" className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                aria-label="More"
                className="flex h-7 w-7 items-center justify-center rounded-full text-bone-faint transition hover:bg-panel hover:text-bone-mut"
              >
                <Icon name="dots" className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                    }}
                    className="fixed inset-0 z-20 cursor-default"
                  />
                  <div className="glass glass-sm absolute right-0 top-8 z-30 w-40 p-1">
                    {isOwn ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void doDelete();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-ember-deep transition hover:bg-panel"
                      >
                        <Icon name="flag" className="h-3.5 w-3.5" />
                        Delete raven
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void doReport();
                          }}
                          disabled={reported}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel disabled:opacity-50"
                        >
                          <Icon name="flag" className="h-3.5 w-3.5" />
                          {reported ? "Reported" : "Report"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void doMute();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel"
                        >
                          <Icon name="bell" className="h-3.5 w-3.5" />
                          Mute
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void doBlock();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel"
                        >
                          <Icon name="shield" className="h-3.5 w-3.5" />
                          Block
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <Link href={`/post/${post.id}`} className="mt-1 block text-[15px] leading-relaxed text-bone">
            <RichBody text={post.body} />
          </Link>

          {post.call && (
            <div
              className={`glass-sm mt-2 flex items-center gap-3 rounded-xl border px-3 py-2 ${
                post.call.stance === "up"
                  ? "border-gold/40 bg-panel-warm"
                  : "border-ember-deep/40 bg-panel"
              }`}
            >
              <Icon
                name="target"
                className={`h-4 w-4 ${post.call.stance === "up" ? "text-gold" : "text-ember-deep"}`}
              />
              <p className="text-xs text-bone-mut">
                <span className="font-bold text-bone">CALL</span> · $
                {post.call.token} {post.call.stance === "up" ? "rises" : "falls"}{" "}
                within {post.call.timeframe} · sealed at ${post.call.entry_price}
              </p>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  post.call.verdict === "hit"
                    ? "bg-gold/15 text-gold-bright"
                    : post.call.verdict === "miss"
                      ? "bg-ember-deep/15 text-ember-deep"
                      : "bg-steel-deep text-bone-faint"
                }`}
              >
                {post.call.verdict}
              </span>
            </div>
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
              aria-label={`${post.view_count} views`}
              title={`${post.view_count.toLocaleString()} views`}
            >
              <Icon name="eye" className="h-[18px] w-[18px]" />
              <span className="tnum">{post.view_count.toLocaleString()}</span>
            </span>
            <Link
              href={`/post/${post.id}`}
              aria-label="Reply"
              className="flex items-center gap-1.5 rounded-full px-2 py-2 text-sm text-bone-faint transition hover:bg-panel hover:text-bone-mut"
            >
              <Icon name="reply" className="h-[18px] w-[18px]" />
              {post.reply_count > 0 && (
                <span className="tnum text-xs">{post.reply_count}</span>
              )}
            </Link>
            <ActionButton
              icon="repost"
              count={reposts}
              active={reposted}
              label="Re-raven"
              onClick={doRepost}
            />
            <ActionButton
              icon="heart"
              count={likes}
              active={liked}
              activeClass="text-ember"
              label="Like"
              onClick={toggleLike}
            />
            <ActionButton
              icon="coin"
              active={tipSent || tipOpen}
              label="Tip"
              onClick={() => {
                if (!requireAuth()) return;
                setTipOpen(true);
              }}
            />
            <ActionButton icon="share" label="Copy link" onClick={share} />
          </div>

          {tipSent && (
            <p className="mt-1 flex items-center gap-1.5 pl-1 text-xs text-gold">
              <Icon name="coin" className="h-3.5 w-3.5" />
              Tribute sent
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
    </article>
  );
}
