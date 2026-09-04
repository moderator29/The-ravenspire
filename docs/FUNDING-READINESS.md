# Funding Readiness: the audit, the pipeline, and the scorecard

Date: 2026-08-27. This document is the working record of the funding-readiness
sprint: a fresh two-track audit of the current code (not the stale findings in
`docs/AUDIT.md`, most of which are fixed), a prioritized pipeline, and an
honest scorecard. It exists so that anyone, founder, investor, or the next
session, can see what was found, what was fixed, and what is deliberately not
being built.

Priorities: P0 blocks production or is exploitable. P1 is a major product or
security defect. P2 is important polish and hardening. P3 is future work.
DO NOT BUILD is scope that would dilute the product.

---

## 1. What the audit confirmed is already strong

These were verified against current source and should not be re-audited:

- On-chain verification (`lib/chain/verify-transfer.ts`, `verify-mint.ts`):
  three-verdict model, sender check, confirmation depth, contract-emitted logs
  only. Better than most funded projects ship.
- Collectible claims, provably fair chests, the Bazaar reserve/pay flow, and
  commerce checkout are idempotent, server-priced, conditionally transitioned,
  and genuinely non-custodial.
- All cron endpoints carry the bearer secret and fail closed in production.
- Auth (`lib/auth/server.ts`) and the award ceiling (`lib/points.ts` with
  `award_capped`) are correct and well reasoned.
- RLS: post and comment visibility enforced in the database; `profiles` locked
  to a named column grant; economy RPCs are service-role only.
- Rule 4 holds server-side: no mock, seeded, or invented data anywhere.
- Secrets hygiene is clean; only `.env.example` is tracked.
- Frontend: zero em dashes, no leftover duplicate route trees, no TODO/FIXME
  debris, `rounded-full` only where allowed, the focus ring is unlayered and
  cannot be defeated by a utility class.
- The design system is applied: archetype shells do real work, densities are
  measured, and most surfaces read as intentionally designed.

## 2. MUST SHIP BEFORE FUNDRAISING (all being landed in this sprint)

Security and correctness (backend):

1. P0. `/api/blocks`: PostgREST filter injection into an unscoped DELETE on
   `follows`. Any member could erase the entire social graph. Fixed with UUID
   validation and scoped deletes.
2. P0. Commerce webhook read the wrong signature header (`stripe-signature`
   instead of Coinbase's `x-cc-webhook-signature`), so no order could ever be
   paid. The entire revenue path was dead. Fixed behind the provider
   interface, with an HMAC replay test.
3. P0. `POST /api/posts` had no rate limit and could trigger paid Anthropic
   calls per post via @raven mentions. Metered per member, plus a realm-wide
   daily cap on the mention path.
4. P1. Referral activation and duel victory minted uncapped Renown and Glory
   (no category, so they bypassed the daily allowances). Categorized, and the
   activation write made race-safe.
5. P1. Ballot privacy: `poll_votes` and `duel_votes` were publicly selectable
   with the anon key, exposing who voted for what. Policies flipped to
   `using (false)` by migration.
6. P1. Tips could skip on-chain verification by omitting `chain_id`. Now
   required and validated.
7. P1. The War's stateless settle path let a client declare victories without
   a server session. Removed; `battle_id` is mandatory; War gold capped.
8. P1. The trade feed served client-supplied USD amounts under a verified
   badge. The feed no longer vouches for figures it did not check.
9. P1. Prompt injection hardening at the two Herald chokepoints: member text
   is delimited as data, and the Herald will not repeat addresses or state
   presale policy from member content.
10. P1. Missing hot-path indexes: `follows(followee_id)` and
    `referrals(referrer_id)`.

Product and funnel (frontend):

11. P0. Every landing CTA dead-ended a signed-out visitor back to the landing
    page (about 30 links, including the hero chips). The gate now routes to
    `/signin?next=<destination>` so every click lands somewhere intentional.
12. P1. "See the realm" showed two empty grey frames where the product should
    be. Rebuilt as finished vignettes with no invented data.
13. P1. The `reliquary_live` launch flag was wired to nothing; flipping it on
    launch day would have changed nothing. Now read server-side like the
    Mercer and Warchests.
14. P1. The onboarding tour rendered under the mobile dock (raw `z-50` under
    `z-nav`), so a new member's first screen was broken. Moved to `z-modal`
    and portaled.
15. P1. `/keep` could hang on its skeleton forever on a null profile read.
    Error state plus deadline added.
16. P1. Onboarding had two authorities for "onboarded" that contradicted each
    other and could bounce a member back to the oath after a server error.
    One authority now.
17. P1/P2. Copy that contradicted the code: the sitemap advertised gated and
    retired pages, the roadmap hardcoded counts that had drifted from the
    catalog source files, the War hub sold a deleted War Pass, and the Throne
    page labelled a hardcoded value as "Your rank". All derived or corrected.
18. P1. About 1,600 lines of confirmed dead code deleted (superseded commerce
    subtree, unused gate and placeholder components, the old send flow), and
    the internal kitchen-sink page returns 404 in production.

## 3. FAST WINS (also landing in this sprint)

- Zero lint errors (was 5 React compiler errors); the CI lint step can become
  a gate once the warning backlog clears.
- IP rate limits on the public data proxies (`/api/coin`, `/api/token`,
  `/api/watch`, `/api/houses`, `/api/calls/caller`) so a shell loop cannot
  burn the free-tier quotas.
- Fail-closed rate limiting on every paid AI route: a limiter outage degrades
  the Herald, never the bank balance.
- A shared `lib/validate.ts` applied to every value that reaches a PostgREST
  filter string, so the injection class is closed, not the instance.
- Raw z-index uses mapped to the token scale, and the house-rules checker
  extended to catch bare `z-{n}` on fixed or sticky elements.
- Contextual back controls on the twelve tool surfaces that fell back to
  `/home`.
- The landing glow budget cut to earned ornament only (rule 21).

## 4. P2 backlog (post-sprint, pre-launch)

- Standardize error bodies on `{ error: code, message?: prose }` so clients
  can branch on more than status codes.
- Move the four inline full-screen overlays fully onto the Modal/Sheet
  primitives where this sprint only portaled them.
- Decide the two orphaned admin commerce routes (refund, redemption): build
  the operator panel or remove them. A refund path with no UI cannot be
  operated.
- Poll display counts use read-then-write and can drift under concurrency
  (the ballot table stays correct). Move the recount into an RPC.
- Magic-byte check on uploads; bind the MoonPay onramp signature to the
  profile wallet; identity column for season ids; move the streak advance out
  of GET.
- The public read tier: consider making `/chronicle`, `/calls`, `/houses`,
  `/leaderboards`, and the sealed storefronts genuinely readable signed out.
  This sprint routes them through signin; a public tier is the better funnel
  but needs each page audited for auth assumptions.

## 5. P3 / future

- Comment-only follow-up migration for the four Bazaar SQL comments that
  still say fees go to the Coffers (the code and UI are correct: the
  Exchequer takes the fee).
- Event cards rendered in the Ravenry (the spine is written and readable;
  the feed does not render it yet).
- Renown tiers that unlock capabilities; the seven remaining Crests; the
  points claim once distribution is decided.
- Wallet-activity indexing for follow buy/sell alerts.
- Email or Telegram re-engagement (keys declared, no delivery code exists).

## 6. DO NOT BUILD

- Claim the Throne as a destination. The decision is recorded in three places
  in the code; its mechanics dissolved into the Ravenry and the Houses. This
  sprint removes the last stray links to it.
- SUPERSEDED (September 2026): this entry read "no on-platform presale or
  whitelist flow, the presale runs on an external launchpad, copy stays
  Presale coming soon". The founder reversed that decision and Season Zero,
  the founding round, now runs inside the platform at `/season-zero`
  (September 1 to 20, 2026; softcap 6 ETH, hardcap 15 ETH, 7 percent of
  supply at a fixed rate, non-custodial and wallet to wallet, every
  contribution verified on chain). `lib/season-zero.ts` is the single source
  of truth for its numbers and AGENTS.md rule 7 states the policy. Do not act
  on the retired instruction: removing the round would delete a live funding
  surface. What does still hold is the narrower rule it was protecting, which
  is that the realm never invents a sale, a date, a price or an address, and
  never announces one that is not in `lib/season-zero.ts`.
- A price display for the storefronts while `COMMERCE_PRICES_CONFIRMED` is
  unset. The gate is deliberate; flipping it is a founder decision.
- The on-chain staking contract in this sprint. The Forge is already the
  honest sealed version and costs nothing while sealed.
- Paid gating or creator monetization. Off by founder decision.
- A schema validation framework rewrite across all 118 routes. The shared
  validators cover the dangerous surface; wholesale rewriting is churn.

## 7. Investor-readiness scorecard

Scored honestly after this sprint's fixes. The weakest areas are the ones
with the lowest numbers, and they are the next priorities.

| Area | Score | Honest read |
| --- | --- | --- |
| Product | 8/10 | The core loops (feed, Calls, Houses, War, tools) are real and connected. The event spine not rendering in the feed is the visible gap. |
| UX | 8/10 | Funnel fixed, gates reconciled, back controls everywhere. The public read tier would lift it further. |
| UI | 8/10 | A real design system, applied. Post-glow-diet the landing reads intentional. |
| Backend | 8/10 | Money paths idempotent and verified; the exploit class closed; validation consolidated. |
| Security | 8/10 | The P0s are gone, RLS is tight, prompts are hardened. An external review before mainnet money flows is still advised. |
| Technology | 8/10 | Next 16, strict TS, RLS, non-custodial signing, real AI. No invented infrastructure. |
| Performance | 7/10 | Hot indexes added, caches exist, public proxies limited. No load testing yet. |
| Mobile | 7/10 | Real adaptive layouts and touch floors; the z-order collisions are fixed. Not yet field-tested on devices. |
| Brand | 9/10 | Distinctive, coherent, and enforced by a checker. Very few products have this. |
| Traction readiness | 6/10 | Honest live stats exist and referral capture works, but analytics beyond that are thin. Build the measurement loop next. |
| Business model | 6/10 | Fee rails exist (Exchequer, 0.5 percent swap fee, commerce) and now actually work (webhook fix), but none is proven with volume. |
| Investor readiness | 7/10 | The story is coherent, the product is demonstrable end to end, the numbers shown are real. |
| Launch readiness | 7/10 | Launch levers now fire, cron and CI are in place. Needs env keys set in production and a staged rollout. |

Weakest areas, in order: traction measurement, business model proof,
performance under load. Those are the post-sprint priorities.

## 8. The five-minute demo path

The strongest honest walkthrough, in order:

1. The landing page, scrolling the story: what it is, the tools, the Herald,
   non-custodial promise, the games, the collection, tokenomics, roadmap.
2. Sign in with X or email; the wallet is created silently; the oath and the
   tour (now correctly above the dock).
3. The Ravenry: post, mention @raven, watch a real model reply in thread.
4. Seal a Call: real volatility-derived difficulty, stated confidence, the
   Herald's read before sealing.
5. The Vault and the Swap: live balances, a real quote, the signing ceiling.
6. A House hall and the Roll of Honour: size-neutral standings, computed
   leadership.
7. The War: one battle, server-settled rewards.
8. The admin console: moderation queue, audit log, real stats. This is the
   slide that says "we run this like a real service".
