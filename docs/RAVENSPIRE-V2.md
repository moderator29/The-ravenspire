# Ravenspire V2: The Living Realm

The living source of truth for the V2 transformation. This document replaces the
Wave 4 direction in `docs/PRODUCT-BACKLOG.md` as the primary plan. The 261-finding
`docs/AUDIT.md` is retained as a historical record, not as the active backlog.

Status: **awaiting product-owner decisions** (see section 22). Audit complete,
plan drafted, implementation not started.

---

## 1. What Ravenspire actually is today

Stated plainly, because the plan depends on being honest here.

Ravenspire is **a crypto trading and on-chain intelligence terminal with a social
network attached, wrapped in medieval fantasy branding, plus one arcade RPG.**

That is not what the Chronicle says, not what the FAQ says, and not what the V2
directive wants. But it is what the code is. The evidence:

| Signal | Reading |
| --- | --- |
| 9 of 24 live nav destinations are crypto tools, 7 tagged Beta | The Tools group is the largest single section of the product |
| Largest page: `/swap` at 1,128 LOC. Then `/whispers` 763, `/watch` 562, `/coin/[address]` 558 | Three of the four largest pages are trading surfaces |
| Largest component: `war/battle-engine.tsx` 1,111 LOC, then `trade/trade-panel.tsx` 871 | The two deepest builds are a game engine and a trade panel |
| `components/wallet/` is 24 files, 3,618 LOC | The wallet is the single most-built feature area |
| `app/(shell)/home/page.tsx` is **17 lines** | The Ravenry, the supposed heart, is a heading and a `<Feed/>` |
| `CallData` is `{token, stance, timeframe, entry_price, verdict}` | A Call can only ever be a crypto price bet |
| Houses are a hardcoded 6-item array, a feed filter, and a glory integer | Houses are cosmetic |
| Landing hero: "See every chain. Fear no rug. Rule your realm." | The top-line promise is a crypto-tool promise |

**The gravitational problem.** Almost everything valuable a member does happens
alone, inside a tool, and produces nothing anyone else can see. You check the
Ledger alone. You scan a coin in the Watch alone. You swap alone. You read your
DNA alone. None of it reaches the Ravenry. The result is a Twitter clone sitting
next to a Bloomberg terminal, sharing a login and a colour palette.

This is the real reason the platform does not feel alive. It is not a shortage of
features. It is that the features do not talk to each other.

---

## 2. What is already excellent (do not touch)

Being clear about this matters, because V2 is an evolution and there is a lot
worth protecting.

1. **The brand and token layer.** `app/globals.css` is genuinely disciplined:
   obsidian and gold, ember, bone, steel, an explicit "no green, ever" rule, a
   rarity ladder, and coherent glass utilities. This is the best-executed part of
   the product and V2 should build on it, not replace it.
2. **Type safety.** `npm run typecheck` passes with **zero errors** across ~50k
   LOC of strict TypeScript. That is rare and valuable.
3. **The points economy is genuinely server-authoritative.** `award()` writes a
   ledger row, then calls an atomic `increment_profile_totals` RPC. No client can
   mint points. The tier ladder is mirrored in SQL.
4. **Quest anti-cheat is real.** `lib/game/quest-verify.ts` verifies 13 of 18
   quests against actual rows and fails closed on error.
5. **Non-custodial discipline is absolute.** Every value transfer is signed by the
   member's own Privy wallet. The platform genuinely cannot move funds.
6. **Call entry prices are sealed server-side.** The client cannot supply an entry
   price. This is the correct design and the foundation Calls V2 builds on.
7. **The War battle engine.** 1,111 LOC of working canvas game with a hardened,
   session-based, server-settled economy.
8. **Duel settlement is atomic.** Guarded conditional updates make duel entry and
   settlement race-safe.
9. **The realm lexicon.** The Ravenry, Whispers, the Rookery, Keeps, Crests,
   Renown, Houses. The naming is consistent and distinctive.

---

## 3. What is weak

### 3.1 Critical, security and data integrity

| # | Finding | Evidence |
| --- | --- | --- |
| C1 | **Post audience selection is not enforced.** The feed runs in the browser under the anon key; the audience filter is a client-built PostgREST `.or()` string plus a JS `.filter()`. Either RLS is permissive and every "Followers only" / "House only" / "Mentions only" raven is readable by anyone querying `posts` directly, or the feature does not work at all. Both are bad. | `lib/social/queries.ts:1` is `"use client"`, uses `lib/supabase/client`, filters at `:150` and `:163` |
| C2 | **The database cannot be rebuilt from the repo.** Only 6 tables have a `CREATE TABLE` in `supabase/migrations/`. The other ~31 (profiles, posts, follows, comments, houses, notifications, duels, seasons...) exist only in the live project. **No RLS policy for any core table is in version control.** | Verified: `grep` for `create table.*profiles\|posts\|follows` returns nothing |
| C3 | **All follower fan-out notifications are silently dead.** `lib/notifications.ts:136` filters on `follows.followed_id`; the real column is `followee_id` (16 uses elsewhere). Errors are swallowed. `follow_call` and `follow_trade` have never fired. | Verified by grep: exactly 2 uses of `followed_id`, both bugs |
| C4 | **Anthropic spend is effectively uncapped.** `/api/dna` is public and rate-limited on a spoofable `x-forwarded-for`. `/api/compose-suggest` has no limit. `/api/raven` uses a per-lambda in-memory `Map`, the exact bug `lib/rate-limit.ts` was written to fix. | `app/api/raven/route.ts:12`, `app/api/dna/route.ts:56` |
| C5 | **Paid quota is exposed anonymously.** `/api/approvals`, `/api/ledger`, `/api/ledger/trend`, `/api/wallet/balances` are public and burn GoldRush credits for arbitrary addresses. `/api/scrying` is public and is the heaviest fan-out in the app. | Agent B route inventory |
| C6 | **`/api/health` is public** and leaks the Supabase project ref, profile count, which env vars are set, and service-role JWT claims. | `app/api/health/route.ts` |
| C7 | **On-chain receipts are never verified.** `/api/tips` and `/api/trade/record` accept any well-formed `tx_hash` and mint a tribute row plus a notification. | Agent B |

### 3.2 Structural (these block V2 more than any missing feature)

| # | Finding |
| --- | --- |
| S1 | **There is no feed card system.** `components/social/post-card.tsx` is one 661-line component that renders every variant inline via conditionals. `Post.kind` is only `raven \| call \| poll` and is barely used. Adding any new card type means editing this one file. This is the single biggest blocker to a living Ravenry. |
| S2 | **There is no design system.** `components/ui/` contains exactly two files (`icon.tsx`, `overflow-menu.tsx`). No Button, Card, Modal, Input, Tabs, Badge, Sheet, Skeleton, or EmptyState. All of it is re-derived per file, over 100 times. A `Toggle`/`Card` set exists but is quarantined in `components/settings/ui.tsx`. This is the source of every inconsistency anyone feels. |
| S3 | **Three parallel icon systems** with overlapping names: `components/ui/icon.tsx`, `components/landing/icons.tsx`, `components/brand/crests.tsx`. `Icon` falls back to a blank circle on a typo, with no dev warning. |
| S4 | **48 of 55 pages are `"use client"`.** No RSC, no streaming, no per-page metadata. A social product whose posts do not unfurl properly is losing its primary growth loop. |
| S5 | **No tests, no CI.** Zero test files, no `.github/`. PRs merge to `main` with no lint, typecheck, or build gate. |

### 3.3 Product

| # | Finding |
| --- | --- |
| P1 | **Calls, the intended flagship, have no home.** No `/calls` route, no leaderboard, no detail view, no per-caller subscription. They exist only as a post kind and a `Signal` feed tab. |
| P2 | **Call verdicts are binary and unfair.** `hit = price > entry`. A +0.01% move is a win. No magnitude, no threshold, no difficulty, no partial credit, and **no penalty for a miss**. A member can spam low-conviction calls at zero risk. |
| P3 | **Calls settle by ticker, not address.** `lookupToken(call.token)` re-resolves the symbol and ignores the stored `address`/`chain`. A recycled ticker settles against the wrong token. |
| P4 | **Settlement ceiling of 100 calls/day.** `LIMIT 100` on a daily cron, ordered oldest-first, with immature 7d/30d calls consuming slots. |
| P5 | **Houses are cosmetic.** No roster, no leadership, no join/leave, no house chat, no progression, no house-vs-house anything. `house_members` is written at onboarding and **never read**. |
| P6 | **The season game that gave Houses meaning was deleted.** `/throne` is a 140-line teaser; the real 680-line game is in commit `eae1d6b`. Its backend (`/api/quests`, `/api/duels`, `lib/game/quests.ts`) is fully intact and still running. Meanwhile `/throne` occupies **1 of 5 mobile bottom-nav tabs**. |
| P7 | **The War has zero connection to anything social.** Separate currency (`gold`, `war_glory`), no link to Calls, Houses, Renown, or the feed. The deepest-built game is an island. |
| P8 | **No inline composer on the feed.** Posting requires the FAB, then a navigation to `/compose`. |
| P9 | **IA overload.** ~30 side-nav links in one column, themed-only labels that hide the plain name until hover (invisible on touch), 6 identical `/soon` stubs, `/keep` unreachable from mobile nav. |
| P10 | **Positioning contradicts itself three ways on one page load.** `app/layout.tsx:23` says "a medieval social realm where wit wins glory"; the hero says "See every chain. Fear no rug."; the FAQ says "a social realm first, a crypto tool second." "SocialFi" appears in `components/landing/realm-intro.tsx:68`, both legal pages, `README.md`, and `docs/PLATFORM.md`. |
| P11 | **Raven is passive.** Every AI path is request-response. There is no background job, no scheduled AI, no proactive agent. The only scheduled work in the entire system is the verdicts cron, which contains no AI. |
| P12 | **Raven chat history is localStorage-only**, capped at 40 conversations, lost on device change. AI prefs are split between localStorage and the server. |

### 3.4 Bugs worth naming

| # | Finding |
| --- | --- |
| B1 | **Feed pagination is broken.** `components/social/feed.tsx:87` reads `posts[posts.length-1]` inside a `useCallback` with deps `[tab, authenticated]` and an eslint-disable at `:104`. `posts` is captured stale, so `before` is always `undefined`: "Older ravens" refetches page 1 forever and appends duplicate keys. **This is on the flagship surface.** |
| B2 | House halls hide their own members' posts. `app/(shell)/houses/[slug]/page.tsx:30` calls `fetchFeed` with no viewer context. |
| B3 | Profile hit-rate is computed from a truncated 50-post window (`profile-view.tsx:153`). |
| B4 | `--chart-up` / `--chart-down` are referenced in `call-chart.tsx:61` but never defined; off-brand hardcoded hexes always win. |
| B5 | Referral activation uses `postCount === 3` exact equality. Deleting a post permanently skips the milestone. |
| B6 | Widespread non-atomic counters (`like_count`, `reply_count`, `repost_count`, `view_count`, `houses.member_count`, `war_state.gold`). Concurrent writes lose increments. |
| B7 | `notifyFollowers` is a sequential loop of up to 1,000 iterations, each doing a SELECT, an INSERT, and an HTTP broadcast, on the request path. |
| B8 | `POST /api/rooms/messages` lets any member post into any room without joining. |
| B9 | Dead code: `lib/sections.ts` (159 LOC) and `components/shell/section-placeholder.tsx` have zero imports. `/wallet` is a cosmetic duplicate of `/vault`. |

---

## 4. The V2 thesis

> **Ravenspire does not need twenty new features. It needs one spine.**
>
> Every meaningful act anywhere in the realm should emit an event, and the
> Ravenry should be where those events land.

Call it **the Realm Event Spine**. One table, one `emit()` helper, one card
registry in the feed. Then:

| Something happens | The Ravenry shows |
| --- | --- |
| A Call is sealed | A Call card with live price and the caller's running accuracy |
| A Call resolves | A verdict card: hit or miss, magnitude, what it did to their record |
| A crest is earned | An achievement card |
| A House overtakes another | A standings-shift card |
| A duel opens | A duel card you vote on **inline** |
| A quest completes | A quest card |
| Raven finishes its daily read | A Chronicle card |
| A member swears a new oath | An oath card, part of their story |
| A season enters its final week | A world-event card |

This one architectural change delivers six separate directive objectives at once:
rich feed card types, the Ravenry as the operating system, Houses that feel alive,
Calls that are enjoyable for spectators, Raven as an active citizen, and games that
drive engagement back into the feed.

It is also the most conservative possible change. It **adds** to every existing
feature instead of replacing any of them. The Ledger, the Watch, the Swap, the War,
the Vault all keep working exactly as they do. They simply start producing events
that other people can see.

### The second idea: a Call is any resolvable claim

Today a Call is `{token, stance, timeframe, entry_price, verdict}`. Crypto price,
up or down, that is the entire expressive range. **This is why the platform reads
as SocialFi no matter what the copy says.** No amount of rewriting the landing page
changes the fact that the signature mechanic only accepts token tickers.

Generalize it. A Call becomes a claim with a **category** and a **resolver**:

- `markets` (resolver: `price`) - the existing behaviour, unchanged
- `esports` / `gaming` (resolver: `manual` or `community`)
- `culture` / `sport` (resolver: `community`)
- `realm` (resolver: `internal`) - "House Emberfall takes the season", "this member reaches Warden by Friday". Self-resolving from our own data, zero external cost.

Backward compatibility is total: existing rows default to
`category: 'markets', resolver: 'price'`, the existing jsonb shape becomes the
price resolver's payload, and `cron/verdicts` keeps doing exactly what it does for
that resolver. **No migration of existing call data is required.**

The `realm` category is the sleeper. It costs nothing (we own the data), it cannot
be gamed by an external oracle, and it makes the realm itself the thing people
predict. That is the most direct possible expression of "a competitive online realm
where communities build reputation through participation."

### The third idea: dissolve the Throne, do not restore it

The directive says the paused game should not automatically return. That is the
right call, and I would go further: **it should not return as a destination at all.**

But its mechanics (quests, duels, streaks, House Glory) are the only things that
ever made Houses matter, and the entire backend is still live and running. So:
dissolve them into the realm via the event spine.

- Duels become feed cards you vote on inline, not a page you visit.
- Quests become a compact strip at the top of the Ravenry.
- House Glory becomes a live standing on the House hall.
- The season becomes a countdown in the right rail.

The game stops being a place and becomes a layer. That respects the instruction,
captures the value that was built, frees a mobile nav slot, and costs less than
restoring the page would.

---

## 5. Keep, Upgrade, Merge, Remove, Postpone

| Verdict | Items |
| --- | --- |
| **KEEP untouched** | Brand tokens and `globals.css` palette; Privy non-custodial architecture; `award()` / points RPCs; quest verification; duel settlement; Call server-side price sealing; the War battle engine; Whispers; the Rookery; Crests; the realm lexicon |
| **UPGRADE** | The Ravenry (card registry, inline composer, real pagination); Calls (categories, resolvers, magnitude, a home); Houses (roster, oath history, computed leadership, progression); Raven (proactive, cached, streaming, server-persisted history); the design system (build the missing primitives); Admin (cover the new systems); Chronicle and landing (reposition) |
| **MERGE** | `/explore` inline search into `/search` (two search UXs on two backends); `/wallet` into `/vault` (cosmetic duplicate); the three icon sets into one; `WhoToFollow` duplicated in `right-rail.tsx`; the 4 copy-pasted realtime broadcast helpers into `lib/realtime.ts`; the 3 copies of `sigilIcon` into `lib/data/houses.ts` |
| **REMOVE** | `lib/sections.ts` + `section-placeholder.tsx` (zero imports); `/wallet` route; the hardcoded `"Calls won: 27"` stat in `platform-preview.tsx:241`; the in-memory rate limiter in `/api/raven`; "SocialFi" from all 4 shipping-code locations |
| **POSTPONE** | Restoring `/throne` as a page (dissolve instead); House elections (computed leadership first); paid API upgrades; on-chain $RSP; creator monetization (already decided off) |
| **DECIDE** | The 6 `/soon` chapters: 6 identical stubs with a "Notify me" button that goes to `/ravens` and registers nothing. Either make them real teasers that capture interest, or cut them to 2. See question Q7. |

---

## 6. Proposed V2 architecture

### 6.1 The Realm Event Spine

```
supabase/migrations/<ts>_realm_events.sql

realm_events
  id           uuid pk
  kind         text        -- 'call.sealed' | 'call.resolved' | 'crest.earned'
                           -- 'house.overtake' | 'duel.opened' | 'quest.completed'
                           -- 'oath.sworn' | 'season.milestone' | 'raven.chronicle'
  actor_id     uuid null   -- the member who caused it (null for world events)
  subject_type text null   -- 'post' | 'profile' | 'house' | 'duel' | 'season'
  subject_id   text null
  house_slug   text null   -- for house-scoped events
  payload      jsonb       -- kind-specific, versioned
  audience     text        -- 'realm' | 'house' | 'followers' | 'actor'
  created_at   timestamptz default now()
```

One helper, mirroring the existing `award()` pattern:

```ts
// lib/realm/events.ts
export async function emit(db, event: RealmEvent): Promise<void>
```

Called from the same server routes that already call `award()`. Fire-and-forget
via `after()` so it never blocks a request. **This is additive: no existing table
or route changes shape.**

### 6.2 The feed card registry

Replace the 661-line conditional in `post-card.tsx` with a discriminated union and
a registry:

```ts
// components/feed/registry.ts
type FeedItem =
  | { source: 'post';  post: Post }
  | { source: 'event'; event: RealmEvent }

const CARDS: Record<string, FeedCardComponent> = {
  'post.raven': RavenCard,
  'post.call':  CallCard,
  'post.poll':  PollCard,
  'call.resolved':   VerdictCard,
  'crest.earned':    AchievementCard,
  'house.overtake':  StandingsCard,
  'duel.opened':     DuelCard,
  'raven.chronicle': ChronicleCard,
  // adding a card type is one entry, not an edit to a 661-line file
}
```

`post-card.tsx` becomes `RavenCard` plus extracted `CallCard`, `PollCard`,
`MediaGrid`, `ActionBar`. Same rendering, decomposed.

### 6.3 Calls as a first-class domain

```
lib/calls/
  types.ts       -- Call, CallCategory, Resolver, Confidence
  resolvers/
    price.ts     -- existing behaviour, settles by address not ticker
    internal.ts  -- realm-data claims, zero external cost
    community.ts -- realm votes on the outcome
    manual.ts    -- admin resolution
  scoring.ts     -- magnitude, difficulty, streaks, Brier-style accuracy
```

`posts.call` jsonb gains `category`, `resolver`, `confidence`, `rationale`,
`target` (optional). Existing rows read as `markets`/`price` with no migration.

New surface: **`/calls`**, the home the flagship has never had. Trending calls,
open calls you can follow, a resolution feed, and the caller leaderboard.

### 6.4 What does not change

Auth (Privy + `requireProfile`), the points economy, the wallet, the trade stack,
the War engine, Whispers, the Rookery, storage, and the entire brand token layer.
V2 is a spine and a card layer added to a working product, not a rewrite.

---

## 7. The new user journey

**Today:** land on a crypto-tool hero, sign in, pick a handle, pick a House
(cosmetically), arrive at a feed with no composer, and find 30 nav links.

**V2:**

1. **Land** on a realm that shows live activity, not claims about it.
2. **Swear** to a House, and immediately see that House's standing, its roster, and what it needs this season.
3. **Arrive** in a Ravenry that is already moving: open calls to follow, a duel to vote on, your House's position, one quest you can finish today.
4. **Act** within 30 seconds: vote on a duel inline, follow a caller, or make your first Call from an inline composer.
5. **Return** because something happened *to you*: your Call resolved, your House overtook a rival, Raven named you in the daily Chronicle.

The retention loop is the event spine. The viral loop is a resolved Call with a
real accuracy record, which is inherently shareable and currently unfurls as a
blank card.

---

## 8. Ravenry V2

- Card registry (6.2) with, at launch: raven, call, verdict, poll, duel, achievement, house-standings, chronicle.
- **Inline composer** at the top of the feed (the highest-leverage funnel fix in the product).
- Fix pagination (B1). Add infinite scroll with a sentinel, keyset-paginated on `effectiveTime`.
- Move audience filtering server-side (C1).
- Quest strip and season countdown, absorbed from the dissolved Throne.
- Move filters server-side so a filter cannot silently empty a page.
- Realtime "new ravens" pill: scope the subscription so it stops firing for blocked, muted, and self posts.

## 9. Calls V2

Categories, resolvers, and scoring per 6.3, plus:

- **Confidence** (low/medium/high) set at creation, which scales both reward and penalty.
- **Magnitude-aware verdicts.** Replace `price > entry` with a threshold and a graded result. A 0.01% move is not a hit.
- **A real cost to being wrong.** Today a miss costs nothing, so spamming calls is free. Confidence-weighted Renown movement in both directions, with a floor so newcomers cannot go negative.
- Settle by contract address and chain, not ticker (P3).
- Raise the settlement ceiling and exclude immature calls from the batch (P4).
- Make the award conditional on `verdict = 'open'` to kill the double-award race.
- `/calls` index, per-call detail pages with discussion, caller profiles with a real accuracy record computed server-side over all calls (not a 50-post window).
- Follow a caller's calls (the notification path already exists, it is just wired to a broken column).

## 10. Raven AI V2

The single change that matters: **Raven stops waiting to be mentioned.**

- **A daily Chronicle job.** One scheduled run reads the last 24 hours of `realm_events` and posts a Chronicle card to the Ravenry. This is the whole "living realm" feeling in one cron entry, and it costs one Anthropic call per day.
- **Weekly House summaries**, one call per House per week.
- **Call analysis at creation:** similar past calls, the caller's record in that category, a confidence sanity check.
- Prompt caching on the ~2,500-word system prompt (a large, immediate cost win).
- Streaming responses.
- Server-persisted chat history (currently localStorage, capped at 40, lost on device change).
- Centralize `RAVEN_MODEL` (currently duplicated across three files and three clients).
- Wire the shared rate limiter and add a spend cap.

## 11. Houses V2

### 11.1 Verdict on the oath system

The proposal in the directive is good and I endorse it with two refinements:

**Endorsed as proposed:** Global Renown stays (personal legacy). House Glory
resets (you are under a new banner). House Crests become Legacy and cannot be
re-earned unless you return. A public oath history appears on the profile.

**Refinement 1: make it one oath per season, not one per 60 days.**
Easier to explain, thematically stronger ("you swore for this season"), and it
aligns the mechanic with the thing it affects. A raw day counter is arbitrary; a
season boundary is a story.

**Refinement 2: lock oaths during the final two weeks of a season.**
Without this, everyone defects to the winning House at the death. This one rule is
what makes the underdog narrative in the directive actually possible: to help an
underdog rise, you have to commit *early*, when it is still a risk.

Glory already contributed stays with the House that earned it. It does not follow
the member. This is both fairer and simpler.

**Data model:** `house_members` already exists, is written at onboarding, and is
**never read anywhere**. It becomes the oath history table with `sworn_at`,
`left_at`, `season_id`. No new table.

### 11.2 Verdict on leadership

Do not build elections yet. With a small population, an election with 20 voters
feels sad; a computed title feels earned immediately.

**Recommendation: derive leadership from contribution each season, automatically.**

| Role | Earned by |
| --- | --- |
| Lord / Lady | Top House Glory contributor this season |
| Hand of the House | Second |
| Master of Ravens | Best Call accuracy in the House (minimum volume) |
| Master of War | Top war Glory |
| Chronicler | Most engaged-with posts |
| Recruiter | Most referrals who actually became active |

Zero admin burden, zero new voting infrastructure, and it rotates every season,
which is a built-in re-engagement loop. Elections become a Phase 3 upgrade once
there is a population that makes voting meaningful.

### 11.3 The rest

House hall with a real roster, oath history, season standing, house-scoped events
from the spine, rivalries (the closest House by Glory, named), and progression
(House level from cumulative seasonal Glory).

## 12. Games V2

- **The War stays**, but gets connected: war victories emit events into the Ravenry, and war Glory feeds House standings. It stops being an island. This is a small change with a large effect.
- **Claim the Throne dissolves** into the Ravenry and Houses per section 4.
- **New games should be feed-native, not destinations.** The cheapest high-value additions, in order: House trivia (one question a day, posted as a card, answered inline), prediction leagues (already free once Calls V2 lands, it is a leaderboard over existing data), and co-operative realm events (a House-vs-House goal with a progress bar in the feed).

Every one of these lives *in* the Ravenry rather than behind another nav link.

## 13. Frontend and design direction

1. **Build the missing primitives** in `components/ui/`: Button, Card, Modal/Sheet, Input, Tabs, Badge, Skeleton, EmptyState, Toggle (promote the quarantined set from `components/settings/ui.tsx`). This is the highest-value refactor in the product, because it is the root cause of the inconsistency.
2. **Add the missing scales** to `globals.css`: spacing, radius, elevation, z-index, and semantic state tokens (success/warning/danger/info do not exist today). Define `--chart-up` / `--chart-down`, which are referenced but missing.
3. **Unify the three icon systems** and make `Icon` warn on unknown names in dev instead of silently rendering a blank circle.
4. **Reduce the IA.** ~30 side-nav links is a discovery failure. Group Tools behind one entry, show plain names alongside themed names (themed-only is invisible on touch), free the `/throne` mobile slot, and give `/keep` a mobile entry point.
5. **Selective RSC.** Convert the highest-value pages to server components for real metadata and share unfurls: `/post/[id]`, `/u/[handle]`, `/houses/[slug]`, `/calls/[id]`. Leave the interactive tool pages client-side.

## 14. Backend and infrastructure direction

Ordered by severity, matching section 3.1.

1. **Dump the live schema and every RLS policy into `supabase/migrations/00000000000000_init.sql`.** Nothing else in this list is safe until the database is reproducible. This is the single most important backend task.
2. **Enforce post visibility server-side**, either by RLS or by moving the feed behind a server route.
3. Fix `followed_id` to `followee_id` in two files.
4. Wire `lib/rate-limit.ts` into `/api/raven`, `/api/compose-suggest`, `/api/upload`, `/api/comments`, `/api/social`, `/api/reports`, `/api/scrying`, keyed on `profile.id` rather than a spoofable IP. Delete the in-memory `Map`.
5. Gate `/api/health`, `/api/approvals`, `/api/ledger*`, `/api/wallet/balances`.
6. Add a participant check to `POST /api/rooms/messages`.
7. Replace read-modify-write counters with atomic RPCs, following the `increment_profile_totals` pattern that already exists.
8. Batch `notifyFollowers` into a single multi-row insert and move it off the request path.
9. Add `.github/workflows/ci.yml`: `npm ci && npm run lint && npm run typecheck && npm run build`.
10. Add security headers to the empty `next.config.ts`.
11. Extract `lib/realtime.ts` from the 4 copy-pasted broadcast helpers.

## 15. Admin V2

Extend the existing panel, do not build a parallel one. New sections: Calls
(resolve disputes, manual/community resolution queue, category management),
Events (inspect the spine, replay, hide a bad event), Houses (leadership overrides,
oath audit), and Raven (Chronicle runs, spend, prompt versions). Fix the racy
`seasons.id` assignment and the two full-table scans in `admin/crests` and
`admin/war`.

## 16. Documentation V2

All of these must describe the same product, with LIVE / IN DEVELOPMENT / PLANNED /
FUTURE labels:

- `README.md` and `docs/PLATFORM.md`: remove "SocialFi", reposition.
- `lib/data/chronicle.ts`: 8 sections that omit Whispers, Raven, every Tool, the Rookery, trading, Leaderboards, notifications, DNA, and the Scanner. Needs a rewrite, not an edit.
- Landing: one consistent top-line promise (currently three).
- `docs/PRODUCT-BACKLOG.md`: superseded by this document.
- `docs/AUDIT.md`: retained as history, marked as such.

## 17. APIs and zero-budget posture

**Nothing in this plan requires a new paid service.** The event spine, card
registry, Calls V2, Houses V2, and computed leadership all run on Postgres we
already pay for.

Costs that go *down*: prompt caching on Raven's 2,500-word system prompt, rate
limiting the three uncapped Anthropic paths, and gating the four public GoldRush
routes.

Declared in `.env.example` but never read anywhere in the codebase:
`ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `BIRDEYE_API_KEY`, `COINGECKO_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`, `X_CLIENT_ID/SECRET`. **There is no email
or Telegram delivery anywhere.** Notifications are in-app only, which is the
largest retention gap in the product. Resend and a Telegram bot are both free at
our scale and are the highest-value zero-budget additions available.

Undocumented but used: `CRON_SECRET`, `PLATFORM_FEE_RECIPIENT`.

## 18. Testing requirements

From zero. Priorities, in order:
1. `lib/points.ts`, `lib/calls/scoring.ts`, `lib/game/quest-verify.ts` (pure logic, highest risk, easiest to test).
2. Call resolvers, including the settle-by-address fix.
3. API route contract tests for auth gates: every route asserts its expected auth level.
4. A Playwright smoke path: sign in, post, call, vote.

`playwright-core` is already a devDependency and unused. Vitest is the cheapest
addition.

---

## 19. Master TODO

### Phase 0: Foundation and safety (blocking, do first)
- [ ] Commit the full schema and all RLS policies (C2)
- [ ] Enforce post visibility server-side (C1)
- [ ] Fix `followed_id` to `followee_id` (C3)
- [ ] Rate-limit the three Anthropic paths, delete the in-memory Map (C4)
- [ ] Gate the public paid-quota routes (C5, C6)
- [ ] Fix feed pagination (B1)
- [ ] Add CI: lint, typecheck, build (S5)

### Phase 1: The spine
- [ ] `realm_events` table + `emit()` helper
- [ ] Feed card registry; decompose `post-card.tsx`
- [ ] First card types: verdict, achievement, house-standings, duel
- [ ] Inline composer on the feed

### Phase 2: Calls V2
- [ ] Categories and resolvers; `price` resolver settles by address
- [ ] Confidence, magnitude-aware verdicts, real cost to a miss
- [ ] `/calls` index, detail pages, caller leaderboard
- [ ] Server-side accuracy over all calls

### Phase 3: Houses V2
- [ ] Oath history on `house_members`; swear-a-new-oath flow in Settings
- [ ] Computed seasonal leadership
- [ ] House hall: roster, standing, rivalry, progression

### Phase 4: Raven V2
- [ ] Daily Chronicle job; weekly House summaries
- [ ] Prompt caching, streaming, server-persisted history
- [ ] Call analysis at creation

### Phase 5: Design system
- [ ] `components/ui/` primitives
- [ ] Token scales; unify icons
- [ ] IA reduction

### Phase 6: Surface and docs
- [ ] Reposition landing, README, PLATFORM, Chronicle
- [ ] Admin V2 sections
- [ ] Games: connect the War, dissolve the Throne
- [ ] Email and Telegram re-engagement

### Phase 7: Hardening
- [ ] Atomic counters, batched fan-out, tests

---

## 20. Deprecation list

| Item | Why | Replacement | Data | Migration |
| --- | --- | --- | --- | --- |
| `lib/sections.ts`, `section-placeholder.tsx` | Zero imports | None needed | None | Delete |
| `/wallet` route | Cosmetic duplicate of `/vault`, not in nav | `/vault` | None | Redirect |
| `/throne` as a page | Dissolved into Ravenry and Houses | Feed cards, quest strip, House standings | Quests/duels tables stay live and in use | Free the mobile nav slot |
| In-memory rate limiter | Broken by design on serverless | `lib/rate-limit.ts` | None | Delete |
| `"Calls won: 27"` mock stat | Violates the no-mock-data rule | Real aggregate or remove the tile | None | Edit |
| "SocialFi" (4 code locations) | Contradicts the positioning | New positioning line | None | Edit |
| `/explore` inline search | Duplicates `/search` on a different backend | `/search` | None | Link through |

---

## 21. Progress

| Date | Milestone |
| --- | --- |
| 2026-08-11 | Two-agent audit complete. Typecheck verified clean (0 errors). Critical findings C1, C2, C3 verified first-hand. Plan drafted. **Awaiting product-owner decisions.** |

---

## 22. Questions for the product owner

Consolidated, as the directive requires. Grouped by how much they change the plan.

### Blocking (I cannot safely proceed without these)

**Q1. Database access.** The schema and every RLS policy for ~31 core tables exist
only in the live Supabase project (`tqvigouaifbklvajiyoj` per the handoff doc). The
Supabase connection available to me lists two unrelated projects, not this one. I
cannot dump the schema, cannot audit the RLS policies, and therefore cannot verify
or fix the post-visibility issue (C1). **How do you want to proceed?** Options:
(a) grant access to that project, (b) run a dump command yourself and commit the
output, (c) I write the migrations blind from code inference and you apply them
carefully. I recommend (a) or (b).

**Q2. The post-visibility issue (C1).** Either "Followers only" / "House only"
ravens are readable by anyone with the public anon key, or those audiences do not
work at all. I cannot tell which without Q1. If it is the former, this is a
privacy incident affecting every restricted post ever written. **Do you want this
treated as a hotfix ahead of all V2 work?** I recommend yes.

### Product direction (these change what I build)

**Q3. Do you accept the core thesis?** That the fix is a realm event spine feeding
a card-based Ravenry, rather than a list of new features. Everything in Phases 1
through 4 assumes yes.

**Q4. Generalizing Calls beyond crypto.** This is the biggest product call in the
plan. Making a Call any resolvable claim (with `markets` as one category among
esports, gaming, culture, and realm events) is what makes the repositioning true
rather than cosmetic. It is also a real widening of scope. **Do you want this, or
should Calls stay crypto-only and be deepened instead?**

**Q5. The oath system.** I endorse your proposal (Renown stays, House Glory
resets, Legacy Crests, public oath history) with two refinements: **one oath per
season rather than per 60 days**, and **oaths locked in the final two weeks** to
prevent late defection to the winning House. Do you accept both refinements?

**Q6. Leadership.** I recommend computed seasonal roles (Lord, Hand, Master of
Ravens, Master of War, Chronicler, Recruiter) rather than elections, on the
grounds that elections need a population we do not have yet. Agreed, or do you
want elections built now?

**Q7. The six `/soon` chapters.** Six identical stub pages whose "Notify me"
button links to `/ravens` and registers nothing. Make them real (a
`feature_interest` table and a working notify), or cut to two? They currently
account for 6 of ~30 nav destinations.

**Q8. Calls and the cost of being wrong.** Today a miss costs nothing, so
low-conviction spam is free. I want confidence-weighted Renown that can move
down as well as up, with a floor for newcomers. **Is downward Renown movement
acceptable to you?** Some communities hate it. It is the single biggest lever on
Call quality.

### Operational

**Q9. Sub-agents.** `docs/NEXT-SESSION-HANDOFF.md` says explicitly: "Do NOT spawn
subagents: the founder wants the main agent doing the work (subagents burn the
usage budget)." Your V2 directive says the opposite: use two parallel sub-agents.
I followed the newer directive for this audit. **Confirm which rule stands.**

**Q10. Branching.** The directive asks for `v2/*` branches. My session is pinned to
`claude/ravenspire-v2-living-realm-a5b06e` and I am instructed never to push
elsewhere without permission. I will keep all V2 work on that branch, logically
committed, unless you tell me otherwise.

**Q11. Email and Telegram.** `RESEND_API_KEY` and `TELEGRAM_BOT_TOKEN` are declared
but no delivery code exists anywhere. In-app-only notifications is the biggest
retention gap in the product, and both are free at our scale. **Do you have those
accounts, and do you want re-engagement wired in Phase 6?**
