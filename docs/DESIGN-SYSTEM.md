# Ravenspire V2 design system: The Forge and the Ledger

The design law for the whole platform. Every surface, from the landing page to
the admin console, resolves to something in this document. If a screen cannot be
described using the archetypes, tabs, density and ornament rules below, the
screen is wrong, not the system.

Read `AGENTS.md` first for the non-negotiable house rules.

---

## 1. The thesis

Two registers, deliberately and visibly separated.

**The Ledger.** Roughly ninety percent of the product. Quiet, dense, fast. Flat
surfaces, hairline borders, rounded rectangles, bone text on obsidian, no
ornament at all. This is where a member reads, scans, compares and acts. It
should feel like a well made instrument.

**The Forge.** The remaining ten percent, and the only part anyone will describe
to a friend. Forged gold gradients, the 3D icon set, ember light, atmosphere,
motion with weight. This is where the realm *rewards* you: a Crest unlocking, a
Call resolving, a House overtaking a rival, a rank earned, a season closing,
the first thirty seconds of onboarding.

**The rule that makes it work: ornament is earned, never ambient.**

Fantasy products usually fail by putting ornament everywhere, which is tiring
and illegible within one session. Crypto products usually fail by being entirely
flat and soulless. Ravenspire wins by being disciplined about where the magic
goes. A member should be able to feel the difference between reading the realm
and being rewarded by it, without being told.

The corollary: **if a surface glows all the time, nothing on it means anything.**

---

## 2. Surface archetypes

Every one of the 41 routes is one of six shapes. This is what stops forty pages
becoming forty opinions.

### Stream
Vertical list of cards, effectively infinite, one column.
Ravenry, Calls, Ravens (notifications), Bookmarks, Crossroads, Search results.

- Column: `max-width: 640px`, centred. Never wider, on any display.
- Rhythm: fixed `--spacing-3` gap, variable card height. Constant gap with
  varying heights reads as rich; varying gaps read as broken.
- Cards carry a 2px accent rail on the leading edge, never a different shape.
- Ornament budget: none, except a 3D icon inside an empty state.

### Board
Ranked or tabular rows, dense, scannable, comparison is the job.
Leaderboards, Houses standings, House roster, Caller board, Champions, Admin
tables, Arsenal.

- Row height 44px comfortable, 36px compact. Compact is the desktop default.
- Rank, identity, then metrics right aligned with `tnum`. Numbers must line up.
- Zebra striping is banned. Use a hairline divider and hover lift instead.
- Ornament budget: none. A Board is a instrument, not a trophy case.

### Dossier
A subject with a hero, tabs, and panels. The archetype for anything with an
identity.
Keep and public profiles, House hall, Coin, Champion, Post detail, Call detail.

- Hero band, then tabs, then panels. Always that order.
- Hero is the one place in a Dossier that may use the Forge register: a House
  hall may carry its sigil in 3D, a Keep may carry its Renown tier crest.
- Panels sit in a two column grid at `lg`, one column below.
- Ornament budget: the hero only. Panels are Ledger.

### Console
Dense data plus controls. Reading and operating at the same time.
Ledger, Vault, Scrying Glass, Swap, Watch, Coin trading panel, Forge, DNA,
Scanner, Admin.

- This is where "too big on desktop" happens. Console is `compact` density
  always, at every breakpoint above `md`.
- Controls sit in a toolbar rail, never scattered into the content.
- Charts get `--chart-up` and `--chart-down`, never green.
- Ornament budget: zero. A Console with ornament is a toy.

### Ceremony
Full bleed, motion led, one message. The Forge register, undiluted.
Onboarding and House selection, Crest unlocked, Call resolved, rank earned,
House overtake, season close, chest opening, the coming soon chapters.

- Takes over the viewport or presents as a centred Sheet.
- 3D icon at `hero` size (192px) is the anchor.
- One sentence, one number, one action. Never a form.
- Ornament budget: unlimited. This is the whole point of the register.

### Document
A reading column. Long form, low interaction.
Chronicle, Terms, Privacy, coming soon detail.

- Column: `max-width: 680px`, `--text-secondary` body, generous leading.
- Sticky table of contents at `lg`.
- Ornament budget: a single 3D icon per section heading, at most.

---

## 3. Tabs: three kinds, three jobs

The product currently invents a tab row per page. Three patterns cover
everything, and picking the wrong one is a design bug.

### Segmented control
**When:** two to four mutually exclusive views of the same data, switched in
place, no navigation.
**Looks like:** a single bordered track holding equal width rounded rectangles,
the active one filled. Earned / Locked / All.
**Where:** Renown (earned vs locked crests), Vault (assets vs activity), Ledger
(allocation vs positions), Watch (checks vs approvals).

### Underline tabs
**When:** three to six sections of a Dossier, each a genuinely different view,
often with counts.
**Looks like:** a horizontal row of labels with an animated gold underline that
*slides* between them, counts in `--text-tertiary` beside the label.
**Where:** Keep (Ravens, Calls, Media, Crests), House hall (Feed, Roster,
Clashes, History), Coin (Chart, Holders, Activity).

### Chip rail
**When:** many options, additive or filtering rather than exclusive, and the set
can grow.
**Looks like:** horizontally scrollable rounded rectangles, no track, active
ones filled gold at low opacity.
**Where:** Ravenry feed tabs, Calls views, Scrying filters, trending cashtags,
the dock's contextual sub navigation.

**The rule:** exclusive and few, use Segmented. Sections of a subject, use
Underline. Filters and many, use Chip rail. Never mix two in one row.

---

## 4. Density

This is the fix for "on desktop something big you make it small".

The current product ships one size at every breakpoint, so a dense desktop
surface arrives as an oversized mobile block, and a comfortable mobile layout
arrives as a sparse desktop page. Responsive is not a resize.

| | Comfortable | Compact |
| --- | --- | --- |
| Row height | 44px | 36px |
| Card padding | `--spacing-4` (16) | `--spacing-3` (12) |
| Section gap | `--spacing-5` (24) | `--spacing-4` (16) |
| Body text | 14px | 13px |
| Meta text | 12px | 11px |
| Icon | 20px | 17px |

**Which archetype gets which:**

- Stream: comfortable everywhere. Reading wants air.
- Dossier: comfortable everywhere.
- Document: comfortable everywhere.
- Board: compact at `md` and above, comfortable below.
- Console: **compact always, at every breakpoint above `md`.**
- Ceremony: neither. Ceremony sets its own scale.

Mobile is never compact. Touch targets stay at 44px minimum regardless of the
density the archetype declares.

---

## 5. The card chassis

One chassis. Many bodies. This is Discord's embed model and it is the single
biggest reason a heterogeneous feed can stay calm.

Every card in the product, whether it holds a member's raven, a resolved Call,
a House standing shift, a war result or a Herald summary, shares an identical
outer shell: `--radius-xl`, `--shadow-card`, `--border-subtle`, the same padding.
**Only the interior varies.** Heterogeneity lives inside a rigid frame, never in
the frame itself.

Type is encoded by a 2px accent rail on the leading edge, never by changing the
card's shape, radius or width:

| Rail | Meaning |
| --- | --- |
| Gold | A member's raven |
| Ember | A Call, open or resolving |
| Steel | A system or realm event |
| House colour | Anything scoped to a House |
| Bright gold | A Ceremony moment inlined into a Stream |

### System cards must be quieter than human posts

The failure mode is a feed that reads like advertising, and it comes from system
cards competing on visual weight. So they are structurally lower energy: no
avatar (a flat Icon in a steel tile instead), `--text-secondary` not
`--text-primary`, `--surface-raised` not `--surface-overlay`, no glow, smaller
vertical footprint.

A member should be able to skim past a system card without effort. The existing
"hide the Herald" filter is evidence that Herald posts already feel intrusive:
fixing visual weight is the real fix, not the filter.

**Every system card carries a primary action or a dismiss.** A card you can act
on earns its slot. A card that only announces is an advertisement.

**Density cap, enforced server side:** no more than one system card per five
human posts, and never two adjacent.

---

## 6. Motion

Current motion runs 0.28s to 0.9s with one spring across 21 files. That is two
to three times too slow, and 0.6s on a hover is exactly where "cheap" comes from.

- Micro interactions: `--duration-instant` (100ms) to `--duration-fast` (150ms)
- Standard UI: `--duration-base` (220ms)
- Sheets, modals, page level: `--duration-slow` (320ms)
- Nothing in the Ledger register exceeds 320ms
- Exits run about twenty percent faster than entrances
- Entrances `--ease-out-quint`, movement `--ease-in-out-quart`, hover `ease`
- Animate `transform` and `opacity` only, never `width`, `height` or `margin`
- Anything gesture driven uses a spring, because springs preserve velocity when
  interrupted and CSS animations restart from zero

**Shared element motion is the signature.** The gold plate behind the active
dock item, the underline under the active tab, and the rail beside the active
nav row are all single elements that *slide* using `layoutId`. They never cross
fade. This is cheap to implement and it is the thing that reads as expensive.

**Motion signals arrival, not existence.** A card animating in says "this is
new". A card that pulses forever says "look at me" and becomes noise inside one
session. Ambient atmosphere loops (aurora, ember) are the only permanent motion,
and they belong to background layers only.

The Ceremony register is the exception to all of the above. A Crest unlocking
may take a full second and use whatever it needs.

---

## 7. Atmosphere without losing legibility

**Atmosphere belongs to background layers. Legibility belongs to foreground
layers. They never mix.** The existing `.realm-bg` plus `.glass` split already
gets this right and must be protected. The failure mode is putting texture *on*
the card rather than *behind* it.

- **Budget: at most two atmospheric effects visible in any viewport.** Full
  atmosphere on the landing page, the War and Ceremony surfaces, where
  atmosphere is the product. Grid and radial only inside the Ravenry, where
  reading is the product.
- **Depth comes from the light source, not shadow spread.** Every raised surface
  carries a top highlight and a bottom occlusion, lit from the upper left.
  `--shadow-forge` is the reference. Inconsistent light direction is the
  clearest tell of an amateur dark interface, and it is the one thing that will
  make this product look cheap no matter how good the rest is.
- **Noise is a banding fix first and an aesthetic second.** Near black gradients
  band on eight bit panels, which is exactly what `.realm-bg` and `.glass` are.
  A single low opacity noise layer on the body kills the banding and reads as
  forged metal. Apply once on the body, never per card, given 432 `.glass`
  instances already carry a 14px backdrop blur.

---

## 8. The 3D icon set

Two icon systems, and confusing them is a design bug.

**Flat stroke glyphs** (`components/ui/icon.tsx`) are the working icons:
buttons, navigation, dense rows, inline meta, action bars. Currency: 17px to
20px. They are never decorative.

**3D icons** (`components/ui/icon-3d.tsx`) are the expressive set: forged gold
and bone on a carved stone plinth. They are never inline in a button and never
smaller than 40px. They appear where an icon carries weight and has room:

| Placement | Size |
| --- | --- |
| Ceremony anchor, landing hero | `hero` 192px |
| Landing feature sections, House hall header | `xl` 128px |
| Empty states, onboarding House cards | `lg` 96px |
| Crest and Renown tier displays, reward rows | `md` 64px |
| Quest rows, dense achievement grids | `sm` 40px |

**Never label a 3D icon with its own name.** The icon sits with the content it
belongs to, and the surrounding copy carries the meaning. A caption under an
icon is an admission that the icon failed.

---

## 9. The Ravenry as the realm's dashboard

The Ravenry is 17 lines of code and `/swap` is 1,128. The heart of the product
is the thinnest page in it. That single comparison is the V2 problem in
miniature.

The Ravenry becomes a dashboard that happens to contain a feed:

1. **The realm strip.** A single compact row above the feed: your streak, your
   House's standing and its nearest rival, the season countdown, and how many of
   your Calls are open. Real data or nothing. Compact density, Board rules.
2. **The composer, inline.** Posting currently requires the floating button and
   a navigation to `/compose`. Every peer product puts the box in the feed. This
   is the highest leverage funnel change available.
3. **The chip rail.** For You, Following, My House, Signal, Latest.
4. **The stream itself**, card registry driven, mixing member ravens with realm
   events under the density cap in section 5.
5. **The right rail** at `xl`: your open Calls counting down, the nearest House
   rivalry, who to follow. Not a static placeholder, which is what it is today.

A member arriving should be able to see, inside one screen and without
scrolling, that something is happening and that they are part of it.

---

## 10. Responsive law

Desktop and mobile get different layouts, not the same layout scaled.

| Breakpoint | Shell |
| --- | --- |
| base to `md` | Top bar, single column, floating dock with contextual sub navigation |
| `lg` | Sidebar 272px with collapsible sections, content, no dock |
| `xl` | Sidebar, content, contextual right rail 320px |

- Stream keeps its 640px column at every width. A wide feed is a worse feed.
- Board and Console expand to fill and switch to compact density at `md`.
- Dossier panels go two column at `lg`.
- Console toolbars collapse into a Sheet below `md` rather than wrapping.
- Any table with more than four columns becomes a card list below `md`. Tables
  do not scroll horizontally on a phone.

---

## 11. Accessibility, as design constraints

These are not a checklist bolted on afterwards, they are part of the look.

- Every colour carrying text clears 4.5:1. The fill only hues (`--foe`,
  `--blood`, `--ash`) have `-text` twins for when they must carry a label.
- One `:focus-visible` ring, forged gold at 13:1, on every interactive element.
  Never `focus:outline-none` without a replacement.
- Touch targets 44px minimum regardless of declared density.
- Every icon only control carries an accessible name.
- Realtime and optimistic changes announce through a polite live region.
- Motion respects `prefers-reduced-motion`, and the Ceremony register degrades
  to a crossfade rather than being removed entirely.

---

## 12. What this replaces

| Today | V2 |
| --- | --- |
| 268 hand written buttons, zero `focus-visible` | One `Button` primitive, one focus ring |
| 432 hand written `.glass` blocks | One `Card` chassis with an accent rail |
| A tab row invented per page | Three tab patterns, chosen by job |
| 14 radius values, 13 z-index values | 6 radius rungs, 7 z-index rungs |
| One size at every breakpoint | Two densities, assigned per archetype |
| Ornament everywhere, evenly | Ledger by default, Forge where earned |
| 3 icon systems with overlapping names | Flat glyphs for work, 3D for weight |
| Motion 0.28s to 0.9s | A four rung scale topping out at 320ms |
