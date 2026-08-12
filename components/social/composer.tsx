"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuItem } from "@/components/ui/menu";
import {
  CallForm,
  EMPTY_CALL_DRAFT,
  callDraftReady,
  callPayload,
  type CallDraft,
} from "@/components/calls/call-form";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";
import type { Post } from "@/lib/social/types";

/* The composer.

   Stream density, so every control in the toolbar clears 44px and nothing here
   shrinks on a wider screen. The one deliberate exception to "prefer the
   primitives" is the body textarea: it is a transparent field inside a card,
   not a bordered control, because a raven is written into the card rather than
   into a box drawn on top of it. */

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
  const [callDraft, setCallDraft] = useState<CallDraft>(EMPTY_CALL_DRAFT);
  /* Each attachment carries a local blob `preview` for instant, reliable
     on-screen display and the persisted public `url` used when the raven is
     sent. Previewing the blob (not the fresh remote URL) means the thumbnail
     never shows a black box while the public object propagates. */
  const [images, setImages] = useState<{ url: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [visibility, setVisibility] = useState<Audience>("public");
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
      <Card className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-bone-mut">
          The Ravenry is open to read. To send a raven, enter the realm.
        </p>
        <Button
          variant="gold"
          size="lg"
          render={<Link href="/signin" />}
          className="shrink-0"
        >
          Sign in
        </Button>
      </Card>
    );
  }

  const send = async () => {
    if (busy || (!body.trim() && !callOpen && images.length === 0)) return;
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = { body };
    if (callOpen) {
      const call = callPayload(callDraft);
      if (call) payload.call = call;
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
    setCallDraft(EMPTY_CALL_DRAFT);
    for (const img of images) {
      previewUrls.current.delete(img.preview);
      URL.revokeObjectURL(img.preview);
    }
    setImages([]);
    setPollOpen(false);
    setPollOptions(["", ""]);
    setVisibility("public");
    if (page) {
      if (onDone) onDone();
      else router.push("/home");
      return;
    }
    onPosted?.(res.data?.post);
  };

  /* A Call being drafted but not yet complete is the one case where an
     otherwise sendable raven has to wait: sealing it half stated would post a
     raven and silently drop the Call. */
  const callIncomplete = callOpen && !callDraftReady(callDraft);
  const sendDisabled =
    busy ||
    uploading ||
    callIncomplete ||
    (!body.trim() && !callOpen && images.length === 0);

  const audience = AUDIENCES.find((a) => a.value === visibility);

  return (
    <div className={page ? "flex min-h-[calc(100dvh-3.5rem)] flex-col" : "p-4"}>
      {page && (
        <div className="sticky top-0 z-sticky flex items-center justify-between gap-3 border-b border-steel-line bg-void/95 px-3 py-2.5 backdrop-blur-[14px]">
          <Button
            variant="glass"
            size="md"
            onClick={() => router.push("/home")}
            className="group"
          >
            <Icon
              name="arrow"
              className="h-3.5 w-3.5 rotate-180 transition-transform duration-fast ease-out-quint group-hover:-translate-x-0.5"
            />
            Close
          </Button>
          <Button
            variant="gold"
            size="md"
            onClick={send}
            loading={busy}
            disabled={sendDisabled}
          >
            {busy ? "Flying" : "Send raven"}
          </Button>
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
            aria-label="Your raven"
            autoFocus={page}
            rows={page ? undefined : body.length > 80 ? 4 : 2}
            className={
              page
                ? "min-h-[28vh] w-full flex-1 resize-none bg-transparent text-lg leading-relaxed text-bone placeholder-bone-faint"
                : "w-full resize-none bg-transparent text-[15px] text-bone placeholder-bone-faint"
            }
          />

          {callOpen && (
            <CallForm draft={callDraft} onChange={setCallDraft} />
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
                  <IconButton
                    icon="close"
                    label="Remove image"
                    variant="glass"
                    size="sm"
                    onClick={() => removeImage(i)}
                    className="absolute -right-1.5 -top-1.5 h-6 w-6"
                  />
                </div>
              ))}
            </div>
          )}

          {pollOpen && (
            <Card variant="inset" pad="sm" className="mt-2 flex flex-col gap-1.5">
              {pollOptions.map((opt, i) => (
                <Field key={i} label={`Choice ${i + 1}`} className="gap-1">
                  <Input
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) =>
                        prev.map((p, j) =>
                          j === i ? e.target.value.slice(0, 60) : p
                        )
                      )
                    }
                    placeholder={`Choice ${i + 1}`}
                  />
                </Field>
              ))}
              {pollOptions.length < 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPollOptions((prev) => [...prev, ""])}
                  className="self-start text-gold hover:text-gold-bright"
                >
                  Add a choice
                </Button>
              )}
            </Card>
          )}

          {error && (
            <p role="alert" className="mt-2 text-xs text-state-danger">
              {error}
            </p>
          )}

          <div
            className={
              page
                ? "sticky bottom-0 z-sticky mt-2 flex flex-wrap items-center gap-1 border-t border-steel-line bg-void/95 py-2 backdrop-blur-[14px]"
                : "mt-2 flex flex-wrap items-center gap-1"
            }
          >
            <Button
              variant="ghost"
              size="lg"
              render={<label className="cursor-pointer" />}
              className={`px-2.5 ${uploading ? "text-gold" : "text-bone-faint"}`}
            >
              <Icon name="image" className="h-5 w-5" />
              <span className="sr-only">Attach an image</span>
              {uploading ? <span className="text-xs">Attaching</span> : null}
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
            </Button>

            <IconButton
              icon="poll"
              label="Add a poll"
              size="lg"
              aria-pressed={pollOpen}
              onClick={() => setPollOpen((v) => !v)}
              className={pollOpen ? "bg-gold/15 text-gold" : "text-bone-faint"}
            />

            <Button
              variant="ghost"
              size="lg"
              onClick={() => void suggest()}
              disabled={suggesting}
              aria-label="Let the Herald draft a raven"
              className={`px-2.5 ${suggesting ? "bg-gold/15 text-gold" : "text-bone-faint"}`}
            >
              <Icon name="raven" className="h-5 w-5" />
              {suggesting && <span className="text-xs">Drafting</span>}
            </Button>

            <Button
              variant="ghost"
              size="lg"
              aria-pressed={callOpen}
              onClick={() => setCallOpen((v) => !v)}
              className={`px-2.5 text-xs ${callOpen ? "bg-gold/15 text-gold" : "text-bone-faint"}`}
            >
              <Icon name="target" className="h-5 w-5" />
              Make a Call
            </Button>

            <Menu
              side={page ? "top" : "bottom"}
              trigger={
                <Button
                  variant="ghost"
                  size="lg"
                  aria-label="Choose who can see this raven"
                  className={`ml-auto px-2.5 text-xs ${
                    visibility === "public" ? "text-bone-faint" : "text-gold"
                  }`}
                >
                  <Icon name={audience?.icon ?? "eye"} className="h-5 w-5" />
                  <span className="hidden sm:inline">{audience?.label}</span>
                </Button>
              }
            >
              {AUDIENCES.map((a) => (
                <MenuItem
                  key={a.value}
                  icon={a.icon}
                  onClick={() => setVisibility(a.value)}
                  className={visibility === a.value ? "text-gold" : undefined}
                >
                  {a.label}
                </MenuItem>
              ))}
            </Menu>

            <span className="tnum text-[11px] text-bone-faint">
              {body.length > 0 && `${body.length}/1000`}
            </span>

            {!page && (
              <Button
                variant="gold"
                size="md"
                onClick={send}
                loading={busy}
                disabled={sendDisabled}
              >
                {busy ? "Flying" : "Post"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
