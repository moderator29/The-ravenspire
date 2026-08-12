# THE RAVENSPIRE

Make the call. Earn your name.

Ravenspire is a competitive online realm where communities earn reputation
through participation. Crypto is infrastructure, community is the product,
reputation is the progression system, and standing is earned rather than bought.

## What lives here

Everything below is labelled with what it actually is. See
`lib/data/chronicle.ts` for the member-facing version of the same map, and
`docs/PLATFORM.md` for the full architectural tour.

### Live

- **The Ravenry** (`/home`): the feed, with a realm strip above it (streak,
  House standing and nearest rival, open Calls, season countdown) and an inline
  composer that expands in place. Five tabs, threaded realtime comments,
  bookmarks, re-ravens, audience selection, up to four images, polls, and
  AI-suggested drafts.
- **Calls** (`/calls`): the flagship. A Call is a claim with a category and a
  resolver. Difficulty is derived from the token's own trailing realized
  volatility and frozen at creation, confidence is stated in `[0.55, 0.99]`, and
  the score is a log score against that baseline (or against the crowd once
  three independent members Call the same bucket). Two currencies: Renown is
  monotonic and permanent, Season Rating is signed and resets. Settlement is by
  contract address and chain, never by ticker. Five open Calls at a time.
  See `lib/calls/`.
- **Houses** (`/houses`): six banners, size-neutral scoring (the sum of a
  House's top 20 contributors, ties broken on their mean), named live
  contributors, computed seasonal leadership across six titles, public oath
  history with off-season-only switching, and House Clashes (a 48 hour window
  on one nominated token or theme). See `lib/houses/`.
- **Renown and Crests** (`/renown`): seven tiers from Smallfolk to King or
  Queen. Renown never falls. Three of ten Crests are grantable today; none of
  them is an NFT or tradable.
- **The Roll of Honour** (`/leaderboards`): four ladders. Accuracy ranks on a
  shrunk mean over settled Calls; Renown, Glory and Points are the others.
- **The Herald** (`/raven`, `@raven` inline): Claude Sonnet 5 over real data,
  four voice styles, a live web-browsing toggle with cited sources, and token
  and wallet cards. Never invents a number.
- **Whispers** (`/whispers`): realtime private messages with images.
- **The Rookery** (`/rookery`): live audio courts on LiveKit, live and
  scheduled, with honest degradation when LiveKit is not configured.
- **Ravens** (`/ravens`): in-app notifications across thirteen kinds, with
  per-kind preferences in settings. In-app only; there is no email or messenger
  delivery anywhere in the codebase.
- **The Vault** (`/vault`): a non-custodial Privy embedded wallet with backup
  and export, send, receive, live balances, and client-signed tipping.
- **The War** (`/war`): a real-time battle RPG with five champion rarities, an
  arsenal, and a server-authoritative reward path. War Glory feeds House
  standings and decides the Master of War title.
- **The Tools**: the Ledger (`/ledger`, portfolio), the Watch (`/watch`,
  token safety), the Scrying Glass (`/scrying`, coin discovery), the Swap
  (`/swap`, non-custodial EVM trading), the Bloodline (`/dna`), and the Oracle
  (`/scanner`, owner-only account scan). All tagged Beta in navigation.
- **Keeps** (`/keep`, `/u/[handle]`): avatar and banner, bio and links, earned
  crests, Renown tier, oath history, and a public record of Calls.
- **Safety**: mute, block and report, backed by an admin moderation queue.
- **The realm event spine** (`lib/realm/events.ts`, `/api/events`): every
  meaningful act emits one audience-scoped record. Seven of the nine declared
  kinds are emitted today.
- **The Admin panel** (`/admin`): bans and verification, moderation takedowns,
  an audit log, real stats, and Season, House, Crest, War, Clash and Flag
  management.

### In development

- Event cards in the Ravenry. The stream is written and readable; the feed does
  not render it yet.
- The Calls composer controls. The scoring engine takes a stated confidence and
  freezes a difficulty baseline, but the composer sends neither, so a Call is
  currently sealed at the floor of the confidence band (0.55).
- Quests and duels. Both run server-side and emit events, but have no surface.
  They are dissolving into the Ravenry and the House halls rather than
  returning as a destination, which is why Claim the Throne is not a nav item.
- The Forge (`/forge`). The staking hall is built and flag-gated; the on-chain
  contract is the remaining work.

### Planned

- Renown tiers that unlock capabilities. Today a tier is a title.
- The seven remaining Crests.
- Community and admin Call resolvers (declared, and refused at creation until
  they exist).
- The points claim. There is no claim route, no published distribution and
  nothing on chain yet.
- The six chapters in `comingSoonNav`: the Flock, the Almanac, the Mint,
  Prophecies, the Raven Unbound, and the Long Night.

## The landing

`app/page.tsx` is the public gate. It opens on the hero and the "Enter the
Realm" call to action, then reveals motion-led sections: the realm intro, the
stats strip, the Tools rail, Meet @raven, the non-custodial promise, the Games
and the Champions gallery drawn from real roster data, a platform preview,
coming-soon teasers, $RSP tokenomics, the roadmap, how the realm works, the
chapters ahead, the crests, an FAQ, and the risk band. Section components live
in `components/landing/`. Motion is Framer Motion. The footer links the Privacy
Policy at `/legal/privacy` and the Terms of Service at `/legal/terms`.

## Stack

- Next.js 16 (App Router) with TypeScript in strict mode. This build tracks the
  installed Next.js closely; read the guides under `node_modules/next/dist/docs/`
  before adding framework code.
- Tailwind CSS v4, with brand tokens and helper classes in `app/globals.css`.
- Bespoke primitives on Base UI in `components/ui/`. Prefer them over raw
  Tailwind; if a primitive is missing, add it there.
- Framer Motion for cinematic reveals and ambient motion.
- Supabase (Postgres, RLS, realtime, storage) as the Archives. The schema is
  reproducible from `supabase/migrations/`.
- Privy for non-custodial embedded wallets and X, email, and wallet auth.
- Anthropic Claude Sonnet 5 for the Herald (see `lib/ai/raven.ts` and
  `lib/ai/raven-voice.ts`).
- Vitest for unit tests. `lib/points.ts`, `lib/calls/scoring.ts` and
  `lib/calls/peers.ts` carry the highest-risk pure logic and are covered.
- Live market and chain data from keyed and keyless public sources, cached
  server-side.

## Principles

- Real data only. Honest empty states, never fabricated numbers.
- Real AI only. Every AI surface is a real model call over real data.
- Non-custodial only. Keys are the member's, exportable, never held by us.
- Reputation is earned, never bought. No keys, no tickets, no NFTs.
- Server-authoritative rewards. Points and Glory settle on the server against
  verified events, never on the word of a client.
- Ticker is `$RSP`, total supply 10,000,000,000. The presale runs on an
  external launchpad, never on the platform. Presale coming soon. Earned
  balances are shown as POINTS, never as a $RSP amount.
- No em dashes, anywhere. See `AGENTS.md`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

`npm run typecheck`, `npm test` and `npm run build` must stay green before every
push, and CI enforces them. All environment variables are documented in
`.env.example` and in `docs/PLATFORM.md`.

## Admin access

Admin access is granted by setting `profiles.is_admin = true` for a member.
There is no separate admin password. Admins gain an Admin entry in the side
navigation that opens the console at `/admin`.

## Design system

Read `docs/DESIGN-SYSTEM.md` before designing any surface. It is the design law:
two registers (Ledger and Forge), six surface archetypes, three tab patterns,
two densities, one card chassis. Brand is obsidian and forged gold, restrained
ember, a single steel tone. Gold is a gradient, never a flat fill. Never green,
including success states. No emoji as icons; use the `Icon` component. Tokens
live in `app/globals.css`.

## Legal

Ravenspire is a competitive social realm. $RSP is a utility and social token,
not an investment, and nothing on the platform is financial advice. The presale
runs on an external launchpad and never on the platform; presale coming soon.
Crypto carries real risk; bring only what you can afford to lose. See the
Privacy Policy at `/legal/privacy` and the Terms of Service at `/legal/terms`.

See `docs/PLATFORM.md` for a full tour of the platform and its architecture,
`docs/RAVENSPIRE-V2.md` for the V2 plan, and `docs/AUDIT.md` for the adversarial
review that preceded it.

<!-- deploy: ravenspire on Next.js, build from latest main -->
