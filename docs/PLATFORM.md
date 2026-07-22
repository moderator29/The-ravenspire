# The Platform

A full tour of The Ravenspire: what it is, how it is built, and the vows it holds
to. This document tracks the current, shipped platform.

The Ravenspire is a fun-first, non-custodial, medieval-fantasy SocialFi realm. It is
a social network first and a crypto toolkit second. Creators and their Houses
are the heart of everything. The chains and charts serve the story, never the
other way round.

## Contents

- Overview
- Social: The Ravenry, composer, engagement, safety, profiles, Explore
- Whispers (direct messages)
- The Herald (@raven AI)
- The Wallet (non-custodial) and tipping
- The Games: Claim the Throne and The War
- The Tools: Ledger, Watch, Scrying Glass, Vault, Forge
- The Admin panel
- Architecture
- Getting started and environment variables
- Principles and founder rules
- Legal and risk disclaimer
- Brand

## Overview

A member enters through the Gatehouse, swears to one of six Houses, and lands in
The Ravenry. From there they post, banter, duel, tip, play, and earn. The realm
is non-custodial by design: every member holds their own keys through a Privy
embedded wallet, and the platform can never move their funds. Reputation is
earned through real actions and verified outcomes, never bought.

The application is a Next.js 16 App Router project. Signed-in life happens inside
the `app/(shell)` route group, which frames every page with a side navigation, a
top bar, a right rail, and a floating composer. The public landing page at
`app/page.tsx` is the gate for signed-out visitors.

## Social

### The Ravenry (feed)

The Ravenry is the public square, served at `/home`. Members post ravens (posts),
seal Calls against live prices, share cashtag price cards, reply in threads, and
re-raven what they admire. Feed tabs cover Latest, Following, For You, and Signal,
and Explore surfaces the wider realm.

A Call is a public, timestamped market read a member puts their name to. It is
scored against real on-chain data over time by the verdict settlement job, so a
strong record is proof of skill rather than noise.

### The composer

The composer is a rich authoring surface. It supports:

- Free text with @mentions, cashtags, and links, all highlighted as you type.
- AI-suggested ravens. The composer can ask the Herald for draft lines through
  `/api/compose-suggest`, giving a member a running start rather than a blank box.
- Audience selection. Every raven can be aimed at Public, Followers, House, or
  Mentions only, so members choose who sees a given post.
- Images. Up to four images per raven, validated by type and size, with a 4MB
  ceiling per image, uploaded to Supabase Storage through `/api/upload`.
- Calls and polls as first-class post kinds.

A floating compose control (`components/shell/floating-compose.tsx`) opens the
composer in a sheet from anywhere in the shell.

### Engagement

Members can like, comment, bookmark, and re-raven. Comments are threaded and
delivered in near real time. Likes, comment counts, and repost counts are kept on
the server through the hardened social endpoints so counters reflect reality
rather than optimistic guesses. Bookmarks are saved to a private shelf at
`/bookmarks`, readable only by their owner.

### Safety

The realm ships a full member-facing safety kit:

- Mute quietly removes an author from a member's own view.
- Block severs the relationship in both directions and filters the blocked
  author out of feed, threads, and notifications.
- Report opens a case against a post, comment, or profile that lands in the admin
  moderation queue.

These sit in the overflow menus on posts and profiles and are backed by
`/api/mutes`, `/api/blocks`, and `/api/reports`.

### Profiles (Keeps)

A member's Keep is their hall, served at `/u/[handle]` and `/keep`. A Keep shows
an uploaded avatar and banner, a bio and links, earned crests, a Renown tier, a
House allegiance, and a verified record of Calls and duels. Members edit their
own Keep through `/api/profile`, uploading avatar and banner images to storage.
Nothing on a Keep is bought.

### The referral loop

Every member carries an invite. When a newcomer joins through a member's
referral and completes onboarding, the loop is credited through `/api/referrals`,
rewarding the member who brought them into the realm. Referrals feed the earn
economy without paid placement.

### Explore

Explore (`/explore`) is the discovery surface: trending ravens, active members,
Houses, and cashtags for members who want to find the wider realm beyond the
people they already follow.

## Whispers

Whispers are private direct messages, served at `/whispers` and backed by
`/api/whispers`. Conversations are scoped to their participants, delivered in
real time through Supabase realtime, and support image messages alongside text.
A Message action on profiles opens a whisper with that member.

## The Herald (@raven)

@raven is the resident intelligence of the realm. Tag it in any raven, comment,
or whisper, or visit the dedicated Herald surface at `/raven`, and it answers:
settling debates, narrating the Season, and reading any token or wallet over real
data only. It is helpful first and flavorful always, and it never invents a price
or a statistic.

The Herald runs on Anthropic's Claude Sonnet 5 (`lib/ai/raven.ts`). Its behaviour
is shaped by several controls:

- Four voice styles (`lib/ai/raven-voice.ts`): Default realm (witty and regal
  with light realm flavor), Lore (a mythic narrator, grander and older), Normal
  (a clear modern assistant with all fantasy framing dropped), and Degen (fast,
  punchy, crypto-native energy).
- A live web browsing toggle. When enabled, the Herald can browse the live web to
  ground an answer, and the reply reports whether browsing was used.
- A Realm Pulse: a real, derived read across the tokens a member asks about at
  once, described like weather rather than a promise of tomorrow.
- Token and wallet cards. When a question is about a token or a wallet, the reply
  renders a structured card built from real market and on-chain data.

The Herald is authenticated and rate limited so it answers members, not scripts,
and never fabricates a number to fill a silence.

## The Wallet

Every member has a non-custodial embedded wallet provided by Privy, surfaced at
`/wallet` and as the Vault tool. The platform never holds keys and cannot move a
member's funds. The wallet supports:

- Backup and export of keys, always in the member's control.
- Send and Receive flows for real transfers.
- A live balance read from chain data.

### Tipping

Members tip one another with real, non-custodial, wallet-to-wallet transfers. The
transfer is signed and broadcast client-side from the tipper's own embedded
wallet; `/api/tips` resolves the recipient's linked address and records the
confirmed tribute after it settles on chain. A success card confirms the tip once
it lands. The platform is never in the path of the funds.

## The Games

The Glory economy behind both games is server-authoritative and hardened. Rewards
are computed and settled on the server against verified events, with single-use
settlement, per-cadence quest periods, guarded duel entry and settlement, and
battle sessions that cross-check outcomes. Client numbers never mint Glory on
their own.

### Claim the Throne

Claim the Throne (`/throne`) is the Season game of quests, duels of wit judged by
the realm, and streaks. Quests are grouped by cadence into daily, weekly, and
seasonal work, each claimable once per its own period. Duels are public
challenges: a member opens one, an opponent enters, the realm votes, and
settlement awards Glory to the winner. Glory earned lifts both the member and
their House, and each Season the leading House claims the Throne.

### The War

The War, Battle for the Realm (`/war`), is a real-time battle RPG. Muster
champions across five rarities, arm them from a legendary arsenal, and lead the
charge across the battlefield. Roster data lives in `lib/game/champions.ts` and
champion art under `public/game/champions/`. Battles are played out client-side
in a canvas engine, then settled server-side: victory rewards in Glory and gold
are computed on the server, capped, and banked only for champions the member
actually owns.

## The Tools

Five serious surfaces sit quietly under the play:

- The Ledger (`/ledger`): portfolio and profit across chains, from real on-chain
  data.
- The Watch (`/watch`): safety scans for rugs, hidden mints, and honeypots.
- The Scrying Glass (`/scrying`): smart-money tracking, live from the markets.
- The Vault (`/vault`): the member's non-custodial wallet, keys always exportable.
- The Forge (`/forge`): staking for real yield from protocol fees, never
  emissions.

## The Admin panel

The Admin panel lives at `/admin` and is a full operations console for the realm.
It provides:

- User management: ban and verify members, with every action recorded.
- Moderation: review the report queue and take down offending content.
- An audit log: every privileged action is written to `admin_audit_log` on a
  best-effort basis so the realm keeps a trail.
- Real stats: live counts and standings, never fabricated figures.
- Realm management: Seasons, Houses, Crests, The War, and feature Flags.

Admin access is granted by setting `profiles.is_admin = true` for a member. There
is no separate admin password or side login. Every admin API route runs through a
single `requireAdmin` gate (`app/api/admin/_admin.ts`) that rejects any caller
whose profile is not an admin. When a member is an admin, the side navigation
shows an additional Admin entry that opens the panel; other members never see it.

## Architecture

- Next.js 16 with the App Router and TypeScript in strict mode. This build tracks
  the installed Next.js closely; consult the guides bundled under
  `node_modules/next/dist/docs/` before adding framework code, and heed any
  deprecation notices.
- Tailwind CSS v4. Brand tokens and helper classes (`.glass`, `.btn-gold`,
  `.gold-metal`, `.realm-bg`, the rarity ladder, and the aurora and ember
  animations) live in `app/globals.css`.
- Framer Motion drives the cinematic reveals and ambient motion.
- Supabase is the Archives: Postgres with row-level security for data, realtime
  for whispers, comments, and notifications, and Storage for uploaded images,
  avatars, and banners. Privileged server routes use the service role client;
  the browser uses the anon key under RLS.
- Privy provides non-custodial embedded wallets and X, email, and wallet auth.
  The platform never holds keys and cannot move a member's funds.
- Anthropic's Claude Sonnet 5 powers @raven, always reading from real, verified
  context, with optional live web browsing.
- Live market and chain data are pulled from keyed and keyless public sources and
  cached server-side.

The signed-in application is organized under `app/(shell)`, with server routes
under `app/api`, the admin console under `app/admin`, and legal pages under
`app/legal`. The public landing page and its cinematic sections
(`components/landing/`) are the gate for signed-out visitors, and the footer
links the Privacy Policy at `/legal/privacy` and the Terms of Service at
`/legal/terms`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

`npm run typecheck` and `npm run build` must stay green before every push.

### Environment variables

All variables are documented in `.env.example`. `NEXT_PUBLIC_` values are exposed
to the browser; everything else stays server-side only.

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
- Ravens (notifications): `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`.

## Principles and founder rules

- Real data only. Honest empty states, never fabricated numbers.
- Non-custodial only. Keys are the member's, exportable, never held by us.
- Reputation is earned, never bought. No keys, no tickets, no NFTs.
- Server-authoritative rewards. Glory and gold are settled on the server against
  verified events, never trusted from the client.
- No presale, ever, anywhere on the platform.
- Fun first. A realm to live in, not a terminal.

## Legal and risk disclaimer

The Ravenspire is a fun-first social platform. $RAVEN is a utility and social token
that powers the realm, not an investment. Nothing on the platform is financial
advice, and no one at The Ravenspire will ever tell anyone to buy, sell, or hold.
There is no presale, anywhere, at any time. Crypto carries real risk, including
the total loss of everything a member puts in, so members should bring only what
they can afford to lose. The realm is non-custodial by design: members hold their
own keys, the keys are always exportable, and the platform never takes custody of
anyone's funds. The Privacy Policy lives at `/legal/privacy` and the Terms of
Service at `/legal/terms`.

## Brand

Brand v3, "Obsidian and Gold, cinematic metal": deep obsidian surfaces, forged
gold gradients, ember firelight, bone text, steel hairlines, and glass
containers. No green, no emoji chrome, no flat gold. Icons come from the project
Icon component in `components/ui/icon.tsx`. Tokens live in `app/globals.css`.
