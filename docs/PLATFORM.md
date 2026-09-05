# The Platform

A full tour of Ravenspire: what it is, how it is built, and the vows it holds
to. This document tracks the current, shipped platform, including everything V2
added. The V2 plan itself lives in `docs/RAVENSPIRE-V2.md`; this document
describes what exists rather than what is intended.

Ravenspire is a competitive online realm where communities earn reputation
through participation. Crypto is infrastructure, community is the product, and
reputation is the progression system.

Every feature below carries a status.

| Status | Meaning |
| --- | --- |
| **Live** | Built, reachable, and working against real data. |
| **In development** | Partly built. The gap is stated explicitly. |
| **Planned** | Designed and not built. Nothing in the product presents it as shipped. |

## Contents

- Overview
- The Ravenry and the realm event spine
- Calls
- Houses
- Renown, Crests and the Roll of Honour
- Whispers, the Rookery and Ravens
- The Herald (@raven)
- The Vault and tipping
- The War
- The Tools
- Seasons, points and $RSP
- The Admin panel
- Architecture
- Testing
- Getting started and environment variables
- Principles and founder rules
- Legal and risk disclaimer
- Brand and design system

## Overview

A member enters through the Gatehouse, swears to one of six Houses, and lands
in the Ravenry. From there they post, argue, make Calls, join courts, play the
War, and earn standing. The realm is non-custodial by design: every member
holds their own keys through a Privy embedded wallet, and the platform can
never move their funds. Reputation is earned through real actions and verified
outcomes, never bought.

The application is a Next.js 16 App Router project. Signed-in life happens
inside the `app/(shell)` route group, which frames every page with a side
navigation at `lg`, a top bar, a right rail at `xl`, a mobile dock with
contextual sub-navigation, and a floating composer. The public landing page at
`app/page.tsx` is the gate for signed-out visitors. Navigation is declared once,
in `lib/nav.ts`.

## The Ravenry and the realm event spine

### The Ravenry (`/home`), Live

The Ravenry is a dashboard that contains a feed rather than a feed alone.

**The realm strip** (`components/social/realm-strip.tsx`) sits above the feed
and answers, before a member scrolls, whether anything is happening and whether
they are in it. Four cells: the member's streak, their House's rank with the
nearest rival and the gap to it, how many Calls they have running, and the days
left in the season. It is Board density, not Stream density, because it is an
instrument. Real data only: a cell whose fact the realm cannot answer honestly
does not render, and when none can be answered the strip does not render at all.

**The inline composer** (`components/social/inline-composer.tsx`) sits at the
top of the feed as a single quiet row and expands into the full composer in
place, with no navigation and no modal. The floating compose control still
exists for the rest of the shell.

**The composer** (`components/social/composer.tsx`) supports free text with
`@mentions`, cashtags and links highlighted as you type, AI-suggested drafts via
`/api/compose-suggest`, audience selection (Public, Followers, House, or
mentions only), up to four images at 4MB each through `/api/upload`, and Calls
and polls as first-class post kinds.

**Feed tabs**: For You, Following, My House, Signal, Latest.

**Engagement**: like, threaded comments delivered in near real time, bookmarks
to a private shelf at `/bookmarks`, and re-ravens. Counters are kept on the
server through the hardened social endpoints.

**Safety**: mute, block and report, backed by `/api/mutes`, `/api/blocks` and
`/api/reports` and an admin moderation queue. Block filters the blocked author
out of feed, threads and notifications in both directions.

### The realm event spine, Live, with the feed surface in development

`lib/realm/events.ts` is the V2 spine. Every meaningful act emits one row into
`realm_events`. `emit()` is server-only, takes the service-role client the
caller already holds, does one write, and never throws: an event is a record of
something that already happened, so a failed emit must never fail the request
that caused it.

Nine kinds are declared. Seven are emitted today:

| Kind | Emitted from |
| --- | --- |
| `call.sealed` | `app/api/posts` |
| `call.resolved` | `app/api/cron/verdicts` |
| `crest.earned` | `lib/crests.ts` |
| `house.overtake` | `lib/houses/scoring.ts` |
| `duel.opened` | `app/api/duels` |
| `quest.completed` | `app/api/quests` |
| `oath.sworn` | `app/api/houses/oath` |

`season.milestone` and `raven.chronicle` are declared and not yet emitted.

Every row carries an audience: `realm`, `house`, `followers` or `actor`. The
database RLS policy exposes only `audience = 'realm'` to browser roles, and
`GET /api/events` resolves the narrower audiences with the service-role client.

The Ravenry renders the spine: `/api/feed` interleaves ravens with events
through `lib/realm/feed-events.ts` and the card registry in
`components/stream/cards/registry` draws them.

**In development**: quests (`/api/quests`) and duels (`/api/duels`) run
server-side and emit their events, but no UI consumes either route. Their
mechanics are dissolving into the Ravenry and the House halls rather than
returning as a destination, which is why Claim the Throne holds no navigation
slot. `app/(shell)/throne` survives as a coming-soon teaser page only.

## Calls

**Live.** `lib/calls/`, `app/api/calls`, `app/api/cron/verdicts`, `/calls`.

A Call is a public, timestamped claim a member puts their name to. It is stored
as a `posts` row with `kind = 'call'` and a `call` jsonb column. `/calls` is its
hall, with Live, Closing soon, Trending, Callers and Mine views.

### Shape

A Call is a claim with a **category** and a **resolver** (`lib/calls/types.ts`).

- Categories: `markets`, `esports`, `gaming`, `culture`, `sport`, `realm`.
- Resolvers implemented: `price` (real market data) and `internal` (claims
  about the realm itself, resolved from our own tables at zero external cost:
  which House leads, a House's glory, a member's tier or renown).
- Resolvers declared and **not** implemented: `community` and `manual`. A Call
  that asks for one is rejected at creation rather than accepted and left open
  forever.

Backward compatibility is total. Every pre-V2 row reads as `markets` / `price`
with a zero threshold, which is exactly what it was, and no data migration was
required.

### Difficulty

`lib/calls/scoring.ts` derives a baseline `pi_0` from the token's own trailing
realized volatility (`lib/calls/volatility.ts`):

```
pi_0 = Phi( -ln(1 + k) / (sigma * sqrt(t)) )
```

for an up Call, and the mirror in log space for a down Call. This is the chance
the move happens on its own with no skill involved, so a blue chip drifting a
fraction of a percent and a fresh token needing forty percent cannot score the
same. `pi_0` is computed and **frozen at Call creation**, so a member is scored
against the world as it stood when they committed.

`lib/calls/create.ts` refuses to seal a Call when the realm cannot read a real
price, measure a real volatility, or compute a real base rate. A Call sealed
against an invented difficulty would mint permanent Renown out of nothing.

### Scoring

```
S = clamp( 100 * log2( p_o / pi_o ), -100, +100 )
```

where `p_o` is the member's stated probability for the outcome that actually
happened and `pi_o` is the baseline's probability for that same outcome.
Confidence is a value in `[0.55, 0.99]`; an out-of-band value is rejected
rather than clamped, because silently turning a stated 0.999 into 0.99
misreports the claim.

Once at least three **independent** members have Called the same
`(token, threshold, timeframe)` bucket, a peer score replaces the baseline
score. `lib/calls/peers.ts` enforces independence by excluding the member's own
Calls and every House-mate's.

Note the correction carried in the code and documented in
`docs/RAVENSPIRE-V2.md` section 9.2: the draft divided by `pi_0` in both the hit
and miss cases, which would have paid maximum Renown for being spectacularly
wrong. The shipped form compares like with like.

### Two currencies

| | Renown | Season Rating |
| --- | --- | --- |
| Formula | `+= max(0, S)` | `+= S` |
| Direction | Monotonic, never falls | Can go negative |
| Lifetime | Permanent | Resets each season |
| Purpose | Standing and legacy | Standings and House score |

Renown must never fall. This is asserted in `lib/calls/scoring.ts`, in
`lib/calls/scoring.test.ts`, and independently in the `apply_call_score` SQL
function, which takes `greatest(p_score, 0)`.

### Settlement

`lib/calls/resolvers/price.ts` settles against the **contract address and
chain** pinned at creation, or a canonical CoinGecko id for a major with no
single contract. This is the fix for finding P3: settlement used to re-resolve
the ticker at settlement time, so a recycled or impersonated ticker settled a
Call against a different token than the one whose price was sealed. Legacy rows
fall back to the ticker they were sealed against, are flagged as `legacy`, and
score nothing rather than being handed a difficulty invented after the fact.

`app/api/cron/verdicts` flips the verdict with a `verdict = 'open'` filter
inside the UPDATE, so a concurrent re-run cannot double-award.

### Anti-farming

- Five open Calls at a time (`MAX_OPEN_CALLS`).
- Renown from social actions capped at 200 a day
  (`DAILY_SOCIAL_RENOWN_CAP`), enforced in a single `award_social_capped` RPC
  that takes the profile row lock so two concurrent likes cannot both spend the
  same allowance. Renown from resolved Calls is deliberately uncapped.
- The flat award for a landing Call (40 points, 25 glory) is scaled by
  `difficultyWeight(S)`, so a coin flip pays almost nothing.
- House-mates excluded from each other's peer baseline.

The composer sends confidence, threshold and timeframe and shows the
difficulty read before a member seals. `prepareCall` still defaults a missing
confidence to the floor of the band, 0.55, so an older or hostile client can
never inflate a score by omission.

## Houses

**Live.** `lib/houses/`, `app/api/houses`, `/houses`, `/houses/[slug]`.

Six Houses, declared once in `lib/data/houses.ts`: Corvane, Emberfall,
Frosthold, Stormcrest, Nightvale, Goldmane.

### Size-neutral scoring

A House scores the sum of its **top 20 contributors** this season and nothing
else (`HOUSE_TOP_N`), with ties broken on those same members' mean. Six Houses
of unequal membership summed across every member is a headcount contest. The
contributing 20 are named and shown live on the House hall.

Contribution is never stored against a member. It is derived in Postgres by
`house_season_contributions`, which joins `points_ledger` against the oath
window that contained each row, plus the Call scores recorded on the posts
themselves. The two sources are kept disjoint in SQL so they cannot double
count (see migration `20260812010000`).

### Computed leadership

`lib/houses/roles.ts` and `deriveLeadership` in `lib/houses/scoring.ts`. Not an
election: with this population an election of twenty voters feels sad, and a
computed title feels earned immediately. Six titles per season, one per member,
so six different people carry something:

| Role | Earned by |
| --- | --- |
| Lord / Lady | Top House contribution this season |
| Hand of the House | Second highest |
| Master of Ravens | Best Call accuracy in the House |
| Master of War | Most war Glory this season |
| Chronicler | Most engaged-with ravens (reposts weighted heaviest) |
| Recruiter | Most referrals who actually became active |

### The oath

`lib/houses/oath.ts`. An oath is a dated commitment, not a profile field.
`house_members` holds the whole history with `sworn_at`, `left_at` and
`season_id`, and it is public on a member's Keep
(`components/social/oath-history.tsx`). Four rules:

1. Switching is allowed only in the **off-season window**, so helping an
   underdog rise means committing early while it is still a risk.
2. Global Renown stays. It is personal legacy and is never taken away.
3. Contribution already made stays with the House that earned it, permanently.
   This is enforced by the data model rather than by code.
4. One season of cooldown before switching again.

Members swear through `/api/houses/oath` and the settings oath section.

### House Clashes

`app/api/houses/clashes`, migration `20260811140200_house_clashes.sql`. A Clash
is a **48 hour window** on one nominated token or theme. Only Calls made inside
the window count. Top-20 scoring, live scoreboard, named contributors, no new
scoring maths and no entries table: an entry is derived from the Calls
themselves, so a Clash cannot drift out of sync with the Calls engine. Clashes
are opened by an admin and shown at `/houses?view=clashes`.

## Renown, Crests and the Roll of Honour

### Renown, Live

Seven tiers (`lib/points.ts`): Smallfolk 0, Squire 100, Knight 400, Lord/Lady
1200, Warden 3000, Hand 7000, King/Queen 15000. Renown never falls, and cannot
be purchased, transferred or gifted.

**Planned**: Renown does not yet unlock capabilities. `docs/RAVENSPIRE-V2.md`
section 9.4 proposes a ladder from commenting on others' Calls up to voiding
suspicious Calls, and none of it is built. A tier is a title today.

### Crests, Live, partly

Ten Crests are designed (`components/brand/crests.tsx`). Three are grantable:

- **Took the Black**, on finishing onboarding.
- **Knight of the Realm**, at 400 Renown or a 7 day streak.
- **Warden of the Realm**, at 3000 Renown.

The automatic grants live in `lib/crests.ts`, are idempotent, and emit a
`crest.earned` event. The other seven are shown dimmed rather than hidden, so
nobody is told a locked Crest is available.

Crests are not NFTs, not tokens, and not tradable. There is no shop.

### The Roll of Honour, Live

`/leaderboards`, `app/api/leaderboards`. Four ladders:

- **Accuracy**: settled Calls ranked on a shrunk mean, so a long honest record
  beats a lucky streak of three. The raw hit rate and sample size are shown
  beside the rank.
- **Renown**, **Glory**, and **Points**.

## Whispers, the Rookery and Ravens

### Whispers, Live

`/whispers`, `/api/whispers`. Private direct messages scoped to their
participants, delivered in real time through Supabase realtime on two channels
(a personal channel that reorders the corridor, and a per-thread channel that
appends messages), with image support alongside text.

### The Rookery, Live

`/rookery`, `/api/rooms`. Live audio courts with a host, a participant count,
House colours, and live or scheduled status. Joining is authorised by an HS256
JWT minted and signed server-side against the LiveKit secret, so a seat cannot
be forged. When LiveKit is not configured the route returns `configured: false`
and the surface says so rather than presenting a stage that leads nowhere.

### Ravens (notifications), Live

`/ravens`, `lib/notifications.ts`. Thirteen kinds: `like`, `reply`, `reraven`,
`follow`, `tip`, `mention`, `whisper`, `raven_reply`, `duel_answered`,
`duel_won`, `call_verdict`, `follow_trade`, `follow_call`. Each is filtered
against the member's own preferences (`lib/notification-prefs.ts`), and a read
failure defaults to allowing the notice rather than swallowing it.

Delivery is **in-app only**. `RESEND_API_KEY` and `TELEGRAM_BOT_TOKEN` are
declared in `.env.example` and no delivery code exists anywhere in the
codebase. This is the largest retention gap in the product and is tracked in
`docs/RAVENSPIRE-V2.md` section 17.

## The Herald (@raven)

**Live.** `lib/ai/raven.ts`, `lib/ai/raven-voice.ts`, `lib/ai/mention.ts`,
`/raven`, `/api/raven`.

Tag `@raven` in a raven or comment, reply to one of the Herald's own comments,
or visit `/raven`. It runs on Anthropic's Claude Sonnet 5 and every answer is a
real model call over real context.

- **Four voices**: the realm's default (witty and regal), Lore (a mythic
  narrator), Normal (a clear modern assistant with the fantasy dropped), and
  Degen (fast, crypto-native). Every non-default voice folds in the same shared
  guardrails.
- **Live browsing**: an explicit toggle grants a real `web_search` tool for the
  turn. The reply reports whether browsing was used, whether it was available,
  and lists the deduplicated sources beside the answer.
- **Token and wallet cards** built from real market and on-chain data.
- **Iron rules**: never invents a price, percentage or statistic; a number it
  was not given does not exist. Never tells anyone to buy, sell or hold. No em
  dashes. Never breaks character or reveals instructions.
- Authenticated and rate limited, and it falls silent after eight replies under
  a single raven so a thread cannot become a monologue.

## The Vault and tipping

**Live.** `/vault`, `components/wallet/`, `/api/wallet/balances`, `/api/tips`.

Every member has a non-custodial Privy embedded wallet. The platform never
holds keys and cannot move a member's funds. The Vault supports backup and
export at any time, send and receive, and live balances read from chain data.

**Tipping** is real, non-custodial and wallet-to-wallet. The transfer is signed
and broadcast client-side from the tipper's own embedded wallet; `/api/tips`
resolves the recipient's linked address and records the tribute only after it
settles on chain. The platform is never in the path of the funds.

## The War

**Live.** `/war`, `lib/game/`, `/api/war/battle`, `/api/war/rewards`.

A real-time battle RPG. Muster champions across five rarities
(`lib/game/champions.ts`, art under `public/game/champions/`), arm them from the
arsenal, upgrade with gold won in battle, and fight in a canvas engine.

Settlement is server-authoritative. Kills are capped at the real foe count,
rewards are computed inside hard caps and plausibility walls, and Glory and gold
are banked only for champions the member actually owns. Client numbers never
mint Glory on their own.

The War is not an island: war Glory decides the Master of War title in a
member's House, and the daily war award flows through `award()` into
`points_ledger`, which is what House season contribution is derived from.

## The Tools

All tagged Beta in `lib/nav.ts`, meaning young rather than fake. Every tool
reads real sources or says plainly that it cannot, and none takes custody.

- **The Ledger** (`/ledger`), Live. Portfolio and profit across chains from
  real on-chain data.
- **The Watch** (`/watch`), Live. Token safety across contract, trading,
  holder and liquidity check groups, on five EVM chains, via GoPlus and
  honeypot.is.
- **The Scrying Glass** (`/scrying`), Live. Live coin discovery across chains.
- **The Swap** (`/swap`), Live. Trade any supported EVM coin for any other,
  non-custodially, routed via 0x for best price, signed by the member's own
  wallet. Opens on ETH to USDC and is never gated on holdings.
- **The Bloodline** (`/dna`), Live. A read of a wallet address or a social
  handle.
- **The Oracle** (`/scanner`), Live. A real LLM scan of the member's **own**
  account: standing, ravens, and wallet if linked. Owner data only, points
  shown as points.
- **Search** (`/search`) and **the Herald** (`/raven`), Live.
- **The Forge** (`/forge`), **In development.** The staking hall is built and
  the terms are on the page, but it is gated behind the `forge_staking` feature
  flag and the on-chain contract wiring is the remaining work. Until it lights
  there is nothing to sign and nothing to lock. When it opens it will pay yield
  from real protocol fees, never emissions.

## Seasons, points and $RSP

### Seasons, Live

The realm runs in seasons (`seasons` table, managed at `/admin/seasons`).
Season Rating and House standings reset when a season turns; Renown and Crests
do not. `lib/houses/oath.ts` derives the season window, and oaths may be sworn
only in the off-season gap. The countdown appears in the realm strip and the
right rail.

### Points, Live

`lib/points.ts`. `award()` writes `points_ledger` and updates the cached
profile totals; the ledger is the source of truth. Every award is
server-authoritative. Current awards:

| Action | Points | Glory |
| --- | --- | --- |
| Finish onboarding | 50 | 20 |
| Send a raven | 5 | 2 |
| Seal a Call | 8 | 2 |
| Reply | 2 | 1 |
| Be liked | 1 | 0 |
| A Call that lands | up to 40, scaled by difficulty | up to 25, scaled |
| Win a duel | 30 | 60 |
| A referral who becomes active | 60 | 30 |
| Daily war muster | 0 | 10 |

Social awards draw from a 200-per-day allowance through the
`award_social_capped` RPC. Resolved Calls are uncapped by design.

### $RSP, Live copy, planned distribution

Ticker `$RSP`, total supply 1,000,000,000, matching the standard Pump.fun
launch model. Earned balances are shown as **POINTS** everywhere in the
product; no $RSP figure is displayed against a member's name, because none
has been distributed. Points convert to $RSP at TGE.

Season Zero, the founding round, is built to run **inside the platform** at
`/season-zero`, currently **archived** behind the `season_zero_live` realm
flag (fails closed, see `lib/flags.ts`): softcap 6 ETH, hardcap 15 ETH,
7 percent of total supply (70,000,000 $RSP) drawn from within the 20 percent
Presale allocation, at a fixed rate of 4,666,666 $RSP per 1 ETH.
Contributions, when live, are non-custodial and wallet to wallet, ETH on Base
(primary) or Ethereum mainnet, sent to the realm treasury and verified on
chain by the server before being recorded. If the softcap is not reached,
every contribution is returned to its sending wallet. Tokens are delivered at
TGE. `lib/season-zero.ts` is the single source of truth for the numbers. Any
later sale phases will be announced before they run.

**Planned**: the claim itself does not exist. There is no claim route, no
published distribution, and nothing on chain. When it ships it will be
non-custodial from end to end.

## The Admin panel

**Live.** `/admin`. A full operations console:

- User management: ban and verify members, with every action recorded.
- Moderation: review the report queue and take down offending content.
- An audit log: every privileged action is written to `admin_audit_log` on a
  best-effort basis.
- Real stats: live counts and standings, never fabricated figures.
- Realm management: Seasons, Houses, House Clashes, Crests, the War, and
  feature Flags.

Admin access is granted by setting `profiles.is_admin = true`. There is no
separate admin password or side login. Every admin API route runs through a
single `requireAdmin` gate (`app/api/admin/_admin.ts`). When a member is an
admin the side navigation shows an Admin entry; other members never see it.

## Architecture

- **Next.js 16**, App Router, TypeScript strict. This build tracks the
  installed Next.js closely; consult the guides bundled under
  `node_modules/next/dist/docs/` before adding framework code, and heed
  deprecation notices.
- **Tailwind CSS v4.** Brand tokens, the radius, spacing, elevation and
  z-index scales, and helper classes live in `app/globals.css`.
- **`components/ui/`**: the primitive layer, bespoke on Base UI. Twelve files
  plus the icon set, covering the controls the product was re-deriving inline
  over a hundred times. Prefer these over raw Tailwind; if a primitive is
  missing, add it there.
- **Framer Motion** for cinematic reveals and ambient motion.
- **Supabase** is the Archives: Postgres with row-level security, realtime for
  whispers, comments and notifications, and Storage for uploads. The schema is
  reproducible from `supabase/migrations/`. Privileged server routes use the
  service-role client; the browser uses the anon key under RLS. Economy RPCs
  (`increment_profile_totals`, `increment_house_glory`, `award_social_capped`,
  `apply_call_score`, `rate_limit_hit`) are service-role only.
- **Privy** provides non-custodial embedded wallets and X, email and wallet
  auth.
- **Anthropic Claude Sonnet 5** powers @raven, always over real context, with
  optional live web browsing.
- Live market and chain data from keyed and keyless public sources, cached
  server-side.

Layout: the signed-in application lives under `app/(shell)`, server routes
under `app/api`, the admin console under `app/admin`, legal pages under
`app/legal`, and the landing page and its sections in `app/page.tsx` and
`components/landing/`.

## Testing

Vitest. Run with `npm test`. Coverage is deliberately concentrated on pure
logic with the highest blast radius:

- `lib/points.test.ts`: the award path and the daily social cap.
- `lib/calls/scoring.test.ts`: the baseline, the log score in both directions,
  the clamp bounds, and the guarantee that Renown never goes negative.
- `lib/calls/peers.test.ts`: peer independence, including House-mate exclusion.

`npm run typecheck`, `npm test` and `npm run build` must all stay green, and CI
enforces them.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

### Environment variables

All variables are documented in `.env.example`. `NEXT_PUBLIC_` values are
exposed to the browser; everything else stays server-side only.

- The Archives (Supabase, required): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- The Herald (Anthropic, required): `ANTHROPIC_API_KEY`.
- The Gatehouse (auth and wallets): `NEXT_PUBLIC_PRIVY_APP_ID`,
  `PRIVY_APP_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`,
  `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- Chain data: `ALCHEMY_API_KEY` (EVM), `HELIUS_API_KEY` (Solana).
- Market data: `BIRDEYE_API_KEY`, `COINGECKO_API_KEY` (DexScreener and
  GeckoTerminal are keyless).
- Portfolio: `GOLDRUSH_API_KEY`.
- The Watch (token safety): `GOPLUS_APP_KEY`, `GOPLUS_APP_SECRET`
  (honeypot.is is keyless).
- The Rookery (live audio and video): `NEXT_PUBLIC_LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- Trading: `PLATFORM_FEE_RECIPIENT`.
- Cron: `CRON_SECRET`, required by `/api/cron/verdicts`.
- Declared but unread today: `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`. There is
  no email or messenger delivery anywhere in the codebase.

## Principles and founder rules

The full set lives in `AGENTS.md` and is non-negotiable. In brief:

- Real data only. Honest empty states, never fabricated numbers.
- Real AI only. Every AI surface is a real model call over real data.
- Non-custodial only. Keys are the member's, exportable, never held by us.
- Reputation is earned, never bought. No keys, no tickets, no NFTs.
- Server-authoritative rewards. Points and Glory settle on the server against
  verified events, never trusted from the client.
- Ticker `$RSP`, supply 1,000,000,000 (the standard Pump.fun launch model).
  Season Zero, the founding round, is built to run inside the platform,
  non-custodially and wallet to wallet, currently archived behind
  `season_zero_live`. Earned balances are shown as POINTS; the Season Zero
  allocation is purchased, not earned, so its $RSP amount is shown when live.
- No em dashes, anywhere, in any file.
- Ornament is earned, never ambient.

## Legal and risk disclaimer

Ravenspire is a competitive social realm. $RSP is a utility and social token
that powers the realm, intended for use within it. Nothing on the platform is financial
advice, and no one at Ravenspire will ever tell anyone to buy, sell or hold.
Season Zero, the founding round, runs inside the platform September 1 to 20,
2026 (UTC), non-custodially and wallet to wallet, with its terms stated in the
Terms of Service; participation is only permitted where lawful in the member's
jurisdiction, and no token value is promised. Crypto carries real risk,
including the total loss of everything a member puts in, so members should bring
only what they can afford to lose. The realm is non-custodial by design:
members hold their own keys, the keys are always exportable, and the platform
never takes custody of anyone's funds. The Privacy Policy lives at
`/legal/privacy` and the Terms of Service at `/legal/terms`.

## Brand and design system

Read `docs/DESIGN-SYSTEM.md` before designing any surface. It is the design law:
two registers (Ledger and Forge), six surface archetypes (Stream, Board,
Dossier, Console, Ceremony, Document), three tab patterns, two densities, one
card chassis.

Brand: deep obsidian surfaces, forged gold gradients, ember firelight, bone
text, steel hairlines, glass containers. Gold is a gradient, never a flat fill.
Never green, including success states. No emoji as icons; icons come from
`components/ui/icon.tsx`. Every colour that carries text clears WCAG AA. Motion
is fast: under 300ms for everything except ambient atmosphere loops. Tokens live
in `app/globals.css`.
