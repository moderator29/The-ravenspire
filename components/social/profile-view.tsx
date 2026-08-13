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
import { HoardPanel } from "@/components/collectibles/hoard-panel";
import { Icon } from "@/components/ui/icon";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { StreamList } from "@/components/stream/stream-shell";
import {
  DossierBanner,
  DossierHeader,
  DossierHero,
  DossierIdentity,
  DossierPage,
  DossierTabPanel,
  DossierTabs,
} from "@/components/dossier/dossier-shell";
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
import { shareUrl } from "@/lib/share/links";
import { ShareButton } from "@/components/share/share-button";

/* A Keep, on the Dossier archetype.

   Hero band, then tabs, then panels, always in that order. The hero is the one
   place in a Dossier that may carry any weight at all: here that is the banner
   and the member's crests. Everything below it is Ledger, flat and quiet.

   The tab strip is the underline pattern rather than a chip rail, because these
   are sections of one subject with counts, which is the rule in section 3.

   All of that is now the Dossier shell rather than this file's own reading of
   it: the frame, the banner band, the identity block that overlaps it, and the
   tab strip with its counts. This file describes the subject; the shell
   decides what a Dossier looks like. */

/* A file picker is a label wrapping a hidden input, which is invisible to the
   keyboard unless the input stays focusable and the label shows the ring on its
   behalf. This belongs in a FilePicker primitive the next time components/ui is
   opened; until then it is one string rather than four hand rolled variants. */
const PICKER_FOCUS =
  "cursor-pointer has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 " +
  "has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[color:var(--state-focus-ring)]";

export type ProfileTab = "posts" | "calls" | "media" | "hoard";

export function ProfileView({
  profile,
  own = false,
  back = false,
  onEdit,
  tab: controlledTab,
  onTabChange,
}: {
  profile: PublicProfile;
  own?: boolean;
  /* House rule 16. A Keep reached from a raven, a board or a roster is
     navigated into and needs a way back; the member's own Keep is a dock
     destination and does not. */
  back?: boolean;
  onEdit?: () => void;
  /* Optionally controlled, so a route that carries the panel in its URL can
     drive it. The member's own Keep does, because the dock's contextual strip
     links `?tab=calls` and `?tab=media` and something has to answer those.
     A public /u/handle passes neither and keeps its own state. */
  tab?: ProfileTab;
  onTabChange?: (next: ProfileTab) => void;
}) {
  const { authenticated } = useRealmAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [crestSlugs, setCrestSlugs] = useState<string[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [internalTab, setInternalTab] = useState<ProfileTab>("posts");
  const tab = controlledTab ?? internalTab;
  const setTab = (next: ProfileTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };
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

  /* Both of the writes on this Keep flipped optimistically and kept the new
     state when the server refused, so a follow that never happened read as a
     follow, and the follower tally moved with it. FollowButton, which is the
     same verb on the same route, has rolled back since it was written; these
     two never did. */
  const [writeError, setWriteError] = useState<string | null>(null);
  const refuse = (message: string) => {
    setWriteError(message);
    window.setTimeout(() => setWriteError(null), 2600);
  };

  const toggleBlock = async () => {
    if (!authenticated) {
      window.location.href = "/signin";
      return;
    }
    const on = !isBlocked;
    const wasFollowing = following;
    setIsBlocked(on);
    if (on) setFollowing(false);
    const res = await realmFetch("/api/blocks", {
      method: "POST",
      json: { profile_id: profile.id, on },
    });
    if (!res.ok) {
      setIsBlocked(!on);
      if (on) setFollowing(wasFollowing);
      refuse("The realm would not change that. Try again.");
    }
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
    const res = await realmFetch("/api/social", {
      method: "POST",
      json: { action: "follow", subject_id: profile.id, on },
    });
    if (!res.ok) {
      setFollowing(!on);
      setCounts((c) => ({ ...c, followers: c.followers - (on ? 1 : -1) }));
      refuse(
        on ? "That follow did not reach the realm." : "That could not be undone."
      );
    }
  };

  /* Somebody else's Keep, from the overflow menu. No banner rides on this one:
     crediting the viewer for traffic to a Keep that is not theirs would take a
     recruit the subject had at least as good a claim to. bannerFor enforces
     that; passing `own: false` here is stating it at the call site too. */
  const shareProfile = () => {
    const url = shareUrl(
      window.location.origin,
      { kind: "keep", handle: profile.handle ?? "" },
      { handle: null, own: false }
    );
    if (!url) return;
    const who = profile.display_name ?? `@${profile.handle}`;
    void shareOrCopy(url, `${who} on The Ravenspire`);
  };

  return (
    <DossierPage>
      {back ? <DossierHeader /> : null}

      {/* Hero band. The one place in a Dossier that may carry any weight. */}
      <DossierHero>
      <DossierBanner
        style={
          displayProfile.banner_url
            ? {
                backgroundImage: `url(${displayProfile.banner_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {
                background: `radial-gradient(ellipse 70% 90% at 30% 0%, ${house?.color ?? "#D9B040"}1e, transparent), linear-gradient(180deg, #101017, #0C0C11)`,
              }
        }
      >
        {isOwn && (
          <Button
            variant="glass"
            size="md"
            dense
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
      </DossierBanner>

      <DossierIdentity>
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

          {/* The Keep's header actions sit at `md`, not `lg`. As primary CTAs
              they had grown into the heaviest thing in the header, above the
              member's own name, which is backwards: a member looks at their
              Keep to see their standing, not to press Edit. `md` keeps the
              gold weight and the 44px touch target while tightening the height
              and padding, so the actions read as controls rather than as the
              headline. */}
          {isOwn ? (
            /* A member's own Keep is the single most shared thing the realm
               has, and until mission 10 the only way to share it was an
               overflow menu on somebody ELSE'S Keep: there was no share
               control on your own at all. It sits beside Edit rather than in
               a menu because a control nobody can find is a control that does
               not exist. `subjectHandle` matching the viewer is what lets the
               referral banner ride along, which is exactly the case where
               that is honest. */
            <div className="flex items-center gap-2">
              <ShareButton
                /* A handle that is not yet claimed produces no path and
                   therefore no button, which is correct: there is nothing to
                   share until the Keep has a name. */
                target={{ kind: "keep", handle: profile.handle ?? "" }}
                subjectHandle={profile.handle}
                size="md"
                title={`${profile.display_name ?? `@${profile.handle}`} on The Ravenspire`}
              />
              {onEdit ? (
                <Button variant="gold" size="md" dense onClick={onEdit}>
                  <Icon name="sliders" className="h-3.5 w-3.5" />
                  Edit profile
                </Button>
              ) : (
                <Badge variant="gold">This is your Keep</Badge>
              )}
            </div>
          ) : (
            /* Follow always renders so blocking never shifts it. The menu is
               anchored to its own trigger and portals, so opening it never
               moves the Follow button or the surrounding header. Block lives
               only inside this menu, never loose. */
            <div className="flex items-center gap-2">
              <Button
                variant={following ? "glass" : "gold"}
                size="md"
                dense
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
                    size="md"
                    dense
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

        {writeError && (
          <p
            role="status"
            className="mt-2 flex items-center gap-1.5 text-xs text-state-danger"
          >
            <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
            {writeError}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-bone">
            {profile.display_name ?? profile.handle}
          </h1>
          {/* Hand written this was a 24x24 anchor with a `title` doing the work
              of an accessible name. IconButton carries both: the name, and the
              44px floor on a finger that no call site has to remember. */}
          {profile.x_handle && (
            <IconButton
              icon="xlogo"
              label={`@${profile.x_handle} on X`}
              variant="glass"
              size="sm"
              render={
                <a
                  href={`https://x.com/${profile.x_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            />
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

        {/* The House is the one navigable fact in this row and it was dressed
            exactly like the two beside it: a 108x16 flex link that neither
            looked like a control nor could be hit like one. As a chip off the
            Button scale it reads as the affordance it is and clears 44px on a
            finger; the facts around it stay text, which is what they are. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-bone-faint">
          {house && (
            <Button
              variant="glass"
              size="sm"
              pad="sm"
              render={<Link href={`/houses/${house.slug}`} />}
              className="font-medium text-bone-mut"
            >
              <Icon name="banner" className="h-3.5 w-3.5 text-gold" />
              {house.name}
            </Button>
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

      </DossierIdentity>
      </DossierHero>

      {/* The tab line sits directly under the identity block, at the top of
          the dashboard, per the founder's direction: plain text on one line,
          no chip containers, the gold underline naming the current panel. It
          used to sit below the Coffers, which on a phone put it below the
          fold, and the dock strip duplicated it at the bottom of the screen
          as boxed chips. The strip is gone; this line is the one switcher.

          Renown and Saved ride the same line as quiet links when the Keep is
          the viewer's own, because they were the strip's other two entries
          and they navigate somewhere real rather than switching a panel. */}
      <DossierTabs
        value={tab}
        onValueChange={(v) => setTab(v as ProfileTab)}
        tabs={[
          { value: "posts", label: "Ravens", count: posts.length },
          { value: "calls", label: "Calls", count: callPosts.length },
          { value: "media", label: "Media", count: mediaTiles.length },
          /* The Hoard carries no count. Every other tab counts something the
             Keep already holds in memory; this one would have to be fetched
             before the member had asked to see it, and a trophy case is worth
             one deliberate press. */
          { value: "hoard", label: "Hoard" },
        ]}
        trailing={
          isOwn ? (
            <>
              <Link
                href="/renown"
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-semibold text-bone-faint transition-colors duration-fast ease-out-quint hover:text-bone-mut touch:min-h-11"
              >
                Renown
              </Link>
              <Link
                href="/bookmarks"
                className="inline-flex shrink-0 items-center whitespace-nowrap rounded-t-md px-3 py-2.5 text-sm font-semibold text-bone-faint transition-colors duration-fast ease-out-quint hover:text-bone-mut touch:min-h-11"
              >
                Saved
              </Link>
            </>
          ) : undefined
        }
      >
        {/* The Coffers holds its place on every panel: it is the member's
            standing, not one tab's content, so it sits between the tab line
            and the panels the way a pinned card would. Its privacy gate lives
            server side in /api/profile/earnings. */}
        <EarningsSection
          profileId={profile.id}
          handle={profile.handle}
          own={isOwn}
        />
        <DossierTabPanel value="posts">
          <PostPanel
            posts={posts}
            empty={
              <EmptyState
                icon3d="raven"
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
        </DossierTabPanel>

        <DossierTabPanel value="calls">
          <PostPanel
            posts={callPosts}
            empty={
              <EmptyState
                icon3d="call-orb"
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
        </DossierTabPanel>

        <DossierTabPanel value="media">
          {mediaTiles.length === 0 ? (
            <Card pad="none">
              <EmptyState
                icon3d="media"
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
        </DossierTabPanel>

        {/* The trophy case. It loads itself, and only when this panel is the
            one on screen, so a Keep opened to read someone's ravens never pays
            for a collection nobody looked at. */}
        <DossierTabPanel value="hoard">
          <HoardPanel handle={profile.handle} own={isOwn} />
        </DossierTabPanel>
      </DossierTabs>
    </DossierPage>
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
