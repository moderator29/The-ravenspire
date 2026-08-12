# External services Ravenspire V2 depends on

Every entry below is either already called by code in this repository or is
required by a V2 feature that has been approved. Nothing here is speculative
shopping. Free tier figures were checked in August 2026 and are linked so they
can be rechecked, because vendors change them without notice.

The zero budget constraint holds: everything marked REQUIRED has a free tier
that carries the platform through early scale, with one exception that is
called out honestly in section 3.

---

## 1. Already wired in code, needs only a key

These are called by existing route handlers. Without the key the surface
degrades honestly rather than breaking, but it does not work.

| Service | Env var | What goes dark without it | Cost | Link |
| --- | --- | --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Everything. Postgres, RLS, realtime, storage. | Free tier | [supabase.com/pricing](https://supabase.com/pricing) |
| Privy | `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Sign in and every embedded wallet | Free to a monthly active user ceiling | [privy.io/pricing](https://www.privy.io/pricing) |
| Anthropic | `ANTHROPIC_API_KEY` | Raven AI entirely: analysis, compose suggestions, scrying | Paid, no free tier. This is the one unavoidable line item. | [anthropic.com/pricing](https://www.anthropic.com/pricing) |
| LiveKit Cloud | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` | Live audio courts. The panel says the stage is warming up. | Build tier is permanently free: 5,000 WebRTC minutes and 50 GB egress per month | [livekit.io/pricing](https://livekit.io/pricing) |
| DexScreener | none | Price resolution for market Calls, and pair data | Free, no key | [docs.dexscreener.com](https://docs.dexscreener.com/api/reference) |
| CoinGecko | none on the public endpoint | Fallback price resolution by coin id | Free demo tier, rate limited | [coingecko.com/api/pricing](https://www.coingecko.com/en/api/pricing) |
| GeckoTerminal | none | On chain pool and chart data | Free, rate limited | [geckoterminal.com/dex-api](https://www.geckoterminal.com/dex-api) |
| GoldRush (Covalent) | `GOLDRUSH_API_KEY` | Multi chain wallet balances in the Vault | Free tier with a credit allowance | [goldrush.dev/pricing](https://goldrush.dev/pricing/) |
| GoPlus | `GOPLUS_APP_KEY`, `GOPLUS_APP_SECRET` | Token security checks in the scanner | Free tier | [gopluslabs.io](https://gopluslabs.io/) |
| 0x | `ZEROX_API_KEY` | Swap quotes and routing | Free tier | [0x.org/pricing](https://0x.org/pricing) |
| MoonPay | `NEXT_PUBLIC_MOONPAY_KEY`, `MOONPAY_SECRET_KEY` | Fiat on ramp | Revenue share, no fixed fee | [moonpay.com/business](https://www.moonpay.com/business) |
| Honeypot.is | none | Honeypot detection in the scanner | Free | [honeypot.is](https://honeypot.is/) |
| Resend | already set in Vercel | Transactional email | Free tier | [resend.com/pricing](https://resend.com/pricing) |

Also required and not an external vendor: `CRON_SECRET`, which guards
`/api/cron/verdicts`. Without it, in production the route refuses to run rather
than letting anyone time their own Call settlement. Set it.

---

## 2. Needed for approved V2 features, not yet wired

| Need | Recommendation | Cost | Link |
| --- | --- | --- | --- |
| Sport category Calls | TheSportsDB | Free at point of access. 9 USD a month unlocks two minute livescores, which is what an automatic resolver actually wants. | [thesportsdb.com/free_sports_api](https://www.thesportsdb.com/free_sports_api) |
| Gaming category Calls (releases, ratings, launches) | IGDB, via a Twitch developer app | Free | [api-docs.igdb.com](https://api-docs.igdb.com/) |
| Rate limiting that survives a serverless fleet | Upstash Redis | Free tier | [upstash.com/pricing](https://upstash.com/pricing/redis) |
| Bot defence on sign up and posting | Cloudflare Turnstile | Free | [cloudflare.com/products/turnstile](https://www.cloudflare.com/products/turnstile/) |
| Error and performance visibility | Sentry | Free developer tier | [sentry.io/pricing](https://sentry.io/pricing/) |

Rate limiting today is a Postgres RPC (`rate_limit_hit`). That is correct and
costs nothing extra, and it should stay until the write volume justifies moving
it. Upstash is listed because that move is foreseeable, not because it is due.

---

## 3. The esports problem, stated honestly

`esports` is an approved Call category and it is the one category with no
affordable automatic resolver. This is not a gap I can close by picking a
cheaper vendor.

- **PandaScore** is priced per title. A project covering League, CS2, Dota 2 and
  Valorant is roughly 1,600 EUR a month for historical data and around 4,000 EUR
  a month with live data. Its stats plans also explicitly prohibit betting
  adjacent usage, and a Call on a match outcome sits close enough to that line
  to be a real contractual risk.
  [pandascore.co/pricing](https://www.pandascore.co/pricing)
- **Abios** licenses data per tournament and per publisher, so terms and
  availability differ match to match. It is enterprise priced.
  [abiosgaming.com/packaging](https://abiosgaming.com/packaging)
- **Liquipedia LPDB** is genuinely free, but only for non commercial use, and it
  requires the consuming project to be open sourced. Ravenspire is neither.
  [liquipedia.net/api-terms-of-use](https://liquipedia.net/api-terms-of-use)

**The decision this forces:** esports Calls should ship on the `community` or
`manual` resolver rather than waiting on a price we will not pay. Both resolver
kinds are already declared in `lib/calls/types.ts` and are rejected at creation
until implemented, so the stored shape does not have to change. A community
resolved esports Call is also arguably the better product: the outcome of a
match is common knowledge to the people making the Call, which is exactly the
condition under which community resolution is trustworthy.

The alternative, spending 1,600 EUR a month before the realm has members, is not
a trade worth making.

---

## 4. Deliberately not added

- **Twitter or X API.** Read access is priced far above what the feature would
  return, and the platform already has its own posting surface.
- **A second price oracle.** DexScreener plus CoinGecko already gives one
  fallback. A third adds failure modes, not accuracy.
- **A hosted vector database.** Postgres with pgvector is already available in
  Supabase and is enough for anything Raven AI needs at this size.
- **An analytics vendor.** Vercel Web Analytics is already present.

---

## 5. What to set in Vercel next

In priority order, because each one lights a surface that is currently dark:

1. `CRON_SECRET`, which is a security requirement, not a feature.
2. `ANTHROPIC_API_KEY`, which lights every Raven AI surface.
3. `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`, which
   light the live audio courts on the free Build tier.
4. `GOLDRUSH_API_KEY`, `ZEROX_API_KEY`, `GOPLUS_APP_KEY`, `GOPLUS_APP_SECRET`,
   which light the Vault and the scanner.
