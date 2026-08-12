# Ravenspire V2: The Living Realm

The living source of truth for the V2 transformation. This document replaces the
Wave 4 direction in `docs/PRODUCT-BACKLOG.md` as the primary plan. The 261-finding
`docs/AUDIT.md` is retained as a historical record, not as the active backlog.

Status: **awaiting product-owner decisions on section 22.** Audit complete and
plan drafted. Feature work has not started, but the findings that were unsafe
or broken to leave alone have been fixed and shipped already: a critical economy
exploit, a broken production build, the missing baseline schema, WCAG AA text
contrast, and keyboard focus. See section 21 for the log.

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

### The card registry, in full

The directive names sixteen things that must appear in the Ravenry. All sixteen
are listed here so none is lost, each mapped to what actually produces it. A
card ships only when there is a real producer behind it; a card with no source
is not built, because a card with invented contents breaks rule 4.

| Card | Producer | Status |
| --- | --- | --- |
| Posts | `posts.kind = 'raven'` | Live |
| Calls | `posts.kind = 'call'` | Live |
| Polls | `posts.kind = 'poll'` | Live |
| Call verdicts | `call.resolved` | Live |
| Achievements | `crest.earned` | Live |
| House victories | `house.overtake` | Live |
| Quest cards | `quest.completed` | Live |
| Challenge invitations | `duel.opened` | Live, without an action until a duel surface exists |
| Oaths sworn | `oath.sworn` | Live |
| Season updates | `season.milestone` | **Kind defined, nothing emits it.** No card. |
| Chronicle updates | `raven.chronicle` | **Kind defined, nothing emits it.** No card. |
| House announcements | **No producer yet.** Needs a House post type authored by leadership. | Queued |
| Leaderboards | **No producer yet.** A periodic standings snapshot card, not a live table in the feed. | Queued |
| Trending discussions | **No producer yet.** Derived from reply and reaction velocity, not a stored event. | Queued |
| Community events | **No producer yet.** Needs an events table before a card can exist. | Queued |
| Game invitations | **No producer yet.** The War emits nothing invitational today. | Queued |
| Reward announcements | **No producer yet.** Blocked behind server settled rewards. | Queued |
| AI responses | Raven, once it posts rather than only replies. | Queued |
| World events | Realm wide events with no single actor. | Queued |

Six of these are now rendered in the Ravenry through the card registry in
`components/stream/cards/registry.tsx`, resolved from the unified feed in
`/api/feed`. Two of the nine spine kinds turned out to have no producer at all
when checked against the code, `season.milestone` and `raven.chronicle`, and a
ninth, `call.sealed`, is emitted but deliberately not drawn: sealing a Call
already writes the post that carries it, and rendering both would double every
Call in the timeline.

Seven more need a producer built first. That distinction is the build order:
render what already exists before inventing new sources.

- Card registry (6.2), resolved through one map so a new kind is one file and one registry line, never a change to the feed. Done.
- **Inline composer** at the top of the feed (the highest-leverage funnel fix in the product).
- Fix pagination (B1). Done for correctness: the cursor holds one keyset position per source, plus the ids already consumed at the instant it stopped on, because a batch written by `emitMany` shares one `now()` and a strictly-older-than cursor drops its siblings. Infinite scroll with a sentinel is still to come; the page still ends in a button.
- Move audience filtering server-side (C1). Done for both sources: `lib/social/feed-server.ts` for ravens, `lib/realm/feed-events.ts` for the spine.
- Quest strip and season countdown, absorbed from the dissolved Throne.
- Move filters server-side so a filter cannot silently empty a page.
- Realtime "new ravens" pill: scope the subscription so it stops firing for blocked, muted, and self posts.

## 9. Calls V2

Categories and resolvers per 6.3. The scoring design below is drawn from a
survey of how Metaculus, Manifold, Lichess, Chess.com, Duolingo, Strava and
Stack Overflow solve these exact problems. Formulas taken from Manifold's and
Lichess's open source are exact; the Metaculus and Stack Overflow figures came
from search summaries because those domains were unreachable, so spot-check
them before they ship.

### 9.1 The difficulty problem, solved without a crowd

The root bug is not that `price > entry` lacks a threshold. It is that the
system has no idea which Calls are hard. "BTC up in 24h" and "a fresh memecoin
up 40% in 24h" score identically today.

Metaculus scores a forecast against a baseline probability rather than against
raw correctness. Their baseline is a fixed 0.5. Ours can be better, because we
already hold the price history: derive the baseline from the token's own
realized volatility.

For a driftless lognormal walk, the chance a token clears a move of `k` over
horizon `t` is approximately:

```
pi_0 = Phi( -ln(1 + k) / (sigma * sqrt(t)) )
```

where `sigma` is trailing realized volatility and `Phi` is the standard normal
CDF. (The exact form carries a `sigma^2 * t / 2` drift term; the simplified
version is accurate enough for scoring and far easier to explain.)

This one line does a great deal of work:

- "BTC up 0.1% in 24h" gets a `pi_0` just under 0.5, and because a member
  cannot state much more than 0.5 for it either, it scores near zero on its
  own. **Corrected in build.** The original draft of this line said `pi_0` lands
  "near 1", which does not follow from the formula directly above it: on a
  driftless walk the chance of *any* upward move is one half, so requiring a
  further 0.1% puts the baseline just below one half, not near one. The formula
  is right and the gloss was wrong. The conclusion the line draws is unchanged.
- A +40% call on a volatile new token gets a low `pi_0` and scores heavily.
- **The `+0.01% = hit` bug disappears at the root** rather than being patched
  with an arbitrary threshold.
- Difficulty is graded with no crowd, no manual tiers, and no admin work.

`pi_0` is computed and **frozen at Call time, and shown to the member before
they commit**. You can see how hard your Call is before you make it.

### 9.2 Scoring

A Call carries `token, direction, threshold k, horizon t, confidence p`, where
`p` is a slider in `[0.55, 0.99]` rather than three buttons. Granularity is
worth supporting: forecasting research finds that people who say 63%
genuinely outperform people who say "about 60%".

```
S = clamp( 100 * log2( p_o / pi_o ), -100, +100 )
```

where `p_o = p` when the Call lands and `1 - p` when it does not, and
`pi_o = pi_0` when the Call lands and `1 - pi_0` when it does not.

**Corrected in build.** The original draft divided by `pi_0` in both cases. That
is a minting bug rather than a rounding detail: with `pi_0 = 0.1` and `p = 0.7`,
landing scores `100 * log2(0.7 / 0.1) = +281` and *missing* scores
`100 * log2(0.3 / 0.1) = +158`. Both clamp to `+100`, so being wrong about a
hard Call would have paid the maximum Renown available in the realm, and the
optimal strategy would have been to make the most absurd Call possible and lose
it. Comparing like with like, the member's probability for the realized outcome
against the baseline's probability for that same outcome, is what "scored
against a baseline probability" means in 9.1. The corrected form is identical
whenever a Call lands, so every worked figure elsewhere in this section stands.
Covered by `lib/calls/scoring.test.ts`.

Note a consequence that is correct but worth stating: a score is signed against
the baseline, not against being right, so a member who states *less* confidence
than the baseline scores better by being wrong. They were closer to the truth
than the baseline was. The baseline is shown before they commit, so this is a
choice rather than a trap.

When at least 3 independent members Call the same `(token, k, t)` bucket, switch
to a peer score, `100 * (log2 p_o - log2 GM(q_o))`, which sums to zero across
participants and is therefore immune to difficulty by construction. The draft
wrote this with a natural logarithm; it is expressed in `log2` in build so that
a peer score and a baseline score share one scale and one clamp. Independence
excludes the member's own Calls and every House-mate's, per 9.5 rule 3.

### 9.3 The answer to "should being wrong cost you"

**Yes, but not from the same pot.** Run two currencies, which is what every
platform surveyed does and what Ravenspire currently collapses into one ladder:

| | Renown | Season Rating |
| --- | --- | --- |
| Formula | `+= max(0, S)` | `+= S` |
| Direction | Monotonic, never falls | Can go negative |
| Lifetime | Permanent | Resets each season |
| Purpose | **Unlocks capabilities** | Drives standings and promotion |

This resolves the tension completely. Renown is a permanent legacy that can
never be taken away, so the system stays safe to play. Season Rating carries
real stakes, so Calls still mean something.

**Corrected in build.** The draft added that "the clamp at -100 plus a
confidence ceiling means a member who never exceeds 85% confidence cannot
approach the floor". That is not true of the formula in 9.2: 85% confidence
against an even baseline that then misses is `100 * log2(0.15 / 0.5) = -174`,
which the clamp takes to the floor exactly. The claim was wrong; the behaviour
is right, and the clamp is what makes it safe, because no single Call can cost
more than one Call's worth of Season Rating and Renown is untouched either way.
What genuinely limits exposure is the confidence *floor*: the least confident
Call available, 0.55 against an even baseline, loses well under half the
maximum. Asserted in `lib/calls/scoring.test.ts` so the bounds cannot be
retuned by accident.

### 9.4 Renown should unlock things, not just print a title

Ravenspire has seven tiers (Smallfolk to Monarch) that do nothing but display a
name. Stack Overflow's ladder hands over a piece of governance at each step,
which is both the progression system and the anti-farming system, because it
recruits the best members into policing the rest. Proposed ladder:

| Renown | Unlocks |
| --- | --- |
| 50 | Comment on others' Calls |
| 250 | Call an unlisted token |
| 500 | Vote on Call resolution disputes |
| 1000 | Author House Clash topics |
| 2500 | Your Calls join the peer-score baseline others are measured against |
| 10000 | Void suspicious Calls |

The 2500 unlock is the interesting one: joining the crowd that defines the
baseline is a genuinely coveted, entirely non-cosmetic reward.

### 9.5 Streaks and anti-farming

From Lichess's tournament source: two consecutive positive Calls put a member
"on fire" and the next scores double. Conversely a run of Calls sitting near
the baseline scores zero, which nullifies low-information spam without needing
to detect intent.

Concrete anti-farming rules, each adapted from a shipped system:

1. **No Calling your own bag.** A member cannot Call a token they hold
   significantly, or within an hour of changing that position. This is
   Manifold's self-trade exclusion, which strips self-dealing at the data layer
   rather than trying to detect it afterwards.
2. **Cap concurrent open Calls** at around 5, so nobody can fire off a hundred
   and cherry-pick the winners for their profile.
3. **Exclude House-mates from each other's peer baseline**, which kills the
   obvious six-person collusion ring.
4. **Cap daily Renown from social actions, leave resolved Calls uncapped.** This
   also closes the existing hole where two colluding accounts farm renown
   through unlimited, un-rate-limited likes and comments.
5. **Show Call rarity**, Xbox-style: "only 4% of members Called this correctly."
   Free difficulty signalling, and it makes hard wins feel legendary.

### 9.6 Leaderboards that reward skill, not volume

Rank by a shrunk mean, `sum(S_i) / (n + 20)`, with medals gated at 25 resolved
Calls. A plain sum rewards spraying; a plain average rewards cherry-picking one
lucky Call. Shrinkage divides 3 lucky Calls by 23 while letting 200 Calls
converge on true skill. It is one line of SQL.

Follow Metaculus in running **four separate ladders** rather than one: accuracy,
peer accuracy, commentary, and Call authorship. These are different talents, and
four ladders means four times as many members can be visibly good at something.

### 9.7 The spectator problem

A Call is already the right object: public, timestamped, name attached. What it
lacks is motion. It renders as a receipt rather than an event.

- Render every open Call as a live line from entry toward its threshold, with a
  countdown. That is the difference between a record and a spectacle.
- Add a "Calls closing within the hour" surface, which is Polymarket's trending
  section and the cheapest drama available.
- Put discussion inline with the price line, as Manifold does, so the argument
  and the number are the same object.

### 9.8 The profile artifact

Ship a calibration curve: predicted probability against realized frequency, with
the diagonal drawn. Use Manifold's deliberately tail-dense buckets (1, 3, 5, 10,
20, ... 90, 95, 97, 99), because the tails are where miscalibration is largest
and most interesting. It is roughly forty lines of code and it is the single
most credible-looking artifact a prediction profile can carry. It is also what
makes asking members for a confidence percentage feel worth their while.

Forecasting skill is a real, persistent trait (year-over-year correlation around
0.65 in the Good Judgment Project data), which is the business case for ranking
people on it at all. That same research found a one-hour training module
measurably improved accuracy, so a "Calls Academy" unlockable is a cheap way to
turn an intimidating mechanic into a learnable one.

### 9.9 Correctness fixes carried over

- Settle by contract address and chain, not ticker (P3).
- Raise the settlement ceiling and exclude immature calls from the batch (P4).
- Make the award conditional on `verdict = 'open'` to kill the double-award race.
- `/calls` index, per-call detail pages, caller leaderboard.
- Compute accuracy server-side over all calls, not a 50-post window (B3).
- Follow a caller's calls (the notification path exists; it is wired to a broken
  column, C3).

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

### The full capability list from the directive

Every capability the directive names, with an honest cost and feasibility read.
Rule 5 governs all of them: a real Anthropic call over real data, or it does not
ship. Rule 19 governs the budget: Anthropic is the one unavoidable paid line, so
each capability is rated by how many calls it costs.

| Capability | Cost shape | Verdict |
| --- | --- | --- |
| @Raven mentions | Per mention | Live |
| Analyse a Call before publishing | Per Call created | Build first. Highest value per call. |
| Calculate confidence, compare with previous predictions | Free. Pure maths over stored Calls, no model needed. | Build first |
| Detect similar Calls and discussions | Cheap with embeddings, or free with Postgres full text search | Build, prefer the free path |
| Summarise a discussion | Per thread, on demand only | Build, never automatic |
| Summarise Houses daily | One call per House per day | Build |
| Daily and weekly Chronicle | One or two calls a day total | Build first. The whole living realm feeling for pennies. |
| Detect spam | Free for the common cases with heuristics; model only on the uncertain tail | Build the heuristic first |
| Moderate toxicity | Same shape as spam | Build the heuristic first |
| Identify emerging trends | Free. Velocity over existing rows. | Build, no model needed |
| Highlight outstanding contributors | Free. Ranking over existing rows. | Build, no model needed |
| Recommend users and communities | Free at this size. Graph adjacency beats a model until the graph is large. | Build, no model needed |
| Event recaps | Folds into the Chronicle rather than being separate | Merge |
| Create quests | Per generation, low frequency | Build after the Chronicle |
| Create tournaments | Low frequency | Later |
| Intelligent notifications | Risk of noise outweighs value early | Later, and opt in |
| Onboarding assistance | Per new member | Later |
| Surface hidden content | Free. Ranking, not generation. | Build, no model needed |
| Generate lore updates | Low frequency, high delight | Later |

The pattern worth naming: **nine of these twenty need no model at all.** Trend
detection, contributor ranking, recommendations, similarity and surfacing are
all ranking problems over rows we already store. Doing them without a model is
faster, free, deterministic and testable. Reaching for Anthropic where SQL
suffices is the expensive mistake here.

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

**Refinement 2: allow oaths only in the off-season window between seasons.**
I originally proposed locking the final two weeks. Off-season-only is stricter,
simpler to explain, and is the rule competitive team ladders converge on. Without
it, everyone defects to the winning House at the death. This is what makes the
underdog narrative in the directive actually possible: to help an underdog rise,
you have to commit *early*, while it is still a risk.

Full rule set:

- Switching is allowed only during the off-season window.
- Contributions already made stay with the House that earned them, permanently.
  They never transfer and never follow the member.
- The switcher's House contribution resets to 0 for the new season.
- One-season cooldown before switching again.

**Data model:** `house_members` already exists, is written at onboarding, and is
**never read anywhere**. It becomes the oath history table with `sworn_at`,
`left_at`, `season_id`. Note its primary key is currently `profile_id` alone, so
it can hold only the current House; that needs relaxing to keep history. No new
table required.

### 11.1b House scoring must be size-neutral

With six Houses of unequal membership, any sum-of-all-members score is won by
headcount rather than skill. Lichess solves this in team battles by scoring a
team as **the sum of its top N members only** (their default is 5, configurable
to 20). Fixed-N is exactly size-neutral.

**Recommendation: House score = the sum of its top 20 members' Season Rating,
recomputed on every Call resolution, with the contributing 20 shown live.** Ties
break on those members' mean.

The live leaderboard is the real prize here. "Who is currently carrying our
House" is a named, churning, public list, and it is the single best driver of a
House feeling alive. Lichess recomputes it after every finished game for exactly
this reason.

As a secondary metric, borrow Chess.com's club-league multiplier, where match
points scale with the number of players fielded. That is the participation lever:
it rewards a House for getting lurkers to act, so Houses optimise for depth and
breadth at once.

### 11.1c Two clocks, not one

Duolingo's league system retains extraordinarily well, and the mechanism is
worth copying precisely: cohorts of 30, weekly Monday reset, seeded from members
who were first active at a similar time of day so the race feels close. The
design consequence, in their words, is that winning by 100 points two weeks
running beats winning by 5,000 once. **No week can be skipped.**

Run a **weekly cross-House personal ladder in cohorts of 30** alongside the
**monthly House season**. Two clocks means two independent reasons to return, and
the weekly one is where retention actually lives.

For the tier structure, Manifold's league config is the model. Two rules matter
most:

- **The bottom division never demotes.** This is the entire answer to "how do we
  add stakes without scaring people."
- **The top division churns hard** (Manifold demotes 60% of Masters each season),
  which is how the summit stays contested.

Double-promotion for the top one or two in a cohort lets a genuinely strong new
member reach their level in two seasons rather than six.

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

### 11.3 House Clashes

The reason nobody cares about a team they joined arbitrarily is that standings
tables are not events. Lichess team battles and Chess.com club matches work
because they are *scheduled, bounded, and have a live scoreboard*.

**A Clash is a 48-hour window on one nominated token or theme. Only Calls made
inside that window count. Top-20 scoring, live scoreboard, named contributors.**

This is the single highest-value thing we can build for Houses, it reuses the
entire Calls V2 engine, and it needs no new scoring maths.

### 11.4 The rest

House hall with a real roster, oath history, season standing, house-scoped events
from the spine, rivalries (the closest House by score, named), and progression
(House level from cumulative seasonal contribution).

Two cheap additions worth taking from Strava: run **both a peak and a
consistency ladder** (their KOM versus Local Legend split), so a "Standard
Bearer" title for the most resolved Calls on a token over a rolling 90 days sits
beside the raw accuracy ladder. Different people win each, so twice as many
people win. And make every leaderboard **filterable to House, to people you
follow, or to your own tier**: shrinking the reference group is the cheapest
retention mechanic in the entire survey.

## 12. Games V2

- **The War stays**, but gets connected: war victories emit events into the Ravenry, and war Glory feeds House standings. It stops being an island. This is a small change with a large effect.
- **Claim the Throne dissolves** into the Ravenry and Houses per section 4.
- **New games should be feed-native, not destinations.** The cheapest high-value additions, in order: House trivia (one question a day, posted as a card, answered inline), prediction leagues (already free once Calls V2 lands, it is a leaderboard over existing data), and co-operative realm events (a House-vs-House goal with a progress bar in the feed).

### Every concept the directive names

| Concept | Read | Verdict |
| --- | --- | --- |
| Trivia | One question a day, posted as a card, answered inline. No new surface, no new engine. | Build first |
| Prediction leagues | Free once Calls V2 lands. It is a leaderboard over data we already settle. | Build first |
| Co-operative realm events | A realm wide goal with a progress bar in the feed. Cheap, and it makes strangers allies. | Build second |
| Weekly challenges | A recurring quest with a season scoped leaderboard. Reuses quests and Calls. | Build second |
| House Wars | The strongest identity builder in the list, but it is a scheduled competitive season with scoring, brackets and dispute handling. Real scope. | Design before building |
| Territory control | Genuinely compelling and genuinely expensive: a persistent map, contested state, tick resolution. | Later, needs its own plan |
| Community boss battles | Cooperative damage against a shared pool. Cheap if it is a progress bar, expensive if it is a game. | Build the cheap version |
| Kingdom building | A different product wearing this product's clothes. Persistent state, economy, balance. | Not planned. Say no. |
| Dungeon runs | Same objection as kingdom building, plus content cost per run. | Not planned. Say no. |

The rule that decides all of these: **a game earns its place by feeding the
Ravenry, not by adding a nav link.** Trivia and prediction leagues pass because
they are feed cards with a leaderboard behind them. Kingdom building and dungeon
runs fail because they are destinations that pull members out of the realm and
cost more to build than everything else on this list combined.

Every one of these lives *in* the Ravenry rather than behind another nav link.

## 13. Frontend and design direction

Grounded in a measured audit of the codebase plus a survey of how the current
best-in-class systems are built. Verified against the *installed* packages
(`tailwindcss@4.3.3`, `next@16.2.10`) rather than remembered documentation.

### 13.0 The target, in the founder's words

> "Apple meets Discord meets Steam inside a fantasy realm."

Taken seriously rather than as a slogan, each name contributes something
specific and they pull in different directions, which is why the sentence is
useful:

- **Apple is the restraint.** One radius scale, one motion scale, one type
  scale, and the discipline to refuse a one off. It is the reason
  `npm run check:rules` fails a build over a capsule shaped chip. Apple is not
  the chrome, it is the saying no.
- **Discord is the density and the liveness.** A room you leave open. Dense
  legible rows, fast transitions, presence you can feel. This is why the Ledger
  register is flat and quiet across ninety percent of the product: quiet is what
  makes density readable.
- **Steam is the library.** A sense of a collection worth returning to, of
  progress that accumulates and belongs to you. Crests, Renown, oath history and
  the prediction profile are the Steam part.
- **The fantasy realm is the skin, never the structure.** Obsidian and forged
  gold, the Ravenry, the Keep, the Coffers. Lexicon and atmosphere carry the
  world; the underlying interface stays a modern product. A member should never
  have to decode a metaphor to find a control.

Where these conflict, restraint wins. Ornament is earned, never ambient.

### 13.00 User experience, as explicit requirements

The directive names these directly, so they are recorded as requirements rather
than left implicit in the archetypes.

- **Reduce complexity, reduce clicks, reduce friction.** The measure is the
  number of taps from intent to done. Posting was a floating button plus a
  navigation; it is now an inline composer in the feed. Every flow gets the same
  question asked of it.
- **Prioritise speed.** The feed is the only surface where performance is a
  product feature rather than an engineering concern. No N+1 per card, batched
  lookups, keyset pagination.
- **Improve mobile.** Responsive is not a resize. Desktop and mobile get
  different layouts. Touch targets are 44px below `md`, without exception.
- **Improve animation and transitions.** 100 to 150ms for micro interactions,
  150 to 250ms standard, under 300ms for everything. Exits about twenty percent
  faster than entrances. Only `transform` and `opacity`. Ambient atmosphere
  loops are the sole exception.
- **Improve onboarding.** A new member should reach their first real action
  without reading anything.
- **Improve accessibility.** Not a checklist bolted on: contrast, focus,
  keyboard reachability and live regions are part of the look. See 11 of the
  design system.
- **Every screen has a clear purpose.** Enforced structurally: every route must
  resolve to one of the six archetypes. A screen that resolves to none is a
  screen without a purpose, and that is the signal to cut it.

### 13.000 The frontend sweep ledger

Live state of the sweep, so the next session starts from fact rather than from
a guess. Updated as work lands.

**Done and verified**

- Zero `btn-gold` or `btn-glass` in live code, from 268 hand written buttons. A
  checker rule fails any new use.
- Thirteen primitives on Base UI. Console, Stream and Board each have exactly
  one shell: `components/console/console-shell.tsx`,
  `components/stream/stream-shell.tsx`, `components/board/board-shell.tsx`.
- The six Stream routes are on the 640px law through `StreamColumn`. All six had
  been hand rolling `max-w-2xl`, which is 672px, so the law existed and every
  subject of it drifted by 32px.
- Console density across the Vault, Swap, Watch, Scrying, Ledger, Forge and coin.
- Mobile shell: 44px targets in the top bar, and the navigation drawer is a real
  Sheet with a focus trap rather than a bare overlay.
- Contrast, focus rings, live regions and dialog semantics across the product.
- Three blind spots closed in the house rule checker itself, each of which
  failed on a real violation the first time it ran. A fourth change made the em
  dash rule structural: it recognises the AI output strip filter by its shape
  rather than by a hand kept list of allowed routes, which had to be extended
  every time an AI surface shipped and was extended late twice.
- **The 3D icon set, sliced and placed.** 114 icons from four generated sheets,
  2.0MB total, produced by `scripts/slice-icons.mjs` and named by a union the
  script generates from what actually landed on disk. Four defects were fixed to
  get there: a solid black background on one sheet, near zero rather than zero
  alpha on another, neighbour fragments surviving as detached islands, and every
  icon being upscaled past its native resolution.
- **Surface identity.** `lib/nav.ts` declares an `icon3d` per surface and
  `icon3dFor(href)` resolves a route to it, so a feature reads the same
  everywhere it is presented. Placed on the landing page (tools shelf, vows,
  pillars, both game cards, teasers, chapters), the Chronicle (per section), the
  legal pages (a plain summary band above the legal one), onboarding (the oath),
  the chapter pages and the eleven empty states that own their surface.
  Deliberately absent from navigation and settings, where a flat stroke glyph is
  correct and an illustration is noise.
- **Both faces self hosted.** `next/font/google` downloads at build time and
  does not fall back, so a build that cannot reach fonts.gstatic.com dies on a
  module resolution error that names no network problem. CI went red on it once,
  on a commit that touched nothing but images. 74KB committed, nothing fetched
  from Google at build or run time.
- **Builds no longer block each other.** `NEXT_DIST_DIR` overrides the output
  directory. Next locks `.next`, so a second build in a shared checkout exits
  rather than queueing, and its message looks nothing like a compile error.
- **Board on the member facing boards.** The Roll of Honour, House standings,
  the contributor board, the three roster boards and the caller board all run
  through `Board`. None of them was a table: every one was a column of cards at
  every width, which is the Stream shape, so on a desktop no member could
  compare two rows without reading both end to end. Above `md` each is a table
  with the metrics right aligned and tabular, below `md` a card list at a 44px
  target. `Board` grew what they needed rather than each page re-deriving it:
  `rowHref` and `rowLabel` for one link over a row, `highlight` for the viewer's
  own row, `divider` for a named rule across the board, `muted` for a row that
  is real but no longer counts, plus `BoardPage`, `BoardHeader` and `BoardStack`
  for the frame. Three real defects fell out of the conversion, recorded below.
- **The Dossier shell exists**, `components/dossier/dossier-shell.tsx`, and the
  Keep, public profiles, the House hall and post detail are on it. All four
  archetypes with a shell now have exactly one each.
- **`Meter` in `components/ui`.** The gold bar was pasted into nine places, each
  re-deciding its height and the clamp that keeps a real but tiny value from
  drawing as nothing.

**Defects the sweep found, and fixed**

- The accuracy leaderboard, which is the **default** board, answered in the
  database's snake case while its three siblings answered camel cased. Every key
  the page read by name came back undefined, so nobody had a display name or an
  avatar, no verification mark ever drew, and no member could find their own row.
- The caller board selected `is_agent` on every author and never read it, and
  never looked at `is_banned` at all, so the realm's own agents ranked on a
  member facing board. It also kept callers with no handle, whose row linked to
  `/calls/caller/` with nothing after it.
- The House hall carried its three sections on a `SegmentedControl`. Section 3
  assigns that pattern to two to four views of the same data; sections of one
  subject are underline tabs. The cut line on the contributor board, which is
  where a member stops counting toward the House score, existed only in the
  desktop list, so the most important line on that board was absent on a phone.

**Queued, in priority order**

1. **The Ravenry card layer**, which is section 8 and the biggest single item.
2. **The archetype shells still missing.** Call detail, Coin and Champion are
   Dossier routes and the shell now exists for them. Everything else that
   resolves to an archetype and does not use its shell follows.
3. **Fix the primitive override defect** recorded in section 21. Caller class
   overrides on `Card` and `Button` are silently dead in some cases because
   `cx` assumes class attribute order decides CSS precedence, which is false.
   Needs a deliberate visual pass, because the fix activates every currently
   dead override at once.
4. **Retire the `.glass` utilities.** Done. Every raw usage is the `Card`
   primitive and all four classes are deleted from `app/globals.css`. The
   measured damage was about a hundred and thirty `rounded-*` classes sitting
   beside an unlayered class that beat all of them, so every one of them
   described nothing. `Card` also gained a `radius` prop, which is the narrow
   fix for item 3 on the one property where the dead override was doing visible
   harm. A checker rule fails any new use of the names.
5. **Spacing scale enforcement** (`--spacing: initial`), which is approved but
   breaks every existing `p-4` at once and needs its own mechanical pass.

**Standing rules for this sweep**

- Responsive is not a resize. Desktop and mobile get different layouts, and a
  table becomes a card list below `md` rather than scrolling sideways.
- Every conversion keeps behaviour identical unless the behaviour was the bug.
- A primitive is added to `components/ui/` rather than re-derived in a feature
  folder, and a shell is added under its own archetype folder.

### 13.1 What the measurements actually showed

The problem was never "we lack a Button". It is that the ad-hoc layer quietly
accumulated defects a primitive layer would have prevented once.

| Measurement | Value |
| --- | --- |
| Hand-written `<button>` elements | 268 |
| Uses of `focus-visible` | 0 |
| `focus:outline-none` with no replacement ring | 9 |
| `aria-live` regions | 0 |
| `role="dialog"` vs files with `fixed inset-0` overlays | 6 vs 19 |
| Skeletons, all generic blocks rather than content-shaped | 80 |
| Arbitrary Tailwind values (`-[...]`) | 890 |
| Distinct `rounded-*` values | 14 |
| Distinct `z-*` values | 13, including `z-[90] z-[91] z-[95] z-[96]` |
| `loading.tsx` / `error.tsx` / `not-found.tsx` across 55 routes | 0 / 0 / 0 |
| `useOptimistic` / `useTransition` / `useActionState` | 0 |
| `@tanstack/react-query` imports (installed) | 0 |

**Status: the accessibility items above are fixed.** Contrast lifted, one
focus-visible ring applied to every interactive element, the 9 overrides
removed, the dead dependency deleted. See the commit history.

### 13.2 Primitive layer: build bespoke on Base UI

**Recommendation: build twelve bespoke primitives on `@base-ui/react` (1.7.0).
Do not adopt shadcn/ui. Do not adopt Radix.**

- **Not shadcn**, because shadcn's value is its Tailwind styling defaults, and a
  product whose entire differentiator is a hand-forged obsidian-and-gold
  aesthetic would delete 100% of them on day one, leaving exactly Base UI
  underneath. Take the dependency shadcn takes; skip shadcn. (shadcn itself
  made Base UI its default in July 2026, which is a strong signal about where
  the primitive layer is heading.)
- **Not Radix**, because it has no Drawer and no Toast, so we would need Vaul
  and Sonner, and **Vaul is now explicitly unmaintained by its author**. Base UI
  ships both natively. For a mobile-heavy social product, gesture drawers are
  core rather than optional.
- **Not Ark UI**, whose differentiator is Vue/Solid/Svelte support we will never
  use.

The decisive argument is our own `overflow-menu.tsx`, the more sophisticated of
the two existing primitives and a genuine good-faith effort. It still has four
real defects: no focus management (opening never moves focus in, closing never
restores it), no roving tabindex or arrow-key handling despite setting
`role="menu"` (so the ARIA role actively lies to screen readers, which is worse
than no role), no collision detection (hard-anchored, so it renders off-screen
on the last post in the feed), and it closes on *any* scroll, so on touch it
dismisses on the slightest thumb drift. Multiply that by Dialog, Tabs, Select,
Tooltip, Combobox, Toast and Drawer and you have the true cost of hand-rolling.

**Base UI is unstyled.** We keep 100% of the aesthetic and buy back only the
behaviour contract.

Twelve files: `button`, `card`, `modal`, `sheet`, `field`, `tabs`, `badge`,
`skeleton`, `empty-state`, `toast`, `menu`, `tooltip`. Keep `icon.tsx`, it is
good. Retire `overflow-menu.tsx`.

Also migrate `framer-motion` to `motion` (the old name is a deprecated
republishing alias) while only 21 files import it.

### 13.3 Enforce the scales at compile time, not by convention

Tailwind v4 does not ship a spacing *scale*, it ships a multiplier:

```css
--spacing: 0.25rem;   /* this is the entire spacing definition in theme.css */
```

`p-4` compiles to `calc(var(--spacing) * 4)`, generated on demand. **That is
precisely why `py-2.5`, `px-3.5`, `p-7`, `p-9` are scattered through the
codebase: every integer and half-step is free, so there is no scale to
violate.** Conventions cannot fix this.

The enforcement mechanism is real and verifiable in the v4 compiler: if
`--spacing` does not resolve, `handleBareValue` returns `null` and bare numeric
spacing utilities stop being generated at all. So:

```css
@theme {
  --spacing: initial;    /* p-4, gap-3, py-2.5 now fail to compile */
  --spacing-1: 0.25rem;  /* through --spacing-8, a 9 step scale */
}
```

**The build then breaks on violation**, which is worth far more than a lint
rule and converts 890 arbitrary values from invisible drift into a bounded,
mechanical migration. Do it on its own branch: the diff is large but entirely
mechanical.

Same treatment for radius (14 values down to 6), elevation (named, not ad hoc
box-shadows), and z-index (13 values down to 7 named rungs at gaps of 100).
Tailwind v4 has no `--z-*` namespace, so express those as custom properties
consumed through a small `@utility`.

### 13.4 Interaction craft

Current motion uses durations of 0.28s to 0.9s with exactly one spring across
21 files. The established guidance is 100 to 150ms for micro-interactions, 150
to 250ms for standard UI, and under 300ms for everything. **Most of our motion
is two to three times too slow, and 0.6s on a hover is exactly where "cheap"
comes from.** Ambient loops (`aurora-float` at 16s, `ember-rise`) are correct as
they are and should stay.

Priorities:

1. **Ship a duration and easing scale** (100/150/220/320ms) and rewrite the 21
   motion files against it. Cheapest perceived-quality win after contrast.
2. **Adopt React 19 `useOptimistic`** for like, bookmark, follow and repost.
   There are currently zero uses, and `whispers/page.tsx` hand-rolls optimistic
   sending with manual rollback. Perceived speed is the dominant driver of
   "premium".
3. **Content-shaped skeletons behind a 300ms gate.** A skeleton that flashes for
   under 300ms reads as a layout bug rather than a loading state.
4. **Add `loading.tsx` and `error.tsx`** to the route groups. Zero exist across
   55 routes, and they are free streaming SSR that Next 16 already wants to give
   us.
5. **Turn on View Transitions** (`experimental.viewTransition: true` in a
   currently empty `next.config.ts`). Shared-element morphs (post avatar to
   profile hero, coin logo to coin page), Suspense reveals, and directional
   navigation. This is the most "native app" thing available to a web product
   today, at near-zero runtime cost, degrading to instant swaps where
   unsupported. Next 16 ships a complete guide inside `node_modules`.

Two traps worth recording. **Haptics do not work on iOS**: `post-card.tsx`
calls `navigator.vibrate`, iOS Safari has never supported the Vibration API,
and the checkbox-switch workaround was patched in iOS 26.5. Keep it for Android,
feature-detect, and never depend on it. **Scroll-driven CSS animations are not
Baseline** (Firefox still gates them), so use them progressively and never
load-bearing.

Before reaching for a virtualizer on the unbounded feed, try one line:
`content-visibility: auto` with `contain-intrinsic-size` on the post card. It
defers off-screen rendering and preserves Ctrl+F.

### 13.5 Feed card design

Seven principles for mixing human posts with system events without it reading
as advertising:

1. **One chassis, many bodies.** Every card shares an identical outer shell:
   same radius, padding, border, shadow. Only the interior varies. This is
   Discord's embed model, and heterogeneity must never live in the frame.
2. **Encode type in a 2px left accent rail**, not in the card's shape. Gold for
   a human raven, ember for a call, steel for a system event.
3. **System cards must be visibly quieter than human posts.** No avatar, use
   secondary text, a lower surface, no glow, smaller footprint. The failure mode
   the directive names, feeling like ads, comes from system cards competing on
   visual weight. The existing `hideHerald` filter is evidence that Herald posts
   already feel intrusive; fixing visual weight is the real fix.
4. **Cap system-card density server-side.** No more than 1 in 5, never two
   adjacent.
5. **Every system card carries a primary action or a dismiss.** A card you can
   act on earns its slot; a card that only announces is an advertisement.
6. **Motion signals arrival, not existence.** An entry animation says "this is
   new". A permanent pulse becomes noise within one session.
7. **Fixed rhythm, variable height.** Constant gap with varying heights reads as
   rich; varying gaps read as broken.

On the two north stars the directive names: from **Discord**, take identity
through *colour applied to a fixed shape*, never through varying the shape,
which maps onto Houses exactly (avatar ring, card rail, badge tint, identical
geometry). From **Steam**, take the *showcase*: a profile as a curated set of
slots the member chooses to fill (pinned raven, best Call, House crest, war
record), each rendering in the same card chassis. That single idea does more for
"living realm" than any amount of ornament, because it is self-expression inside
a system.

### 13.6 Atmosphere without losing legibility

The governing rule: **atmosphere belongs to background layers, legibility to
foreground layers, and they must never mix.** The existing `.realm-bg` plus
`.glass` split already implements this correctly and should be protected. The
failure mode is putting texture *on* the card rather than *behind* it.

- Noise is a banding fix first and an aesthetic second. Near-black gradients
  band on 8-bit panels, which is exactly what `.realm-bg` and `.glass` are. An
  SVG `feTurbulence` layer at 2 to 4% opacity kills the banding and reads as
  forged metal. Apply once on the body, never per-card, given 432 `.glass`
  instances already carrying a 14px backdrop blur.
- **Depth comes from the light source, not shadow spread.** `.btn-gold` already
  gets this right with a top highlight and bottom occlusion. Formalize it as
  `--shadow-forge` and light the entire product from one direction. Inconsistent
  light direction is the clearest tell of an amateur dark UI.
- **Budget: at most two atmospheric effects visible at once.** Full atmosphere
  on landing, war and profile, where atmosphere is the product. Grid and radial
  only in the feed, where reading is the product.

### 13.7 Information architecture

Roughly 30 side-nav links is a discovery failure. Group Tools behind one entry,
show plain names alongside themed ones (themed-only is invisible on touch),
free the `/throne` mobile slot, and give `/keep` a mobile entry point.

Unify the three icon systems (`ui/icon`, `landing/icons`, `brand/crests`) and
make `Icon` warn on unknown names in development rather than silently rendering
a blank circle.

Convert the highest-value pages to server components for real metadata and share
unfurls: `/post/[id]`, `/u/[handle]`, `/houses/[slug]`, `/calls/[id]`. Leave the
interactive tool pages on the client.

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

## 21. Progress, and an honest scorecard

The distinction that matters in this table is **engine** versus **product**. A
system can be fully designed, implemented, tested and unreachable by a member.
Several of them were, and that is the gap this section exists to make visible
rather than to hide behind a green tick.

### Where each V2 pillar actually stands

| Pillar | Engine | Product surface | Honest read |
| --- | --- | --- | --- |
| Realm event spine | Built. Nine kinds, `emit()` wired into posts, verdicts, duels, quests, crests. | **Not built.** Only `/api/events` reads `realm_events`; the feed reads `posts` alone. | The spine was laid and never connected. The Ravenry is not yet the operating system. |
| Calls V2 | Built and tested. Volatility implied difficulty frozen at creation, confidence, thresholds, peer consensus, contract pinned settlement. | **Barely built.** The composer collects one V2 field, `timeframe`. No Call detail page exists. | The engine computes difficulty and consensus that no member can see. |
| Raven AI | Seven of the twenty capabilities in section 10 are live: the draft read before a Call is sealed, the caller's record and calibration, similar Calls and discussion, the daily Chronicle, the daily House entries, the thread summary, and the spam and abuse screen. Four of those seven need no model at all. | The composer, the thread, the Ravenry. | It stopped waiting to be mentioned. The Chronicle writes itself once a day and the Herald reads a Call before it is sealed, which is the only moment a reading can still change anything. |
| Houses V2 | Built. Size neutral top 20 scoring, computed leadership, oath history, Clashes. | Partial. | Closest to complete of the four. |
| Games V2 | The War exists. | Converted, and three pieces of invented data removed. | Social first games are not started. |
| Design system | Built. Six archetypes, two registers, thirteen primitives. | Applied across the platform. | The sweep is real: zero `btn-gold` or `btn-glass` remain in live code. |

### What that means

The V2 work so far has been strongest at the two ends and weakest in the middle.
Security, schema, scoring models and the design system are genuinely done. The
product layer that turns those into an experience a member can feel is the part
that was still missing, and it is the part the founder correctly called out.

Both remaining agents are now assigned to exactly that: the unified Ravenry with
a card registry, and the Calls V2 composer, detail page and prediction profile.

### Log

| Date | Milestone |
| --- | --- |
| 2026-08-11 | Two agent audit complete. Critical findings C1, C2, C3 verified first hand. |
| 2026-08-11 | **Critical economy exploit found and closed.** Three `SECURITY DEFINER` functions were executable by PUBLIC over PostgREST, so anyone holding the browser bundled anon key could mint unlimited points and glory. Revoked; advisors clear. |
| 2026-08-11 | **Post audience was not enforced.** The RLS policy was `USING (NOT deleted)`, making the composer's audience selector cosmetic. Tightened, feed moved behind a server route, verified live against the database. |
| 2026-08-11 | Baseline schema committed. 38 tables, 26 indexes, 3 functions, 22 policies. The database is reproducible from source for the first time. |
| 2026-08-11 | **`main` did not build.** `/search` used `useSearchParams()` with no Suspense boundary and no CI existed to catch it. Fixed, and CI added from nothing. |
| 2026-08-11 | WCAG AA contrast fixed (`--bone-faint` 4.10 to 4.52 across 635 uses) and one keyboard focus ring applied to 268 previously focus invisible buttons. |
| 2026-08-11 | Design system written: two registers, six archetypes, thirteen primitives on Base UI. |
| 2026-08-12 | Console density pass complete across the Vault, Swap, Watch, Scrying, Ledger, Forge and coin surfaces. |
| 2026-08-12 | **Zero `btn-gold` and `btn-glass` left in live code**, down from 268 hand written buttons. A checker rule now fails any new use. |
| 2026-08-12 | Three blind spots found in the house rule checker itself and closed: pills written with `pl-`/`pr-`, capsule rows written with `p-` plus `gap-`, and the retired button utilities. Each one failed on a real violation the first time it ran. |
| 2026-08-12 | `--chart-up` and `--chart-down` were defined but never aliased into Tailwind, so `text-chart-up` compiled to nothing and every caller reached the token through an inline style. Exposed. |
| 2026-08-12 | **Invented data removed from The War**: a six tier reward ladder with no server behind it, a fabricated Glory to $RSP rate, and client computed Glory displayed as banked. |
| 2026-08-12 | Mobile shell fixed: every top bar control was 36px on the only screens that render it, and the navigation drawer had no dialog role, focus trap or focus restore. |
| 2026-08-12 | **Audit finding: the Ravenry is not yet the operating system, and Calls V2 has an engine with no product on top.** Both agents reassigned to close exactly that. |
| 2026-08-12 | **Raven becomes the intelligence layer.** Seven capabilities from section 10, in the order it gives them. Four of the seven are pure arithmetic over stored rows and cost nothing, which is the pattern that section names: reaching for Anthropic where SQL suffices is the expensive mistake. Every paid route carries two caps through the shared limiter and degrades honestly with no key. |
| 2026-08-12 | **The `.glass` utilities deleted.** Every raw usage is now the `Card` primitive. The measured damage was about a hundred and thirty `rounded-*` classes written beside an unlayered class that beat every one of them, so each one described nothing. |

### Known defect, not yet fixed

**Caller `className` overrides on primitives are silently dead in some cases.**
`cx` documents that "any caller override arrives last in the string and wins on
source order", which is false: class attribute order does not decide CSS
precedence, source order in the emitted stylesheet does. Compiling this
project's Tailwind and measuring byte offsets confirms the emission order is
`rounded-2xl`, `rounded-lg`, `rounded-md`, `rounded-xl`. So `Card`'s
`rounded-xl` is emitted last and **cannot be overridden by any caller**, and
`Button`'s `rounded-md` beats a caller passing `rounded-lg`. The same applies to
padding: `px-0` is emitted before `px-5`, so a caller cannot zero a `Button`'s
padding.

This is a real defect in the primitive layer's central promise. The fix is
either conflict aware class merging in `cx` or explicit props on the
primitives; the first is correct but has a wide blast radius, because every
override that is currently dead would suddenly apply. It should be done
deliberately with a visual pass, not slipped in beside feature work.

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

**Q8. Calls and the cost of being wrong. RESOLVED by research, confirm only.**
I originally asked whether Renown should be able to fall, and flagged that many
communities hate that. The survey in section 9 produced a better answer than the
one I proposed: run **two currencies**. Renown becomes monotonic and never
falls, and instead **unlocks capabilities** (Stack Overflow's model). A separate
Season Rating carries the downside and resets each season. Nothing permanent can
ever be taken away, and Calls still carry real stakes. Confirm you are happy
with the split and I will build it.

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

---

## 23. Directive coverage, checked line by line

The founder's concern, in his words: "I just want to make sure everything in my
prompt is actually what you going to build and it's on the file."

That was a fair challenge, and the answer when it was asked was no. Sixteen
named items from the directive appeared nowhere in this plan. This section
exists so that question never needs asking again: every block of the directive,
with where it lives and whether it is honestly covered.

**Rule for this table.** COVERED means the plan says how, not merely that the
word appears. QUEUED means it is planned and unbuilt. DECLINED means a
deliberate no with a stated reason, which the directive explicitly invites
("Whenever you identify a better solution than the one requested, explain your
reasoning and recommend it").

### The Ravenry

| Directive item | Home | Status |
| --- | --- | --- |
| Sixteen feed surfaces | 8, full registry table | COVERED. Eleven have an emitting spine and no card; seven need a producer first. |
| Rich, non repetitive card types | 8, 13 | QUEUED |
| Reusable UI components | 6.2 registry, `components/ui/` | COVERED and largely built |
| Grow without clutter | 8, one map, one file per kind | COVERED |

### Calls

All eighteen named capabilities are in section 9. Evidence, sources, discussions,
personal analytics and the prediction profile were named in the directive and
were thin in the plan; they are now explicit. The engine is built and tested,
the product layer is not. That gap is section 21's scorecard.

### Raven AI

| Directive item | Status |
| --- | --- |
| All twenty capabilities | COVERED in 10, each with a cost shape and a verdict |
| Nine of them need no model | Recorded in 10. Trend detection, contributor ranking, recommendations, similarity and surfacing are ranking problems over rows we already store. |

### Games

All nine named concepts are in section 12 with a verdict. Two are DECLINED:
kingdom building and dungeon runs. Both are destinations that pull members out
of the Ravenry and cost more than everything else on the list combined, which
contradicts the directive's own rule that games must strengthen the Ravenry
rather than become isolated products. Territory control is deferred rather than
declined, because it is genuinely good and genuinely expensive.

### User experience

Named in the directive and previously absent from this plan as its own block.
Now section 13.

| Item | Status |
| --- | --- |
| Reduce complexity, reduce clicks, reduce friction | QUEUED |
| Improve navigation | COVERED and built: five slot dock, contextual sub nav, collapsible side nav |
| Prioritise speed | QUEUED. The feed is the surface that matters. |
| Improve mobile | COVERED and partly built. Touch targets and the drawer are fixed. |
| Improve animation and transitions | COVERED in 13, motion scale enforced |
| Improve onboarding | QUEUED |
| Improve accessibility | COVERED and largely built. Contrast, focus rings, live regions, dialog semantics. |
| Every screen has a clear purpose | COVERED by the six archetypes. A screen that resolves to no archetype is a screen without a purpose. |

### Design system

| Item | Status |
| --- | --- |
| Consistent spacing, type, motion, cards, buttons, icons, colour | COVERED in 13 and `docs/DESIGN-SYSTEM.md` |
| Glassmorphism only where it improves usability | COVERED. Ornament is earned, never ambient. The Ledger register is flat and quiet for ninety percent of the product. |
| "Apple meets Discord meets Steam inside a fantasy realm" | Now recorded verbatim in 13 as the target. Apple is the restraint and the token discipline, Discord is the density and the speed of a live room, Steam is the library and the sense of a collection worth returning to. |

### Architecture, admin, documentation

| Item | Status |
| --- | --- |
| Modularity, maintainability, scalability, separation, reusable systems | COVERED in 6 and 14 |
| Avoid technical debt | COVERED, and enforced: `npm run check:rules` fails the build on the rules that regress |
| Admin tools for every public feature, no duplicate interfaces | COVERED in 15. Verified: all eleven admin routes converted, every destructive action behind a confirmation. |
| Chronicles, landing, roadmap, dev, admin and product docs all tell one story | COVERED in 16, QUEUED as work |
| API review, free tiers first | COVERED in 17 and `docs/APIS.md`, which prices every service and records the esports finding |

### Process and principles

| Item | Status |
| --- | --- |
| Evolve, do not rebuild | COVERED in 5. Keep, Upgrade, Merge, Remove, Postpone, with a reason per removal. |
| Think like a co founder, challenge assumptions | Demonstrated rather than asserted: the Roll of Honour default was changed because ranking by monotonic Renown made Call spamming optimal, the esports resolver was declined on cost, and kingdom building is declined here. |
| Never immediately code, plan first | This section is the mechanism. Nothing starts until it is written down here. |
| Production grade: typed, documented, testable, maintainable, readable, performant | COVERED in 18 and enforced by the four gates |
| Backward compatibility and migrations | COVERED in 20 |

### What is genuinely not planned

Kingdom building and dungeon runs, declined above with reasons. Everything else
in the directive is either built, queued here, or explicitly deferred with a
stated cost. Nothing is silently dropped.
