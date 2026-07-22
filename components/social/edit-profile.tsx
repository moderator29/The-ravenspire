"use client";

import { useEffect, useState } from "react";
import { realmFetch } from "@/lib/auth/api";
import { fetchProfile } from "@/lib/social/queries";

type LinkRow = { label: string; url: string };

const EMPTY_LINKS: LinkRow[] = [
  { label: "", url: "" },
  { label: "", url: "" },
  { label: "", url: "" },
];

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

  /* Prefill from the caller's current profile each time the sheet opens. */
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

  if (!open) return null;

  const fieldClass =
    "w-full rounded-lg border border-steel-line bg-void px-3 py-2 text-sm text-bone placeholder-bone-faint outline-none focus:border-gold/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="glass relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto p-5">
        <h2 className="font-display text-lg font-semibold text-bone">
          Edit Profile
        </h2>

        <label className="mt-4 block text-xs font-semibold text-bone-faint">
          Username
          <div className="mt-1 flex items-center gap-1 rounded-lg border border-steel-line bg-void px-3 focus-within:border-gold/40">
            <span className="text-bone-faint">@</span>
            <input
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
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-bone placeholder-bone-faint outline-none"
            />
          </div>
          <span className="mt-1 block text-[10px] text-bone-faint">
            3 to 20 characters, a-z 0-9 _. Must be unique in the realm.
          </span>
        </label>

        <label className="mt-3 block text-xs font-semibold text-bone-faint">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
            placeholder="Your name in the realm"
            className={`mt-1 ${fieldClass}`}
          />
        </label>

        <label className="mt-3 block text-xs font-semibold text-bone-faint">
          Bio
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 280))}
            placeholder="A few words carved above your gate"
            rows={3}
            className={`mt-1 resize-none ${fieldClass}`}
          />
          <span className="tnum mt-1 block text-right text-[10px] text-bone-faint">
            {bio.length}/280
          </span>
        </label>

        <div className="mt-1">
          <p className="text-xs font-semibold text-bone-faint">
            Links (up to 3, https only)
          </p>
          <div className="mt-1 flex flex-col gap-1.5">
            {links.map((l, i) => (
              <div key={i} className="flex min-w-0 gap-1.5">
                <input
                  value={l.label}
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
                  className={`w-1/3 min-w-0 ${fieldClass}`}
                />
                <input
                  value={l.url}
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
                  className={`flex-1 min-w-0 ${fieldClass}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt="Avatar preview"
              className="h-14 w-14 shrink-0 rounded-full border border-steel-line object-cover"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-full border border-steel-line bg-void" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-bone-faint">Avatar</p>
            <div className="mt-1 flex items-center gap-2">
              <label className="btn-glass cursor-pointer px-3 py-1.5 text-xs text-bone-mut">
                {uploading === "avatar" ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, "avatar");
                    e.target.value = "";
                  }}
                />
              </label>
              {avatarUrl && (
                <button
                  onClick={() => setAvatarUrl("")}
                  className="text-[11px] text-bone-faint hover:text-ember"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-bone-faint">Banner</p>
          {bannerUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={bannerUrl}
              alt="Banner preview"
              className="mt-1 h-20 w-full rounded-lg border border-steel-line object-cover"
            />
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <label className="btn-glass cursor-pointer px-3 py-1.5 text-xs text-bone-mut">
              {uploading === "banner" ? "Uploading..." : "Upload"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f, "banner");
                  e.target.value = "";
                }}
              />
            </label>
            {bannerUrl && (
              <button
                onClick={() => setBannerUrl("")}
                className="text-[11px] text-bone-faint hover:text-ember"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-ember-deep">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-glass px-4 py-2 text-xs text-bone-mut"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || uploading !== null}
            className="btn-gold px-5 py-2 text-xs disabled:opacity-60"
          >
            {saving ? "Sealing..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
