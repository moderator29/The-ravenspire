"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PostCard } from "@/components/social/post-card";
import { EarningsSection } from "@/components/profile/earnings-section";
import { Avatar } from "@/components/social/avatar";
import { OathHistory } from "@/components/social/oath-history";
import { CrestRoundel, findCrest } from "@/components/brand/crests";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Tab, Tabs, TabsList, TabsPanel } from "@/components/ui/tabs";
import { StreamList } from "@/components/stream/stream-shell";
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
import { shareOrCopy } from "@/lib/share";

/* A Keep, on the Dossier archetype.

   Hero band, then tabs, then panels, always in that order. The hero is the one
   place in a Dossier that may carry any weight at all: here that is the banner
   and the member's crests. Everything below it is Ledger, flat and quiet.

   The tab strip is the underline pattern rather than a chip rail, because these
   are sections of one subject with counts, which is the rule in section 3. */

/* A file picker is a label wrapping a hidden input, which is invisible to the
   keyboard unless the input stays focusable and the label shows the ring on its
   behalf. This belongs in a FilePicker primitive the next time components/ui is
   opened; until then it is one string rather than four hand rolled variants. */
const PICKER_FOCUS =
  "cursor-pointer has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 " +
  "has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[color:var(--state-focus-ring)]";

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
  const callsLost = callPosts.filter((p) => p.call?.verdict === "miss").length;
  const settledCalls = callsWon + callsLost;
  /* Hit-rate on settled calls only, an honest track record, blank until at
     least a few calls have resolved so a lone lucky call can't read as 100%. */
  const hitRate =
    settledCalls >= 3 ? Math.round((callsWon / settledCalls) * 100) : null;
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

  const shareProfile = () => {
    const url = `${window.location.origin}/u/${profile.handle}`;
    const who = profile.display_name ?? `@${profile.handle}`;
    void shareOrCopy(url, `${who} on The Ravenspire`);
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-4 sm:py-6">
      {/* ── Hero band ─────────────────────────────────────────────────── */}
      <Card
        pad="none"
        className="relative h-32 overflow-hidden sm:h-40"
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
          <Button
            variant="glass"
            size="md"
            render={<label className={PICKER_FOCUS} />}
            className="absolute right-3 top-3 text-xs text-bone-mut"
          >
            <Icon name="image" className="h-3.5 w-3.5" />
            {uploading === "banner" ? "Uploading" : "Change banner"}
            <input
              type="file"
              accept={portraitAccept}
              className="sr-only"
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPortrait(f, "banner");
                e.target.value = "";
              }}
            />
          </Button>
        )}
      </Card>

      {/* Positioned and later in the DOM than the banner, so it paints above it
          without needing a rung off the z-index scale. */}
      <div className="relative -mt-8 px-4">
        <div className="flex items-end justify-between gap-3">
          {isOwn ? (
            <label
              className={`group relative inline-flex ${PICKER_FOCUS} rounded-[var(--radius-full)]`}
            >
              <Avatar author={displayProfile} size={76} />
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-full)] bg-obsidian/60 opacity-0 transition-opacity duration-fast ease-out-quint group-hover:opacity-100"
              >
                <Icon name="image" className="h-5 w-5 text-bone" />
              </span>
              {uploading === "avatar" && (
                <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-full)] bg-obsidian/70 text-[9px] font-semibold uppercase tracking-wider text-bone">
                  Sealing
                </span>
              )}
              <span className="sr-only">Change your portrait</span>
              <input
                type="file"
                accept={portraitAccept}
                className="sr-only"
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
              <Button variant="gold" size="lg" onClick={onEdit}>
                <Icon name="sliders" className="h-3.5 w-3.5" />
                Edit profile
              </Button>
            ) : (
              <Badge variant="gold">This is your Keep</Badge>
            )
          ) : (
            /* Follow always renders so blocking never shifts it. The menu is
               anchored to its own trigger and portals, so opening it never
               moves the Follow button or the surrounding header. Block lives
               only inside this menu, never loose. */
            <div className="flex items-center gap-2">
              <Button
                variant={following ? "glass" : "gold"}
                size="lg"
                onClick={toggleFollow}
                aria-pressed={following}
                className={following ? "text-bone-mut" : ""}
              >
                {following ? "Following" : "Follow"}
              </Button>
              <Menu
                trigger={
                  <IconButton
                    icon="dots"
                    label="More"
                    variant="glass"
                    size="lg"
                  />
                }
              >
                <MenuItem icon="share" onClick={shareProfile}>
                  Share profile
                </MenuItem>
                <MenuItem
                  icon="bell"
                  onClick={() => {
                    void realmFetch("/api/mutes", {
                      method: "POST",
                      json: { muted_id: profile.id },
                    });
                  }}
                >
                  Mute
                </MenuItem>
                <MenuItem icon="shield" onClick={() => void toggleBlock()}>
                  {isBlocked ? "Unblock" : "Block"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  icon="flag"
                  tone="danger"
                  onClick={() => {
                    void realmFetch("/api/reports", {
                      method: "POST",
                      json: {
                        subject_type: "profile",
                        subject_id: profile.id,
                        reason: "member_flag",
                      },
                    });
                  }}
                >
                  Report
                </MenuItem>
              </Menu>
            </div>
          )}
        </div>

        {isOwn && portraitError && (
          <p role="alert" className="mt-2 text-xs text-state-danger">
            {portraitError}
          </p>
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
              className="flex h-6 w-6 items-center justify-center rounded-md border border-steel-line bg-void text-bone-mut transition-colors duration-fast ease-out-quint hover:border-gold/40 hover:text-bone"
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
          {profile.is_agent && <Badge variant="gold">Herald of the realm</Badge>}
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
                <Button
                  key={l.url}
                  variant="glass"
                  size="sm"
                  render={
                    <a href={l.url} target="_blank" rel="noopener noreferrer" />
                  }
                  className="max-w-full max-md:h-11 font-medium text-bone-mut"
                >
                  <Icon name="compass" className="h-3 w-3 shrink-0 text-gold" />
                  <span className="truncate">{l.label || l.url}</span>
                </Button>
              ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-bone-faint">
          {house && (
            <Link
              href={`/houses/${house.slug}`}
              className="flex items-center gap-1.5 hover:text-gold"
            >
              <Icon name="banner" className="h-3.5 w-3.5" />
              {house.name}
            </Link>
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

        {/* The public oath record. Renders only once there is more than one
            oath to show, since a single oath is what the banner above says. */}
        <OathHistory profileId={profile.id} />

        <div className="tnum mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
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
          {hitRate !== null && (
            <span title={`${callsWon} of ${settledCalls} settled calls hit`}>
              <Badge variant="gold" icon="target">
                {hitRate}% hit rate
              </Badge>
            </span>
          )}
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

        {/* Earnings and balance close the hero band: this is the member's
            standing, the same readout as Renown and Calls won above it, and its
            privacy gate lives server side in /api/profile/earnings, which
            respects the PnL and public-positions toggles. */}
        <EarningsSection
          profileId={profile.id}
          handle={profile.handle}
          own={isOwn}
        />
      </div>

      {/* ── Tabs, then panels ─────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "posts" | "calls" | "media")}
        className="mt-5"
      >
        <TabsList>
          <Tab value="posts">
            Ravens{" "}
            <span className="tnum text-bone-faint">{posts.length}</span>
          </Tab>
          <Tab value="calls">
            Calls{" "}
            <span className="tnum text-bone-faint">{callPosts.length}</span>
          </Tab>
          <Tab value="media">
            Media{" "}
            <span className="tnum text-bone-faint">{mediaTiles.length}</span>
          </Tab>
        </TabsList>

        <TabsPanel value="posts" className="mt-3">
          <PostPanel
            posts={posts}
            empty={
              <EmptyState
                icon="raven"
                title={isOwn ? "Your Keep awaits its first raven" : "No ravens yet"}
                body={
                  isOwn
                    ? "Send one and it lands here for good."
                    : "This Keep has sent no word to the realm."
                }
                action={
                  isOwn ? (
                    <Button variant="gold" size="lg" render={<Link href="/compose" />}>
                      Send a raven
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </TabsPanel>

        <TabsPanel value="calls" className="mt-3">
          <PostPanel
            posts={callPosts}
            empty={
              <EmptyState
                icon="target"
                title="No Calls sealed yet"
                body={
                  isOwn
                    ? "A Call seals a live price and lets the market judge it."
                    : "This Keep has staked nothing on a price yet."
                }
                action={
                  isOwn ? (
                    <Button variant="gold" size="lg" render={<Link href="/compose" />}>
                      Seal a Call
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </TabsPanel>

        <TabsPanel value="media" className="mt-3">
          {mediaTiles.length === 0 ? (
            <Card pad="none">
              <EmptyState
                icon="image"
                title="No images from this Keep yet"
                body={
                  isOwn
                    ? "Ravens carrying an image or a video collect here."
                    : "Nothing this member has sent carried a picture."
                }
                action={
                  isOwn ? (
                    <Button variant="gold" size="lg" render={<Link href="/compose" />}>
                      Send a raven
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {mediaTiles.map((m) => (
                <Link
                  key={m.key}
                  href={`/post/${m.postId}`}
                  className="block aspect-square overflow-hidden rounded-lg border border-steel-line"
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
          )}
        </TabsPanel>
      </Tabs>
    </div>
  );
}

/* A panel holding a stream of ravens. Same fixed gap as the Ravenry, so a Keep
   and the feed read as the same product. */
function PostPanel({
  posts,
  empty,
}: {
  posts: Post[];
  empty: React.ReactNode;
}) {
  if (posts.length === 0) return <Card pad="none">{empty}</Card>;
  return (
    <StreamList>
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </StreamList>
  );
}
