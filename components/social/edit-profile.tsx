"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { AdaptiveDialog } from "@/components/ui/sheet";
import { realmFetch } from "@/lib/auth/api";
import { fetchProfile } from "@/lib/social/queries";

/* Editing a Keep, on the AdaptiveDialog: a bottom sheet on a phone, a centred
   modal above 768px. The hand rolled overlay it replaces had no role, no focus
   trap, no focus restore and no background scroll lock.

   Every control is a Field, so the label is associated, the helper text is
   referenced by aria-describedby and the error is announced rather than merely
   printed in red under the form. */

type LinkRow = { label: string; url: string };

const EMPTY_LINKS: LinkRow[] = [
  { label: "", url: "" },
  { label: "", url: "" },
  { label: "", url: "" },
];

/* A file picker is a label wrapping an input. Keeping the input focusable and
   showing the ring on the label keeps it reachable from the keyboard, which the
   previous `hidden` input was not. */
const PICKER_FOCUS =
  "cursor-pointer has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 " +
  "has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[color:var(--state-focus-ring)]";

const PORTRAIT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function EditProfile({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<LinkRow[]>(EMPTY_LINKS);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Prefill from the caller's current profile each time the sheet opens.
     Still gated on `open`, so a closed editor costs nothing. */
  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    void (async () => {
      const res = await realmFetch<{ profile?: { handle: string | null } }>(
        "/api/me",
        { method: "POST" }
      );
      const currentHandle = res.data?.profile?.handle;
      if (!currentHandle || cancelled) return;
      const p = await fetchProfile(currentHandle);
      if (!p || cancelled) return;
      setHandle(p.handle ?? "");
      setDisplayName(p.display_name ?? "");
      setBio(p.bio ?? "");
      setLinks([0, 1, 2].map((i) => ({ ...(p.links?.[i] ?? { label: "", url: "" }) })));
      setAvatarUrl(p.avatar_url ?? "");
      setBannerUrl(p.banner_url ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const upload = async (file: File, kind: "avatar" | "banner") => {
    setUploading(kind);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await realmFetch<{ url?: string; error?: string }>(
      "/api/upload",
      { method: "POST", body: fd }
    );
    setUploading(null);
    if (!res.ok || !res.data?.url) {
      setError(res.data?.error ?? "The upload failed. Try again.");
      return;
    }
    if (kind === "avatar") setAvatarUrl(res.data.url);
    else setBannerUrl(res.data.url);
  };

  const save = async () => {
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
      setError("Username must be 3 to 20 characters, a-z 0-9 _.");
      return;
    }
    if (!displayName.trim()) {
      setError("A display name is required.");
      return;
    }
    const filled = links.filter((l) => l.label.trim() || l.url.trim());
    for (const l of filled) {
      if (!l.label.trim() || !l.url.trim().startsWith("https://")) {
        setError("Each link needs a label and an https:// address.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    const res = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/profile",
      {
        method: "POST",
        json: {
          handle,
          display_name: displayName.trim(),
          bio,
          links: filled.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
        },
      }
    );
    setSaving(false);
    if (!res.ok || !res.data?.ok) {
      setError(res.data?.error ?? "The scribe failed. Try again.");
      return;
    }
    onSaved();
  };

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Edit profile"
      description="How the realm sees you."
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="lg"
            onClick={save}
            loading={saving}
            disabled={saving || uploading !== null}
          >
            {saving ? "Sealing" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Username"
          description="3 to 20 characters, a-z 0-9 _. Shown as @handle, unique in the realm."
        >
          <Input
            value={handle}
            onChange={(e) =>
              setHandle(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, 20)
              )
            }
            placeholder="your_handle"
          />
        </Field>

        <Field label="Display name">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            placeholder="Your name in the realm"
          />
        </Field>

        <Field label="Bio" description={`${bio.length} of 280 characters used.`}>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            placeholder="A few words carved above your gate"
          />
        </Field>

        <Field
          label="Links"
          description="Up to three, https only. Each needs a label."
        >
          <div className="flex flex-col gap-1.5">
            {links.map((l, i) => (
              <div key={i} className="flex min-w-0 gap-1.5">
                <Input
                  value={l.label}
                  aria-label={`Link ${i + 1} label`}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((row, j) =>
                        j === i
                          ? { ...row, label: e.target.value.slice(0, 40) }
                          : row
                      )
                    )
                  }
                  placeholder="Label"
                  className="w-1/3 min-w-0"
                />
                <Input
                  value={l.url}
                  aria-label={`Link ${i + 1} address`}
                  onChange={(e) =>
                    setLinks((prev) =>
                      prev.map((row, j) =>
                        j === i
                          ? { ...row, url: e.target.value.slice(0, 300) }
                          : row
                      )
                    )
                  }
                  placeholder="https://"
                  className="min-w-0 flex-1"
                />
              </div>
            ))}
          </div>
        </Field>

        <div className="flex items-center gap-3">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt="Your portrait as it will appear"
              className="h-14 w-14 shrink-0 rounded-full border border-steel-line object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="h-14 w-14 shrink-0 rounded-full border border-steel-line bg-void"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-mut">
              Portrait
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <Button
                variant="glass"
                size="md"
                render={<label className={PICKER_FOCUS} />}
                className="max-md:h-11 text-bone-mut"
              >
                <Icon name="image" className="h-3.5 w-3.5" />
                {uploading === "avatar" ? "Uploading" : "Upload"}
                <input
                  type="file"
                  accept={PORTRAIT_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "avatar");
                    e.target.value = "";
                  }}
                />
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setAvatarUrl("")}
                  className="max-md:h-11"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-bone-mut">
            Banner
          </p>
          {bannerUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={bannerUrl}
              alt="Your banner as it will appear"
              className="mt-1.5 h-20 w-full rounded-lg border border-steel-line object-cover"
            />
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              variant="glass"
              size="md"
              render={<label className={PICKER_FOCUS} />}
              className="max-md:h-11 text-bone-mut"
            >
              <Icon name="image" className="h-3.5 w-3.5" />
              {uploading === "banner" ? "Uploading" : "Upload"}
              <input
                type="file"
                accept={PORTRAIT_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f, "banner");
                  e.target.value = "";
                }}
              />
            </Button>
            {bannerUrl && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setBannerUrl("")}
                className="max-md:h-11"
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-state-danger">
            {error}
          </p>
        )}
      </div>
    </AdaptiveDialog>
  );
}
