<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes, so APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Ravenspire house rules

These are non-negotiable. They apply to every file, every commit, every agent.
The full V2 plan lives in `docs/RAVENSPIRE-V2.md`.

## Writing

1. **No em dashes. Anywhere.** Not in code, comments, commit messages, UI copy,
   docs, or product text. Use a comma, a period, a colon, or restructure the
   sentence. This applies to en dashes used as punctuation too.
2. **No emoji as icons.** Use the `Icon` component only.
3. Realm lexicon: The Ravenry (feed), The Crossroads (explore), The Rookery
   (live), Whispers (DMs), The Vault (wallet), The Coffers (earnings), The
   Ledger (portfolio), The Scrying Glass (coin discovery), The War (game),
   @raven (the Herald AI), Houses, Renown, Glory, Calls, Crests, Keeps.

## Product

4. **Real data only.** No mock, placeholder, seeded, demo, or invented data
   anywhere, ever. Every number, balance, chart, holding and list is real or an
   honest empty state. This is a hard line.
5. **Real AI only.** Every AI surface is a real Anthropic call reasoning over
   real data. Never fake, stub, canned, or hardcode model output.
6. **Non-custodial only.** Every value transfer is signed by the member's own
   Privy embedded wallet. The platform never takes custody and never holds keys.
7. Ticker is `$RSP`, total supply 10,000,000,000. Presale runs on an external
   launchpad, never on the platform. Copy is always "Presale coming soon",
   never "no presale". Show POINTS for earned balances, never $RSP amounts.
8. **Server-authoritative rewards.** Points and Glory settle on the server
   against verified events. Never trust the client.

## Design

9. **Buttons and controls are clean rounded rectangles.** No pill or capsule
   shapes, meaning no `rounded-full` on buttons, tabs, nav items, or chips.
   Radius comes from the scale (`--radius-sm` through `--radius-2xl`). Circles
   are allowed only for avatars and genuinely circular icon buttons.
10. **Use the token scales.** Spacing, radius, elevation and z-index all come
    from `app/globals.css`. Off-scale spacing fails to compile by design. Never
    add a raw `z-[93]` or a one-off `rounded-[13px]`.
11. **Every colour that carries text must clear WCAG AA (4.5:1).** The fill-only
    hues (`--foe`, `--blood`, `--ash`) have `-text` twins for when they must
    carry a label. Never put text on a fill-only hue.
12. **Every interactive element is keyboard reachable and visibly focusable.**
    The global `:focus-visible` ring handles this; never add
    `focus:outline-none` without a replacement.
13. Brand is obsidian and forged gold, restrained ember, a single steel tone.
    Gold is a gradient, never a flat fill. Glows are warm candlelight, never
    cool. **Never green in brand surfaces**, including success states, which use
    gold. Trading up/down may use gold for up and ember for down.
14. **Motion is fast.** 100 to 150ms for micro-interactions, 150 to 250ms for
    standard UI, under 300ms for everything. Exits about 20% faster than
    entrances. Animate only `transform` and `opacity`. Ambient atmosphere loops
    (aurora, ember) are the sole exception.
15. **Responsive is not a resize.** Desktop and mobile get different layouts,
    not the same layout scaled. Dense desktop surfaces must not ship as
    oversized mobile blocks, and mobile must not ship as a squeezed desktop.
16. Every page, section and tab that can be navigated into needs a back control.
    Modals that overlay the screen must portal to `document.body`. Popovers
    anchor to their own trigger inside a `relative` box.

## Engineering

17. `npm run typecheck` and `npm run build` must both pass before any push. CI
    enforces both.
18. Prefer the primitives in `components/ui/` over raw Tailwind. If a primitive
    is missing, add it there rather than re-deriving it inline.
19. No new paid service without justification. Prefer free tiers, open source,
    and browser-native capability. Assume the budget is zero.
