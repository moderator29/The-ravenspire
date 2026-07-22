# THE RAVENSPIRE

See every chain. Fear no rug. Rule your realm.

The Ravenspire is a fun-first, non-custodial, medieval-fantasy SocialFi realm: a
crypto-native social network where creators and their Houses build reputation,
post, banter, duel, tip, play, and earn, with on-chain intelligence as the
superpower under the hood, never the headline.

## What lives here

- The Ravenry (feed): ravens, a rich composer with AI-suggested drafts, audience
  selection, images, Calls sealed against live prices, cashtag price cards,
  threaded comments, and re-ravens.
- Whispers: private, realtime direct messages with image support.
- Keeps (profiles): uploaded avatar and banner, bio and links, earned crests,
  Renown tiers, and a verified record of Calls and duels. Explore surfaces the
  wider realm.
- Safety: mute, block, and report, backed by an admin moderation queue.
- Houses: six banners, standings, halls, and rivalry.
- Claim the Throne: the Season game of quests, duels of wit, and Glory.
- The War: Battle for the Realm, a real-time battle RPG with a legendary arsenal
  and a hardened, server-authoritative economy.
- @raven, the Herald: Claude Sonnet 5 with four voice styles, a live web browsing
  toggle, a Realm Pulse, and token and wallet cards, answering over real data.
- The Wallet: a non-custodial Privy embedded wallet with backup and export, send,
  receive, and live balance, plus on-chain tipping with a success card.
- The Tools: the Ledger (portfolio), the Watch (safety), the Scrying Glass (smart
  money), the Vault (wallet), and the Forge (staking).
- The Admin panel: user bans and verification, moderation takedowns, an audit
  log, real stats, and Season, House, Crest, War, and Flag management.

## The landing

`app/page.tsx` is the public gate. It opens on the hero and the "Enter the Realm"
call to action, then reveals cinematic, motion-rich sections that show the
platform: a platform preview, the Champions gallery drawn from real roster data,
the two Games, a Meet @raven panel, and the Tools grid. Section components live
in `components/landing/`. Motion is Framer Motion, using in-view reveals,
staggered children, and subtle parallax. The footer links the Privacy Policy at
`/legal/privacy` and the Terms of Service at `/legal/terms`.

## Stack

- Next.js 16 (App Router) with TypeScript in strict mode. This build tracks the
  installed Next.js closely; read the guides under `node_modules/next/dist/docs/`
  before adding framework code.
- Tailwind CSS v4, with brand tokens and helper classes in `app/globals.css`.
- Framer Motion for cinematic reveals and ambient motion.
- Supabase (Postgres, RLS, realtime, storage) as the Archives.
- Privy for non-custodial embedded wallets and X, email, and wallet auth.
- Anthropic Claude Sonnet 5 for the Herald (see `lib/ai/raven.ts` and
  `lib/ai/raven-voice.ts`).
- Live market and chain data from keyed and keyless public sources, cached
  server-side.

## Principles

- Real data only. Honest empty states, never fabricated numbers.
- Non-custodial only. Keys are the user's, exportable, never held by us.
- Reputation is earned, never bought. No keys, no tickets, no NFTs.
- Server-authoritative rewards. Glory and gold settle on the server, not the
  client.
- No presale, ever, anywhere on the platform.
- Fun first. It is a place to live in, not a terminal.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

`npm run typecheck` and `npm run build` must stay green before every push. All
environment variables are documented in `.env.example` and in `docs/PLATFORM.md`.

## Admin access

Admin access is granted by setting `profiles.is_admin = true` for a member. There
is no separate admin password. Admins gain an Admin entry in the side navigation
that opens the console at `/admin`.

## Design system

Brand v3, "Obsidian and Gold, cinematic metal": deep obsidian surfaces, forged
gold gradients, ember firelight, bone text, steel hairlines, and glass
containers. No green, no emoji chrome, no flat gold. Icons come from the project
Icon component. Tokens live in `app/globals.css`.

## Legal

The Ravenspire is a fun-first social platform. $RAVEN is a utility and social token,
not an investment, and nothing on the platform is financial advice. There is no
presale, anywhere, at any time. Crypto carries real risk; bring only what you can
afford to lose. See the Privacy Policy at `/legal/privacy` and the Terms of
Service at `/legal/terms`.

See `docs/PLATFORM.md` for a full tour of the platform and its architecture, and
`docs/AUDIT.md` for the grand adversarial review of the realm.

<!-- deploy: ravenspire on Next.js, build from latest main -->
<!-- build trigger 97e5773 -->
<!-- fresh build 1784487178 -->
