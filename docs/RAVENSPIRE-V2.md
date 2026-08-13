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

- **The primitive override defect is fixed, and it was four times larger than
  the audit suggested.** The count of 143 was call sites passing a class in a
  colliding family, not collisions: 119 of them are on `<Card pad="none">`,
  where the primitive emits no padding at all and nothing was ever dead. The
  real figure, measured against the emitted stylesheet rather than guessed, is
  29 dead classes across ten CSS properties.

  The emission order is deterministic, not random. Tailwind v4 sorts each
  family, numerically ascending for spacing and opacity and alphabetically
  otherwise, so the rule a caller would have to know is "your class applies
  only if it sorts after the primitive's". For padding that reads as "you may
  override upward but never downward"; for radius, `rounded-xl` beats every
  other plain rung because xl sorts last.

  The three worst were invisible in code review and obvious on a screenshot:
  every `IconButton shape="circle"` rendered as a rounded rectangle, the back
  to top control was not fixed to the viewport, and the landing page's mobile
  nav dropdown pushed the page down instead of overlaying it. The carousel
  arrows meant to be desktop only were visible on a phone. Someone had already
  hit this and worked around it blindly: `floating-compose.tsx` carried
  `style={{ position: "fixed" }}` because the class would not take.

  The fix is in two halves. `components/ui/merge.ts` drops a base class when
  the caller has spoken about the same CSS property, so precedence stops
  depending on emission order at all; it is scoped to the primitives, keys
  responsive and state variants separately, and appends anything it does not
  recognise rather than dropping it. `Card` and `Button` took props for the
  groups a class cannot express: `tone`, `elevation`, `pad`, `opaque` and the
  `raised` variant. Background is the one group neither ordering nor merging
  can rescue, because the lit variants paint a gradient image over the colour,
  so a checker rule keeps backgrounds on `variant`.

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
3. **Retire the `.glass` utilities.** Done. Every raw usage is the `Card`
   primitive and all four classes are deleted from `app/globals.css`. The
   measured damage was about a hundred and thirty `rounded-*` classes sitting
   beside an unlayered class that beat all of them, so every one of them
   described nothing. `Card` also gained a `radius` prop, which was the narrow
   first fix for the primitive override defect, on the one property where the
   dead override was doing visible harm. A checker rule fails any new use of
   the names.
4. **Spacing scale enforcement** (`--spacing: initial`), which is approved but
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

---

# Part Two: The Collectibles Realm

Directive 2, from the founder and co-founder, August 12, 2026. Status: **plan
approved for foundation work; naming and set economics awaiting founder votes
in section 33.**

The direction, in the co-founder's words: SocialFi is poorly received in
crypto, other social networks hold the advantage. What can work is a
collectibles community: NFTs from the trading card game we already have, and
mystery boxes carrying official merch.

The verdict: agreed, and the codebase agrees too. This document already
ordered "SocialFi" removed from every shipping surface (section 5). Part Two
finishes that thought: the social layer stays as the community square, but the
identity of the product becomes the collection.

## 24. The reframe, in one line

Ravenspire is a collectibles realm: play the War, collect the champions, join
a House, own the relics. The Ravenry is where the community lives. The trading
tools remain as the crypto wing. Nothing built is deleted; it is re-ranked.

## 25. Why this platform is uniquely positioned

This is not a pivot onto empty ground. The expensive parts of a collectibles
product already exist here, live, tested, and on brand:

| Asset | State | What it becomes |
| --- | --- | --- |
| 62 champions with name, title, house, weapon, 2 abilities, 4 stats, lore | Shipped, 20 with art | The card set. Every champion IS a card |
| Rarity ladder (rare, epic, legendary, mythic) with per-rarity visual law | Shipped | Card rarities and pull odds |
| Six Houses with sigils, mottos, colors | Shipped | Collector factions; House-aligned sets |
| Crests (badges of deed) | Shipped | Earned, non-purchasable collectibles |
| Ceremony register (Forge) | Shipped | The pack-opening moment |
| Privy embedded wallet per member, non-custodial | Shipped | NFT custody with zero onboarding. The hardest problem in NFT UX is already solved for every member |
| Server-authoritative POINTS and inventory precedent | Shipped | Chest contents and card grants settle server-side, same law as Glory |
| $RSP at TGE, presale on external launchpad | Planned | The economy connective tissue |

The honest gap: no commerce, no NFT infrastructure, no fulfillment. All of
that is in section 30.

## 26. The product

Four pieces, one loop.

### 26.1 The Reliquary (the collectibles hub)

Route `/reliquary`. Plain label: Cards and relics. The member's binder and the
realm's catalog. Set One is the 40-card champion set (section 31). Each card
shows the real art, name, title, house, rarity, abilities and lore, drawn from
`lib/game/champions.ts`, the single source of truth. Until launch every card
is sealed: rendered, desaturated behind a soft blur, padlock chip, "First set,
coming soon", and a Notify me that actually registers interest (section 27).
No invented owners, no invented prices, no invented sale counts, ever.

### 26.2 Warchests (mystery boxes)

Digital chests and physical boxes under one name. A Warchest opens into cards
and, for physical tiers, official merch. Odds are printed on the chest, exact
and honest, before any purchase exists. Three planned tiers, names on the
rarity ladder (working names): Squire's Chest, Knight's Warchest, the King's
Reliquary. Physical boxes ship merch plus printed cards plus a redemption code
that mints the digital twin to the buyer's own wallet.

### 26.3 The Mercer (official merch)

Route `/mercer`. Plain label: Official merch. Working name, alternates in
section 33. Launch catalog small and high quality: one tee, one hoodie, one
cap, one art print, one playmat. Until product photos exist the shop renders
planned SKUs with the 3D icon set and silhouettes, sealed behind the same
padlock. No fake product photos, no fake stock counts.

### 26.4 The trading card game

The War is the game; the cards are the champions. Phase one changes nothing
about combat: owning a champion card is owning the champion, and the existing
muster, arsenal and battle loop carries on. Phase two (post-launch): a proper
turn-based card mode built on the stats and abilities that already exist.
Physical cards are printable from day one because every card's data is real.

### 26.5 The economy loop

Play and post, earn POINTS (existing, server-side). POINTS convert to $RSP at
TGE (existing law, rule 7 unchanged: balances display as POINTS). Warchests
and merch are purchased with money, not points, at launch; points-priced
cosmetic chests are a post-launch decision. Every digital collectible is
claimable to the member's own Privy wallet. The platform never holds keys and
never takes custody (rule 6 unchanged).

### 26.6 Demote, merge, remove

| Verdict | Item |
| --- | --- |
| Demote, keep | Scrying, Scanner, Swap, DNA, Watch, Forge, Ledger: grouped under Tools. They serve the crypto wing and the $RSP story, they stop being the identity |
| Remove | The word SocialFi, everywhere, now doctrine. `/kitchen-sink` from production nav. The six `/soon` stubs, replaced by three real sealed chapters: Reliquary, Warchests, The Mercer |
| Merge | `/wallet` into `/vault` (already ordered in section 5) |
| Continue | Throne dissolution as planned |

## 27. The preview pattern: backend live, frontend sealed

The founder's build order, made precise. We build the real backend now, ship
the real frontend now, and gate launch behind flags, so opening day is a flag
flip and not a deploy.

1. **Feature flags.** A `realm_flags` table: `reliquary_live`, `chests_live`,
   `mercer_live`. Server-read, cached. The padlock UI is driven by the flag,
   so the gate opens with zero code change.
2. **The LockedGate primitive.** One component: wraps a surface, desaturates
   and blurs it slightly, lays a padlock chip and "Coming soon" over it, and
   offers Notify me. Built once in `components/realm/`, used by all three
   surfaces and the landing page.
3. **Notify me that works.** An `interest` table keyed by member and feature.
   The existing `/soon` buttons that navigate to `/ravens` and register
   nothing are replaced by this. Interest counts are real demand data for the
   launch decision.
4. **Rule 4, clarified, not weakened.** Previewing the real catalog is
   honest: the 40 cards are the actual planned set, rendered from real data
   and labeled as coming soon. What stays banned is unchanged: invented
   owners, invented prices, invented sales, invented balances, any number
   pretending to be live.

## 28. Architecture

### 28.1 Schema (Supabase, additive, RLS deny-by-default)

| Table | Purpose |
| --- | --- |
| `realm_flags` | key, enabled, updated_at. Launch switches |
| `interest` | member_id, feature, created_at, unique pair. The waitlist |
| `collectible_sets` | set slug, name, season, status: preview, live, closed |
| `collectibles` | id, set_id, champion_slug, kind (card, relic), rarity, house, art_url, metadata jsonb, planned_supply, chain, contract, token_id nullable, status |
| `inventory` | member_id, collectible_id, qty, acquired_via (chest, reward, purchase, redemption), acquired_at. Server-authoritative, same law as points |
| `chests` | sku, name, tier, odds jsonb (printed on the box), includes_merch, price_usd nullable, status |
| `chest_openings` | id, member_id, chest sku, result jsonb, server_seed_hash, opened_at. Auditable pulls |
| `merch_products` | sku, name, kind, images, sizes jsonb, status |
| `redemptions` | code_hash, grants jsonb, redeemed_by nullable, redeemed_at. Physical to digital bridge |
| `orders`, `order_items` | Schema now, endpoints later, payments phase |

### 28.2 APIs

`GET /api/reliquary` (catalog plus own inventory), `GET /api/reliquary/[id]`,
`POST /api/interest` (live immediately), `GET /api/chests`,
`POST /api/chests/[sku]/open` (server-authoritative, flag-gated off),
`GET /api/mercer/products`, `POST /api/redeem` (code to wallet claim), and
`/admin/collectibles` for sets, cards, chests, products, and the flag panel.

### 28.3 The NFT plan

- Chain: **Base**. Cheap, liquid, works with the existing Alchemy key and
  Privy embedded wallets.
- Standard: **ERC-1155** editions for rare, epic, legendary print runs;
  mythics as ultra-short editions or 721 one-of-ones, decided per card.
- Custody: **lazy mint by claim voucher.** The server signs a voucher against
  `inventory`; the member's own wallet executes the mint. The platform never
  holds the token. Rule 6 survives contact with NFTs.
- Sequence: preview (off-chain catalog, now), claimable (contracts deployed,
  vouchers live), tradable (standard contracts mean OpenSea works day one; an
  in-realm market is a later decision).
- Metadata pinned before mint; supplies frozen before mint; no mint until the
  set is final. Nothing on-chain is retractable, so on-chain goes last.

### 28.4 Physical

Print spec lives in `docs/CARD-ART-PROMPTS.md` (63 by 88 mm, 300 dpi, 3 mm
bleed, art generated at 2:3 exceeds print resolution). Merch starts
print-on-demand, one quality vendor, no held inventory. Every physical
Warchest carries a QR redemption code, single-use, hash-stored.

## 29. Dashboard IA redesign

Side navigation regroups around the identity. Nothing is deleted:

| Group | Entries |
| --- | --- |
| (top) | The Ravenry, Calls, The Crossroads, Houses |
| The Collection | The War, The Reliquary (sealed), Warchests (sealed), The Mercer (sealed), Crests and Renown |
| The Realm | The Rookery, Roll of Honour, Whispers, Bookmarks, Raise Your Banners |
| Tools | The Scrying Glass, Scanner, Swap, The Ledger, DNA, Watch, Forge |
| Account | Ravens, The Vault, The Chronicle, Settings |

Sealed entries carry a small padlock glyph in the nav, gold on hover, which is
itself a teaser. The mobile dock has five slots; two options, founder's call:

- Option A: Ravenry, Reliquary, War, Crossroads, Keep
- Option B (recommended): Ravenry, Calls, Reliquary, War, Keep, with the
  Crossroads reachable from the top bar search

Settings additions: collection privacy (show or seal your Hoard on your Keep),
and notify preferences per sealed feature.

## 30. Landing page corrections

1. Hero repositions to the collectibles realm: play the War, collect the
   champions, join a House. SocialFi language gone.
2. A Collection section: a fanned preview of real Set One cards, sealed with
   the padlock treatment, wired to the same interest capture.
3. Champion count made consistent everywhere: sixty two (the baked-in "60+"
   in `lineup.png` is replaced along with the concept-art backdrops).
4. Roadmap gains the Collection chapter with honest states: preview now,
   chests at launch, mint after.
5. Presale copy unchanged by law: "Presale coming soon", POINTS never $RSP.
6. Tokenomics section notes chest and merch revenue as realm revenue, no
   invented figures.

## 31. Set One: Champions of the Six Houses

Forty cards from the live roster: 2 mythic, 12 legendary, 13 epic, 13 rare,
six to seven per House. The manifest below is the set list; art direction and
per-card prompts live in `docs/CARD-ART-PROMPTS.md`.

| # | Rarity | House | Card | Title |
| --- | --- | --- | --- | --- |
| 1 | Mythic | Nightvale | The Faceless | A Stranger to All |
| 2 | Mythic | Emberfall | Kaelen Dragonborn | The Last Ember of the Old Fire |
| 3 | Legendary | Corvane | Aeron the Black | Warden of the Obsidian Coast |
| 4 | Legendary | Corvane | Corvus Ashwing | The Raven Lord |
| 5 | Legendary | Emberfall | Pyrra Flameheart | The First Spark |
| 6 | Legendary | Emberfall | Varek Hollowflame | The Ash King's Heir |
| 7 | Legendary | Frosthold | Grommash | The Walking Rampart |
| 8 | Legendary | Frosthold | Helga Winterborn | The Glacier's Daughter |
| 9 | Legendary | Stormcrest | Tempest Kael | The Rider of Gales |
| 10 | Legendary | Stormcrest | Lyra Windmere | The Falcon of the Crest |
| 11 | Legendary | Nightvale | Vorian Nightblade | Herald of the Long Dusk |
| 12 | Legendary | Nightvale | Umbra Veilwalker | The Space Between Shadows |
| 13 | Legendary | Goldmane | Leonar Goldmane | The Lion Ascendant |
| 14 | Legendary | Goldmane | Isolde the Pure | Light of the Seven Roads |
| 15 | Epic | Corvane | Thessaly Quill | Mistress of Whispers |
| 16 | Epic | Corvane | Ravenna Holt | Keeper of the Black Archive |
| 17 | Epic | Emberfall | Karn the Reaver | Terror of the Ember Coast |
| 18 | Epic | Emberfall | Ashka Emberveil | The Smoke Dancer |
| 19 | Epic | Frosthold | Torvald Ironhand | The Anvil of the North |
| 20 | Epic | Frosthold | Gwendal Frost | The Winter's Lance |
| 21 | Epic | Stormcrest | Mira Stormborn | Daughter of Thunder |
| 22 | Epic | Stormcrest | Wren Galecaller | The Sky's Herald |
| 23 | Epic | Stormcrest | Cormac Thunderhide | The Rolling Boom |
| 24 | Epic | Nightvale | Morrigan Shadowmist | The Whisper Between Walls |
| 25 | Epic | Nightvale | Sable Nightwood | The Quiet Harvest |
| 26 | Epic | Goldmane | Octavia Gilt | The Coin Countess |
| 27 | Epic | Goldmane | Elowen Brightshield | The Dawn Sentinel |
| 28 | Rare | Corvane | Nymeria Vale | The Far-Reaching |
| 29 | Rare | Corvane | Maren Darkfeather | The Owl at Midnight |
| 30 | Rare | Emberfall | Brom Coalbeard | The Forge Father |
| 31 | Rare | Emberfall | Seraphine Dawnash | The Morning Flame |
| 32 | Rare | Frosthold | Ser Willas | The Unmoved |
| 33 | Rare | Frosthold | Bjorn Frostfell | The Bear of the Tundra |
| 34 | Rare | Stormcrest | Ser Brannoch | The Loud Knight |
| 35 | Rare | Stormcrest | Petra Boneweather | The Storm Reader |
| 36 | Rare | Nightvale | Bael the Bard | Voice of Velvet |
| 37 | Rare | Nightvale | Nyx Emberdim | The Last Candle |
| 38 | Rare | Goldmane | Lady Ysolde | The Gilded Thorn |
| 39 | Rare | Goldmane | Ser Elyra | The Line That Holds |
| 40 | Rare | Goldmane | Cressida Lorne | The Velvet Verdict |

The card chrome (frame, rarity gems, house sigil, name, stats) is rendered by
the platform, never baked into the art. That is the lesson of the
battlefield.png finding: baked-in text ships typos and contradictions forever,
composited chrome stays crisp, correctable and print-ready.

## 32. What V2 still lacks, the honest gap list

Frontend not built or not verified: onboarding steps 0 and 1 and `/banners`
signed in (blocked on real Privy keys in any test environment), Whispers
realtime UI, image attachment flows, `platform-preview.tsx` honest rebuild
(now: replace invented feed with the sealed Collection preview), the three new
sealed chapters, all Reliquary, Warchest and Mercer surfaces, dashboard IA
regroup, landing reposition.

Backend not built: feature flags, interest capture, the collectibles schema
and APIs, chest opening with auditable seeds, redemption codes, payments
(nothing exists), NFT voucher signing, durable rate limiting (the in-memory
limiter in `/api/raven` still stands), search unification, `/wallet` into
`/vault`, push and email notifications, admin for all of the above.

Infrastructure not built: real staging environment with real keys, CI running
all four gates (today CI runs typecheck and build only), error monitoring and
alerts on free tier, analytics, Supabase backup and PITR verification, load
readiness for chest-opening spikes, image CDN policy for card art, cleanup of
the duplicated Vercel projects visible on every PR.

## 33. Build phases

| Phase | Contents | State |
| --- | --- | --- |
| A. Foundation | Flags, interest, schema, LockedGate, rewire `/soon`, three sealed chapters | Started, agent dispatched |
| B. The Reliquary preview | `/reliquary` with Set One sealed, card detail sheets, Keep integration, dashboard IA regroup, landing reposition | Next, art can land mid-phase |
| C. Warchests and Mercer preview | Chest tiers with printed odds, merch SKUs with silhouettes, both sealed, pack-opening Ceremony built and dark | After B |
| D. Commerce | Payments, orders, fulfillment vendor, chest purchase live | Needs founder decisions on pricing and vendor |
| E. Mint | Contracts on Base, vouchers, claim flow, redemption codes on physical boxes | Last, deliberately |

Founder votes needed: the three names (Reliquary, Warchests, Mercer, with
alternates The Hoard, The Vaultworks, The Outfitter), dock option A or B,
chest tier names and pricing intent, print-on-demand vendor preference, and
planned supplies per rarity before anything mints.

## 34. Risks and guardrails

1. NFT markets are as bruised as SocialFi. The answer is sequencing: lead
   with the game and the physical collectibles, the word NFT arrives last,
   attached to something people already want.
2. Mystery boxes carry gambling optics. Exact odds printed on every chest,
   guaranteed floor value per box, no cash-out promises, no invented scarcity.
3. Merch logistics can eat a small team. Print-on-demand, one vendor, five
   SKUs, quality over catalog.
4. Nothing mints until the set is final. On-chain mistakes are permanent;
   preview mistakes cost a deploy.
5. The realm lexicon holds. Every new surface gets a realm name and a plain
   label, same as every existing one.

---

# Part Three: Commerce shipped, and the consolidated upgrade todo

The full strategic reasoning behind this part lives in
`docs/RAVENSPIRE-V2-STRATEGY.md` (the co-founder research read). This part is
the consolidated, actionable todo: what just shipped, what research says to add,
what our own features say to upgrade, and the exact remaining work handed to the
next session. Everything obeys AGENTS.md without exception.

## 35. What shipped this wave (done, integrated, on the branch)

Branch `claude/ravenspire-v2-living-realm-a5b06e`, all four gates green, pushed.

- **3D icon pack fixed at the source.** The dense sheet seated icons low so the
  grid slice chopped every plinth. `scripts/slice-icons.mjs` now recovers the
  full board and selects the subject by distance to cell centre. The roomier
  sheets are byte identical; only the sixty odd cut icons moved.
- **Commerce engine, backend, end to end** (sealed behind `chests_live` plus a
  separate `COMMERCE_PRICES_CONFIRMED` gate, both off): integer minor unit money,
  a Stripe provider built on REST and Node crypto (webhook signature verified,
  five minute replay window, secret server only), a server authoritative checkout
  that prices from a server only catalog, a provably fair commit reveal chest
  opening drawing against the printed odds with the guarantee floor enforced,
  non custodial redemption of single use hashed codes into an off chain holdings
  ledger, a swappable fulfillment vendor abstraction (Gelato primary), and the
  additive migration `20260812130000_commerce_engine.sql`. The migration is
  applied to the live database; the security advisor shows only the expected deny
  by default lints, no exposure.
- **Money safety pass.** The two write routes that record an unverified on chain
  tx hash (`/api/tips`, `/api/trade/record`) were the only mutating writes without
  a rate limit; both now carry one. Full adversarial audit found no unfixed fund
  stealing vulnerability; the prior SECURITY DEFINER exploit is confirmed closed
  against the live database.
- **Confirmed already done** (verified, not rebuilt): the `cx` override precedence
  defect is fixed (`components/ui/merge.ts` is conflict aware, primitives carry
  explicit props, the checker fails on conflicts), durable Postgres backed rate
  limiting exists and is wired into `/api/raven`, and CI already runs all four
  gates.

## 36. Recommendations from research (new, ecosystem driven)

Grounded in the mid 2026 ecosystem (see the strategy doc): phygital utility is
the one growing NFT corner, extractive points only SocialFi is dying, mystery
boxes face real regulation, wallets went invisible via account abstraction.
Ordered by leverage.

1. **Close the ownership loop.** Wallet backed, non custodial, eventually
   tradeable cards, with a soulbound tier for earned Crests. The single highest
   leverage move: it turns a sealed set into a real collection.
2. **Native secondary market.** List, buy, gift, transfer, member to member,
   signed by their own wallets, a protocol fee to the Exchequer, real print caps for
   a real floor. The resale premium is the documented reason phygital retains.
3. **Sinks and stakes.** Craft duplicates up a rarity, Call entries with a stake,
   House treasury perks, cosmetic Crest frames. Give status somewhere to go, or it
   inflates to nothing. This is the honest answer to "what is the token for"
   without a token sale.
4. **Appointment mechanics and seasons.** Daily Warchest drop window, a weekly
   House Clash clock, a season finale and a rank banked into a permanent badge.
   Habits need a clock.
5. **Provably fair as a marketed feature.** A public commit reveal seed, a working
   verifier page, and the floor and expected value published beside the odds. It
   also buys most of the compliance posture for free.
6. **Phygital authenticity.** NFC or QR on the physical box, tying printed cards
   to their digital twins and carrying provenance on resale.
7. **The Herald as the retention brain.** A personal weekly brief grounded in real
   data, surfaced as a notification. Same real AI over real data, aimed at loyalty.
8. **Creator and House economies.** House treasuries that accrue a slice of market
   fees, Renown that unlocks issuing Calls others follow.
9. **Native distribution wedges.** Shareable real artifacts (a Call result, a pull
   reveal, a season rank), each carrying an invite. Zero budget growth.
10. **Gasless, forgiving non custodial UX.** Account abstraction on Privy: a
    paymaster for gasless pulls and claims, social recovery, a member set spending
    cap.
11. **Compliance guardrails, before we take a dollar.** Alternative means of entry,
    age gate, spending caps, cooling off, geo awareness, the verifier page.

## 37. Recommendations from current platform features (upgrade, and why)

1. **The loop is open, so close it.** We mint Renown, Glory, Crests, POINTS with no
   sink and no market. Add spend and trade or the numbers stop mattering.
2. **Cards are sealed with no ownership, so make them owned.** Wallet backed
   ownership turns the Reliquary preview into a collection.
3. **The Keep and Vault do not show what you own or won, so build the trophy
   case.** The "Show" beat is the cheapest retention we are leaving unbuilt.
4. **Calls settle but carry nothing at stake, so let members stake.** A prediction
   with something on it is felt, and it wires the sink into a surface we built.
5. **Houses Clash but on no clock, so give the Clash a season and a settlement
   time.** Appointments form the habit.
6. **The Herald reads Calls but does not chase retention, so aim it there.**
7. **The Ceremony is our one Forge moment, so make it the best screen we have,**
   and put the provably fair verifier on it.
8. **Money surfaces are newest and thinnest, so keep auditing them hardest** as
   commerce grows a frontend.

## 38. Remaining build handed to the next session

From the commerce agent's report, ordered. All sealed while the flag is off.

1. **Commerce frontend** (largest piece): purchase and checkout UI in Warchests,
   order history in The Vault (`GET /api/commerce/orders` is ready), the pack
   opening Ceremony in the Forge register, redemption code UI. Distinct mobile and
   desktop layouts.
2. **Redemption code creation** (admin or pack time): generate a code, store its
   hash plus the specific granted cards plus the chest sku. The redeem route
   already consumes codes; nothing mints them yet.
3. **Physical fulfillment completion:** collect a shipping address at checkout for
   physical orders, and a worker that calls the fulfillment vendor on the pending
   `fulfillments` row.
4. **Refunds:** `payments.status` supports `refunded`, but there is no refund route
   or webhook branch.
5. **P2 remainder:** error monitoring (Sentry free), structured logging, a Supabase
   backup and PITR verification note, an image CDN policy for card art.
6. **P3 remainder:** onboarding steps 0 and 1, Whispers realtime UI, image
   attachment flows.

## 39. Security residuals and re-audit findings (not blocking, for the todo)

From the security audit and my re-audit of the commerce code:

1. **[MED] Tips and trades record an unverified on chain `tx_hash`.** Proper fix
   is to verify the receipt (token, amount, recipient, confirmations) before
   recording. Needs an EVM RPC provider, an infra decision. Rate limit mitigation
   is in place.
2. **[LOW to MED] War Glory is self reported and not bounded by a daily ceiling.**
   Only the twelve battles per hour rate limit bounds it. Recommend a server side
   daily war Glory cap, mirroring the two hundred per day social cap, or seed based
   replay verification (the deterministic seed groundwork exists). A game economy
   decision.
3. **[LOW] Chest entitlement is marked opened before the opening row is written,**
   so a database error in between burns a paid chest with no cards. Fix by moving
   claim, roll, grant into one transactional RPC, or reset `opened_at` on failure.
4. **[LOW] One shot provably fair.** The server generates the seed and rolls in one
   request, so a hostile server could grind seeds. Pre commit a rotating seed in a
   prior request for the stronger guarantee. No fund loss; only house favor, which
   we do not want anyway.
5. **[TRIVIAL] The redeem route comment mentions bumping `attempts`,** which the
   code does not do. Align the two.
6. **[LOW] `profile/sync` sets `wallet_address` from unverified client input**
   (set once, self only). Limited to the setter's own inbound tips.

## 40. Item 7 decided, and founder only decisions still pending

Decided (co-founder recommendation, stored server side, off customer surfaces
until confirmed): chest pricing 4.99 / 14.99 / 59.99 USD, one print on demand
vendor Gelato with Printful and Prodigi fallbacks behind a swappable abstraction,
per card mint caps Rare 5,000 / Epic 1,500 / Legendary 400 / Mythic 75, art print
edition 250 per champion.

Founder only, do not block on these, keep building sealed:
- Confirm or adjust the prices, then set `COMMERCE_PRICES_CONFIRMED`.
- Compute real floor valuations per card before confirming (the guardrail forces
  floor at least price).
- Merch prices (checkout rejects merch until they exist).
- On chain mint: deployed contracts and a platform voucher signer (the mint
  phase, deliberately last).
- The print on demand vendor contract and the payment provider account.
## 41. The ownership loop

Shipped. The first of the twelve V2 missions, and the one everything else in
the collectibles realm rests on: what you earn or buy is yours, in your own
wallet, and the platform cannot take it back.

### 41.1 What was already there, and what was missing

The holdings ledger existed. `public.inventory`, from the commerce engine, is
one row per copy of a card, written by chest opening and redemption,
server-authoritative under the same law as points. What had never existed was
the mechanism that takes a row in that ledger and turns it into a token the
member holds themselves.

A note on how that was found, because it matters more than the feature. The
commerce engine migration had been applied to the live project by a session
whose branch never reached `main`, so production carried five tables the
repository had no record of. It is recovered as
`supabase/migrations/20260812224950_commerce_engine.sql`, read back out of
`supabase_migrations.schema_migrations` and committed verbatim. A schema that
exists only in production is a schema nobody can review, test against or
rebuild. Check the two agree before writing a migration, every time.

### 41.2 The loop, end to end

1. A server flow grants a copy and writes `inventory`. Already built.
2. The member asks to claim it. `POST /api/claims` resolves the holding
   against the ledger that owns the fact (`inventory` for cards,
   `user_crests` for crests), derives the frozen token id, signs an EIP-712
   voucher naming the member's own wallet and a deadline, and records it in
   `collectible_claims`. The client names a holding and nothing else: not a
   token id, not a contract, not an amount, not a wallet.
3. The member's own wallet executes the mint and pays its own gas. The
   platform never holds a key, never holds a token, and never takes custody
   for a moment in between. An unspent voucher would still work if the
   platform vanished, which is the honest test of whether a thing is
   custodial.
4. `POST /api/claims/[id]/confirm` reads the receipt off the chain: the
   transaction landed, it was sent by that member's wallet, it reached our
   contract, and it minted that exact token to them. Only then is the claim
   `minted`. The client asserts a hash and nothing else.

`GET /api/inventory` is the Hoard, and `GET /api/claims` is the claim history
and the mint's state in one read.

### 41.3 The rules the loop is built on

- **One claim is one copy.** The holdings ledger is per copy, so a claim
  points at exactly one row and mints exactly one token. There is never a
  question of how much of a holding has been carried on-chain.
- **Token ids are frozen forever.** `lib/collectibles/token-ids.ts` is the
  only place they are decided. Cards derive theirs from the collector number
  already printed on the card; crests carry a hand written table, because
  reordering a display list must never renumber a token somebody owns. Its
  test is a tripwire on both tables.
- **Crests are soulbound.** A separate contract, and the voucher says so in
  its own signed payload. A crest is a record of something a member did, and
  one that can be sold is a record of something somebody paid for, which is a
  different object with the same picture. The secondary market (mission 4)
  reads `isSoulbound` and must never list one.
- **Four replay guards.** A unique nonce inside the signed payload, a
  deadline, a wallet the voucher is bound to, and a partial unique index so
  one copy carries one live claim.
- **A hash proven wrong is never persisted.** It would otherwise squat the
  unique index and block the real one.

### 41.4 Sealed until the founder says otherwise

Three things are founder-only and all three are absent: the deployed
contracts, the voucher signing key, and the chain. `mint_live` ships off
beside `reliquary_live`, `chests_live` and `mercer_live`. Both the flag and
the configuration must be present before a single voucher is signed, and they
report differently because they are different situations: 423 for a sealed
chapter, 503 for a missing signer.

`lib/chain/claim-abi.ts` records the interface the deployed contract must
implement, field for field with the signed voucher. The two cannot be edited
alone. A struct that differs by one field or one ordering produces a
signature that verifies against nothing, and the member meets that failure in
the worst possible place: in their own wallet, after paying gas.

To open the mint: deploy the two contracts on Base, set `MINT_CHAIN_ID`,
`MINT_CARD_CONTRACT`, `MINT_CREST_CONTRACT` and `MINT_VOUCHER_SIGNER_KEY`,
then flip `mint_live`. No deploy is needed for any of it.

## 42. The chest, and why anyone should believe it

Shipped, sealed. Two of the section 39 security residuals, and they turned out
to be one bug seen from two angles: the realm could not honestly promise what
came out of a chest, and it could not promise that opening one happened
exactly once.

### 42.1 Both halves, in the order that makes them mean something

The planned design generated a server seed at open time and stored its hash.
That is the version of provably fair that proves nothing. A server that picks
its seed after the member has committed can roll a thousand seeds and publish
the hash of whichever one pays out least, and every published hash still
verifies. The proof has to exist before the member can act on it.

The first pass fixed that half and left the other one open: a seed was
published only if the member chose to rotate it, so a member who never rotated
could never check a single one of their openings. A proof nobody can run is a
promise, not a proof.

Both halves now:

1. **The realm commits.** A seed is generated and its hash published the first
   time a member looks at the chests, kept in `chest_seeds`. The realm goes
   first, before it knows what the member will choose.
2. **The member answers.** They set a client seed of their own, having already
   seen the hash. The realm cannot know it in advance, so it cannot pick a seed
   to suit it. `POST /api/chests/seed`.
3. **The chest reveals.** Opening publishes the seed that drew it, commits a
   fresh one for the next chest, spends the entitlement and grants the cards,
   all in one transaction. The member walks away holding everything needed to
   rerun the draw, without having to know a rotation feature exists.

`/api/chests/seed` is deliberately not flag gated: a member is entitled to hold
the realm to its promise before the chests are live and long after. The
`FairnessPanel` on `/warchests` is where the three steps are shown, using the
member's own live commitment and never a specimen.

A correction worth recording. The first pass refused to let a member edit their
client seed under a live commitment, reasoning that it would let them re-roll a
chest they had already seen. That was wrong: a roll cannot be seen without
consuming an entitlement, and the entitlement is consumed in the same
transaction that reveals the seed, so there is no "already seen" to exploit.
Editing is what makes step two possible at all.

### 42.2 The three inputs

| Input | Who chooses it | What it stops |
| --- | --- | --- |
| Server seed | The realm, committed as a hash beforehand | The member predicting the roll |
| Client seed | The member, any text | The realm choosing the roll |
| Nonce | The entitlement being spent, a uuid | The same pair of seeds dealing the same chest twice |

The nonce is fixed before the roll rather than counted during it, which is
what makes a retried open recompute the same cards instead of rerolling into a
better chest. Changing the client seed is a rotation, never an edit, because a
client seed changed under a live commitment would let a member re-roll a chest
whose odds they had already seen.

The roll (`lib/collectibles/pulls.ts`) is a pure function of those three. It
reads no clock, no database and no random number generator, which is exactly
what makes it checkable: anyone holding a revealed seed can rerun it. Nine
tests cover the count, the floor, the odds, determinism, and that a chest can
only ever deal cards that exist in the roster.

### 42.3 The opening was four writes

Consume the entitlement, record the opening, grant the cards, link the two.
Four round trips from a serverless route, and a crash between any two either
ate a paid chest and granted nothing or granted the cards and left the
entitlement to be spent again. Neither is distinguishable from the other
afterwards. `public.chest_open` does all four under a row lock in one
transaction, or none of them, and a partial unique index on the entitlement is
the second line of defence.

### 42.4 What it waits on

Nothing grants an entitlement yet. Checkout and redemption codes are the two
writers and both are founder-gated on pricing, so `chest_entitlements` is
empty and the route answers honestly that you have no unopened chest of that
kind. `chests_live` is off as well, so the door is shut on both counts.

The verifier page (mission 6) is the surface this was built for: the revealed
seeds, the openings under them, and a rerun anybody can check. It shipped, at
`/proof`. See section 47.

## 43. The commerce frontend, and two things it turned up

Shipped. The last of the three things `COMMERCE_PRICES_CONFIRMED` was waiting
on. What remains is a real payment account and the compliance guardrails,
neither of which is code.

### 43.1 Prices come through one door

`lib/commerce/catalog.ts` is server-only so a price cannot leak into a bundle,
and `GET /api/commerce/catalog` is the single controlled exception. While the
confirmation gate is shut it carries no money at all: not a rounded figure, not
a "from" price, not a placeholder. The buy control says "priced at launch"
instead.

The buy control has four states and most of its job is refusing correctly:
sealed, open but unpriced, priced and ready, and payments not configured. Each
is a different truth and each is said in words. The guaranteed floor rides
beside every chest price, because a chest that shows its price without its
floor is a worse offer than the realm actually makes.

Merch sells now and answers to `mercer_live`, checked after the cart is parsed
so a merch-only order is not turned away by a sealed chest chapter it never
touched.

### 43.2 The opening, and the Reliquary as a checklist

The opening is the Forge register: full bleed, cards landing one at a time
rarest last, the card the printed guarantee lifted named as such, and the proof
on the same screen. Card names and art come from the roster rather than from
the response, so the two can never disagree.

The Reliquary now knows what you hold. A card you own is unsealed and wears its
rarity frame, which is the existing rule read correctly: the seal was always
about a card you have not pulled yet, never about a chapter being closed. The
progress line and the Held/Missing filter are absent until the holdings read
lands, so the page never spends a moment claiming you own nothing before it
knows.

### 43.3 Two bugs the work turned up

**An invented feed on the landing page.** `platform-preview.tsx` shipped a
raven with 214 likes from a member who does not exist, a Season table where
House Corvane held 4,820 Glory, and a Keep with 8,140 Renown. Every figure
invented, on the most public page in the product, beside real claims about a
real platform. Rebuilt with the same four rooms and no invented figure: the six
Houses and the crest set are real, and the two social rooms show chrome with
their content honestly empty.

**Four of the six House sigils were blank circles.** `Icon` falls back to a
small empty ring for a name it does not know, so a missing glyph reads as
deliberate. `snowflake`, `storm`, `moon` and `lion` had never been drawn, so
Frosthold, Stormcrest, Nightvale and Goldmane wore identical circles everywhere
a banner appears. Six banners that look the same are not six banners. Drawn
now, and checked: `scripts/check-house-rules.mjs` gained two rules, one for
literal `Icon` names and one for the sigils and crest glyphs that reach `Icon`
through a variable, which are exactly the ones that went missing because they
are written once in a data file and rendered everywhere.

### 43.4 One decision unblocked, and left for the founder

Section 29 offers two mobile docks and recommends the one that drops the
Crossroads for the Reliquary, on the premise that the Crossroads stays
reachable from a top bar search. There was no top bar search, so the premise
was false and the dock could not honestly move. There is one now. The dock
itself is untouched: which five destinations a member gets on a phone is the
founder's call, and it is one array in `lib/nav.ts` when they make it.
## 44. Crafting, the card sink

Shipped, sealed. The first half of mission 3, the Spend beat. The collectibles
realm could mint a card and had no way to destroy one, so duplicates piled up
and meant nothing. Crafting is the sink: burn copies of one rarity, forge one
card of the rarity above.

### 44.1 The ratios, and why each one is that number

| Step | Burn | Floor burned | Floor forged | Destroyed |
| --- | --- | --- | --- | --- |
| rare to epic | 4 | 32 | 22 | 31% |
| epic to legendary | 4 | 88 | 60 | 32% |
| legendary to mythic | 10 | 600 | 275 | 54% |

Two bars, both asserted at module load in `lib/collectibles/crafting.ts` rather
than argued in a comment, so a bad ratio breaks the build instead of reaching a
member.

**It destroys floor value.** N copies of the lower rarity must be worth
strictly more than the card they produce, against the real per rarity floor in
`lib/commerce/catalog.ts`, and at least a fifth of what is burned has to
disappear. A ratio that clears the floor by a dollar is arithmetically a sink
and economically not one: a single revision to a floor would turn it into a
printer with nothing failing.

**It is never cheaper than the box.** In a chest the two rarities already
arrive together at a rate the odds table fixes. The Squire's Chest deals 3.70
rares per epic, 3.70 epics per legendary and 9.0 legendaries per mythic. A
craft below those rates would be a strictly better chest with no variance at
all, and nobody would open a box for that rarity again. Every ratio strictly
exceeds the most generous co-drop rate any tier offers, read off
`CHEST_TIERS.odds` rather than a copy of it, so a retuned odds table breaks the
build rather than quietly turning crafting into arbitrage.

Ten is the number worth explaining. The Knight's Warchest deals five cards at
2% mythic, so ten of them are one mythic in expectation, and because every
Knight's chest guarantees a legendary floor those same ten chests also
guarantee the ten legendaries a craft costs. The two paths cost the same, which
is exactly right: crafting is the floor under bad luck, never a cheaper route
than good luck. Six or seven would have made the craft the dominant way to
reach the top rarity, which is how a collectibles economy inflates to nothing.

Chained end to end the ladder costs 160 rares, 1,280 dollars of floor, for a
275 dollar mythic. A per step check alone would have missed that.

### 44.2 Crafting is a choice, not a roll

The member names the card they are forging. That is what the premium above the
chest's own rate buys: the chest sells randomness cheaply, crafting sells
certainty dearly. A bench that rolled would be a strictly worse chest and
nobody would feed it. It also means there is nothing here to distrust: no seed,
no commitment, no reveal, because there is no randomness to prove fair.

### 44.3 The transaction

`public.craft_cards` deletes N rows and inserts one, under a row lock, or does
neither. From a route that is three round trips and a crash between any two is
unrecoverable and undiagnosable afterwards: either the member's cards are gone
with nothing to show, or a card was forged and the copies that paid for it are
still in the ledger, which is a printer. Same lesson as `public.chest_open`,
applied to the other end of the same ledger.

What it re-checks under the lock, never trusting the route's read: ownership,
the set, the rarity, the count, the absence of a repeated id, the absence of a
live claim, and that the forged rarity is exactly one rung above the burned one.
The last of those is the important one: a bug in a route could otherwise mint a
mythic out of four rares, and a minted card is not retractable once a member has
claimed it to their own wallet.

**A card carried on-chain cannot be burned.** A copy with an issued, submitted
or minted claim is refused. The member holds that token and the platform never
had custody of it, so deleting the ledger row would put the database and the
chain into permanent disagreement with the chain being right. Two independent
mechanisms enforce it. The explicit status check catches a claim that exists.
A claim being issued at the same moment is caught by the row lock itself:
inserting a row that references `public.inventory` takes a `FOR KEY SHARE` lock
on the referenced row, which conflicts with the `FOR UPDATE` the craft takes, so
a concurrent issuance blocks until the craft commits and then fails its own
foreign key. Without that a voucher could be signed against a copy being
destroyed, and the member would meet the failure in their own wallet after
paying gas. `FOR UPDATE` rather than `FOR NO KEY UPDATE` is load bearing.

**Burned rows are deleted, not flagged.** A `burned_at` column was the other
option and it is the worse one: every read of the holdings ledger would need to
filter on it, and the day one forgets is the day a member sees a card they
burned and can act on it. A deleted row cannot be misread by a query nobody
updated. `craft_events` keeps the history, denormalised, because the rows it
describes no longer exist to be joined against.

### 44.4 The surface

`/reliquary/craft`, a Console. Choosing what to destroy is Ledger work: dense,
flat, one tile per copy rather than per card, because a member burning four
rares is choosing four specific rows and a stacked tile would hide which ones.
The one Forge moment is the card coming out, in a modal. Desktop puts the fire
and the choice of what comes out of it side by side; a phone stacks them in the
order the decision is made and pins the action to the thumb.

A member may burn their only copy of a card. The bench marks it and does not
stop them, because it is their card, and refusing would be the platform
deciding what somebody may do with their own property.

The Hoard grows one control, and only when the collection actually holds enough
of one rarity to craft with. The trophy case is where a member notices they hold
four of the same rare, so it is where the sink has to be offered.

### 44.5 What it waits on

`crafting_live` ships off, a fifth switch beside `reliquary_live`,
`chests_live`, `mercer_live` and `mint_live`. Nothing grants a card yet, so
every Hoard is empty and the bench renders its honest empty state. The ratios
are printed while sealed, for the same reason a chest prints its odds before it
can be bought: a member is entitled to read the terms of a trade before the
trade exists.

Migration `20260813103404_crafting_the_card_sink.sql`, applied.

## 45. The Bazaar, the non-custodial secondary market

Shipped, sealed. Mission 4. Members held real cards and there was nowhere to
trade one, so a collection could only ever grow: it had a floor the platform
stands behind and no price anybody had ever paid, which makes a collectibles
economy a subscription with pictures.

### 45.1 Why this is not custody, in full

The platform never holds a card and never holds a payment. That constraint is
not a feature of the design, it is the design, and everything else falls out of
it.

**The card never moves to the platform.** A listing is an intent, not a deposit.
`inventory.profile_id` stays the seller's for the entire life of the listing.
There is no escrow row and no platform-owned profile. The card moves exactly
once, in `public.market_record_payment`, straight from the seller to the buyer,
in the same transaction that records the payment. At every instant the answer to
"who owns this copy" is one member, and it is either the seller or the buyer.

**The money never touches the platform.** The buyer's own Privy wallet pays the
seller's own wallet and pays the fee to the Exchequer. Nothing in the schema holds
a balance because there is no balance to hold: the payment columns record hashes
of transactions that happened between two other parties, which is bookkeeping.
The honest test the ownership loop uses applies here too. If the platform
vanished halfway through a trade, the seller would already have been paid, in
full, because the payment went directly to them and never anywhere else.

**The fee is revenue, not custody.** The Exchequer receives it from the buyer, in
the buyer's own transaction, as a disclosed charge for running the venue.
Receiving your own fee is not holding somebody else's asset.

### 45.2 The ordering problem, and the reservation that solves it

An off-chain ledger row and an on-chain payment cannot settle atomically. One of
them has to move first, and there are exactly three orderings.

| Ordering | Verdict |
| --- | --- |
| The platform escrows the payment | Atomic, and custody. Refused |
| The card moves first, then the buyer pays | The seller carries the whole risk with no recourse |
| The buyer pays into a frozen reservation, then the ledger moves on proof | Chosen |

The reservation is what makes the third one safe. While a listing is reserved to
one buyer, the seller cannot cancel it, re-price it, sell it to anybody else,
burn the card at the crafting bench, or carry it to their own wallet. The last
two are enforced by triggers on the tables rather than by a route remembering to
check. So the buyer pays into a trade the realm has already committed to
completing, and the only failure left is the realm failing to record a payment
that is on a public chain forever, which is retryable and idempotent rather than
a loss.

Said plainly, because a member is owed the plain version: the buyer takes a
short window of risk against the realm's bookkeeping. They never take custody
risk, because nobody has custody.

**Expiry is a deadline on exclusivity, never on settlement.** The moment a
single payment leg is proven, the reservation stops being releasable at all, no
matter how long ago it was made. A buyer told their money arrived too late would
be the worst sentence in this product.

### 45.3 Two transfers, and why not one

A sale has two payees and a plain ERC-20 transfer pays one address. The
single-signature version is the buyer paying the platform, which then forwards
the seller's share, and that is the custody this design refuses. So the buyer
signs twice, or once if their wallet can batch the two calls, and the server
records whichever legs each receipt actually proves. Two signatures is the price
of never touching a seller's money.

The seller leg is asked for first on purpose. A member who abandons the flow
between the two prompts has paid the seller and owes only the fee, which leaves
the seller whole and the trade completable. The other order would take a fee for
a trade that never happened.

Settlement is in a dollar stablecoin on Base, quoted in USD minor units and
converted to token base units by exact integer arithmetic. That is the whole
reason the pay token is a stablecoin: a floating asset would need an exchange
rate, a rate needs an oracle, and a rate read at listing time and honoured at
settlement is an invented number wearing a price tag.

### 45.4 The fee

**500 basis points, five percent, to the Exchequer.** Small, explicit, and shown
in full before anybody commits: the seller sees what they will receive before
they list, and the buyer sees the price and the fee before they sign. It is
never taken out of a spread and never described as network costs.

Five percent is where it sits because of what it sits between. eBay takes about
thirteen percent of a collectibles sale and StockX about nine, both on an
inventory the seller has to ship. An NFT marketplace takes two and a half and
provides no floor, no authentication and no venue beyond a contract. This market
authenticates every card by construction, because the realm printed it. Five is
defensible between those, and it is a number a member can check in their head.

The arithmetic is integer minor units throughout (`splitFee` in
`lib/commerce/money.ts`), rounded half up, with the seller's share derived by
subtraction rather than by a second rounding, so the two halves can never
disagree with the whole. That invariant is asserted at module load, tested
exhaustively across every price the market allows, and checked again by a
database constraint, because a split that quietly loses a cent shorts a seller
on every sale forever and nothing ever fails.

Price bounds are a dollar to a hundred thousand. The floor is what keeps the fee
from rounding to nothing; the ceiling is a fat finger guard.

### 45.5 A crest is never listable

`isSoulbound` in `lib/collectibles/token-ids.ts` is the single answer to that
question and the market reads it rather than re-deriving it, because a market
that has to ask a second module whether a listing is legal will one day forget
to. The database says it independently: `market_listings.subject_kind` is
constrained to `card`. Two mechanisms, because a soulbound token sold to a buyer
takes their money and delivers something that cannot be transferred to them, and
there is no honest way to unwind that afterwards.

### 45.6 A card carried on-chain, and the rule nobody would have written

**A copy with a live claim cannot be listed.** The member holds the token in
their own wallet and the ledger row is no longer the whole truth. Moving the row
on payment would sell a buyer something the realm cannot deliver, with the chain
saying the seller still owns it and the chain being right. Refused, exactly as
`public.craft_cards` refuses it, with the same verdict name, because it is the
same fact.

Trading a card that is genuinely on-chain is a real feature and it is
deliberately absent. The only honest way to do it is on-chain: the seller signs
the transfer and it settles atomically against the payment in a contract both
parties call. That needs a deployed marketplace contract, which is founder-gated
and unbuilt, and the alternative of having the seller send the token to the
platform to forward is the exact custody this design refuses.

**The reciprocal rule is the one that actually protects a buyer's money, and a
route would have forgotten it.** Without it a seller could list a card, wait for
somebody to pay, and mint the token to their own wallet before the settlement
landed. So a card with a live listing cannot be claimed on-chain, and cannot be
burned at the bench either. Both are triggers on the tables. The claim trigger
takes `FOR UPDATE` on the inventory row before it reads the listing table, which
is what makes it race-proof rather than usually right: it forces the claim
insert and `market_list` or `market_reserve` into a strict order, so whichever
commits first is seen by the other. A plain `SELECT` there would be an MVCC
snapshot taken beside an uncommitted listing, which reads as no listing at all.

The triggers raise custom SQLSTATEs, `RS001` for the burn and `RS002` for the
claim, which the craft route and the claim route map into sentences rather than
reporting the realm as unavailable for something entirely of the member's doing.

### 45.7 The floor is not a price, and the market never quotes it

`lib/commerce/catalog.ts` is deliberately not imported by any market module.
`RARITY_FLOOR_USD` is what the platform commits to standing behind, not a market
price and not an appraisal. A board that showed it beside a listing would be
quoting it as one, whatever the label said. The only number on a row is the
price its seller named: no floor, no last sold, no estimate, no suggestion. The
realm does not know what a card is worth and is not going to invent a figure.

### 45.8 The transaction, and what it re-checks

`public.market_list`, `market_cancel`, `market_reserve` and
`market_record_payment`, all `security definer`, all `service_role` only, all
under a row lock. Same lesson as `public.chest_open` and `public.craft_cards`,
applied to the third end of the same ledger: a settlement from a route is five
round trips, and a crash between any two leaves a buyer who has paid and holds
nothing, or a card moved with the listing still open for a second buyer.

What they re-check under the lock, never trusting the route's read: ownership,
the absence of a live claim, the absence of another live listing, the buyer not
being the seller, the reservation being this buyer's, and that the fee and the
proceeds still add up to the price.

**The wallets are read inside the function, never passed in.** If a route could
name the payee, then a bug or a forged request in a route could redirect a
sale's proceeds, which is the single most valuable thing anybody could do to
this system. The chain, the pay token and the Coffers address do come from the
caller, because they are the platform's own configuration, and they are frozen
onto the listing at reservation time so a config change mid-flow cannot move
where a buyer was told to pay.

A listing cannot sell twice by three independent mechanisms: a partial unique
index means a copy carries at most one live listing, the settlement is guarded
on the status still being `reserved` under the row lock, and the update that
moves the card is scoped to the seller still holding it.

### 45.9 The surfaces

**The Hoard grows a listing control**, on a copy that is neither on the board
nor in the member's own wallet. Selling starts where a member is looking at what
they own, which is the same argument that put the crafting bench there. The
sheet prints three numbers before the button can be pressed: what the buyer
pays, the fee, and what the seller receives. There is no suggested price beside
the field.

**`/market` is the Bazaar**, a Board rather than the wall of images every other
marketplace defaults to. Comparison is the job: a member arriving wants to know
what is for sale and at what price, and prices are read by lining them up. So
compact density above `md`, right aligned tabular prices, hairline dividers, no
zebra, ornament budget zero, and a card list below `md` because a five column
table never scrolls sideways on a phone. The Hoard is where cards are meant to
look beautiful. The fee is printed on the board itself, for the same reason a
chest prints its odds before it can be bought.

The honest empty state is the usual one and it is the truthful one: nobody holds
a card yet, so nothing is listed, and the board says exactly that.

### 45.10 What it waits on

`market_live` ships off, a sixth switch beside `reliquary_live`, `chests_live`,
`mercer_live`, `mint_live` and `crafting_live`, answering 423 exactly as the
chest route does. The pay token and the Coffers address are unset, which answers
503 separately, because a sealed chapter and a missing configuration are
different situations and a member should never have to interpret the second.

To open it: set `MARKET_CHAIN_ID`, `MARKET_PAY_TOKEN`,
`MARKET_PAY_TOKEN_SYMBOL`, `MARKET_PAY_TOKEN_DECIMALS` and `MARKET_FEE_WALLET`,
then flip `market_live`. The decimals are required rather than defaulted on
purpose: a wrong value does not fail, it succeeds at the wrong magnitude, and
the buyer meets the result in their own wallet after signing.

Gifting and member to member transfer without a payment are the two pieces of
mission 4 still absent. Neither is hard on top of this, and both are a different
flow: no price, no fee, no reservation, one signature.

Applied in four parts, `20260813112210` through `20260813112411`, and the four
files carry the names and versions production recorded. It was verified against
a throwaway PostgreSQL 16 cluster with the whole migration chain replayed onto
it, exercising every refusal, both triggers, every check constraint, the unique
indexes and the grants.
## 46. The realm gets a clock

Shipped. Mission 5, appointments and seasons, and the plainest retention hole
in the product: nothing in Ravenspire happened at a time. Every act was
available at every hour of every day, so no day was different from any other
and no member ever had a reason to come back on a particular one.

Three appointments, in ascending period. The clock that decides all three is
`lib/realm/appointments.ts`: pure, server-only, with its own tests and its own
module load assertions. The settling is in Postgres, because all three have to
happen exactly once or not at all.

### 46.1 The Muster, the daily window

Two two-hour windows a day, at 01:00 and 13:00 UTC. A member who opens the app
inside either one claims the day: once per UTC day, either window, never twice.

**Why two.** One realm-wide window is what makes an appointment worth anything,
because everybody is present at once, which is the difference between an event
and a daily bonus. But a single fixed UTC window permanently excludes whole
hemispheres, and a per-member window would fix that by destroying the mechanic:
if everyone's window is different, nobody is ever present at the same time as
anybody else. Two windows twelve hours apart cost nothing, because the claim is
still once a day. That they cover the whole planet is asserted at module load
against every whole-hour UTC offset from -12 to +14, and tested again, because
it is the one property of the schedule a well-meaning "let us move it an hour"
would silently destroy for one hemisphere, and the people it excludes are
asleep and do not file bugs.

**What it pays, and why the realm can afford it.** This is the part that took
the longest to get right, because the obvious design is wrong in a way that
takes a year to show.

`public.award_capped` adds every point of Glory to Renown, and Renown never
falls. So a daily attendance reward paid in fresh Glory mints permanent
standing every day forever for opening an app: at sixty a day that is twenty
two thousand Renown a year, past the King tier at fifteen thousand, without a
member ever making a Call or fighting a battle. Every ladder in the realm would
have ended up sorted by attendance.

So the Muster mints nothing at all. It is paid through `award_capped` under the
same `'social'` category, and therefore out of the same two hundred a day
ceiling, that likes, cheers, comments and quests already spend. The realm's
total Renown mint per member per day does not rise by one point. What the
Muster changes is WHEN a member spends an allowance they already had, which is
exactly what an appointment mechanic is supposed to do.

The honest consequence is stated on the offer, before the button, rather than
discovered after it: a member who has already earned their day is paid nothing
by the Muster, and the vigil holds anyway. That is correct. They have already
earned their day. The Muster is for the member who would otherwise not have
come at all.

A pleasant side effect: `points_ledger_category_check`, the constraint this
repository has twice nearly broken by re-adding it from a stale reading, is not
touched by this migration at all.

**What is actually earned in the window** is the vigil: a server-kept count of
consecutive days mustered inside a window, which no amount of scrolling at
other hours can produce. Thirty consecutive days earns `lord-of-light`.

That crest is the point. It has sat in the catalogue since launch reading "for
unbroken daily devotion to the realm", marked locked, with a frozen token id
and a drawn glyph, and nothing anywhere in the product could grant it. It was a
promise the realm had no mechanism to keep. A badge is the one thing an
attendance mechanic can pay forever without inflating anything, and the Muster
is its producer.

The vigil is deliberately a separate count from `profiles.streak`, which
advances for opening the app at any hour. They measure different things: that
one is "did you show up", this one is "were you here when the realm was".
Paying a devotion crest off the plain streak would hand it to somebody who has
never once caught a window.

Curve: 20 Glory on day one, 5 more per consecutive day, ceiling 60 on day nine.
The ceiling is asserted at module load to be a whole number of steps above the
base and to be under half the daily social allowance, because a ceiling near
the cap would mean a member who catches the window has already spent their day
and earns nothing for anything they then actually do.

### 46.2 The Clash, the weekly clock

House Clashes shipped with a table, an authoring form and a live scoreboard,
and no schedule and no ending. Every Clash had to be typed by a steward, which
in practice meant none was ever called: `house_clashes` is empty in production
to this day. And nothing happened when one closed, so a finished Clash was
indistinguishable from an abandoned one.

**The cadence.** The Clash of ISO week N opens on that week's Friday at 18:00
UTC and closes on the Sunday at 18:00 UTC. Forty eight hours, which is the
length a Clash has always been, moved off a steward's whim and onto the
calendar. Friday evening in Europe, Friday afternoon in the Americas, Saturday
morning in Asia and Oceania, so every member gets two of their own weekend days
inside it. The row is written as soon as the previous Clash closes, so the
countdown is visible for the best part of a week before it opens.

It is a THEME Clash, counting every Call sealed inside the window, and never a
token one. No scheduler can nominate a token without inventing one: picking
"whatever is trending" would make the realm's own weekly fixture depend on a
third party price feed, and picking a favourite would be the platform putting
its thumb on a market. A theme Clash needs nothing invented, because the rule
is the window itself. Stewards may still call a token Clash by hand; those
carry no `scheduled_week` and sit beside the weekly one rather than replacing
it.

**Idempotency, three layers.** A unique partial index on `scheduled_week` means
one scheduled Clash per ISO week, so a cron that overlaps itself races an index
rather than a guard written in TypeScript. `public.settle_house_clash` takes
`FOR UPDATE` on the clash row and re-checks `settled_at` under it, so a second
invocation blocks and then reads what the first wrote. The primary key on
`(clash_id, house_slug)` is the third line. And `ends_at` is re-checked against
the DATABASE clock, never against a time passed in, so a job host whose clock
is an hour fast cannot close a Clash early and freeze a board that Calls were
still arriving in.

**Safe to miss a run** falls out of the design rather than being bolted on. The
scheduler asks "what is the next window a member could still enter", never
"what has happened since I last ran", so a job that has been down for a month
comes back and opens exactly one Clash: the real one. Backfilling the weeks it
missed would have been the obvious answer and the wrong one, because a Clash
for a week that already closed is a competition nobody could enter. And a job
that comes back DURING a live window still gets it right, which is a property
of the original Clash design: entries are derived from `posts.created_at`
inside the window rather than recorded when the Clash opens, so a row written
an hour after its own start counts every Call made in that hour.

**Why settlement pays nothing.** The obvious design is a Glory bonus for the
winning House and it is wrong. A Clash score IS Glory, already earned and
already paid by the very Calls on the board: every point went through `award()`
when the verdict job settled that Call. Paying it again at settlement would
credit one act twice and make winning a Clash the cheapest Glory in the realm.
It cannot pay POINTS into the House treasury either, because that treasury
holds real POINTS burned by real members staking real Calls, and minting into
it would put invented balance beside earned balance in one column.

So a Clash pays a record, permanently. The House that won the Clash of week 33
won it forever, and nothing anybody does afterwards can move it. That is worth
more than a bonus that devalues the currency it is paid in.

**Why the finished board is frozen.** `house_clash_contributions` derives the
board from posts, which is right for a LIVE board and wrong for a finished one.
A result that keeps recomputing is a result that changes: a member deleting a
Call in November would silently rewrite who won a Clash in August, and a House
that lost could be handed a retroactive victory by somebody tidying their
profile. `house_clash_results` freezes it at settlement, and the surface reads
the frozen board for a settled Clash and the derived one for a live Clash.

### 46.3 The season finale

**What banks.** Every member's final rank, POINTS, Renown and Glory, frozen
into `season_settlements`. Each House's board is already derived from
`points_ledger` within the season window and needs no freezing.

**What resets.** Glory, and Glory alone, on `profiles` and on `houses`.

**What a member keeps forever.** Renown, which never falls. POINTS, an earned
balance the realm intends to honour. Every card and every crest, held non
custodially, which the platform could not take back if it wanted to. The
settlement row itself. And, for the top three on Glory,
`champion-of-the-season`.

That is the other crest the catalogue has always described and nothing could
ever grant: legendary, locked, frozen token id, drawn glyph, no producer
anywhere in the product, because a season had no close. Now it has one. A
member on zero Glory is never crowned: a season nobody played has no podium,
and a legendary crest for finishing first among people who all scored nothing
would be worth nothing.

**Why Glory is the only thing that can reset.** Renown never falls, which is
the first law of this economy and the reason Renown is worth earning at all.
POINTS are an earned balance, so confiscating them at a boundary would be
taking back something a member was told they had kept. Cards and crests are
property. Glory is the only currency the product has always described as a
House's SEASONAL standing, and a season in which nothing resets is a
leaderboard with a name on it: the House that led in month one leads forever,
because nobody can catch a number that only grows.

**Why the freeze and the reset are one transaction.** The reset destroys
exactly the numbers the freeze is recording. From a route that is two
statements, and a crash between them is unrepairable in the worst possible way,
because the evidence is what was destroyed: either every member's final Glory
is zeroed with no record of what it was, or the record exists and the new
season starts with the old scores still on the board.

**Why a second run cannot zero the record.** This is the subtle one.
`season_settlements` is keyed on `(season_id, profile_id)`, so a second run
would upsert over the frozen rows, and by then every member's Glory is zero: it
would overwrite a whole season's record with zeroes and rank the realm
alphabetically. The status moves to `'settled'` inside the same transaction and
is re-read under the row lock, so a second run refuses before it reads a single
profile. `p_force` exists to close a season EARLY and deliberately does not
bypass the status check. Force means "close it now", never "close it again".

**A rank basis that was wrong.** The admin settle action ranked the season by
POINTS, a lifetime balance that never resets, so the top of every season's
table would have been the same people in the same order forever and the rank
would have measured how long somebody had been here rather than what they did.
A season is ranked by the season's own currency. The admin route now calls
`public.close_season` too, so the realm has one settlement path and cannot hold
two opinions about who won.

**And a member can finally see it.** `season_settlements` has existed since
launch with RLS denying it to every browser role, correctly, and the only
reader in the product was the admin console. So the realm has been freezing a
permanent record of each member's season and showing it to nobody but a
steward. `GET /api/seasons/record` is the member's own half of it, their rows
and nobody else's, rendered on `/renown` under "Seasons behind you", absent
rather than empty until there is a settled season to show.

### 46.4 The surfaces

The **realm strip** leads with the Muster, and it is the only cell that ever
leads, because it is the only one that expires. The strip stays Ledger: quiet,
compact, one line. Answering is the Ceremony and takes over a centred Modal
with the 3D icon at its anchor, one number and one action. That register split
is the whole point: if the strip glowed, the moment it announces would mean
nothing. The cell is only a control when there is genuinely something to do,
because a control that opens a dialog saying "come back later" teaches a member
to ignore it.

The **Houses Clashes view** gets the cadence above the list, present whether or
not a Clash exists, which is the honest empty state it never had. Publishing
the rule ("Clashes open every Friday at 18:00 UTC and run 48 hours") is not
inventing a record, and a `scheduled` flag keeps it honest in the other
direction: when the row for the next window has not been written yet the card
says the Clash is due rather than counting down to something that does not
exist. A settled Clash reads Final and names the House that took it; a Clash
that has closed without settling says so, because closed and settled are
different facts.

The **`clash.settled` card** is Ledger register, deliberately, and it is the
one interesting judgement in the set. A House winning something is exactly what
the Forge register exists for, and `house.overtake` already takes it. But a
Clash settles every single week, forever, and ornament that arrives on a
schedule is ornament nobody looks at twice. Ornament is earned and never
ambient, and a weekly fixture is the definition of ambient. So the Clash result
is quiet and the House overtaking a rival stays loud.

**Every countdown is against the server's clock.** Each payload carries the
server's own `now` beside the absolute instants, the surface measures the skew
once on arrival, and every label is drawn against that. A browser twenty
minutes fast reads the right countdown, and a browser set forward deliberately
gains nothing at all, because the claim is decided in `public.claim_muster`
against the database's clock and the surface can only ever render a label.

### 46.5 Cron

`/api/cron/clock`, hourly at five past, authenticated by `CRON_SECRET` exactly
as the four existing jobs are. One job for all three appointments, because they
share a clock and three cron entries would let the realm hold three opinions
about what time it is. One `now` per invocation, for the same reason.

Idempotent, safe to run twice in the same window, and safe to miss a run: every
question it asks is "what is true now" and never "what happened since I last
ran". Nothing in it reads a state and writes it from application code; every
guard is a unique index or a row lock.

### 46.6 Two bugs found on the way

**Seasonal quests have never been verified against their season.**
`lib/game/quest-verify.ts` read `started_at` from `seasons` and the column is
`starts_at`. PostgREST fails the whole select on an unknown column, the
surrounding catch swallowed it, and the fallback is a plausible ninety day
rolling window rather than an error, so it has been silent since the verifier
shipped. Every seasonal quest in the realm has been checking activity in the
last ninety days instead of activity in the season: "win ten duels this season"
could be completed with duels won in the previous one, and a season shorter
than ninety days verified its quests against time before it existed. Fixed.

**A module load assertion closed an import cycle.** `points -> crests ->
appointments -> points`. The cycle had existed harmlessly for as long as points
and crests have referred to each other, because every use was inside a
function. A module load assertion is the one thing that cannot wait, so it read
the binding before the module holding it was evaluated, and the build failed
with "cannot access before initialization" from a route that touches none of
it. Typecheck could not see it; `npm run build` could. The two daily allowances
moved to `lib/economy/allowances.ts`, a leaf with no imports, re-exported from
`lib/points.ts` so every call site is unchanged.

### 46.7 Repository versus database

Checked before anything was written, as the handoff now requires.
`points_ledger_category_check` in the live project is
`('social', 'call', 'war', 'stake')`, which matches
`20260813104201_call_stakes_and_house_treasury.sql` exactly. Every table,
column and index this work touches agrees between the two. No divergence found.

The migration was replayed instead: the full chain from
`00000000000000_baseline_schema.sql` forward was applied to a throwaway
Postgres 16 cluster and the three functions were exercised against it, which is
how the behaviour claimed above was checked rather than assumed. Four of the
older migrations fail on that replay because the baseline already creates the
policies they create, which is pre-existing and unrelated.

Migration `20260813113137_appointments_and_seasons.sql`, applied.

## 47. Provably fair, as a feature

Shipped. Mission 6, and the gap it closes is not a missing property but a
missing surface. The chest has been provably fair since section 42: the server
seed is committed before the member can act, revealed when the chest opens, and
the roll is a pure function of three inputs with nine tests on it. What did not
exist was anywhere a person could actually check a draw. A property nobody can
exercise is a claim, and the realm was making it in prose.

### 47.1 The verification runs in the browser, and that was the decision

The obvious build is a route: post the three inputs, the server imports
`rollChest`, reruns, compares, answers. Simpler, honest, and worthless against
the only adversary a fairness feature has. A verifier hosted by the house is the
house grading its own examination paper: the same server that faked a draw
returns "verified" for the faked draw, and nothing a member can observe
separates that from the truthful case. Nearly every provably fair scheme on the
internet fails at exactly this point, by shipping a verify button that asks the
house whether the house was honest.

So the rerun happens on the member's machine, from source they can read. The
server's role is reduced to handing over the record it already published, and it
is never asked whether the numbers agree.

**What that cost, and how the cost was contained.** The roll lived behind
`server-only` and `node:crypto`, and neither can reach a browser.
`crypto.subtle` can, but every digest it offers is a promise, and `rollChest` is
synchronous and called from the opening route; making it async to suit the
browser would have rippled through the settle path for a requirement none of it
has.

The dangerous fix would have been a second implementation for the client. Two
implementations of one algorithm is the trap: the day they disagree, the
verifier calls an honest opening a forgery, and nothing distinguishes that from
the opposite error. So there is exactly one. `lib/collectibles/sha256.ts` is a
hand written SHA-256 and HMAC-SHA256 in plain TypeScript, synchronous,
isomorphic, no dependency. `lib/collectibles/roll.ts` holds the algorithm and
uses it. `lib/collectibles/pulls.ts` is now a `server-only` re-export, so every
existing server import is unchanged and the browser runs the same bytes the
realm runs.

A hand written hash is exactly the code that is right for the inputs its author
tried, so `sha256.test.ts` pins it against `node:crypto` over the empty string,
the NIST vectors, every length from 0 to 130 bytes across the padding seam,
UTF-8 beyond ascii, keys either side of the 64 byte HMAC block boundary (which
is the length the realm's seeds actually are), and 320 random cases. The nine
existing roll tests pass unchanged, which is the proof that the swap did not
move a single card.

**The residual trust is stated on the page, not hidden.** The realm could still
lie about the record. The hash is what closes that, and it is why it is
published before the member acts: a member who kept the hash they were shown and
pastes it in is trusting nothing at all, because a swapped seed fails the first
check in their own browser.

### 47.2 What is public

A settled opening's proof is not a secret. Once a chest is opened its seed has
been revealed, its commitment is retired and can never draw again, and the cards
are in a ledger. Two public endpoints, neither requiring an account:

- `GET /api/chests/openings/[id]` returns one settled opening: the chest, the
  time, the revealed seed, the hash that preceded it, the client seed, the
  nonce, and the cards recorded.
- `GET /api/chests/openings` returns recent settled openings as reference, chest
  and time only.

The list is the half that makes this about the house rather than about one
member. If the only findable reference were your own, the only draws ever
audited would be the ones the house had no reason to fear, and a house cheating
one opening in a thousand would never be caught, because the member who was
cheated is precisely the one who cannot tell.

**What is deliberately absent, and each omission is load bearing.** No
`profile_id` and no join to `profiles`, on either endpoint: the draw is public,
the drawer is not. No filter by member, so the audit log cannot be turned into a
surveillance feed. No unrevealed seed, ever: both queries require `server_seed`
to be present and neither reads `chest_seeds` at all. No holdings, no
entitlements, no other openings. Both projections are explicit column lists
rather than `select *`, because the service role client is what reads them and a
`select *` would ship `profile_id` the first time somebody widened the table.

The entitlement id is published, as the nonce, because the draw cannot be rerun
without it. It confers nothing: `chest_entitlements` is RLS denied, the opening
route selects an entitlement by profile as well as by id, and the row is
permanently spent by the time it appears.

The honest residual: on a small realm an opening's timestamp could in principle
be correlated with a member's public activity. That is a real cost and a smaller
one than an unauditable house.

### 47.3 Real data only, and this is where it bit

Nobody has ever opened a chest. `chests_live` is off, nothing grants an
entitlement, and `chest_openings` is empty in production. So the verifier has
nothing to verify, and the whole temptation of this mission was to demonstrate
it with a plausible looking sample opening. A fabricated proof is
indistinguishable from a real one, which makes it the single worst thing this
page could contain.

There is no worked example anywhere in it. The list of openings renders "No
chest has been opened in the realm yet", the lookup answers 404 for every
reference because there are none, and the form works the moment a real opening
exists.

What the page can honestly show today is the manual mode: the member supplies
all three inputs themselves and the draw reruns in front of them. That proves
the function is deterministic and proves nothing about any chest anybody pulled,
so it returns the verdict `recomputed` and says so in those words. There are
four verdicts rather than two for exactly this reason. `unusable` is the input
being incomplete, never an accusation against the house; `recomputed` is a draw
with nothing behind it; `match` and `mismatch` are the only two that speak to a
record.

### 47.4 The comparison is the part worth testing

Rerunning is the easy half and was already covered. What decides whether the
feature is honest is whether it can say NO, so `verify.test.ts` feeds
`verifyDraw` deliberately corrupted triples: a changed server seed, a changed
nonce, a changed client seed, a changed committed hash, one recorded card
altered by a single number, a short record, and the same cards in another order.
Every one must come back a mismatch.

The instructive case is the changed nonce: the commitment check still PASSES,
because the seed genuinely is the one the realm promised, and the card check
fails, because this is a different opening. A verifier that only checked the
hash would have called that a pass. That is why there are two checks and why
they are reported separately rather than collapsed into one verdict.

One bug was caught by writing those tests rather than by review. The roll omits
`guaranteed` on an ordinary card, and a JSON round trip through Postgres can
return it as an explicit `false`. A literal comparison would have reported every
honest opening as forged, and it would have been invisible until the first real
chest was opened, because there is no data to see it with today. The comparison
normalises the flag and a test pins it.

### 47.5 Where it is linked from

The promise is made in two places and is now keepable in both: the
`FairnessPanel` on `/warchests`, at step three, and the opening Ceremony itself,
where the proof block carries the opening's reference into `/proof?draw=`. A
proof that requires copying a uuid out of a dialog by hand is a proof nobody
runs.

The page sits at `/proof`, outside the shell on purpose. Everything under
`app/(shell)` is behind `ShellGate`, and a verifier only members can reach
quietly undoes the feature: the argument for provable fairness is that a
stranger with no account and every reason to disbelieve can pick a draw and
check it. It is a Console, not a Ceremony. The opening keeps its gold; an audit
that glows is an audit congratulating itself.

### 47.6 Repository versus database

Checked before anything was written, as the handoff requires. `chest_openings`,
`chest_seeds` and `chest_entitlements` in the live project match this directory
column for column, and `public.chest_open` carries the ten argument signature
from `20260813094251_two_step_commit_reveal.sql`. `chest_openings`,
`chest_entitlements` and `chest_seeds` are all empty, and `chests_live` is
false. No divergence found.

**No migration.** This work adds no table, no column, no constraint and no
function. Both new endpoints read existing columns through the service role.
## 48. The compliance guardrails, and the size of what they are not

Mission 12, and the last piece of code standing between the realm and
`COMMERCE_PRICES_CONFIRMED`. What remains after this is a real payment account,
which is not code.

Nobody who built this is a lawyer and none of it claims compliance with any
law. Every guardrail below carries an explicit "what this does not cover"
paragraph, in `lib/commerce/compliance.ts`, written so a real adviser can read
it and say what is missing. That list is the important half of the work.

### 47.1 Where the decisions live, and why not in the route

Section 34 named four answers to the gambling optics of a mystery box. Two were
already built and enforced at module load: exact printed odds validated to sum
to 100, and a guaranteed floor validated against the worst a chest can actually
deal. The other two, no cash-out promises and no invented scarcity, were prose.
This wave is the rest of the posture.

Every decision is made inside Postgres, in the same transaction that creates
the order, under the same lock. That is not a preference. A spend cap read in
one round trip and enforced in the next is not a cap: ten concurrent presses
each read a spend of zero and all ten pass. `public.commerce_checkout_guard`
judges and inserts together or does neither, and the checkout route has no code
path left that writes an order, so a future edit cannot forget the guard.

Every threshold, though, lives in `lib/commerce/compliance.ts` and is passed in
as a REQUIRED parameter with no SQL default. A default in the function body
would be a second copy of a number that also lives in TypeScript, and two
copies of a threshold drift the first time somebody tunes one of them, quietly,
in the direction of taking more money. A required parameter cannot drift
because it cannot exist twice. A test reads the migration file and asserts the
declared parameters are exactly the ones the TypeScript bundle supplies, and
that none of them carries a default, because that joint is invisible to
typecheck.

### 47.2 The Alms, the free method of entry

The one that mattered most. A paid random-reward mechanic commonly needs a
genuinely free path to the same reward, of equal dignity, and the realm's is
called the Alms: a real Squire's Chest, given.

Not a token, not a coupon, not a quieter chest wearing the same name. It is a
row in `chest_entitlements` differing from a purchased one only in
`source_kind`, and it opens through the same route, against the same committed
seed, on the same printed odds, with the same guaranteed floor and the same
provable reveal. No code path anywhere reads `source_kind` and rolls
differently, and a test asserts the opening route does not mention it at all.

The property that decides whether this is an entry or a consolation prize is
that the free chest can win the rarest thing the realm mints. The Squire's
Chest deals three cards at 0.6% mythic each, so it can. That is asserted at
module load rather than argued, because an odds retune that zeroed mythic on
the entry tier for perfectly good economic reasons would destroy it silently
and nothing else in the codebase would notice.

**Abuse, which is the whole difficulty.** A free entry one person can take a
thousand times is not compliance, it is a faucet, and a faucet pointed at a
capped-supply collectible is worse than no free path at all. Four defences,
none individually sufficient: one per member per 30 days; an account at least
seven days old, onboarded, carrying a handle; the same age gate as the paid
path; and a realm-wide ceiling of twenty five a day under a transaction-scoped
advisory lock, because a ceiling two requests can race past is not a ceiling.

The account age floor is the cheap one: registration is free and instant, so
seven days converts "make a thousand accounts now" into "make a thousand
accounts a week ago and keep them", and costs an honest member nothing they
notice. The realm-wide ceiling is the one that actually contains an attacker,
because it bounds the damage however many accounts they hold.

**It does not stop sybil.** One person with fifty aged accounts gets fifty
entries. Only identity verification changes that and identity verification is a
paid service. The ceiling is containment, not prevention, and the distinction
is worth saying out loud rather than leaving for somebody to discover.

**The ceiling cuts both ways.** A ceiling reached every day has stopped being a
free method of entry and become a lottery for one. The exhaustion is written to
the refusal ledger and the remaining count is on the panel, precisely so this
is visible, and if it is regularly hit the founder must raise it. That is an
operating commitment; no code can enforce it.

Also not covered: merch and the physical King's Reliquary, which has real
per-unit printing and shipping cost, have no free path. Whether the free entry
must reach the top tier rather than the entry tier is exactly the question that
needs an adviser and not a developer.

The Alms are gated on `chests_live` and deliberately NOT on
`COMMERCE_PRICES_CONFIRMED`, so the free path can never be narrower than the
paid one. A test reads the route and asserts it.

### 47.3 The age gate

One question, "are you at least eighteen", answered once. What is stored is
that it was answered, when, and against which minimum. **There is no date of
birth column and there must never be one:** a birth date is identifying data
the realm would then owe a duty of care over, and it answers a question nobody
asked. The minimum in force is stored beside the answer so raising it later
re-asks everybody rather than grandfathering them silently.

It lives in its own table rather than on `profiles`, and the reason is not
tidiness. `public.profiles` carries column-level grants to `anon` on a dozen
columns because a profile is a public object. Putting a compliance fact on that
table would leave it one accidental grant from a public read.

It is a SELF DECLARATION and nothing in the product describes it as more. A
member who types the wrong answer passes. Real verification needs a document or
credit check provider, which is a paid service; the seam is `age_verified_at`
and `age_verification_method`, which nothing writes.

It gates the paid paths and the Alms, and nothing else. The realm does not ask
a member's age to read the Ravenry.

### 47.4 Spend caps

250 in 24 hours, 1,000 in 30 days, computed at checkout from real order
history. The dearest thing in the realm is the King's Reliquary at 54.86, so
250 a day is four of them plus merch: past any honest collecting session, short
of the kind of day somebody regrets. 1,000 a month is roughly eighteen top
chests. Both are deliberately low for a launch, because the directions are not
symmetrical: raising a cap later is a decision made calmly, and lowering one
after members have been allowed to spend past it is a decision made inside a
complaint.

Paid and fulfilled orders count, dated by `paid_at` so a slow webhook does not
date a charge to the wrong window. Refunded and cancelled never count. Pending
orders count for sixty minutes, because a live checkout session is money the
member can still spend and a cap ignoring them could be walked through by
opening twenty sessions before paying any; after an hour an abandoned cart
stops holding a member's ceiling hostage.

A module load assertion refuses a day cap below the dearest single item,
because that is not a cap, it is a closure that quietly makes one product
unbuyable.

They are per member, keyed on the profile: one person with three accounts has
three ceilings. And they see only what the realm charged. They cannot see the
Bazaar, where payment goes wallet to wallet and the platform is not a party to
it, which the panel says on its own face.

### 47.5 Cooling off, and the one asymmetry that matters

Three mechanisms, none of which can be clicked past, which is the only test of
whether an interruption is real.

**The velocity brake.** Four paid orders inside sixty minutes and checkout
stops until the oldest falls out of the window. Three is reachable by an
ordinary member buying a chest, liking what came out, and buying two more; four
inside an hour is a pattern rather than a purchase. It is a pause, it clears
itself, and the answer says exactly when.

**The informed consent interruption.** Once real 30 day spend would pass 150,
checkout refuses and hands back the member's actual total; continuing needs an
explicit acknowledgement that expires after 24 hours. 150 is set against the
DAY cap rather than the month cap, and that is the correction worth recording:
at 250 it would have equalled the 24 hour ceiling, so a member spending fast
inside one day would have been stopped dead without ever having been shown
their own running total, and the consent step would only ever have fired across
days. The relationship is now asserted at module load.

The number recorded is the one the SERVER computed. The route has no way to
pass a total and must never be given one, so the row is evidence of what the
member was actually shown rather than of what a client claimed to have shown
them.

**The member set cap**, and the asymmetry is the entire point: lowering it
applies immediately, raising it waits 24 hours, and the pending value is
visible so nobody is surprised by their own decision. A limit a member can
raise in the moment they want to raise it is not a limit, it is a speed bump
they installed and then removed. The delay is in
`public.commerce_set_self_cap`, not in a route, because a delay a route
computes is a delay a route can be edited to skip.

What none of it does: it cannot tell distress from enthusiasm, it sees a rate
and not a person, there is no self-exclusion register and no way to lock
oneself out for a term, and nobody is paged, because there is no human on a
rota to page.

### 47.6 Geo, and the honest answer

**Reliable geolocation needs a paid service and the realm does not have one.**
Everything else here is a qualification of that sentence.

What is free and real: Vercel injects `x-vercel-ip-country` and Cloudflare
`cf-ipcountry`, both part of hosting rather than a new paid service. Why it is
still only a hint: a VPN defeats it in ten seconds, mobile carrier routing puts
honest members in neighbouring countries, and corporate egress is attributed
badly. And the header is read ONLY when we know we are behind that edge, because
off it the value is a string the caller typed, and a caller who can type their
own country has defeated the gate by typing. Same reasoning as `clientIp`.

Three modes. `advisory` is the default and enforces nothing until the founder
names a country in `COMMERCE_BLOCKED_COUNTRIES`, which is the honest starting
state rather than an oversight. `strict` additionally refuses an unknown
origin, which is the only setting a plain VPN does not simply walk through, and
also the setting that refuses every honest member when the deployment is not
behind a trusted edge. `off` is a single switch rather than an emptied list.
There is no hardcoded country list anywhere: a list of countries in a source
file is a legal position taken by a developer.

**What would actually be needed, so it can be costed.** An IP intelligence
provider (MaxMind GeoIP2, IPinfo, IP2Location) returning a country AND a VPN,
proxy and hosting-provider flag. The flag is the part that matters and the part
no free source gives. `resolveCountry` is the single function it plugs into.
And separately, the payment provider's own card-issuing country and billing
address, which cost nothing extra because they arrive with the payment and are
a materially stronger signal than an IP, but arrive AFTER the charge, so they
inform refunds and reporting rather than the decision to sell. `orders` carries
`geo_country` and `geo_source` so the two can never be flattened into one
confidence.

### 47.7 The refusal ledger

Every guardrail that turns a member away writes `commerce_guard_events`. This
is the half of a compliance posture that is easy to omit and impossible to
reconstruct later: a guardrail that refuses and keeps no record cannot answer
the only question anybody will ever ask it, which is "show me that it fires".
It records the decision and the numbers it turned on, never a cart, a card or
an address.

### 47.8 The surfaces

The Alms sit on `/warchests`, full width, directly under the three chests,
because a free path harder to find than the purchase it stands beside is one in
name. The interruption is a Base UI `Dialog` rather than a line of text,
because an interruption that can be scrolled past is not one, and it always
carries the member's real figures: "you cannot do that right now" is the shape
of a dark pattern and "you have spent 140 in the last 30 days" is not. Spending
and the self-limit control are in the Vault, absent entirely for a member who
has never spent and set no limit, because telling somebody who has bought
nothing how much headroom they have is an invitation dressed as information.

All of it is the Ledger register. No gold gradient, no 3D icon, no glow. The
Forge on a spending limit would be the product celebrating the fact that
somebody is about to spend more, which is the thing these exist to interrupt.

Two refusals carry an action and three do not, and the asymmetry is honest: the
age gate and the acknowledgement are answered by the member, a spending cap and
the velocity brake are answered by time. There is no override and no route that
would accept one.

### 47.9 Repository versus database, and how this was checked

Read before anything was written, per `supabase/migrations/README.md`. One
existing object is altered: `chest_entitlements_source_kind_check`, whose live
definition was read out of the project as `('order', 'redemption')` and matches
`20260812224950_commerce_engine.sql` exactly. The change adds `'amoe'` and
removes nothing. Repository and database agree on every other object touched.

The migration was NOT applied. It was replayed instead against a throwaway
Postgres 16 cluster carrying stand-ins for the five tables it depends on,
applied twice to prove it is idempotent, and then exercised: 39 behavioural
assertions covering the age gate, idempotency that is never re-judged, the
pending-order grace, the acknowledgement and its expiry, both spend windows,
refunds counting for nothing, the self cap in both directions and its delay,
the velocity brake and its self-clearing, and the Alms through every refusal
they can give. A two-session test confirmed a concurrent checkout blocks on the
limits row lock rather than racing past it.

Applied in four parts, `20260813164228` through `20260813164429`, and the
four files carry the names and versions production recorded. The security
advisor was run afterwards and returns only the expected INFO
`rls_enabled_no_policy` lints.

## 49. The Herald as the realm's retention brain

The Herald answered when it was spoken to. The Chronicle was the first half of
fixing that: once a day the realm reads its own event spine and says what
happened, and nobody has to summon it. This is the second half and the harder
one, because it is addressed to one member rather than to everyone: **what
happened to you since the last time the Herald spoke to you, in one paragraph,
at the top of the Ravenry.**

Sealed behind `herald_digest_live` until it is real.

### 41.1 What it is

A member opens the Ravenry. The server reads what the realm recorded since that
member's last digest, in that member's own audience, reduces it to a short fact
sheet, and hands the sheet to a model with one instruction: say the single most
important thing and stop. The paragraph is stored, so refreshing the feed is
free, and it renders as a system card in the Ledger register, structurally
quieter than a member's raven, with a dismiss.

The card is pinned above the feed rather than dropped into it. Every other realm
event is a card in the timeline because every other realm event happened at an
instant. A digest is about a period, so it has no honest position in a stream
ordered by time, and inserting it at "now" would put a summary of the last six
hours above the very ravens it summarises.

### 41.2 The discipline, which is the whole feature

**Every figure is the server's.** `lib/raven/digest.ts` turns real rows into
lines: Calls of theirs that settled and what they scored, Calls still open and
which settle within a day, Points and Glory that settled in their Ledger, where
their House stands and who is nearest, what the members they follow did, what
the rest of the realm did, when the season ends. The model states none of them.
It is never asked for a number, and nothing it writes is read back into a table,
so no Point, Glory, rank or price can depend on it. The exact lines it was given
are stored beside the paragraph, so any sentence a member disputes can be
checked against what the realm actually counted.

**An empty realm produces an empty digest.** Not a paragraph observing that it
was quiet, not a greeting: nothing at all, and no model call. `worthTelling` is
the floor and it is deliberately strict about the difference between a fact that
is always true and something that happened. A House rank and a season countdown
are context for a sentence; they are never a reason to write one. One thing that
happened to this member is enough; absent that, the realm has to have been
genuinely busy before a member with no stake in it is told about it.

**A quiet window is carried forward, not consumed.** The empty answer is stored
with the window it failed to fill, so a realm producing one act a day
accumulates into something worth saying rather than discarding each quiet window
one at a time.

### 41.3 What it costs, which is almost nothing

Four things, in the order they bite:

1. **The stored digest.** Inside a six hour TTL the route returns the stored
   paragraph and spends nothing. Twenty refreshes cost one call.
2. **The floor.** A window with nothing in it never reaches the model, and the
   empty result is stored so the next refresh is free too.
3. **The smaller model.** The reasoning was already done in SQL. What is left is
   writing two sentences over a fact sheet of about twenty lines, which is the
   cheapest thing a model does. The realm now names its two model choices by
   the job rather than by the model, in `lib/ai/herald.ts`, so this is one line
   to change.
4. **Two caps**, per member and per realm, through the shared Supabase limiter,
   checked in the last moment before the call so a cache hit never consumes an
   allowance it did not spend. The per member cap sits above what an honest
   reader can reach at the TTL, which is asserted in the tests: it is a backstop
   against a loop, not a pacer for a member.

### 41.4 Degradation, honestly

No key, no flag, no database, a refusal, a timeout, a rate limit: every one of
them renders as the Herald having had nothing to say. There is no error state on
this surface and no fallback sentence, because a sentence the Herald did not
write, presented as the Herald, is a rule 5 violation whatever it says. A
failure writes no row, so the next request tries again.

### 41.5 The channels that were rejected

- **A notification.** The realm already has one, and the digest is not an event:
  every notification kind is caused by a member acting on another member, with a
  subject to open. A digest has no subject and no actor, so it would file a
  raven that points nowhere. Worse, it fires on the realm's schedule rather than
  on the member's, which is the definition of a nag, and the per type toggles in
  `lib/notification-prefs.ts` would have needed a twelfth entry whose honest
  label is "let the Herald interrupt you".
- **A Whisper.** Whispers are between members. Putting the realm's own voice in
  a member's private conversation list makes the one place in the product that
  is genuinely person to person start carrying announcements, which is the exact
  shape of every messaging product people have learned to distrust.
- **A card in the stream.** Rejected for the timeline reason in 41.1, and
  because the density cap already governs the stream: a digest competing with
  Chronicle entries for the one system card per five ravens would either
  displace them or be displaced by them, and neither is a decision worth
  encoding.

The card is where it is because the Ravenry is the only surface a returning
member is guaranteed to open, and because a card there can be ignored in one
glance and dismissed in one tap. A channel that has nowhere honest to fire
should not be built.

### 41.6 What was consolidated on the way

The mission was mostly not addition:

- **Seven Anthropic clients became one.** Every AI route built its own from the
  same environment variable, and three of them said in a comment that they were
  copies of `lib/ai/raven.ts`. `lib/ai/herald.ts` now holds the client, the two
  model choices and prose extraction.
- **Five private copies of the em dash filter became one.** House rule 1 was
  enforced by whichever route remembered to enforce it. It is now inherited by
  every surface that asks the Herald for prose.
- **Two copies of the House ranking became one.** The realm strip and the digest
  both name a member's nearest rival; `gloryStanding` in `lib/houses/view.ts` is
  now the only place that decides which House that is.
- **The card shell stopped requiring a spine row.** `SystemCard` and `ForgeCard`
  took a whole `FeedEvent` to read one timestamp off it. They take the timestamp,
  which is what let the digest use the same chassis as every other system card
  rather than growing a second one.

## 50. The Coffers, and a House a member can be inside

Shipped, sealed. Mission 9, the creator and House economies, and it is the first
piece of work in this document whose main output is a refusal.

Two economies half existed. A member who brought people in, called a coin that
resolved well, or sold a card, earned, and every one of those settled its own
way and added up nowhere a member could read. A House had a treasury, a
catalogue and two spenders, and a member could take part in none of it.

### 50.1 An earned balance cannot exist, and that is the answer

"Payouts are non-custodial" reads like a constraint on how money leaves. It is
not. It is a constraint on whether an earned balance may exist at all, and
working that through decided the whole mission.

An earned balance denominated in money is a debt: the platform saying "we owe
you fourteen dollars". For the platform to pay it later, the platform has to be
holding it now. **Holding money that is owed to a member is custody**, whether
it is called a balance, a float, an accrual or a pending payout, and whether it
is held for a month or for an hour. Rule 6 has no exception for short holds and
neither does anybody who regulates this.

There are exactly three ways to pay a member a share of revenue.

| | Verdict |
| --- | --- |
| The platform receives the gross and forwards the member's share later | Custody. What every creator platform ships. Refused |
| The platform receives the gross and pays the member from its own funds on a schedule | The money is the platform's own, and between the sale and the payment the member is owed money the platform is holding. The accrual IS the custody. Refused |
| The payer pays the member directly, at the moment of the event, in the payer's own signed transaction | Chosen |

**Split at source, never accrue.** Nothing accrues because nothing is owed: the
value went from the payer's wallet to the member's wallet and was never anywhere
else. It is what the Bazaar already does with the seller's ninety five percent
and what a tribute already does with the whole amount, and this section is the
recognition that those two were never conveniences. They were the only shape
allowed.

The rule is enforced mechanically rather than remembered. `lib/economy/revenue.ts`
refuses to load if any stream declares a member share that is not settled at
source, the same posture `lib/commerce/market.ts` takes with a fee split that
does not add up, and for the same reason: by the time anybody notices in
production, the platform is holding money it told a member it owed them, and
there is no clean way back from that.

**What it costs, written down because it is not free.**

- **A signature per payee.** Two payees means the buyer signs twice, which is
  the price section 45.3 already paid. A third payee is a third prompt at the
  exact moment somebody is committing money, and every prompt is real drop off.
- **No accrual means no aggregation.** A share worth a fraction of a cent can
  never be paid, because there is no balance for it to accumulate in. Any share
  small enough to round to nothing at a single sale is a share that does not
  exist, and the register may not declare one.
- **It cannot cross rails.** A payment arriving on a card cannot pay a member on
  chain in the same act, so a card paid surface shares nothing at all until its
  processor can itself split the payment. That is a paid integration and a
  regulatory posture, not a feature.
- **The compensation is large.** There is no minimum payout threshold, no payout
  schedule, no pending column, no reconciliation between what was promised and
  what was sent, and no support queue for a payout that did not arrive. None of
  those can exist, because the thing they all manage does not.

### 50.2 Which streams are real, and the one that is real and still pays nothing

`lib/economy/revenue.ts` is the register, and The Coffers renders it verbatim,
including the streams that pay nothing and the sentence saying why.

**Tributes. Real, open today, ten thousand basis points to the member.** One
member paying another, wallet to wallet, with the realm reading the receipt off
the chain afterwards. The platform takes nothing, so there is nothing to share
and nothing to withhold, and there has never been a balance anywhere in it. This
is the only stream paying a member real value right now with no flag on it.

**A Bazaar sale. Real, sealed, nine thousand five hundred basis points to the
member.** Ninety five percent of a sale, paid by the buyer's wallet to the
seller's wallet, in the buyer's own signed transaction. That is a creator
revenue share settled at source and it has been built since section 45. Naming
it as one is most of the work: the product had a genuine ninety five percent
revenue share and no surface that said so.

**Nothing is shared out of the five percent, and this is the decision a reviewer
should push on.** The obvious extension is a slice of the venue fee for the
buyer's referrer, the seller's referrer, or a curator. Every version costs the
buyer a third wallet prompt while they are handing over money, and section 45.3
spent its argument establishing that two signatures is the price of never
touching a seller's funds. A third has no comparable justification: nobody in
that list created the card, the listing or the sale. And re-cutting the venue
fee is a decision about the business, not about the code.

**Chests and the Mercer. Real revenue, and they share nothing.** This is the
stream that proves the rule is doing work rather than describing what already
happened. A share for the member whose banner brought that customer is the most
obviously fair creator payment in the product, and this design cannot make it.
The payment arrives on a card, through a processor, into the platform's own
account. Splitting it at source needs the processor's connected accounts
product, which is a paid integration (rule 19), makes the platform a payment
facilitator, and carries a compliance posture nobody here has. Every other way
of paying it is an accrual, and an accrual is custody. So it pays zero, and the
surface says zero and says why, in terms of custody rather than of effort.

**A Call that lands. Not revenue at all**, and listed anyway so nobody has to
guess. The single most valuable thing a member can do in this product pays no
money, because the realm sells nothing when a Call resolves and so has nothing
to share. Writing that down is the point: the pressure to invent a revenue
stream lands hardest on the surface that most deserves one.

**No creator revenue share was invented.** There is no third party creator whose
work this platform monetises. The seller in the Bazaar is the closest thing to
one and already receives ninety five percent at source. Anything else would have
been a stream conjured to have something to share, which is the rule 4 line.

### 50.3 The statement, and the four ways the old one was wrong

`/api/profile/earnings` was the closest thing to an earnings record and it was
quietly wrong in four places at once. None of them were careless. They are what
a derived total does when nothing ever checks it against the balance it claims
to explain.

1. **Tips were structurally zero.** It summed `tips.points`, a column that has
   been null on every row since tributes became on chain transfers, and added
   the result into a headline figure. Every profile in the realm reported zero
   tips, for a payment that is not denominated in POINTS in the first place.
2. **Referrals were structurally zero.** It looked for a reason beginning
   `referral`. Nothing has ever written one: a referral pays through
   `banner_raised`. Every referral reward in the realm reported as zero and fell
   into Other.
3. **Staking made earnings fall.** It added the negative row a staked Call
   writes at escrow into a figure labelled "points earned", and the positive row
   a won stake writes. So sealing a staked Call reduced a member's lifetime
   earnings, and getting your own points back read as earning them.
4. **The breakdown could not add up to its own total.** Slices were filtered to
   positives and the total was not, so the percentages beside them could not
   reach a hundred and nothing said why.

And under the panel, in the product's own copy: **"Points convert to $RSP at
TGE".** A conversion this product has never committed to, on an earnings
surface, under a number. Rule 7 says show POINTS for an earned balance and never
an amount of $RSP; a promised rate is the same claim with the arithmetic left
out. Gone.

`lib/economy/earnings.ts` is now the single fold and both surfaces call it, so
there cannot be two answers to "what has this member earned".

**Two ledgers, in two units, never added together.**

POINTS are a realm score. Not money, not $RSP, not redeemable, and there is no
rate at which they become anything. VALUE is money that has already moved, on a
public chain, into the member's own wallet: a tribute counts only once
`verifyTribute` has read it off the chain, a Bazaar sale only once the buyer's
leg is proven from the pay token's own logs by `verifyMarketLeg`. Summing the
two would produce one number meaning nothing, which is the failure this module
exists to close.

**No USD figure is put on a token.** A tribute of 0.01 of a chain's native coin
is reported as 0.01 of that coin. The realm did not record a price at the moment
of the tribute and cannot recover one, and a rate read today applied to a
payment made in March is an invented number with a currency symbol on it. Bazaar
proceeds are in dollars, because the market quotes and settles in dollars.

The amounts are summed with `sumDecimal` in `lib/commerce/money.ts`, on the
decimal strings themselves, aligned and added as BigInt. `Number("0.1") +
Number("0.2")` is exactly the mistake that module's header exists to prevent,
and it would have been made on a figure a member reads as what they were paid.
Grouped by chain and token before anything is added, because summing two
different assets produces a number with no unit.

**There is no claim button anywhere on the surface, and its absence is the
feature.** A claim button implies a balance the realm is sitting on. It is
sitting on nothing. That is said in words on the surface rather than left to be
noticed, because a member who has used any other creator platform will look for
it.

### 50.4 Reconciliation, said out loud

`points_ledger` is the source of truth and `profiles.points` is a cached total.
`house_treasury_ledger` is the source of truth and `houses.treasury` is a cached
total. That is the right shape twice, and it is also the shape that drifts in
silence, because nothing in this product has ever compared the two.

Now both do, and both tell the member. `public.reconcile_member_points` and
`public.reconcile_house_treasury` sum in the database and return the cached
figure beside the ledger figure.

**The sum is in the database and not in the route, and that is the load bearing
part.** The surface being replaced read two thousand ledger rows into Node and
added them up, which is wrong twice over: a full page of somebody's financial
history over the wire to produce one integer, and it silently stops being the
whole sum at row two thousand and one. A statement folded from the first page of
a long ledger will always disagree with the balance, so a drift computed that
way is mostly its own truncation. **A truncated read is never reported as
reconciled**, even when the numbers happen to agree, because a tick nobody
checked is worse than no tick. "The realm has lost some of your POINTS" is far
too serious a sentence to produce from an incomplete count.

A House's drift is shown only when there is one. A green tick on every healthy
treasury teaches everybody to stop reading the line.

### 50.5 The endowment, and what a treasury may do

A House already received (half of every burned Call stake), spent (a fixed
catalogue, priced per sworn member) and decided (the Lord and the Hand, who are
the top two contributors and rotate with the season). What a member could not do
was take part. A treasury filled only by other people's losses and spent only by
the two members at the top of a board is a thing that happens near a member
rather than a thing they are in.

**The endowment is the missing verb.** A sworn member may commit POINTS from
their own balance to their House. Half reaches the banner and half is destroyed.

**Why half is burned, which is the only real design choice here.** The obvious
version is a straight transfer, and it is wrong for two reasons, only one of
them obvious. The obvious one is supply: the Warden's Pardon pays POINTS back
OUT of a treasury, so at a hundred percent in and fifty percent out a House
becomes a laundry and the realm's supply never contracts. The stake tithe
already answers exactly this question at exactly this ratio, and answering it
differently at a second door would only tell everybody which door to use. The
less obvious one is that a cheap endowment is a purchase: the Long Watch is the
one perk that can move a House's standing, and a member with a deep balance
could simply buy their House a competitive advantage. At half, an endowment is
strictly worse than staking the same POINTS, because a stake can also come back
and win. Endowing has to be a gift rather than an optimisation, or it stops
being one.

The remainder on an odd amount goes to the burn, never to the treasury, so a gift
always errs toward destroying one more POINT than it pools: the direction that
cannot inflate anything. Asserted exhaustively at module load across every legal
amount, and again by a database check constraint, because a split that quietly
loses a POINT shorts somebody on every gift forever and nothing ever fails.

**A member gives at most a thousand POINTS a day**, deliberately identical to
`MAX_STAKE`. The realm already has an opinion about how much of a balance may
move in one act, arrived at against the two daily allowances, and an endowment
moves a balance in exactly the same way. Per day rather than per act, so the
ceiling cannot be walked around by sending it in ten pieces, and counted across
every House, so a member cannot multiply it by the number of banners they have
sworn to.

**What a member gets for it, and what they deliberately do not.** They get the
permanent public record: every treasury inflow from a burned stake carries a
null actor because nobody decided it, and an endowment carries the giver's id,
so the House's audit trail names its benefactors and keeps naming them. They get
the perks their House can then afford.

They do not get Renown, which never falls and would therefore be permanent
standing bought with a balance. They do not get Glory. And this is the one that
matters most:

**AN ENDOWMENT MUST NEVER MOVE A MEMBER TOWARD LORD OR HAND.** Those two titles
are the only thing in the realm that can spend a treasury, and `deriveLeadership`
ranks them on Glory. A member who could buy their way up that ranking could buy
the right to spend the treasury they had just filled, which is "no House mints
value out of nothing" applied to power rather than to points, and it is the
failure that would end the whole design. The mechanism is that an endowment
writes a `glory_delta` of exactly zero, so there is no path from giving to
ranking at all. It is a property nobody can see by reading the SQL, so it is
asserted in `lib/houses/endowment.ts` and exercised against a real cluster.

**What a treasury can and cannot do**, printed on the hall rather than left in a
document nobody opens, from the same list the tests assert:

- It can receive half of a burned stake, receive half of a gift, buy a perk from
  a fixed catalogue, and pay a member back part of a burned stake out of a
  Warden's Pardon that was bought and ring-fenced in advance.
- It cannot be created, seeded, topped up or estimated. It cannot pay POINTS to
  any member outside a ring-fenced pardon, so it cannot be shared out. It cannot
  move to another House or leave with a member who leaves. It cannot be
  withdrawn to a wallet, converted, or quoted in any currency, because it is not
  money and never was. It cannot buy Renown or Glory, so no House can spend its
  way up the standings. And it cannot go below zero, enforced by
  `houses_treasury_check` rather than by the code that spends it.

### 50.6 The transaction, and the request id

`public.endow_house_treasury`, `security definer`, `service_role` only, one
transaction, two locks, **taken in the same order `settle_call_stake` takes
them**: the profile first, then the House. Deadlock is not hypothetical here. A
member's stake settling and the same member endowing touch exactly the same two
rows, and two functions that disagreed about the order would eventually meet in
the middle and one of them would be killed.

The balance, the day's running total and the oath are all read under the profile
row lock and none of them is trusted from the route. A balance read in one round
trip and spent in the next is not a balance, and a daily cap checked in
TypeScript is a cap two concurrent requests both pass. The day is the DATABASE's
day, never one passed in, because the cap is the only thing bounding how fast a
balance becomes a House's capability and a host with a fast clock would get a
second day's allowance free.

**The request id is the member's protection, not the realm's.** Unlike an
escrow, which is keyed on the post being staked, an endowment has no natural
idempotency key: the same member may give the same House the same amount twice
in a minute and both are real gifts. So the client mints one uuid per gift and
carries it through every retry, and the function claims it under a unique index
before anything moves. Without it, a client retrying a timed out request debits
a member twice for one gift, and nothing anywhere can tell that apart from a
member who meant to give twice.

### 50.7 The surfaces

**`/coffers` is a Console**, and every Console rule applies without exception:
compact above `md`, right aligned tabular figures, hairline dividers, ornament
budget zero. Nothing on it glows. A member reading what they have earned is
operating an instrument, not being congratulated, and a surface that celebrated
a balance would be selling it to them.

Three views, because there are three questions and they have different answers:
what the realm owes you in standing, what has actually reached your wallet, and
what each surface pays. The register is the third one, printed in full, with the
sealed streams carrying their padlock and the stream that pays nothing carrying
its reason.

The panel on the Keep stays where it is. It answers "how am I doing", which is a
different question from "show me the record", and the two coexist the way the
Vault and the Ledger do.

**The endowment is a Modal on the House hall's treasury tab**, Ledger register,
no gold. Three figures are printed before the button can be pressed, in the order
the arithmetic runs: what you commit, what reaches the banner, what is destroyed.
They come from the same pure module the server calls rather than from a copy, so
the number promised and the number charged are one function. A member destroying
half of something they earned, on purpose, should not be congratulated for it
while they are deciding.

There is no control at all when the chapter is sealed or the member has nothing
left to give today, rather than a disabled one. A dead button is a promise the
screen cannot keep.

### 50.8 What it waits on

`coffers_live` and `endowment_live`, both off, a seventh and eighth switch beside
the six that exist. They are separate because reading your own earnings and
committing your balance to a House are different decisions, and a member should
be able to have the first without the second.

Neither is waiting on a build. The Coffers waits on there being something in it:
the value ledger is empty until `market_live` opens or somebody sends a tribute,
and the honest empty state says exactly that rather than pretending. The
endowment waits on Houses having treasuries worth filling, which waits on staked
Calls settling, which is live.

What is genuinely absent and would be the next thing: **a share of the venue fee
paid at source to a third party**, if the founder decides the business should
carry one. It is a third transfer and a third signature, and it is a founder
decision rather than an engineering one. And **gifting a card**, which section
45.10 already names, is the other half of member to member value and needs no
fee, no reservation and one signature.

### 50.9 Repository versus database

Checked before a line of SQL was written, as `supabase/migrations/README.md`
requires. The live definition of `points_ledger_category_check` is
`('social', 'call', 'war', 'stake')`, matching
`20260813104201_call_stakes_and_house_treasury.sql` exactly. The change adds
`'house'` and removes nothing, so no existing row and no existing writer can be
broken by it. That check was not optional: this is the fourth migration in a row
to touch that one constraint, and the third nearly took every War award in the
realm offline by re-adding it from a stale reading of this directory.

`tips`, `market_listings`, `houses`, `house_treasury_ledger`, `house_members`
and `realm_flags` all agree between the two, column for column. The six realm
flags in the live project are the six this directory describes, all false.

**A drift was found and it was already being fixed.** This work read the live
`schema_migrations` table and found two things this directory did not describe:
`appointments_and_seasons` applied as `20260813113137` while the README said it
was written and not yet applied, and four `compliance_guardrails_*` versions
(`20260813164228` through `20260813164429`) applied with no file here at all,
which is exactly the invariant the README says broke four times. Section 48 was
landing the recovery for both at the same moment, so by the time this branch
merged, every applied version had a file again. Recorded rather than dropped,
because the interesting fact is not the fix: it is that the invariant broke
again, in the same week, in the same way, which says the failure is structural
and not a lapse. The thing that catches it is reading `schema_migrations`
before writing SQL, and that is now the first step of two separate missions.

Migration `20260813172956_the_coffers_and_the_endowment.sql`, applied. The
security advisor was run afterwards and returns only the expected INFO
`rls_enabled_no_policy` lints, and the altered constraint was read back to
confirm all four earlier categories survived.
It was verified against a throwaway PostgreSQL 16 cluster with the whole
migration chain replayed onto it, exercising the happy path, a replayed request
id, the daily cap counting what has already gone, the floor, a negative amount,
an outsider, terms that would pool more than they destroy, an insufficient
balance, both reconciliations, a deliberately drifted cached total, the
treasury's own floor of zero, the category constraint in both directions, and
the grants. Four of the older migrations fail on that replay because the
baseline already creates the policies they create, which is pre-existing and
unrelated (section 46.7).
