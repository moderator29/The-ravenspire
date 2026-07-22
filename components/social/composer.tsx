"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/social/avatar";
import { Icon } from "@/components/ui/icon";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";
import Link from "next/link";

/* Who a raven is sent to. Order sets the menu; the first is the default. */
const AUDIENCES = [
  { value: "public", label: "Everyone", icon: "eye" },
  { value: "followers", label: "Followers", icon: "user" },
  { value: "house", label: "My House", icon: "banner" },
  { value: "mentions", label: "Mentioned only", icon: "reply" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

export function Composer({
  onPosted,
  page = false,
  onDone,
}: {
  onPosted?: (post?: Post) => void;
  /* When true, the composer renders as a focused full compose screen (its own
     top bar, a large textarea) and navigates to /home once a raven is sent. */
  page?: boolean;
  /* Called after a successful post in page mode instead of the default
     navigation to /home, so a caller can steer where the member lands. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const { authenticated, displayName } = useRealmAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [callToken, setCallToken] = useState("");
  const [callStance, setCallStance] = useState<"up" | "down">("up");
  const [callTimeframe, setCallTimeframe] = useState("24h");
  /* Each attachment carries a local blob `preview` for instant, reliable
     on-screen display and the persisted public `url` used when the raven is
     sent. Previewing the blob (not the fresh remote URL) means the thumbnail
     never shows a black box while the public object propagates. */
  const [images, setImages] = useState<{ url: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [visibility, setVisibility] = useState<Audience>("public");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const suggest = async () => {
    if (suggesting || busy) return;
    setSuggesting(true);
    setError(null);
    const res = await realmFetch<{ text?: string; error?: string }>(
      "/api/compose-suggest",
      { method: "POST", json: { draft: body } }
    );
    setSuggesting(false);
    if (res.data?.text) setBody(res.data.text.slice(0, 1000));
    else setError(res.data?.error ?? "The words would not come. Try again.");
  };

  /* Blob preview URLs to revoke on unmount so we do not leak object URLs. */
  const previewUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  const attachImage = async (file: File) => {
    if (images.length >= 4 || uploading) return;
    const preview = URL.createObjectURL(file);
    previewUrls.current.add(preview);
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await realmFetch<{ url?: string; error?: string }>(
      "/api/upload",
      { method: "POST", body: form }
    );
    setUploading(false);
    if (res.data?.url) {
      setImages((prev) => [...prev, { url: res.data!.url!, preview }]);
    } else {
      previewUrls.current.delete(preview);
      URL.revokeObjectURL(preview);
      setError(res.data?.error ?? "The image would not attach.");
    }
  };

  const removeImage = (i: number) => {
    setImages((prev) => {
      const gone = prev[i];
      if (gone) {
        previewUrls.current.delete(gone.preview);
        URL.revokeObjectURL(gone.preview);
      }
      return prev.filter((_, j) => j !== i);
    });
  };

  if (!authenticated) {
    return (
      <div className="glass glass-sm flex items-center gap-3 p-4">
        <p className="text-sm text-bone-mut">
          The Ravenry is open to read. To send a raven, enter the realm.
        </p>
        <Link href="/signin" className="btn-gold ml-auto shrink-0 px-4 py-1.5 text-xs">
          Sign in
        </Link>
      </div>
    );
  }

  const send = async () => {
    if (busy || (!body.trim() && !callOpen && images.length === 0)) return;
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { body };
    if (callOpen && callToken.trim()) {
      payload.call = {
        token: callToken.trim(),
        stance: callStance,
        timeframe: callTimeframe,
      };
    }
    if (images.length)
      payload.media = images.map((img) => ({ url: img.url, type: "image" }));
    const validPoll = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (pollOpen && validPoll.length >= 2) {
      payload.kind = "poll";
      payload.poll = { options: validPoll };
    }
    payload.visibility = visibility;
    const res = await realmFetch<{ error?: string; post?: Post }>("/api/posts", {
      method: "POST",
      json: payload,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error ?? "The raven refused to fly. Try again.");
      return;
    }
    setBody("");
    setCallOpen(false);
    setCallToken("");
    for (const img of images) {
      previewUrls.current.delete(img.preview);
      URL.revokeObjectURL(img.preview);
    }
    setImages([]);
    setPollOpen(false);
    setPollOptions(["", ""]);
    setVisibility("public");
    setAudienceOpen(false);
    if (page) {
      if (onDone) onDone();
      else router.push("/home");
      return;
    }
    onPosted?.(res.data?.post);
  };

  const sendDisabled =
    busy ||
    uploading ||
    (!body.trim() && !callToken.trim() && images.length === 0);

  return (
    <div className={page ? "flex min-h-[calc(100dvh-3.5rem)] flex-col" : "glass glass-sm p-4"}>
      {page && (
        <div className="glass sticky top-0 z-30 flex items-center justify-between gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => router.push("/home")}
            aria-label="Close"
            className="btn-glass group px-3.5 py-1.5 text-xs font-semibold tracking-wide text-bone-mut hover:text-bone"
          >
            <Icon
              name="arrow"
              className="h-3.5 w-3.5 rotate-180 transition-transform duration-200 group-hover:-translate-x-0.5"
            />
            Close
          </button>
          <button
            onClick={send}
            disabled={sendDisabled}
            className="btn-gold px-5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Flying..." : "Send raven"}
          </button>
        </div>
      )}
      <div className={page ? "flex flex-1 gap-3 px-4 py-4" : "flex gap-3"}>
        <Avatar
          author={{
            handle: null,
            display_name: displayName ?? null,
            avatar_url: null,
            house_slug: null,
          }}
          size={page ? 44 : 40}
        />
        <div className={page ? "flex min-w-0 flex-1 flex-col" : "min-w-0 flex-1"}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 1000))}
            placeholder="Send a raven..."
            autoFocus={page}
            rows={page ? undefined : body.length > 80 ? 4 : 2}
            className={
              page
                ? "min-h-[28vh] w-full flex-1 resize-none bg-transparent text-lg leading-relaxed text-bone placeholder-bone-faint outline-none"
                : "w-full resize-none bg-transparent text-[15px] text-bone placeholder-bone-faint outline-none"
            }
          />
          {callOpen && (
            <div className="glass-sm mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-panel-warm p-2.5">
              <Icon name="target" className="h-4 w-4 text-gold" />
              <input
                value={callToken}
                onChange={(e) => setCallToken(e.target.value.slice(0, 12))}
                placeholder="TOKEN"
                className="w-24 rounded-lg bg-void px-2 py-1 text-xs uppercase text-bone outline-none"
              />
              <div className="flex overflow-hidden rounded-lg border border-steel-line">
                {(["up", "down"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setCallStance(s)}
                    className={`px-2.5 py-1 text-xs font-semibold ${
                      callStance === s
                        ? s === "up"
                          ? "bg-gold/20 text-gold-bright"
                          : "bg-ember-deep/25 text-ember"
                        : "text-bone-faint"
                    }`}
                  >
                    {s === "up" ? "Rises" : "Falls"}
                  </button>
                ))}
              </div>
              <div className="flex overflow-hidden rounded-lg border border-steel-line">
                {["24h", "7d", "30d"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setCallTimeframe(t)}
                    className={`px-2 py-1 text-xs ${
                      callTimeframe === t
                        ? "bg-panel text-bone"
                        : "text-bone-faint"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="w-full text-[10px] text-bone-faint">
                A Call seals the live price now and the realm judges the verdict
                later. Real data only.
              </p>
            </div>
          )}
          {images.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <div key={img.preview} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.preview}
                    alt="Attached image preview"
                    className="h-20 w-20 rounded-xl border border-steel-line object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    aria-label="Remove image"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-steel-line bg-void text-[10px] text-bone-mut"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {pollOpen && (
            <div className="glass-sm mt-2 flex flex-col gap-1.5 rounded-xl border border-gold/25 bg-panel p-2.5">
              {pollOptions.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={(e) =>
                    setPollOptions((prev) =>
                      prev.map((p, j) => (j === i ? e.target.value.slice(0, 60) : p))
                    )
                  }
                  placeholder={`Choice ${i + 1}`}
                  className="rounded-lg bg-void px-2.5 py-1.5 text-xs text-bone outline-none"
                />
              ))}
              {pollOptions.length < 4 && (
                <button
                  onClick={() => setPollOptions((prev) => [...prev, ""])}
                  className="self-start text-[11px] text-gold hover:text-gold-bright"
                >
                  Add a choice
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-ember-deep">{error}</p>}
          <div
            className={
              page
                ? "sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-1 border-t border-steel-line bg-void/95 py-2 backdrop-blur"
                : "mt-2 flex items-center gap-1"
            }
          >
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                uploading
                  ? "text-gold"
                  : "text-bone-faint hover:bg-panel hover:text-bone-mut"
              }`}
            >
              <Icon name="image" className="h-4 w-4" />
              {uploading ? "Attaching..." : ""}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void attachImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => setPollOpen((v) => !v)}
              aria-label="Add a poll"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                pollOpen
                  ? "bg-gold/15 text-gold"
                  : "text-bone-faint hover:bg-panel hover:text-bone-mut"
              }`}
            >
              <Icon name="poll" className="h-4 w-4" />
            </button>
            <button
              onClick={() => void suggest()}
              disabled={suggesting}
              aria-label="Let the Herald draft a raven"
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition disabled:cursor-wait ${
                suggesting
                  ? "bg-gold/15 text-gold"
                  : "text-bone-faint hover:bg-panel hover:text-bone-mut"
              }`}
            >
              <Icon
                name="raven"
                className={`h-4 w-4 ${suggesting ? "animate-pulse" : ""}`}
              />
              {suggesting && <span className="text-[11px]">Drafting...</span>}
            </button>
            <button
              onClick={() => setCallOpen((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                callOpen
                  ? "bg-gold/15 text-gold"
                  : "text-bone-faint hover:bg-panel hover:text-bone-mut"
              }`}
            >
              <Icon name="target" className="h-4 w-4" />
              Make a Call
            </button>
            <div className="relative ml-auto">
              <button
                onClick={() => setAudienceOpen((v) => !v)}
                aria-label="Choose who can see this raven"
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${
                  audienceOpen || visibility !== "public"
                    ? "bg-gold/15 text-gold"
                    : "text-bone-faint hover:bg-panel hover:text-bone-mut"
                }`}
              >
                <Icon
                  name={
                    AUDIENCES.find((a) => a.value === visibility)?.icon ?? "eye"
                  }
                  className="h-4 w-4"
                />
                <span className="hidden sm:inline">
                  {AUDIENCES.find((a) => a.value === visibility)?.label}
                </span>
              </button>
              {audienceOpen && (
                <>
                  <button
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setAudienceOpen(false)}
                    className="fixed inset-0 z-20 cursor-default"
                  />
                  <div
                    className={`glass glass-sm absolute right-0 z-30 w-52 p-1 ${
                      page ? "bottom-10" : "top-9"
                    }`}
                  >
                    <p className="px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-bone-faint">
                      Who can see this
                    </p>
                    {AUDIENCES.map((a) => (
                      <button
                        key={a.value}
                        onClick={() => {
                          setVisibility(a.value);
                          setAudienceOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-panel ${
                          visibility === a.value ? "text-gold" : "text-bone-mut"
                        }`}
                      >
                        <Icon name={a.icon} className="h-3.5 w-3.5 shrink-0" />
                        {a.label}
                        {visibility === a.value && (
                          <span className="ml-auto text-gold">·</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="text-[11px] text-bone-faint">
              {body.length > 0 && `${body.length}/1000`}
            </span>
            {!page && (
              <button
                onClick={send}
                disabled={sendDisabled}
                className="btn-gold px-4 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Flying..." : "Post"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
