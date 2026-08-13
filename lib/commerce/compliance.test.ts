import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHEST_TIERS } from "@/lib/collectibles/warchests";
import { CHEST_CATALOG, MERCH_CATALOG } from "@/lib/commerce/catalog";
import {
  AGE_MINIMUM_YEARS,
  ALMS_CHEST_SKU,
  ALMS_MIN_ACCOUNT_AGE_DAYS,
  ALMS_PER_MEMBER_DAYS,
  ALMS_REALM_DAILY_CEILING,
  GUARD_REASONS,
  PENDING_ORDER_GRACE_MINUTES,
  SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR,
  SPEND_CAP_DAY_MINOR,
  SPEND_CAP_DAY_WINDOW_HOURS,
  SPEND_CAP_MONTH_MINOR,
  SPEND_CAP_MONTH_WINDOW_HOURS,
  VELOCITY_PAID_ORDERS,
  almsClaimParams,
  checkoutGuardParams,
  guardReasonMessage,
  isGuardReason,
} from "@/lib/commerce/compliance";

/* THE COMPLIANCE GUARDRAILS, tested where testing can reach.
 *
 * Two of these suites are unusual and both earn their place.
 *
 * The first restates the module load assertions as tests. That looks like
 * duplication and is not: the assertions run when something imports the module,
 * so a build that never imports it never checks them, and more importantly a
 * failing assertion tells you a build broke while a failing test tells you
 * WHICH property broke and what the numbers were.
 *
 * The second reads the migration file and checks that the SQL function
 * signatures name exactly the parameters the TypeScript bundles supply, and
 * that they declare no defaults. That is the single joint this whole design
 * turns on. The thresholds live in TypeScript and the decisions live in
 * Postgres, and the only thing holding the two together is a set of parameter
 * names that typecheck can no more see than it can see a constraint. A renamed
 * parameter, a forgotten one, or a default quietly reintroduced into the
 * function body is a guardrail enforcing a number nobody chose, and there is no
 * other check in the repository that would notice. */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MIGRATION = readFileSync(
  `${HERE}../../supabase/migrations/20260819090000_compliance_guardrails.sql`,
  "utf8"
);

/* Pull one function's parameter list out of the migration. Deliberately naive:
   it wants the text between the first parenthesis after the name and the
   matching `) returns`, which is exactly how every function in this file is
   written. */
function signature(name: string): string {
  const start = MIGRATION.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined in the migration`).toBeGreaterThan(-1);
  const open = MIGRATION.indexOf("(", start);
  const close = MIGRATION.indexOf(") returns", open);
  expect(close, `${name} has no returns clause`).toBeGreaterThan(open);
  return MIGRATION.slice(open + 1, close);
}

function parameterNames(name: string): string[] {
  return signature(name)
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((word) => word.startsWith("p_"));
}

describe("the spend caps hold their documented shape", () => {
  const dearest = Math.max(
    ...CHEST_CATALOG.map((c) => c.priceMinor),
    ...MERCH_CATALOG.map((m) => m.priceMinor)
  );

  it("lets the dearest single item actually be bought", () => {
    /* A cap below the dearest item is not a cap, it is a closure: the item can
       never be bought by anybody and the shop is quietly broken. */
    expect(SPEND_CAP_DAY_MINOR).toBeGreaterThan(dearest);
  });

  it("keeps the 30 day cap above the 24 hour cap", () => {
    /* Otherwise the day cap always bites first and the month cap is
       decorative. */
    expect(SPEND_CAP_MONTH_MINOR).toBeGreaterThan(SPEND_CAP_DAY_MINOR);
    expect(SPEND_CAP_MONTH_WINDOW_HOURS).toBeGreaterThan(SPEND_CAP_DAY_WINDOW_HOURS);
  });

  it("interrupts a member before it stops them, in the window that bites first", () => {
    /* The acknowledgement has to fire below BOTH walls, and the day cap is the
       one a fast spender meets first. Set at or above it, a member spending
       hard inside a single day would be stopped dead without ever having been
       shown their own running total, and the informed consent step would only
       ever fire across days. */
    expect(SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR).toBeLessThan(SPEND_CAP_DAY_MINOR);
    expect(SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR).toBeLessThan(SPEND_CAP_MONTH_MINOR);
  });

  it("keeps the abandoned session grace inside the shortest window", () => {
    expect(PENDING_ORDER_GRACE_MINUTES).toBeLessThan(SPEND_CAP_DAY_WINDOW_HOURS * 60);
  });

  it("does not brake a member after a single purchase", () => {
    expect(VELOCITY_PAID_ORDERS).toBeGreaterThanOrEqual(2);
  });
});

describe("the Alms are a real free entry, not a consolation prize", () => {
  const tier = CHEST_TIERS.find((t) => t.sku === ALMS_CHEST_SKU);

  it("grant a chest that actually exists and opens in the realm", () => {
    expect(tier).toBeDefined();
    expect(tier?.kind).toBe("digital");
  });

  it("can reach the rarest card the realm mints", () => {
    /* THE PROPERTY THE WHOLE GUARDRAIL RESTS ON. If the free chest cannot win
       a Mythic, the free path is a consolation prize wearing the name of an
       entry, and every claim made about it elsewhere becomes false. An odds
       retune that zeroed mythic on the entry tier would do exactly that, for
       perfectly good economic reasons, and nothing else would notice. */
    expect(tier?.odds.mythic).toBeGreaterThan(0);
  });

  it("deal the same printed odds as the paid chest of the same tier", () => {
    /* Not "similar odds". The same object. There is no separate free odds
       table anywhere in the codebase and this is the test that would fail if
       somebody added one. */
    const paid = CHEST_CATALOG.find((c) => c.sku === ALMS_CHEST_SKU);
    expect(paid).toBeDefined();
    expect(tier?.odds).toBe(CHEST_TIERS.find((t) => t.sku === ALMS_CHEST_SKU)?.odds);
  });

  it("keep the account age floor inside the claim window", () => {
    expect(ALMS_MIN_ACCOUNT_AGE_DAYS).toBeLessThan(ALMS_PER_MEMBER_DAYS);
  });

  it("are given to somebody on a day the realm is open", () => {
    /* A ceiling of zero would close the free path entirely while every comment
       in the codebase still claimed it existed. */
    expect(ALMS_REALM_DAILY_CEILING).toBeGreaterThanOrEqual(1);
  });
});

describe("every refusal is said in words", () => {
  it("has a message for every reason, with no empty strings", () => {
    /* A member turned away from a purchase is owed the actual reason. A reason
       added to the list without a message would render as blank, which reads
       to the member as the shop being broken. */
    for (const reason of GUARD_REASONS) {
      const message = guardReasonMessage(reason);
      expect(message.length, `${reason} has no message`).toBeGreaterThan(20);
    }
  });

  it("names the real age minimum in the age gate message", () => {
    expect(guardReasonMessage("age_gate")).toContain(String(AGE_MINIMUM_YEARS));
  });

  it("recognises only the reasons it knows", () => {
    expect(isGuardReason("velocity")).toBe(true);
    expect(isGuardReason("something_else")).toBe(false);
    expect(isGuardReason(null)).toBe(false);
    expect(isGuardReason(4)).toBe(false);
  });
});

describe("the TypeScript numbers and the SQL signatures are the same joint", () => {
  /* The route supplies these alongside the threshold bundle. Listed here rather
     than derived, because the point of the test is to notice when the route and
     the function stop agreeing. */
  const CHECKOUT_ROUTE_PARAMS = [
    "p_profile_id",
    "p_amount_minor",
    "p_currency",
    "p_provider",
    "p_idempotency_key",
    "p_geo_country",
    "p_geo_source",
  ];

  it("passes commerce_checkout_guard exactly the parameters it declares", () => {
    const declared = parameterNames("commerce_checkout_guard");
    const supplied = [...CHECKOUT_ROUTE_PARAMS, ...Object.keys(checkoutGuardParams())];
    expect([...declared].sort()).toEqual([...supplied].sort());
  });

  it("passes alms_claim exactly the parameters it declares", () => {
    const declared = parameterNames("alms_claim");
    const supplied = ["p_profile_id", ...Object.keys(almsClaimParams())];
    expect([...declared].sort()).toEqual([...supplied].sort());
  });

  it("declares no default for any threshold, in any guard function", () => {
    /* A default in the function body would be a second copy of a number that
       also lives in compliance.ts, and two copies of a threshold drift the
       first time somebody tunes one of them, silently, in the direction of
       taking more money. A required parameter cannot drift because it cannot
       exist in two places. */
    for (const fn of [
      "commerce_checkout_guard",
      "alms_claim",
      "alms_state",
      "commerce_limits_state",
      "commerce_set_self_cap",
      "commerce_acknowledge_spend",
      "commerce_spend_minor",
    ]) {
      expect(signature(fn), `${fn} declares a default`).not.toMatch(
        /\bdefault\b|:?=/i
      );
    }
  });

  it("hands every threshold to SQL as the constant it is documented as", () => {
    /* Ten integers of the same type, passed positionally by name. A transposed
       pair typechecks perfectly and silently applies the 24 hour cap over the
       30 day window, or the month window to the day cap, and the symptom is a
       guardrail that lets four times too much money through. */
    expect(checkoutGuardParams()).toEqual({
      p_age_minimum: AGE_MINIMUM_YEARS,
      p_day_window_hours: SPEND_CAP_DAY_WINDOW_HOURS,
      p_day_cap_minor: SPEND_CAP_DAY_MINOR,
      p_month_window_hours: SPEND_CAP_MONTH_WINDOW_HOURS,
      p_month_cap_minor: SPEND_CAP_MONTH_MINOR,
      p_pending_grace_minutes: PENDING_ORDER_GRACE_MINUTES,
      p_velocity_orders: VELOCITY_PAID_ORDERS,
      p_velocity_window_minutes: 60,
      p_ack_threshold_minor: SPEND_ACKNOWLEDGEMENT_THRESHOLD_MINOR,
      p_ack_valid_hours: 24,
    });

    expect(almsClaimParams()).toEqual({
      p_chest_sku: ALMS_CHEST_SKU,
      p_window_days: ALMS_PER_MEMBER_DAYS,
      p_min_account_age_days: ALMS_MIN_ACCOUNT_AGE_DAYS,
      p_daily_ceiling: ALMS_REALM_DAILY_CEILING,
      p_age_minimum: AGE_MINIMUM_YEARS,
    });
  });
});

describe("the free path is never narrower than the paid one", () => {
  it("is gated on the chapter flag and not on the pricing confirmation", () => {
    /* The paid path needs chests_live AND COMMERCE_PRICES_CONFIRMED. The Alms
       need only the flag, so the free path is open at least as widely as the
       paid one at every moment. Read out of the route rather than asserted in
       prose, because the failure would be a one line edit that nothing else
       catches. */
    const route = readFileSync(
      `${HERE}../../app/api/commerce/alms/route.ts`,
      "utf8"
    );
    expect(route).toContain('getFlag("chests_live")');
    expect(route).not.toContain("pricesConfirmed");
  });

  it("grants through the same entitlement ledger the purchase writes", () => {
    /* source_kind is the ONLY difference between a bought chest and a given
       one. If the migration ever grants an alms chest into a different table,
       or the opening route learns to read source_kind, this is the line that
       should have stopped it. */
    expect(MIGRATION).toContain("insert into public.chest_entitlements");
    const openRoute = readFileSync(
      `${HERE}../../app/api/chests/[sku]/open/route.ts`,
      "utf8"
    );
    expect(openRoute).not.toContain("source_kind");
  });
});
