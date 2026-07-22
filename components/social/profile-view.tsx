"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PostCard } from "@/components/social/post-card";
import { EarningsSection } from "@/components/profile/earnings-section";
import { Avatar } from "@/components/social/avatar";
import { CrestRoundel, findCrest } from "@/components/brand/crests";
import { Icon } from "@/components/ui/icon";
import {
  fetchFollowCounts,
  fetchProfilePosts,
  fetchUserCrests,
} from "@/lib/social/queries";
import {
  fetchIsFollowing,
  fetchViewer,
  fetchMutuals,
  type Mutuals,
} from "@/lib/social/profile-queries";
import { TIER_NAMES, type Post, type PublicProfile } from "@/lib/social/types";
import { houses } from "@/lib/data/houses";
import { realmFetch } from "@/lib/auth/api";
import { useRealmAuth } from "@/lib/auth/use-realm-auth";

export function ProfileView({
  profile,
  own = false,
  onEdit,
}: {
  profile: PublicProfile;
  own?: boolean;
  onEdit?: () => void;
}) {
  const { authenticated } = useRealmAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [crestSlugs, setCrestSlugs] = useState<string[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [tab, setTab] = useState<"posts" | "calls" | "media">("posts");
  const [following, setFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [bannerOverride, setBannerOverride] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mutuals, setMutuals] = useState<Mutuals | null>(null);

  /* This Keep belongs to the viewer either because the parent said so
     (own /keep) or because the signed-in member is looking at their own
     /u/handle. Either way the follow/block controls are hidden. */
  const isOwn = own || (viewerId !== null && viewerId === profile.id);

  /* The portrait an owner can swap in place. Uploads through /api/upload
     (4MB, images only) then seals the url onto the profile via the same
     /api/profile path the Edit sheet uses. Preview is optimistic. */
  const uploadPortrait = async (file: File, kind: "avatar" | "banner") => {
    setUploading(kind);
    setPortraitError(null);
    const fd = new FormData();
    fd.append("file", file);
    const up = await realmFetch<{ url?: string; error?: string }>(
      "/api/upload",
      { method: "POST", body: fd }
    );
    if (!up.ok || !up.data?.url) {
      setUploading(null);
      setPortraitError(up.data?.error ?? "The upload failed. Try again.");
      return;
    }
    const url = up.data.url;
    if (kind === "avatar") setAvatarOverride(url);
    else setBannerOverride(url);
    const saved = await realmFetch<{ ok?: boolean; error?: string }>(
      "/api/profile",
      {
        method: "POST",
        json: kind === "avatar" ? { avatar_url: url } : { banner_url: url },
      }
    );
    setUploading(null);
    if (!saved.ok || !saved.data?.ok) {
      setPortraitError(
        saved.data?.error ?? "The scribe failed to seal the portrait."
      );
    }
  };

  useEffect(() => {
    if (!authenticated || own) return;
    void realmFetch<{ blocked?: string[] }>("/api/blocks").then((res) => {
      if (res.data?.blocked?.includes(profile.id)) setIsBlocked(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, own, profile.id]);

  /* Resolve the viewer and their real follow relationship to this Keep so
     the button reflects the true state on load, not a guess. */
  useEffect(() => {
    if (!authenticated) {
      setViewerId(null);
      setFollowing(false);
      return;
    }
    let cancelled = false;
    void fetchViewer().then((v) => {
      if (cancelled || !v) return;
      setViewerId(v.id);
      if (v.id !== profile.id) {
        void fetchIsFollowing(v.id, profile.id).then((f) => {
          if (!cancelled) setFollowing(f);
        });
        void fetchMutuals(v.id, profile.id).then((m) => {
          if (!cancelled) setMutuals(m);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authenticated, profile.id]);

  const toggleBlock = async () => {
    if (!authenticated) {
      window.location.href = "/signin";
      return;
    }
    const on = !isBlocked;
    setIsBlocked(on);
    if (on) setFollowing(false);
    await realmFetch("/api/blocks", {
      method: "POST",
      json: { profile_id: profile.id, on },
    });
  };

  useEffect(() => {
    void fetchProfilePosts(profile.id).then(setPosts);
    void fetchUserCrests(profile.id).then(setCrestSlugs);
    void fetchFollowCounts(profile.id).then(setCounts);
  }, [profile.id]);

  const house = houses.find((h) => h.slug === profile.house_slug);
  /* Profile with any freshly uploaded portrait applied for instant preview. */
  const displayProfile = {
    ...profile,
    avatar_url: avatarOverride ?? profile.avatar_url,
    banner_url: bannerOverride ?? profile.banner_url,
  };
  const portraitAccept = "image/jpeg,image/png,image/webp,image/gif";
  const callPosts = posts.filter((p) => p.kind === "call");
  const callsWon = callPosts.filter((p) => p.call?.verdict === "hit").length;
  const shown = tab === "calls" ? callPosts : posts;
  const mediaTiles = posts.flatMap((p) =>
    (p.media ?? [])
      .filter((m) => m.type === "image" && m.url)
      .map((m, i) => ({ postId: p.id, url: m.url, key: `${p.id}-${i}` }))
  );

  const toggleFollow = async () => {
    if (!authenticated) {
      window.location.href = "/signin";
      return;
    }
    const on = !following;
    setFollowing(on);
    setCounts((c) => ({ ...c, followers: c.followers + (on ? 1 : -1) }));
    await realmFetch("/api/social", {
      method: "POST",
      json: { action: "follow", subject_id: profile.id, on },
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      {/* Banner */}
      <div
        className="glass relative h-32 overflow-hidden sm:h-40"
        style={
          displayProfile.banner_url
            ? {
                backgroundImage: `url(${displayProfile.banner_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                background: `radial-gradient(ellipse 70% 90% at 30% 0%, ${house?.color ?? "#C8A24C"}1e, transparent), linear-gradient(180deg, #101017, #0C0C11)`,
              }
        }
      >
        {isOwn && (
          <label className="btn-glass absolute right-3 top-3 flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[11px] text-bone-mut">
            <Icon name="image" className="h-3.5 w-3.5" />
            {uploading === "banner" ? "Uploading..." : "Change banner"}
            <input
              type="file"
              accept={portraitAccept}
              className="hidden"
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPortrait(f, "banner");
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div className="relative z-20 -mt-8 px-4">
        <div className="flex items-end justify-between">
          {isOwn ? (
            <label className="group relative inline-flex cursor-pointer">
              <Avatar author={displayProfile} size={76} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100">
                <Icon name="image" className="h-5 w-5 text-bone" />
              </span>
              {uploading === "avatar" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-[9px] font-semibold uppercase tracking-wider text-bone">
                  ...
                </span>
              )}
              <input
                type="file"
                accept={portraitAccept}
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPortrait(f, "avatar");
                  e.target.value = "";
                }}
              />
            </label>
          ) : (
            <Avatar author={displayProfile} size={76} />
          )}
          {isOwn ? (
            onEdit ? (
              <button
                onClick={onEdit}
                className="btn-gold flex items-center gap-1.5 px-4 py-1.5 text-xs"
              >
                <Icon name="sliders" className="h-3.5 w-3.5" />
                Edit profile
              </button>
            ) : (
              <span className="btn-glass px-4 py-1.5 text-xs text-bone-mut">
                This is your Keep
              </span>
            )
          ) : (
            /* Follow always renders so blocking never shifts it. The overflow
               menu is anchored to the dots button alone (its own relative box),
               so opening it never moves the Follow button or the surrounding
               header. Block lives only inside this menu, never loose. */
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFollow}
                className={`px-5 py-1.5 text-xs ${following ? "btn-glass text-bone-mut" : "btn-gold"}`}
              >
                {following ? "Following" : "Follow"}
              </button>
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="btn-glass flex h-8 w-8 items-center justify-center text-bone-mut"
                >
                  <Icon name="dots" className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <button
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setMenuOpen(false)}
                      className="fixed inset-0 z-40 cursor-default"
                    />
                    <div
                      role="menu"
                      className="glass glass-sm absolute right-0 top-full z-50 mt-2 w-44 p-1"
                    >
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void navigator.clipboard
                            ?.writeText(
                              `${window.location.origin}/u/${profile.handle}`
                            )
                            .catch(() => {});
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel"
                      >
                        <Icon name="share" className="h-3.5 w-3.5 shrink-0" />
                        Share profile
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void realmFetch("/api/mutes", {
                            method: "POST",
                            json: { muted_id: profile.id },
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel"
                      >
                        <Icon name="bell" className="h-3.5 w-3.5 shrink-0" />
                        Mute
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void toggleBlock();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-bone-mut transition hover:bg-panel"
                      >
                        <Icon name="shield" className="h-3.5 w-3.5 shrink-0" />
                        {isBlocked ? "Unblock" : "Block"}
                      </button>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void realmFetch("/api/reports", {
                            method: "POST",
                            json: {
                              subject_type: "profile",
                              subject_id: profile.id,
                              reason: "member_flag",
                            },
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-ember-deep transition hover:bg-panel"
                      >
                        <Icon name="flag" className="h-3.5 w-3.5 shrink-0" />
                        Report
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {isOwn && portraitError && (
          <p className="mt-2 text-xs text-ember-deep">{portraitError}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-bone">
            {profile.display_name ?? profile.handle}
          </h1>
          {profile.x_handle && (
            <a
              href={`https://x.com/${profile.x_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`@${profile.x_handle} on X`}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-steel-line bg-void text-bone-mut transition hover:border-gold/40 hover:text-bone"
            >
              <Icon name="xlogo" className="h-4 w-4" />
            </a>
          )}
          {crestSlugs.slice(0, 4).map((slug) => {
            const def = findCrest(slug);
            return def ? (
              <span key={slug} title={def.name}>
                <CrestRoundel icon={def.icon} className="h-6 w-6" />
              </span>
            ) : null;
          })}
          {profile.is_agent && (
            <span className="rounded-full border border-gold/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
              Herald of the realm
            </span>
          )}
        </div>
        <p className="text-sm text-bone-faint">@{profile.handle}</p>

        {profile.bio && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-bone-mut">
            {profile.bio}
          </p>
        )}

        {profile.links && profile.links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.links
              .filter((l) => l.url?.startsWith("https://"))
              .slice(0, 3)
              .map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-sm flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs text-bone-mut hover:text-bone"
                >
                  <Icon name="compass" className="h-3 w-3 shrink-0 text-gold" />
                  <span className="truncate">{l.label || l.url}</span>
                </a>
              ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-bone-faint">
          {house && (
            <span className="flex items-center gap-1.5">
              <Icon name="banner" className="h-3.5 w-3.5" />
              {house.name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Icon name="medal" className="h-3.5 w-3.5" />
            {TIER_NAMES[profile.tier] ?? profile.tier} ·{" "}
            <span className="tnum">{profile.renown.toLocaleString()}</span>{" "}
            Renown
          </span>
          {profile.created_at && (
            <span className="flex items-center gap-1.5">
              <Icon name="scroll" className="h-3.5 w-3.5" />
              Joined{" "}
              {new Date(profile.created_at).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        <div className="tnum mt-3 flex gap-5 text-sm">
          <span>
            <b className="text-bone">{counts.followers}</b>{" "}
            <span className="text-bone-faint">Followers</span>
          </span>
          <span>
            <b className="text-bone">{counts.following}</b>{" "}
            <span className="text-bone-faint">Following</span>
          </span>
          <span>
            <b className="text-bone">{callsWon}</b>{" "}
            <span className="text-bone-faint">Calls won</span>
          </span>
        </div>

        {!isOwn && mutuals && mutuals.count > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            <div className="flex -space-x-2">
              {mutuals.preview.slice(0, 3).map((m, i) => (
                <span
                  key={i}
                  className="h-5 w-5 overflow-hidden rounded-full border border-obsidian bg-void"
                  title={m.handle ? `@${m.handle}` : undefined}
                >
                  {m.avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[8px] text-gold">
                      {(m.display_name ?? m.handle ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-bone-faint">
              Followed by{" "}
              <span className="text-bone-mut">
                {mutuals.preview[0]?.handle
                  ? `@${mutuals.preview[0].handle}`
                  : "someone"}
              </span>
              {mutuals.count > 1 && ` and ${mutuals.count - 1} others`} you follow
            </p>
          </div>
        )}
      </div>

      {/* Earnings + balance: sits between the identity header and the content
          tabs. Its own privacy gate lives server-side in /api/profile/earnings,
          which respects the member's PnL and public-positions toggles. */}
      <EarningsSection
        profileId={profile.id}
        handle={profile.handle}
        own={isOwn}
      />

      <div className="mt-5 flex gap-1.5">
        {(["posts", "calls", "media"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${
              tab === t ? "btn-gold" : "btn-glass text-bone-mut"
            }`}
          >
            {t === "posts" ? "Ravens" : t === "calls" ? "Calls" : "Media"}
          </button>
        ))}
      </div>

      {tab === "media" ? (
        mediaTiles.length === 0 ? (
          <div className="glass mt-3 p-8 text-center text-sm text-bone-mut">
            No images from this Keep yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {mediaTiles.map((m) => (
              <Link
                key={m.key}
                href={`/post/${m.postId}`}
                className="glass-sm block aspect-square overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </Link>
            ))}
          </div>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {shown.length === 0 ? (
            <div className="glass p-8 text-center text-sm text-bone-mut">
              {tab === "calls"
                ? "No Calls sealed yet."
                : isOwn
                  ? "Your Keep awaits its first raven."
                  : "No ravens from this Keep yet."}
            </div>
          ) : (
            shown.map((p) => <PostCard key={p.id} post={p} />)
          )}
        </div>
      )}
    </div>
  );
}
