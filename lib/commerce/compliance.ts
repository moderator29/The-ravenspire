import "server-only";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { CHEST_CATALOG, MERCH_CATALOG } from "@/lib/commerce/catalog";
import { majorToMinor } from "@/lib/commerce/money";

/* THE COMPLIANCE GUARDRAILS: what the realm refuses to do, and why.
 *
 * WHAT THIS FILE IS
 * It is the numbers, and nothing else. Every threshold the commerce guardrails
 * enforce is declared here once, justified here, asserted here at module load,
 * and passed into Postgres as a parameter. The DECISIONS live in
 * public.commerce_checkout_guard and public.alms_claim, because a spend cap
 * that is read and then written in two round trips is not a cap: ten concurrent
 * checkouts each read a spend of zero and all ten pass. The check and the order
 * insert have to be one transaction under one lock, and only the database can
 * do that.
 *
 * So the division of labour is the same one public.chest_open and
 * public.craft_cards already use, with one deliberate sharpening: the SQL
 * functions declare NO DEFAULTS for any threshold. Every one is a required
 * parameter. That is not fussiness. A default in the function body would be a
 * second copy of a number that also lives here, and the two would drift the
 * first time somebody tuned one of them, silently, in the direction of taking
 * more money. A required parameter cannot drift because it cannot exist in two
 * places.
 *
 * WHAT THIS FILE IS NOT
 * It is not legal advice and it does not claim compliance with any law. Nobody
 * who wrote it is a lawyer. What it does is state, plainly enough for a real
 * adviser to read and correct, exactly what the realm enforces and exactly what
 * it does not. Every guardrail below carries its own "what this does not cover"
 * paragraph, and those paragraphs are the important half of the file.
 *
 * THE FIVE, and the risk each one answers (section 34, item 2: mystery boxes
 * carry gambling optics; the answers are exact printed odds, a guaranteed floor
 * per box, no cash-out promises and no invented scarcity).
 *
 *   1. THE ALMS, a free method of entry. The paid random-reward mechanic has a
 *      genuinely free path to the same reward. Section "THE ALMS" below.
 *   2. THE AGE GATE. Recorded on the server, gating the paid paths only.
 *   3. SPEND CAPS. A ceiling per member over two rolling windows, computed from
 *      real order history at the moment of checkout.
 *   4. COOLING OFF. A velocity brake and an informed-consent interruption, both
 *      of which cost a member time they cannot click past.
 *   5. GEO. What can honestly be established with no paid service, which is
 *      less than it sounds. See lib/commerce/geo.ts, which is deliberately a
 *      separate file because it is the one guardrail whose honest answer is
 *      "not really, and here is the seam".
 */

/* ------------------------------------------------------------------
 * 1. THE AGE GATE
 * ------------------------------------------------------------------
 *
 * WHAT THE REALM ASKS: one question, "are you at least eighteen", answered
 * once. WHAT THE REALM STORES: that it was answered, when, and against which
 * minimum. It does NOT store a date of birth, and that is a deliberate refusal
 * rather than an oversight. A birth date is a piece of identifying data the
 * realm would then have to protect, disclose, retain and delete, and it buys
 * nothing here: the gate is "at least eighteen", not "how old exactly", so the
 * answer to the only question asked is a boolean and the boolean is what is
 * kept. The minimum in force at the time is stored alongside it so that raising
 * the minimum later re-asks everyone rather than silently grandfathering them.
 *
 * WHY EIGHTEEN: it is the highest of the common thresholds rather than the
 * lowest, so the realm is not tuning its age floor to the most permissive
 * jurisdiction it can find. A jurisdiction requiring more than eighteen exists
 * and is not covered; see below.
 *
 * WHAT THIS DOES NOT COVER, plainly:
 *   - It is a SELF DECLARATION. It is not identity verification and nothing in
 *     the product should ever describe it as one. A member who types the wrong
 *     answer passes. Real verification needs a document or credit check
 *     provider, which is a paid service (rule 19), and the seam for one is the
 *     age_verified_at and age_verification_method columns, which nothing writes
 *     today.
 *   - It does not know a jurisdiction with a higher minimum. Eighteen is the
 *     one number asked everywhere.
 *   - It gates the PAID paths and the Alms, and nothing else. The realm does
 *     not ask a member's age to read the Ravenry or make a Call, because a
 *     product that demands an age to be looked at collects data it has no
 *     reason to hold. */
export const AGE_MINIMUM_YEARS = 18;

/* ------------------------------------------------------------------
 * 2. SPEND CAPS
 * ------------------------------------------------------------------
 *
 * A ceiling per member over two rolling windows, checked at checkout against
 * real order history and never against anything the client sends. The client
 * has no counter to tamper with because the client is never given one: the
 * totals are computed inside the guard function, in the same transaction that
 * inserts the order.
 *
 * THE NUMBERS, and why each is that number. The most expensive single thing in
 * the realm is the King's Reliquary at 54.86.
 *
 *   250 in 24 hours. Four of the most expensive chest in one day, plus merch,
 *   which is past any honest collecting session and well short of the kind of
 *   day somebody regrets. A cap that a normal member ever meets is a broken
 *   cap, and a cap nobody could ever meet is decorative; this one sits between.
 *
 *   1,000 in 30 days. Roughly eighteen top chests a month. Deliberately low for
 *   a launch, because the two directions are not symmetrical: raising a cap
 *   later is a decision the founder makes calmly, and lowering one after
 *   members have already been allowed to spend past it is a decision made
 *   inside a complaint.
 *
 * WHICH ORDERS COUNT. Paid and fulfilled orders inside the window, always.
 * Refunded and cancelled orders never, because that money came back. And
 * pending orders younger than PENDING_ORDER_GRACE_MINUTES, because a pending
 * order is a live checkout session the member can still complete, and a cap
 * that ignored them could be walked straight through by opening twenty sessions
 * before paying any of them. A pending order older than the grace is an
 * abandoned session and stops counting, so an abandoned cart never holds a
 * member's ceiling hostage.
 *
 * WHAT THIS DOES NOT COVER:
 *   - It is PER MEMBER, keyed on the profile. One person with three accounts
 *     has three ceilings. Nothing short of identity verification changes that,
 *     and identity verification is a paid service.
 *   - It counts what the realm charged. It does not and cannot see what a
 *     member spends on the secondary market, where the payment is wallet to
 *     wallet and the platform is not a party to it (section 45).
 *   - It is a ceiling, not a judgement. It does not know whether a member can
 *     afford what is under it. */
export const SPEND_CAP_DAY_MINOR = majorToMinor(250);
export const SPEND_CAP_DAY_WINDOW_HOURS = 24;
export const SPEND_CAP_MONTH_MINOR = majorToMinor(1_000);
export const SPEND_CAP_MONTH_WINDOW_HOURS = 24 * 30;

/* How long an unpaid checkout session keeps counting against the cap. Stripe
   sessions expire after 24 hours, but a member who has not paid within an hour
   has in practice abandoned it, and holding a ceiling for a day against a
   session nobody completed punishes the wrong person. */
export const PENDING_ORDER_GRACE_MINUTES = 60;

/* ------------------------------------------------------------------
 * 3. COOLING OFF
 * ------------------------------------------------------------------
 *
 * The brief for this one was the sharpest: something that notices a member
 * spending unusually fast and INTERRUPTS, rather than a dark pattern that
 * encourages them. So it is two mechanisms, and neither of them can be clicked
 * past, which is the whole test of whether an interruption is real.
 *
 * THE VELOCITY BRAKE. Four paid orders inside sixty minutes and checkout stops
 * until the oldest of them falls out of the window. It is a pause, not a ban,
 * it clears itself, and the response says exactly when. Four is chosen because
 * three is reachable by an ordinary member buying a chest, liking what came
 * out, and buying two more; four inside an hour is a pattern rather than a
 * purchase. The brake counts PAID orders only, because the signal is money
 * actually leaving, not sessions opened.
 *
 * THE INFORMED CONSENT INTERRUPTION. Once a member's real 30 day spend would
 * pass 150, checkout refuses and hands back their actual total. Continuing
 * requires a separate, explicit acknowledgement, recorded on the server with
 * the real number the member was shown, and that acknowledgement expires after
 * 24 hours. So a member spending steadily meets their own running total, in
 * plain figures, once a day, for as long as they keep spending.
 *
 * Two things make this an interruption rather than theatre. The threshold is
 * computed server side from order history, so there is no client state to skip.
 * And the number recorded is the one the SERVER computed, not one the client
 * sent, so the acknowledgement is evidence of what the member was actually
 * shown rather than of what they claimed to have seen.
 *
 * THE SELF SET CAP, which is the part that matters most and costs least. A
 * member may set their own ceiling below the realm's, and the asymmetry is the
 * entire point: LOWERING IT TAKES EFFECT IMMEDIATELY, raising it takes 24
 * hours. That asymmetry is the difference between a self-limit and a slider. A
 * limit a member can raise in the moment they want to raise it is not a limit,
 * it is a speed bump they installed themselves and then removed, and every
 * responsible-play regime that has looked at this has landed on the same shape.
 *
 * WHAT THIS DOES NOT COVER:
 *   - It cannot tell distress from enthusiasm. It sees a rate, not a person.
 *   - There is no exclusion register, no permanent self-exclusion, and no way
 *     for a member to lock themselves out of commerce for a fixed term. That is
 *     a real feature this deliberately does not claim to be.
 *   - It does not notify anybody. A member spending fast is interrupted; no
 *     human is paged, because there is no human on a rota to page. */
export const VELOCITY_PAID_ORDERS = 4;
export const VELOCITY_WINDOW_MINUTES = 60;

/* The 30 day spend past which every further purchase needs a fresh, explicit
   acknowledgement of the member's real running total.
 *
 * 150, and the number is chosen against the DAY cap rather than the month cap,
 * which is the part worth explaining. An interruption is only worth having if
 * a member meets it BEFORE they meet a wall, in both windows. Set at 250 it
 * would equal the 24 hour ceiling, so a member spending fast inside a single
 * day would be hard stopped without ever having been shown their own total,
 * and the informed consent step would only ever fire across days. At 150 it
 * fires on a realistic third chest, in either window, which is where an
 * interruption belongs: early enough to be information, late enough not to be
 * nagging. The relationship is asserted below rather than trusted. */
export const SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR = majorToMinor(150);

/* How long an acknowledgement stands. A day, so a member who keeps spending
   keeps meeting their own total, and a member who stops is not nagged. */
export const SPEND_ACKNOWLEDGEMENT_VALID_HOURS = 24;

/* Raising a self-set cap waits this long. Lowering it does not wait at all. */
export const SELF_CAP_RAISE_DELAY_HOURS = 24;

/* ------------------------------------------------------------------
 * 4. THE ALMS, the free method of entry
 * ------------------------------------------------------------------
 *
 * The most important guardrail here, and the one with the least room to be
 * clever. A paid random-reward mechanic commonly needs a genuinely free path to
 * the same reward, of equal dignity: not a worse prize, not a longer wait for a
 * smaller thing, not a form buried three screens deep. The realm calls it the
 * Alms, which is what it is: a thing given, asking nothing back.
 *
 * WHAT THE FREE PATH GRANTS. A real Squire's Chest. Not a token, not a coupon,
 * not a discount, not a special "free" chest with its own quieter odds. It is a
 * row in chest_entitlements exactly like a purchased one, differing only in
 * source_kind, and it opens through the same route, against the same committed
 * seed, on the same printed odds table, with the same guaranteed floor and the
 * same provable reveal. There is no code path anywhere that reads source_kind
 * and rolls differently, and there must never be one.
 *
 * THE SAME PRIZES ARE REACHABLE. The Squire's Chest deals three cards at 0.6%
 * mythic each, so a Mythic, the rarest thing the realm mints, is reachable
 * through the free path. That is asserted at module load below rather than
 * asserted in prose, because it is the single property that decides whether
 * this is a free entry or a consolation prize, and a future odds retune that
 * zeroed mythic on the entry tier would destroy it silently.
 *
 * ABUSE, which is the whole difficulty. A free entry one person can take a
 * thousand times is not compliance, it is a faucet, and a faucet pointed at a
 * capped-supply collectible is worse than no free path at all because it
 * destroys the scarcity that made the paid path honest. Four defences, all
 * server side, none of them individually sufficient:
 *
 *   ONE PER MEMBER PER 30 DAYS. The same window as the spend cap, so a member
 *   reasons about one calendar rather than two.
 *
 *   THE ACCOUNT MUST BE 7 DAYS OLD, onboarded, and carry a handle. Registration
 *   is free and instant, so an account-age floor is the cheapest thing that
 *   converts "make a thousand accounts now" into "make a thousand accounts a
 *   week ago and keep them alive", which is a materially more expensive attack.
 *   It costs an honest member nothing they notice, because they were here a
 *   week before the chests interested them.
 *
 *   A REALM-WIDE CEILING PER UTC DAY. This is the one that actually contains a
 *   determined attacker, because it bounds the damage regardless of how many
 *   accounts they hold. Twenty five chests a day is 9,125 a year against per
 *   card mint caps of 5,000 Rare down to 75 Mythic, which is a real cost the
 *   realm can absorb and an attacker cannot multiply.
 *
 *   THE SAME AGE GATE AS THE PAID PATH. A free mystery box is still a mystery
 *   box.
 *
 * A NOTE ON THE CEILING, because it cuts both ways. A ceiling that is reached
 * every day has stopped being a free method of entry and has become a lottery
 * for the free method of entry, which is not the same thing at all. The status
 * endpoint reports how many remain today precisely so this is visible, and if
 * it is regularly exhausted the founder must raise it rather than let the free
 * path quietly become unavailable. That is an operating commitment, not a code
 * comment: nothing in this file can enforce it.
 *
 * WHAT THIS DOES NOT COVER, and a real adviser should read this list first:
 *   - IT DOES NOT STOP SYBIL. One person with fifty aged, onboarded accounts
 *     gets fifty entries. Only identity verification changes that, and identity
 *     verification is a paid service. The realm-wide ceiling is the containment,
 *     not the prevention, and the distinction is worth stating out loud.
 *   - IT COVERS THE DIGITAL CHEST MECHANIC ONLY. There is no free path to merch
 *     and none to the physical King's Reliquary, which has real per-unit
 *     printing and shipping cost. Whether the free entry must reach the top
 *     tier rather than the entry tier is exactly the kind of question that needs
 *     an adviser and not a developer.
 *   - IT IS NOT A MAIL-IN. The classic free-entry form is a postcard, which is
 *     free to the entrant and deliberately high friction. That would need an
 *     address to receive post at and a human to open it, and the realm has
 *     neither. The seam is the alms_claim function, which takes the grant
 *     conditions as parameters and would accept a second source.
 *   - IT IS RATE LIMITED AND FLAG GATED to exactly the same chapter as the paid
 *     path, never more narrowly. If the chests are sealed, nobody can buy one
 *     either, so there is nothing to be an alternative to. */
export const ALMS_CHEST_SKU = "squires-chest";
export const ALMS_PER_MEMBER_DAYS = 30;
export const ALMS_MIN_ACCOUNT_AGE_DAYS = 7;
export const ALMS_REALM_DAILY_CEILING = 25;

/* ------------------------------------------------------------------
 * The assertions. Every one of these is a property that a well meaning tuning
 * change would destroy silently, which is the only kind worth asserting.
 * ------------------------------------------------------------------ */

/* The dearest single thing the realm sells. Derived, never typed, so a price
   change moves it. */
const DEAREST_ITEM_MINOR = Math.max(
  ...CHEST_CATALOG.map((c) => c.priceMinor),
  ...MERCH_CATALOG.map((m) => m.priceMinor)
);

if (SPEND_CAP_DAY_MINOR <= DEAREST_ITEM_MINOR) {
  /* A cap below the dearest item is not a cap, it is a closure: the item can
     never be bought by anybody and the shop is quietly broken. */
  throw new Error(
    `The 24 hour spend cap of ${SPEND_CAP_DAY_MINOR} is at or below the dearest item at ${DEAREST_ITEM_MINOR}. A cap that forbids a single purchase has closed the shop rather than limited it.`
  );
}

if (SPEND_CAP_MONTH_MINOR <= SPEND_CAP_DAY_MINOR) {
  /* A month cap at or below the day cap is unreachable and therefore
     decorative: the day cap would always bite first. */
  throw new Error(
    `The 30 day spend cap of ${SPEND_CAP_MONTH_MINOR} is at or below the 24 hour cap of ${SPEND_CAP_DAY_MINOR}, so it can never be the binding limit.`
  );
}

if (SPEND_CAP_MONTH_WINDOW_HOURS <= SPEND_CAP_DAY_WINDOW_HOURS) {
  throw new Error(
    `The 30 day window of ${SPEND_CAP_MONTH_WINDOW_HOURS} hours must be longer than the 24 hour window of ${SPEND_CAP_DAY_WINDOW_HOURS}.`
  );
}

if (SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR >= SPEND_CAP_DAY_MINOR) {
  /* An interruption at or above a wall never fires ahead of it: the cap
     refuses first and the member is stopped without ever having been shown
     their own total. Tested against the SHORTER window's cap, because that is
     the one a fast spender meets first and the one an interruption most needs
     to precede. Clearing the day cap clears the month cap too, since the month
     cap is asserted above to be the larger of the two. */
  throw new Error(
    `The acknowledgement threshold of ${SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR} is at or above the 24 hour cap of ${SPEND_CAP_DAY_MINOR}, so a member spending fast would meet the wall without ever meeting their own running total.`
  );
}

if (VELOCITY_PAID_ORDERS < 2) {
  /* A brake that fires on a single purchase is not a velocity signal, it is a
     ban on buying twice, and it would read to a member as the shop being
     broken. */
  throw new Error(
    `The velocity brake fires at ${VELOCITY_PAID_ORDERS} paid orders, which would stop a member after their first purchase.`
  );
}

if (PENDING_ORDER_GRACE_MINUTES * 60 >= SPEND_CAP_DAY_WINDOW_HOURS * 3600) {
  /* The grace has to sit inside the shortest window, or an abandoned session
     counts against a window it is no longer inside. */
  throw new Error(
    `The pending order grace of ${PENDING_ORDER_GRACE_MINUTES} minutes must be shorter than the 24 hour spend window.`
  );
}

const ALMS_TIER = CHEST_TIERS.find((t) => t.sku === ALMS_CHEST_SKU);

if (!ALMS_TIER) {
  throw new Error(
    `The Alms grant ${ALMS_CHEST_SKU}, which is not a chest tier. A free method of entry that grants nothing is not one.`
  );
}

if (ALMS_TIER.kind !== "digital") {
  /* A physical box cannot be the free path: it has real printing and shipping
     cost per unit and it does not open in the app. */
  throw new Error(
    `The Alms grant ${ALMS_CHEST_SKU}, which is a ${ALMS_TIER.kind} chest. The free path must be a chest that opens in the realm.`
  );
}

const ALMS_TOP_RARITY_ODDS = ALMS_TIER.odds.mythic;

if (!(ALMS_TOP_RARITY_ODDS > 0)) {
  /* THE PROPERTY THE WHOLE GUARDRAIL RESTS ON. If the free chest cannot reach
     the rarest thing the realm mints, the free path is a consolation prize
     wearing the name of an entry, and every claim made about it elsewhere in
     this file becomes false. A retune that zeroed mythic on the entry tier for
     perfectly good economic reasons would do exactly that, and nothing else in
     the codebase would notice. */
  throw new Error(
    `The Alms chest ${ALMS_CHEST_SKU} has ${ALMS_TOP_RARITY_ODDS}% mythic odds, so the free path cannot reach the realm's rarest card. A free entry must be able to win what the paid entry can win.`
  );
}

if (ALMS_MIN_ACCOUNT_AGE_DAYS >= ALMS_PER_MEMBER_DAYS) {
  /* An account-age floor at or above the claim window means a member's second
     claim is gated by a condition they met before their first, which is not a
     defence, it is a typo waiting to look like one. */
  throw new Error(
    `The Alms account age floor of ${ALMS_MIN_ACCOUNT_AGE_DAYS} days must be shorter than the ${ALMS_PER_MEMBER_DAYS} day claim window.`
  );
}

if (!Number.isInteger(ALMS_REALM_DAILY_CEILING) || ALMS_REALM_DAILY_CEILING < 1) {
  throw new Error(
    `The Alms realm ceiling of ${ALMS_REALM_DAILY_CEILING} would close the free path entirely. A free method of entry that grants nothing on any day is not one.`
  );
}

/* ------------------------------------------------------------------
 * The parameter bundles handed to Postgres.
 * ------------------------------------------------------------------
 *
 * These exist so that a route cannot pass a threshold this file did not
 * declare, and so that the SQL functions can require every threshold rather
 * than defaulting any of them. Read the header for why that matters. */

export interface CheckoutGuardParams {
  p_age_minimum: number;
  p_day_window_hours: number;
  p_day_cap_minor: number;
  p_month_window_hours: number;
  p_month_cap_minor: number;
  p_pending_grace_minutes: number;
  p_velocity_orders: number;
  p_velocity_window_minutes: number;
  p_ack_threshold_minor: number;
  p_ack_valid_hours: number;
}

export function checkoutGuardParams(): CheckoutGuardParams {
  return {
    p_age_minimum: AGE_MINIMUM_YEARS,
    p_day_window_hours: SPEND_CAP_DAY_WINDOW_HOURS,
    p_day_cap_minor: SPEND_CAP_DAY_MINOR,
    p_month_window_hours: SPEND_CAP_MONTH_WINDOW_HOURS,
    p_month_cap_minor: SPEND_CAP_MONTH_MINOR,
    p_pending_grace_minutes: PENDING_ORDER_GRACE_MINUTES,
    p_velocity_orders: VELOCITY_PAID_ORDERS,
    p_velocity_window_minutes: VELOCITY_WINDOW_MINUTES,
    p_ack_threshold_minor: SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR,
    p_ack_valid_hours: SPEND_ACKNOWLEDGEMENT_VALID_HOURS,
  };
}

export interface AlmsClaimParams {
  p_chest_sku: string;
  p_window_days: number;
  p_min_account_age_days: number;
  p_daily_ceiling: number;
  p_age_minimum: number;
}

export function almsClaimParams(): AlmsClaimParams {
  return {
    p_chest_sku: ALMS_CHEST_SKU,
    p_window_days: ALMS_PER_MEMBER_DAYS,
    p_min_account_age_days: ALMS_MIN_ACCOUNT_AGE_DAYS,
    p_daily_ceiling: ALMS_REALM_DAILY_CEILING,
    p_age_minimum: AGE_MINIMUM_YEARS,
  };
}

/* ------------------------------------------------------------------
 * The refusal vocabulary.
 * ------------------------------------------------------------------
 *
 * One name per reason, shared by the guard function, the routes and the
 * surfaces, so a refusal is never rendered as a generic failure. A member
 * turned away from a purchase is owed the actual reason in words, the same
 * discipline the buy control already applies to its four sealed states. */
export const GUARD_REASONS = [
  "age_gate",
  "geo_blocked",
  "geo_unknown",
  "self_cap",
  "spend_cap_day",
  "spend_cap_month",
  "velocity",
  "acknowledgement",
] as const;

export type GuardReason = (typeof GUARD_REASONS)[number];

/* Plain words for each refusal, written to be shown to the member who met it.
   No blame, no euphemism, and a number wherever the server has one, because
   "you cannot do that right now" is the shape of a dark pattern and "you have
   spent 260 in the last thirty days" is not. */
export function guardReasonMessage(reason: GuardReason): string {
  switch (reason) {
    case "age_gate":
      return `The realm asks everyone to confirm they are at least ${AGE_MINIMUM_YEARS} before it takes payment.`;
    case "geo_blocked":
      return "The realm cannot sell to the region this request appears to come from.";
    case "geo_unknown":
      return "The realm could not establish where this request comes from, and is set to refuse rather than guess.";
    case "self_cap":
      return "This purchase would pass the limit you set for yourself.";
    case "spend_cap_day":
      return "This purchase would pass the realm's 24 hour spending limit.";
    case "spend_cap_month":
      return "This purchase would pass the realm's 30 day spending limit.";
    case "velocity":
      return "Several purchases have settled in the last hour. The realm is pausing rather than selling faster.";
    case "acknowledgement":
      return "Before this purchase, the realm wants you to see what you have spent in the last 30 days.";
  }
}

export function isGuardReason(value: unknown): value is GuardReason {
  return (
    typeof value === "string" && (GUARD_REASONS as readonly string[]).includes(value)
  );
}
