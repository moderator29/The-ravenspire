# The Ravenspire Product Backlog (Wave 4+)

This file extends the 261-finding Grand Audit (docs/AUDIT.md) with the founder's
Wave 4 feature direction. Items marked MVP are being built now; the rest are the
next build passes, ordered by presale value.

## 1. DNA Analyzer  (MVP in progress)

Enter a wallet address or an @handle and get an AI "DNA" read.
- MVP: wallet DNA (on-chain style, holdings, vibe) and social DNA (posting style,
  tips, House, activity) via Anthropic over real Covalent and Supabase data.
- Next: cache results, richer transaction-history analysis, biggest-win detection
  from realized PnL, archetype leaderboards, DNA-vs-DNA comparison, share cards
  with generated imagery.

## 2. Profile intelligence: earnings + balance chart  (next)

On a profile, between the identity header and the Ravens/Calls/Media tabs:
- Own profile: platform earnings (points, Glory, tips received, referral rewards)
  and live wallet balance with a FOMO-style balance chart over time.
- "View more" opens portfolio pages: holdings structure, trade history, realized
  and unrealized PnL, join date, notable calls and their outcomes.
- Shareable profile and a shareable "thesis" card.
- Other profiles: show public earnings and reputation, never a private balance.
- Requires a balance-snapshot table to chart balance over time (no historical
  balance from a single RPC call), and a portfolio aggregation service.

## 3. Scrying Glass: in-app coin experience  (next)

- Every coin row pulls its real logo (Covalent/GoldRush logo_url or the token
  list), no blank icons.
- Tapping a coin opens an in-app coin page, not CoinGecko: price chart, market
  data, token image, holders, and transaction history, styled like a terminal.
- A watchlist and alerting hook into the same coin pages.

## 4. Ledger: real portfolio  (next)

- A true portfolio connected to the member's wallet: total value, allocation by
  chain and asset, positions with cost basis and PnL, and history.
- Uses the multi-chain balances route already built for The Vault; adds price
  history and cost-basis tracking.

## 5. AI Account Scanner  (next)

- An AI with full read access to the signed-in member's own account (posts,
  wallet, activity, calls) that surfaces insights, risks, and opportunities.
- Scoped to the owner only; never exposes another member's private data.

## 6. Follow notifications: buy / sell / call  (next)

- Members can enable notifications for accounts they follow, to be alerted when a
  followed member buys, sells, or seals a Call.
- Buy/sell detection needs wallet-activity indexing (webhook or polling of the
  followed member's public wallet); calls already exist and can notify today.

## Done in Wave 4 already

- Profile: block moved into an overflow menu next to Follow; avatar layered above
  the banner; X logo by the name; Edit Profile in the header.
- Image posting fixed; bigger action icons; views counter; full comment actions
  with threading and threaded @raven; tip modal; call price mini charts.
- Wallet: modern multi-chain non-custodial vault with 0x address, coin list,
  per-coin send, two-step send with Max and over-balance guard, tx hash success,
  history, watchlist, filters, settings.
- @raven: bottom input bar, chat history, settings sheet.
- Landing: $RSP tokenomics (10B), Ethereum roadmap, crisp champions, coming-soon
  teasers, presale coming soon. Claim the Throne is a coming-soon sneak peek.
