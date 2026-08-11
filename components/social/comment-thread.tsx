"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { RichBody } from "@/components/social/rich-body";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Skeleton, useDelayedLoading } from "@/components/ui/skeleton";
import { StreamAction } from "@/components/stream/stream-shell";
import { TipDialog } from "@/components/tip/tip-dialog";
import { timeAgo, type Author } from "@/lib/social/types";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

/* A comment as the thread needs it: the base fields plus the author id (to tip
   and to link a profile) and the reader's own like/bookmark state. Kept local
   so the shared Comment type stays untouched. */
interface ThreadComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  author_id: string;
  author: Author;
  liked?: boolean;
  bookmarked?: boolean;
}

/* One comment's full action bar: reply, like, bookmark, tip, share, like a
   real network. Threading and every verb work at any depth. */
interface RowApi {
  authenticated: boolean;
  replyingTo: string | null;
  replyBusy: boolean;
  onToggleLike: (c: ThreadComment) => void;
  onToggleBookmark: (c: ThreadComment) => void;
  onShare: (c: ThreadComment) => void;
  onStartReply: (id: string | null) => void;
  onSubmitReply: (parentId: string, text: string) => void;
  onTip: (c: ThreadComment) => void;
  copiedId: string | null;
}

function ReplyBox({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <Card pad="sm" className="mt-2 flex items-end gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 600))}
        placeholder="Reply in this thread... (@raven answers when called)"
        aria-label="Your reply"
        rows={2}
        autoFocus
        className="min-w-0 flex-1 resize-none bg-transparent text-sm text-bone placeholder-bone-faint outline-none"
      />
      <div className="flex shrink-0 flex-col items-stretch gap-1">
        <Button
          variant="gold"
          size="md"
          onClick={() => text.trim() && onSubmit(text.trim())}
          loading={busy}
          disabled={busy || !text.trim()}
        >
          {busy ? null : <Icon name="send" className="h-3.5 w-3.5" />}
          Reply
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

function CommentNode({
  c,
  all,
  depth,
  api,
}: {
  c: ThreadComment;
  all: ThreadComment[];
  depth: number;
  api: RowApi;
}) {
  const kids = all.filter((x) => x.parent_id === c.id);
  /* Indent nested replies, but cap the visual depth so a deep chain does not
     march off the right edge on a phone. */
  const indented = depth > 0;

  return (
    <div
      className={
        indented ? "ml-4 border-l border-steel-line/60 pl-3 sm:ml-8" : ""
      }
    >
      <div className="flex gap-2.5 py-2.5">
        <Link
          href={c.author.handle ? `/u/${c.author.handle}` : "#"}
          className="shrink-0 self-start rounded-[var(--radius-full)]"
        >
          <Avatar author={c.author} size={30} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
            <Link
              href={c.author.handle ? `/u/${c.author.handle}` : "#"}
              className="font-semibold text-bone hover:underline"
            >
              {c.author.display_name ?? c.author.handle ?? "A stranger"}
            </Link>
            {c.author.is_agent && <Badge variant="gold">Herald</Badge>}
            <span className="text-bone-faint">{timeAgo(c.created_at)}</span>
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-bone">
            <RichBody text={c.body} />
          </p>

          <div className="-ml-2 mt-0.5 flex flex-wrap items-center gap-0.5">
            <StreamAction
              icon="reply"
              label="Reply"
              onClick={() =>
                api.onStartReply(api.replyingTo === c.id ? null : c.id)
              }
            />
            <StreamAction
              icon="heart"
              label="Like"
              count={c.like_count}
              active={c.liked}
              tone="ember"
              onClick={() => api.onToggleLike(c)}
            />
            <StreamAction
              icon="bookmark"
              label={c.bookmarked ? "Remove bookmark" : "Bookmark"}
              active={c.bookmarked}
              onClick={() => api.onToggleBookmark(c)}
            />
            <StreamAction icon="coin" label="Tip" onClick={() => api.onTip(c)} />
            <StreamAction
              icon="share"
              label="Copy link"
              active={api.copiedId === c.id}
              onClick={() => api.onShare(c)}
            />
          </div>

          {api.replyingTo === c.id && (
            <ReplyBox
              busy={api.replyBusy}
              onCancel={() => api.onStartReply(null)}
              onSubmit={(text) => api.onSubmitReply(c.id, text)}
            />
          )}
        </div>
      </div>
      {kids.map((child) => (
        <CommentNode key={child.id} c={child} all={all} depth={depth + 1} api={api} />
      ))}
    </div>
  );
}

/* A skeleton shaped like a comment: avatar, name line, one line of body. */
function CommentSkeleton() {
  return (
    <div className="flex gap-2.5 py-2.5" aria-hidden>
      <Skeleton radius="full" className="h-[30px] w-[30px] shrink-0" />
      <div className="min-w-0 flex-1">
        <Skeleton radius="sm" className="h-3 w-32" />
        <Skeleton radius="sm" className="mt-2 h-3.5 w-4/5" />
      </div>
    </div>
  );
}

export function CommentThread({ postId }: { postId: string }) {
  const { authenticated } = useRealmAuth();
  const [comments, setComments] = useState<ThreadComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ThreadComment | null>(null);

  const load = useCallback(async () => {
    const res = await realmFetch<{ comments: ThreadComment[] }>(
      `/api/comments?post_id=${encodeURIComponent(postId)}`
    );
    setComments(res.data?.comments ?? []);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const requireAuth = useCallback(() => {
    if (!authenticated) {
      window.location.href = "/signin";
      return false;
    }
    return true;
  }, [authenticated]);

  const patch = useCallback(
    (id: string, next: Partial<ThreadComment>) =>
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...next } : c))
      ),
    []
  );

  const send = async () => {
    if (!draft.trim() || busy) return;
    if (!requireAuth()) return;
    setBusy(true);
    setError(null);
    const res = await realmFetch<{ error?: string }>("/api/comments", {
      method: "POST",
      json: { post_id: postId, body: draft },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error ?? "The reply would not fly.");
      return;
    }
    setDraft("");
    void load();
  };

  const onSubmitReply = useCallback(
    async (parentId: string, text: string) => {
      if (!requireAuth()) return;
      setReplyBusy(true);
      setError(null);
      const res = await realmFetch<{ error?: string }>("/api/comments", {
        method: "POST",
        json: { post_id: postId, parent_id: parentId, body: text },
      });
      setReplyBusy(false);
      if (!res.ok) {
        setError(res.data?.error ?? "The reply would not fly.");
        return;
      }
      setReplyingTo(null);
      void load();
    },
    [postId, requireAuth, load]
  );

  const onToggleLike = useCallback(
    (c: ThreadComment) => {
      if (!requireAuth()) return;
      const on = !c.liked;
      patch(c.id, {
        liked: on,
        like_count: Math.max(0, c.like_count + (on ? 1 : -1)),
      });
      void realmFetch("/api/social", {
        method: "POST",
        json: { action: "like", subject_type: "comment", subject_id: c.id, on },
      });
    },
    [requireAuth, patch]
  );

  const onToggleBookmark = useCallback(
    (c: ThreadComment) => {
      if (!requireAuth()) return;
      const on = !c.bookmarked;
      patch(c.id, { bookmarked: on });
      void realmFetch("/api/social", {
        method: "POST",
        json: {
          action: "bookmark",
          subject_type: "comment",
          subject_id: c.id,
          on,
        },
      });
    },
    [requireAuth, patch]
  );

  const onShare = useCallback(async (c: ThreadComment) => {
    const url = `${window.location.origin}/post/${c.post_id}#comment-${c.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* no clipboard, no drama */
    }
  }, []);

  const onTip = useCallback(
    (c: ThreadComment) => {
      if (!requireAuth()) return;
      setTipTarget(c);
    },
    [requireAuth]
  );

  const api: RowApi = {
    authenticated,
    replyingTo,
    replyBusy,
    onToggleLike,
    onToggleBookmark,
    onShare,
    onStartReply: setReplyingTo,
    onSubmitReply,
    onTip,
    copiedId,
  };

  const roots = comments.filter((c) => !c.parent_id);
  const showSkeleton = useDelayedLoading(loading);

  return (
    <div className="mt-4">
      {authenticated ? (
        <Card pad="sm" className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 600))}
            placeholder="Add your voice... (@raven answers when called)"
            aria-label="Add your voice"
            rows={2}
            className="min-w-0 flex-1 resize-none bg-transparent text-sm text-bone placeholder-bone-faint outline-none"
          />
          <Button
            variant="gold"
            size="md"
            onClick={send}
            loading={busy}
            disabled={busy || !draft.trim()}
            className="shrink-0"
          >
            {busy ? null : <Icon name="send" className="h-3.5 w-3.5" />}
            Reply
          </Button>
        </Card>
      ) : (
        <Card pad="sm">
          <EmptyState
            size="sm"
            icon="user"
            title="The thread is open to read"
            body="Enter the realm to add your voice to it."
            action={
              <Button variant="gold" size="lg" render={<Link href="/signin" />}>
                Enter the realm
              </Button>
            }
          />
        </Card>
      )}
      {error && <p className="mt-2 text-xs text-state-danger">{error}</p>}

      {!loading && comments.length > 0 && (
        <p className="tnum mt-4 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-bone-faint">
          {comments.length} {comments.length === 1 ? "voice" : "voices"}
        </p>
      )}

      <div className="mt-2 divide-y divide-steel-line/40">
        {loading ? (
          showSkeleton ? (
            <>
              <CommentSkeleton />
              <CommentSkeleton />
            </>
          ) : null
        ) : roots.length === 0 ? (
          <EmptyState
            icon="reply"
            title="No replies yet"
            body="Every great thread starts with one brave voice."
          />
        ) : (
          roots.map((c) => (
            <CommentNode key={c.id} c={c} all={comments} depth={0} api={api} />
          ))
        )}
      </div>

      {tipTarget && (
        <TipDialog
          recipientId={tipTarget.author_id}
          recipientName={
            tipTarget.author.display_name ??
            (tipTarget.author.handle ? `@${tipTarget.author.handle}` : "this member")
          }
          subjectType="comment"
          subjectId={tipTarget.id}
          onClose={() => setTipTarget(null)}
        />
      )}
    </div>
  );
}
